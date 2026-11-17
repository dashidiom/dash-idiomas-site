import { deleteSubscription } from "./asaas";
import { syncToSheet } from "./sheets";
import type { Enrollment, Env } from "./types";
import { json, nowIso, safeEqual } from "./util";

type PaymentStatus = Enrollment["payment_status"];

const PAID = new Set(["CHECKOUT_PAID", "PAYMENT_CONFIRMED", "PAYMENT_RECEIVED"]);
const REFUSED = new Set(["PAYMENT_CREDIT_CARD_CAPTURE_REFUSED", "PAYMENT_REPROVED_BY_RISK_ANALYSIS", "PAYMENT_OVERDUE"]);
const CANCELLED = new Set(["SUBSCRIPTION_DELETED", "SUBSCRIPTION_INACTIVATED"]);
const CHECKOUT_CLOSED = new Set(["CHECKOUT_CANCELED", "CHECKOUT_EXPIRED"]);

/** Regra de transição do status de pagamento. Cancelada é final: eventos atrasados não reativam. */
export function nextPaymentStatus(current: PaymentStatus, event: string): PaymentStatus {
  if (CANCELLED.has(event)) return "cancelada";
  if (current === "cancelada") return current;
  if (PAID.has(event)) return "ativa";
  if (REFUSED.has(event)) return "recusada";
  return current;
}

interface AsaasEvent {
  id?: string;
  event?: string;
  checkout?: { id?: string };
  subscription?: { id?: string; externalReference?: string | null; checkoutSession?: string | null };
  payment?: { id?: string; subscription?: string | null; externalReference?: string | null; checkoutSession?: string | null };
}

async function findEnrollment(env: Env, ev: AsaasEvent): Promise<Enrollment | null> {
  const db = env.DB;
  const by = async (col: "id" | "checkout_id" | "subscription_id", v?: string | null) =>
    v ? await db.prepare(`SELECT * FROM enrollments WHERE ${col} = ?`).bind(v).first<Enrollment>() : null;

  if (ev.checkout?.id) return by("checkout_id", ev.checkout.id);
  const obj = ev.subscription ?? ev.payment;
  if (!obj) return null;
  const subId = ev.subscription ? ev.subscription.id : ev.payment?.subscription;
  return (await by("subscription_id", subId)) ?? (await by("id", obj.externalReference)) ?? (await by("checkout_id", obj.checkoutSession));
}

export async function handleAsaasWebhook(req: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
  if (!(await safeEqual(req.headers.get("asaas-access-token"), env.ASAAS_WEBHOOK_TOKEN))) {
    return json({ error: "não autorizado" }, 401);
  }
  let ev: AsaasEvent;
  try {
    ev = await req.json();
  } catch {
    return json({ error: "json inválido" }, 400);
  }
  if (!ev.id || !ev.event) return json({ error: "evento sem id" }, 400);

  // Idempotência: o id do evento é chave primária; repetidos são ignorados.
  const ins = await env.DB.prepare(
    "INSERT OR IGNORE INTO webhook_events (id, event, received_at, result, payload) VALUES (?, ?, ?, 'recebido', ?)",
  )
    .bind(ev.id, ev.event, nowIso(), JSON.stringify(ev).slice(0, 20000))
    .run();
  if (!ins.meta.changes) return json({ ok: true, duplicado: true });

  try {
    const e = await findEnrollment(env, ev);
    if (!e) {
      await env.DB.prepare("UPDATE webhook_events SET result = 'sem matrícula vinculada' WHERE id = ?").bind(ev.id).run();
      return json({ ok: true, vinculado: false });
    }

    const incomingSub = ev.subscription?.id ?? ev.payment?.subscription ?? null;
    const ignore = async (why: string) => {
      await env.DB.prepare("UPDATE webhook_events SET enrollment_id = ?, result = ? WHERE id = ?").bind(e.id, why, ev.id).run();
      return json({ ok: true, ignorado: why });
    };
    if (incomingSub) {
      const old = await env.DB.prepare("SELECT 1 FROM replaced_subscriptions WHERE subscription_id = ?").bind(incomingSub).first();
      if (old) return ignore("assinatura substituída");
    }
    const differs = !!(incomingSub && e.subscription_id && incomingSub !== e.subscription_id);
    const isNewSubscription = differs && (ev.event === "SUBSCRIPTION_CREATED" || PAID.has(ev.event));
    if (differs && !isNewSubscription) return ignore("evento de outra assinatura");

    // Ao refazer o pagamento após recusa, o checkout cria uma assinatura nova: a antiga é removida
    // no Asaas para o aluno nunca ter duas cobranças mensais.
    const replacedSub = isNewSubscription ? e.subscription_id : null;
    if (replacedSub) {
      await env.DB.prepare("INSERT OR IGNORE INTO replaced_subscriptions (subscription_id, enrollment_id, replaced_at) VALUES (?, ?, ?)")
        .bind(replacedSub, e.id, nowIso()).run();
      ctx.waitUntil(deleteSubscription(env, replacedSub).catch((err) => console.error("falha ao remover assinatura antiga", replacedSub, err)));
    }
    const base = replacedSub && e.payment_status === "recusada" ? "pendente" : e.payment_status;
    const status = nextPaymentStatus(base, ev.event);
    const subId = incomingSub ?? e.subscription_id;
    const paidNow = PAID.has(ev.event) && status === "ativa";
    const clearCheckout = CHECKOUT_CLOSED.has(ev.event) && e.payment_status === "pendente";
    const now = nowIso();

    await env.DB.batch([
      env.DB.prepare(
        `UPDATE enrollments SET payment_status = ?, subscription_id = ?, last_event = ?, updated_at = ?,
           last_payment_at = CASE WHEN ? THEN ? ELSE last_payment_at END,
           checkout_id = CASE WHEN ? THEN NULL ELSE checkout_id END
         WHERE id = ?`,
      ).bind(status, subId ?? null, ev.event, now, paidNow ? 1 : 0, now, clearCheckout ? 1 : 0, e.id),
      env.DB.prepare("UPDATE webhook_events SET enrollment_id = ?, result = ? WHERE id = ?").bind(
        e.id,
        `${e.payment_status} -> ${status}`,
        ev.id,
      ),
    ]);

    const updated = await env.DB.prepare("SELECT * FROM enrollments WHERE id = ?").bind(e.id).first<Enrollment>();
    if (updated) ctx.waitUntil(syncToSheet(env, updated));
    return json({ ok: true, status });
  } catch (err) {
    // Libera o id para que o Asaas possa reenviar o evento.
    await env.DB.prepare("DELETE FROM webhook_events WHERE id = ?").bind(ev.id).run();
    console.error("webhook error", err);
    return json({ error: "falha ao processar" }, 500);
  }
}
