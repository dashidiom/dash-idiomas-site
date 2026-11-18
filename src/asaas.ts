import { PLANS } from "./config";
import type { Enrollment, Env } from "./types";
import { todaySaoPaulo } from "./util";

export class AsaasError extends Error {
  constructor(public status: number, public body: string) {
    super(`Asaas respondeu ${status}`);
  }
}

/**
 * Cria um Checkout hospedado do Asaas com assinatura mensal no cartão de crédito.
 * Documentação: https://docs.asaas.com/docs/checkout-com-assinatura-recorrente
 * O aluno digita o cartão na página do Asaas; nenhum dado de cartão passa por este servidor.
 */
export async function createSubscriptionCheckout(env: Env, e: Enrollment, token: string): Promise<{ id: string; url: string }> {
  if (!env.ASAAS_API_KEY) throw new AsaasError(500, "ASAAS_API_KEY não configurada");
  const plan = PLANS[e.plano];
  const site = env.SITE_URL.replace(/\/$/, "");
  const t = encodeURIComponent(token);
  const body = {
    billingTypes: ["CREDIT_CARD"],
    chargeTypes: ["RECURRENT"],
    minutesToExpire: 60,
    externalReference: e.id,
    callback: {
      successUrl: `${site}/pagamento/retorno/?t=${t}`,
      cancelUrl: `${site}/pagamento/?t=${t}&checkout=cancelado`,
      expiredUrl: `${site}/pagamento/?t=${t}&checkout=expirado`,
    },
    items: [
      {
        // O Asaas aceita no máximo 30 caracteres no nome do item.
        name: `Inglês - ${plan.nome}`.slice(0, 30),
        description: `Dash Idiomas - ${plan.descricao}`,
        quantity: 1,
        value: plan.valorCentavos / 100,
      },
    ],
    subscription: {
      cycle: "MONTHLY",
      // Primeira cobrança no dia da contratação; as seguintes no mesmo dia dos meses seguintes.
      nextDueDate: `${todaySaoPaulo()} 23:59:59`,
    },
  };

  const res = await fetch(`${env.ASAAS_BASE_URL.replace(/\/$/, "")}/v3/checkouts`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      accept: "application/json",
      access_token: env.ASAAS_API_KEY,
      "user-agent": "dash-idiomas-site",
    },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  if (!res.ok) throw new AsaasError(res.status, text);
  const data = JSON.parse(text) as { id: string; link?: string };
  const host = env.ASAAS_BASE_URL.includes("sandbox") ? "https://sandbox.asaas.com" : "https://asaas.com";
  return { id: data.id, url: data.link || `${host}/checkoutSession/show?id=${encodeURIComponent(data.id)}` };
}

/**
 * Remove uma assinatura no Asaas (encerra a recorrência e as cobranças pendentes).
 * Usado quando o aluno refaz o pagamento após uma recusa: a assinatura nova substitui a antiga.
 * Documentação: https://docs.asaas.com/docs/faq-assinaturas
 */
export async function deleteSubscription(env: Env, subscriptionId: string): Promise<void> {
  if (!env.ASAAS_API_KEY) throw new AsaasError(500, "ASAAS_API_KEY não configurada");
  const res = await fetch(`${env.ASAAS_BASE_URL.replace(/\/$/, "")}/v3/subscriptions/${encodeURIComponent(subscriptionId)}`, {
    method: "DELETE",
    headers: { accept: "application/json", access_token: env.ASAAS_API_KEY, "user-agent": "dash-idiomas-site" },
  });
  if (!res.ok && res.status !== 404) throw new AsaasError(res.status, await res.text());
}
