/**
 * Dash Idiomas — recebe as matrículas do site e grava na planilha.
 *
 * Instalação (feita uma vez, pela conta Google da escola):
 * 1. Crie uma planilha "Matrículas Dash Idiomas" e abra Extensões > Apps Script.
 * 2. Cole este arquivo inteiro no editor e salve.
 * 3. Em Configurações do projeto > Propriedades do script, crie SHEETS_SECRET
 *    com um texto aleatório longo (o mesmo valor vai como segredo na Cloudflare).
 * 4. Implantar > Nova implantação > Tipo "App da Web":
 *      Executar como: Eu  |  Quem pode acessar: Qualquer pessoa
 *    Copie a URL gerada: ela vai como segredo SHEETS_WEBAPP_URL na Cloudflare.
 * A planilha continua privada: só quem a escola compartilhar consegue abri-la.
 * O site só consegue gravar linhas, e somente com o segredo correto.
 */

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

function getSheet() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
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
