/**
 * Dash Idiomas — recebe as matrículas do site e grava na planilha.
 *
 * Instalação (feita uma vez, pela conta Google da escola):
 * 1. Crie uma planilha "Matrículas Dash Idiomas" e copie o ID dela (o trecho da URL
 *    entre /d/ e /edit).
 * 2. Em script.google.com, crie um projeto, cole este arquivo inteiro e preencha
 *    PLANILHA_ID abaixo com esse ID. Salve.
 * 3. Escolha a função "configurar" e clique em Executar. Autorize o acesso à planilha.
 *    O registro de execução mostra o segredo gerado: ele vai como SHEETS_SECRET na
 *    Cloudflare (Configurações > Variáveis e segredos). Não compartilhe esse valor.
 * 4. Implantar > Nova implantação > Tipo "App da Web":
 *      Executar como: Eu  |  Quem pode acessar: Qualquer pessoa
 *    Copie a URL gerada: ela vai como segredo SHEETS_WEBAPP_URL na Cloudflare.
 * A planilha continua privada: só quem a escola compartilhar consegue abri-la.
 * O site só consegue gravar linhas, e somente com o segredo correto.
 */

const PLANILHA_ID = "";

const SHEET_NAME = "Matrículas";
const HEADERS = [
  ["id", "ID"],
  ["criado_em", "Data da matrícula"],
  ["atualizado_em", "Última atualização"],
  ["nome", "Nome"],
  ["email", "E-mail"],
  ["whatsapp", "WhatsApp"],
  ["objetivo", "Objetivo"],
  ["plano", "Plano"],
  ["valor_mensal", "Valor mensal"],
  ["nivel", "Nível"],
  ["disponibilidade", "Disponibilidade"],
  ["observacoes", "Observações"],
  ["autoriza_imagem", "Autoriza imagem e voz"],
  ["autoriza_marketing", "Autoriza marketing"],
  ["status_matricula", "Status da matrícula"],
  ["status_pagamento", "Status do pagamento"],
  ["assinatura_asaas", "Assinatura no Asaas"],
  ["ultimo_pagamento", "Último pagamento"],
];

function doPost(e) {
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    const body = JSON.parse(e.postData.contents);
    const secret = PropertiesService.getScriptProperties().getProperty("SHEETS_SECRET");
    if (!secret || body.secret !== secret) return out({ ok: false, error: "unauthorized" });
    const row = body.row || {};
    if (!row.id) return out({ ok: false, error: "missing id" });

    const sheet = getSheet();
    const values = HEADERS.map(([key]) => formatValue(key, row[key]));
    const ids = sheet.getRange(2, 1, Math.max(sheet.getLastRow() - 1, 1), 1).getValues().map((r) => r[0]);
    const index = ids.indexOf(row.id);
    if (index >= 0) {
      sheet.getRange(index + 2, 1, 1, values.length).setValues([values]);
    } else {
      sheet.appendRow(values);
    }
    return out({ ok: true });
  } catch (err) {
    return out({ ok: false, error: String(err) });
  } finally {
    lock.releaseLock();
  }
}

/** Executar uma vez: cria o cabeçalho, pede a autorização e gera o segredo. */
function configurar() {
  getSheet();
  const props = PropertiesService.getScriptProperties();
  let secret = props.getProperty("SHEETS_SECRET");
  if (!secret) {
    secret = Utilities.getUuid().replace(/-/g, "") + Utilities.getUuid().replace(/-/g, "");
    props.setProperty("SHEETS_SECRET", secret);
  }
  console.log("Planilha pronta. Segredo para a Cloudflare (SHEETS_SECRET): " + secret);
}

function getSheet() {
  // Projeto avulso usa PLANILHA_ID; projeto aberto pela própria planilha usa a planilha ativa.
  const ss = PLANILHA_ID ? SpreadsheetApp.openById(PLANILHA_ID) : SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(SHEET_NAME);
  if (!sheet) sheet = ss.insertSheet(SHEET_NAME);
  if (sheet.getLastRow() === 0) {
    sheet.appendRow(HEADERS.map(([, label]) => label));
    sheet.setFrozenRows(1);
    sheet.getRange(1, 1, 1, HEADERS.length).setFontWeight("bold");
  }
  return sheet;
}

function formatValue(key, value) {
  if (value === undefined || value === null) return "";
  if ((key === "criado_em" || key === "atualizado_em" || key === "ultimo_pagamento") && value) {
    return Utilities.formatDate(new Date(value), "America/Sao_Paulo", "dd/MM/yyyy HH:mm");
  }
  // Evita que textos começando com "=" virem fórmulas.
  const s = String(value);
  return /^[=+\-@]/.test(s) ? "'" + s : s;
}

function out(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}
