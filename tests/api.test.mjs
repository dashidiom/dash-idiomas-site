// Testes de ponta a ponta da API contra o servidor local (wrangler dev) e serviços simulados.
// Uso: npm test  (sobe tudo automaticamente via tests/run.mjs)
import { test } from "node:test";
import assert from "node:assert/strict";

const BASE = process.env.BASE_URL || "http://127.0.0.1:8787";
const MOCK = process.env.MOCK_URL || "http://127.0.0.1:9911";
const WEBHOOK_TOKEN = "token-webhook-ficticio-0123456789abcdef0123456789";

const aluno = (over = {}) => ({
  nome: "Maria Teste da Silva",
  email: `maria+${Math.random().toString(36).slice(2)}@exemplo.com`,
  whatsapp: "(11) 91234-5678",
  objetivo: "viagens",
  plano: "2x",
  nivel: "basico",
  disponibilidade: "Terças e quintas depois das 19h",
  observacoes: "",
  aceite: true,
  ...over,
});

async function post(path, body, headers = {}) {
  const res = await fetch(BASE + path, { method: "POST", headers: { "content-type": "application/json", ...headers }, body: JSON.stringify(body) });
  return { res, data: await res.json() };
}
const webhook = (ev, token = WEBHOOK_TOKEN) => post("/api/webhooks/asaas", ev, { "asaas-access-token": token });
const mockState = async () => (await fetch(MOCK + "/__state")).json();
const tokenFrom = (url) => new URL(url, BASE).searchParams.get("t");
const statusOf = async (t) => (await (await fetch(`${BASE}/api/pagamento?t=${t}`)).json()).status;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let evSeq = 0;
const evId = () => `evt_teste_${Date.now()}_${++evSeq}`;

async function matricularEAbrirCheckout(over) {
  const { res, data } = await post("/api/matricula", aluno(over));
  assert.equal(res.status, 201);
  const t = tokenFrom(data.pagamentoUrl);
  const c = await post("/api/checkout", { t });
  assert.equal(c.res.status, 200, JSON.stringify(c.data));
  const st = await mockState();
  const checkout = st.checkouts.at(-1);
  return { t, checkout };
}

test("site público responde e não lista páginas privadas no sitemap", async () => {
  const home = await fetch(BASE + "/");
  assert.equal(home.status, 200);
  const html = await home.text();
  assert.match(html, /aulas? individua/i);
  assert.match(html, /R\$ 390/);
  assert.equal(home.headers.get("x-robots-tag"), null);
  const sitemap = await (await fetch(BASE + "/sitemap.xml")).text();
  assert.doesNotMatch(sitemap, /matricula|pagamento/);
});

test("matrícula e pagamento pedem não indexação", async () => {
  for (const p of ["/matricula/", "/pagamento/", "/pagamento/retorno/"]) {
    const r = await fetch(BASE + p);
    assert.equal(r.status, 200, p);
    assert.match(r.headers.get("x-robots-tag") || "", /noindex/, p);
    assert.match(await r.text(), /<meta name="robots" content="noindex/, p);
  }
});

test("validação no servidor recusa dados inválidos com mensagens por campo", async () => {
  const { res, data } = await post("/api/matricula", aluno({ nome: "Ma", email: "x@", whatsapp: "123", plano: "9x", aceite: false }));
  assert.equal(res.status, 422);
  for (const f of ["nome", "email", "whatsapp", "plano", "aceite"]) assert.ok(data.fields[f], f);
});

test("campo-armadilha bloqueia robôs", async () => {
  const { res } = await post("/api/matricula", aluno({ website: "http://spam" }));
  assert.equal(res.status, 400);
});

test("matrícula registra data e status e grava na planilha", async () => {
  const { res, data } = await post("/api/matricula", aluno({ nome: "Planilha Teste Silva" }));
  assert.equal(res.status, 201);
  const t = tokenFrom(data.pagamentoUrl);
  const resumo = await (await fetch(`${BASE}/api/pagamento?t=${t}`)).json();
  assert.equal(resumo.plano, "2 aulas por semana");
  assert.equal(resumo.valor.replace(/\s/g, " "), "R$ 780,00");
  assert.equal(resumo.periodicidade, "Mensal");
  assert.equal(resumo.status, "pendente");
  assert.equal(resumo.email, undefined, "não expõe e-mail no link");
  await sleep(300);
  const rows = Object.values((await mockState()).sheetRows);
  const row = rows.find((r) => r.nome === "Planilha Teste Silva");
  assert.ok(row, "linha na planilha");
  assert.equal(row.status_pagamento, "Pagamento pendente");
  assert.ok(row.criado_em);
});

test("link com token inválido é recusado", async () => {
  const r = await fetch(`${BASE}/api/pagamento?t=token-que-nao-existe-123456`);
  assert.equal(r.status, 404);
});

test("checkout é criado como assinatura mensal no cartão com valor do plano", async () => {
  const { checkout } = await matricularEAbrirCheckout({ plano: "3x" });
  const b = checkout.body;
  assert.deepEqual(b.billingTypes, ["CREDIT_CARD"]);
  assert.deepEqual(b.chargeTypes, ["RECURRENT"]);
  assert.equal(b.subscription.cycle, "MONTHLY");
  assert.equal(b.items[0].value, 1170);
  assert.match(b.callback.successUrl, /\/pagamento\/retorno\/\?t=/);
  assert.ok(b.externalReference);
});

test("webhook sem token correto é rejeitado", async () => {
  const { res } = await webhook({ id: evId(), event: "CHECKOUT_PAID", checkout: { id: "x" } }, "token-errado");
  assert.equal(res.status, 401);
});

test("pagamento confirmado ativa a assinatura; notificação repetida não duplica", async () => {
  const { t, checkout } = await matricularEAbrirCheckout();
  const id = evId();
  const ev = { id, event: "CHECKOUT_PAID", checkout: { id: checkout.id } };
  const first = await webhook(ev);
  assert.equal(first.data.status, "ativa");
  const again = await webhook(ev);
  assert.equal(again.data.duplicado, true);
  assert.equal(await statusOf(t), "ativa");
  // Assinatura ativa não abre novo checkout
  const c = await post("/api/checkout", { t });
  assert.equal(c.res.status, 409);
});

test("ciclo completo: assinatura criada, renovação paga, recusa, nova tentativa e cancelamento", async () => {
  const { t, checkout } = await matricularEAbrirCheckout({ plano: "1x" });
  const enrollmentId = checkout.body.externalReference;
  await webhook({ id: evId(), event: "CHECKOUT_PAID", checkout: { id: checkout.id } });
  await webhook({ id: evId(), event: "SUBSCRIPTION_CREATED", subscription: { id: "sub_A", externalReference: enrollmentId } });
  await webhook({ id: evId(), event: "PAYMENT_CONFIRMED", payment: { id: "pay_1", subscription: "sub_A" } });
  assert.equal(await statusOf(t), "ativa");

  // Renovação do mês seguinte recusada
  await webhook({ id: evId(), event: "PAYMENT_CREDIT_CARD_CAPTURE_REFUSED", payment: { id: "pay_2", subscription: "sub_A" } });
  assert.equal(await statusOf(t), "recusada");
  await sleep(300);
  let row = Object.values((await mockState()).sheetRows).find((r) => r.id === enrollmentId);
  assert.equal(row.status_pagamento, "Cobrança recusada");

  // Aluno refaz o pagamento com outro cartão: nova assinatura substitui a antiga
  const c2 = await post("/api/checkout", { t });
  assert.equal(c2.res.status, 200);
  const chk2 = (await mockState()).checkouts.at(-1);
  await webhook({ id: evId(), event: "CHECKOUT_PAID", checkout: { id: chk2.id } });
  await webhook({ id: evId(), event: "SUBSCRIPTION_CREATED", subscription: { id: "sub_B", externalReference: enrollmentId } });
  assert.equal(await statusOf(t), "ativa");
  await sleep(300);
  assert.ok((await mockState()).deleted.includes("sub_A"), "assinatura antiga removida no Asaas");

  // Notificação atrasada da assinatura antiga não altera o status
  await webhook({ id: evId(), event: "SUBSCRIPTION_DELETED", subscription: { id: "sub_A", externalReference: enrollmentId } });
  assert.equal(await statusOf(t), "ativa");

  // Cancelamento da assinatura atual
  await webhook({ id: evId(), event: "SUBSCRIPTION_DELETED", subscription: { id: "sub_B", externalReference: enrollmentId } });
  assert.equal(await statusOf(t), "cancelada");
  // Pagamento atrasado depois do cancelamento não reativa
  await webhook({ id: evId(), event: "PAYMENT_RECEIVED", payment: { id: "pay_9", subscription: "sub_B" } });
  assert.equal(await statusOf(t), "cancelada");
  await sleep(300);
  row = Object.values((await mockState()).sheetRows).find((r) => r.id === enrollmentId);
  assert.equal(row.status_pagamento, "Assinatura cancelada");
  assert.equal(row.assinatura_asaas, "sub_B");
});

test("checkout expirado mantém pagamento pendente e permite tentar de novo", async () => {
  const { t, checkout } = await matricularEAbrirCheckout();
  await webhook({ id: evId(), event: "CHECKOUT_EXPIRED", checkout: { id: checkout.id } });
  assert.equal(await statusOf(t), "pendente");
  const c = await post("/api/checkout", { t });
  assert.equal(c.res.status, 200);
});

test("evento sem matrícula vinculada é aceito sem erro (para não travar a fila do Asaas)", async () => {
  const { res, data } = await webhook({ id: evId(), event: "PAYMENT_RECEIVED", payment: { id: "pay_x", subscription: "sub_desconhecida" } });
  assert.equal(res.status, 200);
  assert.equal(data.vinculado, false);
});
