// Fluxo completo no navegador, em tamanho de celular, com dados fictícios.
// Gera capturas de tela em test-results/ (SCREENSHOTS=1).
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdirSync } from "node:fs";
import { chromium, devices } from "playwright";

const BASE = "http://127.0.0.1:8787";
const MOCK = "http://127.0.0.1:9911";
const OUT = "test-results";
mkdirSync(OUT, { recursive: true });
const shot = async (page, name) => process.env.SCREENSHOTS && page.screenshot({ path: `${OUT}/${name}.png`, fullPage: true });

test("celular: escolher plano, matricular, revisar assinatura, pagar e ver status confirmado", async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ ...devices["iPhone 13"] });
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  try {
    await page.goto(BASE + "/");
    await shot(page, "01-home-celular");
    // Sem rolagem horizontal
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    assert.ok(overflow <= 1, `rolagem horizontal de ${overflow}px`);

    // Menu do celular
    await page.click(".menu-toggle");
    await page.click('#menu a[href="#planos"]');
    await page.click('a[href="/matricula/?plano=2x"]');
    await page.waitForURL(/\/matricula\//);
    assert.ok(await page.isChecked('input[name="plano"][value="2x"]'), "plano pré-selecionado");

    // Envio vazio mostra erros do servidor
    await page.check('input[name="plano"][value="2x"]');
    await page.click("#enviar");
    await page.waitForSelector(".field.has-error");
    await shot(page, "02-matricula-erros");

    await page.check('input[name="objetivo"][value="negocios"]', { force: true });
    await page.fill("#nome", "João Fictício Souza");
    await page.fill("#data_nascimento", "1988-03-15");
    await page.fill("#email", "joao.ficticio@exemplo.com");
    await page.fill("#whatsapp", "21998765432");
    assert.equal(await page.inputValue("#whatsapp"), "(21) 99876-5432");
    await page.selectOption("#nivel", "intermediario");
    await page.fill("#disponibilidade", "Segundas e quartas às 8h");
    await page.check('input[name="aceite"]');
    await shot(page, "03-matricula-preenchida");
    await page.click("#enviar");

    await page.waitForURL(/\/pagamento\/\?t=/);
    await page.waitForSelector("#resumo:not([hidden])");
    assert.equal((await page.textContent("#r-plano")).trim(), "2 aulas por semana");
    assert.match(await page.textContent("#r-valor"), /780,00 por mês/);
    assert.match(await page.textContent("#r-primeira"), /^Hoje, \d{2}\/\d{2}\/\d{4}$/);
    assert.ok(await page.isDisabled("#pagar"), "botão bloqueado até autorizar");
    await shot(page, "04-pagamento-resumo");
    const token = new URL(page.url()).searchParams.get("t");

    await page.check("#confirmo");
    await page.click("#pagar");
    await page.waitForURL(/127\.0\.0\.1:9911\/checkout\//);

    // Simula o retorno do checkout antes da confirmação: deve mostrar "confirmando", não "ativa"
    await page.goto(`${BASE}/pagamento/retorno/?t=${token}`);
    await page.waitForSelector("#badge");
    assert.match(await page.textContent("#badge"), /Confirmando/);
    await shot(page, "05-retorno-aguardando");

    // Asaas notifica o pagamento
    const state = await (await fetch(MOCK + "/__state")).json();
    const chk = state.checkouts.at(-1);
    const res = await fetch(BASE + "/api/webhooks/asaas", {
      method: "POST",
      headers: { "content-type": "application/json", "asaas-access-token": "token-webhook-ficticio-0123456789abcdef0123456789" },
      body: JSON.stringify({ id: `evt_ui_${Date.now()}`, event: "CHECKOUT_PAID", checkout: { id: chk.id } }),
    });
    assert.equal(res.status, 200);
    await page.waitForSelector(".status-ativa", { timeout: 10000 });
    await shot(page, "06-retorno-ativa");

    // Desktop: página inicial
    const desk = await browser.newPage({ viewport: { width: 1366, height: 900 } });
    await desk.goto(BASE + "/");
    await shot(desk, "07-home-desktop");
    assert.deepEqual(errors, []);
  } finally {
    await browser.close();
  }
});
