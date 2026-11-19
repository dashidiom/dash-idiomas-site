import { AsaasError, createSubscriptionCheckout } from "./asaas";
import { OBJETIVOS, PAYMENT_STATUS_LABEL, PLANS, formatBRL } from "./config";
import { syncToSheet } from "./sheets";
import type { Enrollment, Env } from "./types";
import { formatDateBR, json, nowIso, randomToken, sha256Hex, todaySaoPaulo } from "./util";
import { validateEnrollment } from "./validation";
import { handleAsaasWebhook } from "./webhook";

const NOINDEX = "noindex, nofollow, noarchive";

async function loadByToken(env: Env, token: string | null): Promise<{ e: Enrollment } | { error: Response }> {
  if (!token || token.length < 20 || token.length > 100) return { error: json({ error: "Link inválido." }, 404) };
  const e = await env.DB.prepare("SELECT * FROM enrollments WHERE token_hash = ?").bind(await sha256Hex(token)).first<Enrollment>();
  if (!e) return { error: json({ error: "Link inválido." }, 404) };
  // Links de matrícula já paga continuam válidos para consultar o status.
  if (e.payment_status === "pendente" && new Date(e.token_expires_at) < new Date()) {
    return { error: json({ error: "Este link expirou. Fale com a Dash Idiomas para receber um novo." }, 410) };
  }
  return { e };
}

function publicSummary(e: Enrollment) {
  const plan = PLANS[e.plano];
  return {
    nome: e.nome.split(" ")[0],
    plano: plan?.nome ?? e.plano,
    descricao: plan?.descricao ?? "",
    objetivo: OBJETIVOS[e.objetivo] ?? e.objetivo,
    valor: formatBRL(e.valor_centavos),
    periodicidade: "Mensal",
    primeiraCobranca: formatDateBR(todaySaoPaulo()),
    status: e.payment_status,
    statusLabel: PAYMENT_STATUS_LABEL[e.payment_status],
  };
}

async function readBody(req: Request): Promise<Record<string, unknown>> {
  const type = req.headers.get("content-type") ?? "";
  if (type.includes("application/json")) return (await req.json()) as Record<string, unknown>;
  const form = await req.formData();
  return Object.fromEntries([...form.entries()].map(([k, v]) => [k, typeof v === "string" ? v : ""]));
}

async function createEnrollment(req: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
  if (Number(req.headers.get("content-length") ?? 0) > 20000) {
    return json({ error: "Envio muito grande." }, 413);
  }
  let raw: Record<string, unknown>;
  try {
    raw = await readBody(req);
  } catch {
    return json({ error: "Dados inválidos." }, 400);
  }
  // Campo-armadilha contra robôs: humanos não o veem.
  if (typeof raw.website === "string" && raw.website.length > 0) return json({ error: "Dados inválidos." }, 400);

  const v = validateEnrollment(raw);
  if (!v.ok) return json({ error: "Revise os campos destacados.", fields: v.errors }, 422);

  const d = v.data;
  const id = crypto.randomUUID();
  const token = randomToken();
  const now = nowIso();
  const ttlHours = Number(env.TOKEN_TTL_HOURS) || 168;
  const expires = new Date(Date.now() + ttlHours * 3600_000).toISOString();

  await env.DB.prepare(
    `INSERT INTO enrollments (id, created_at, updated_at, nome, email, whatsapp, data_nascimento, objetivo, plano, valor_centavos, nivel,
       disponibilidade, observacoes, consent_at, token_hash, token_expires_at, autoriza_imagem, autoriza_marketing)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  )
    .bind(id, now, now, d.nome, d.email, d.whatsapp, d.dataNascimento, d.objetivo, d.plano, PLANS[d.plano].valorCentavos, d.nivel,
      d.disponibilidade, d.observacoes, now, await sha256Hex(token), expires,
      d.autorizaImagem ? 1 : 0, d.autorizaMarketing ? 1 : 0)
    .run();

  const e = await env.DB.prepare("SELECT * FROM enrollments WHERE id = ?").bind(id).first<Enrollment>();
  if (e) ctx.waitUntil(syncToSheet(env, e));
  return json({ ok: true, pagamentoUrl: `/pagamento/?t=${token}` }, 201);
}

async function startCheckout(req: Request, env: Env): Promise<Response> {
  let token: string | null = null;
  try {
    token = String(((await readBody(req)) as { t?: string }).t ?? "");
  } catch {
    /* noop */
  }
  const r = await loadByToken(env, token);
  if ("error" in r) return r.error;
  const e = r.e;
  if (e.payment_status === "ativa") return json({ error: "Sua assinatura já está ativa." }, 409);
  if (e.payment_status === "cancelada") return json({ error: "Esta matrícula foi cancelada. Fale com a Dash Idiomas." }, 409);

  try {
    const { id, url } = await createSubscriptionCheckout(env, e, token!);
    await env.DB.prepare("UPDATE enrollments SET checkout_id = ?, checkout_created_at = ?, updated_at = ? WHERE id = ?")
      .bind(id, nowIso(), nowIso(), e.id)
      .run();
    return json({ ok: true, checkoutUrl: url });
  } catch (err) {
    console.error("checkout error", err instanceof AsaasError ? `${err.status} ${err.body}` : err);
    return json({ error: "Não foi possível abrir o pagamento agora. Tente de novo em alguns minutos." }, 502);
  }
}

function withNoindex(res: Response): Response {
  const r = new Response(res.body, res);
  r.headers.set("X-Robots-Tag", NOINDEX);
  r.headers.set("Cache-Control", "no-store");
  r.headers.set("Referrer-Policy", "no-referrer");
  return r;
}

export default {
  async fetch(req: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(req.url);
    const p = url.pathname;

    // www e o endereço provisório (workers.dev) levam ao domínio oficial; a API continua respondendo em qualquer endereço.
    const oficial = new URL(env.SITE_URL);
    if (!p.startsWith("/api/") && url.host !== oficial.host &&
        (url.hostname.endsWith(".dashidiomas.com.br") || url.hostname.endsWith(".workers.dev"))) {
      return Response.redirect(`${oficial.origin}${p}${url.search}`, 301);
    }

    if (p.startsWith("/api/")) {
      let res: Response;
      if (p === "/api/matricula" && req.method === "POST") res = await createEnrollment(req, env, ctx);
      else if (p === "/api/pagamento" && req.method === "GET") {
        const r = await loadByToken(env, url.searchParams.get("t"));
        res = "error" in r ? r.error : json(publicSummary(r.e));
      } else if (p === "/api/checkout" && req.method === "POST") res = await startCheckout(req, env);
      else if (p === "/api/webhooks/asaas" && req.method === "POST") res = await handleAsaasWebhook(req, env, ctx);
      else res = json({ error: "não encontrado" }, 404);
      return withNoindex(res);
    }

    // Páginas de matrícula e pagamento: servidas normalmente, mas com pedido de não indexação.
    if (p.startsWith("/matricula") || p.startsWith("/pagamento")) {
      return withNoindex(await env.ASSETS.fetch(req));
    }
    return env.ASSETS.fetch(req);
  },
} satisfies ExportedHandler<Env>;
