/**
 * Dash Idiomas — recebe as matrículas do site e grava na planilha.
 *
 * Instalação (feita uma vez, pela conta Google da escola):
 * 1. Crie uma planilha "Matrículas Dash Idiomas" e copie o ID dela (o trecho da URL
 *    entre /d/ e /edit).
 * 2. Em script.google.com, crie um projeto, cole este arquivo inteiro e preencha
 *    PLANILHA_ID abaixo com esse ID (e, se quiser, EMAILS_AVISO). Salve.
 * 3. Escolha a função "configurar" e clique em Executar. Autorize o acesso à planilha.
 *    O registro de execução mostra o segredo gerado: ele vai como SHEETS_SECRET na
 *    Cloudflare (Configurações > Variáveis e segredos). Não compartilhe esse valor.
 * 4. Implantar > Nova implantação > Tipo "App da Web":
 *      Executar como: Eu  |  Quem pode acessar: Qualquer pessoa
 *    Copie a URL gerada: ela vai como segredo SHEETS_WEBAPP_URL na Cloudflare.
 * 5. A cada matrícula nova, pagamento confirmado, cartão recusado ou cancelamento, o
 *    script manda um e-mail de aviso (ver "Aviso por e-mail para a equipe" abaixo).
 * A planilha continua privada: só quem a escola compartilhar consegue abri-la.
 * O site só consegue gravar linhas, e somente com o segredo correto.
 */

const PLANILHA_ID = "";
// E-mails extras que recebem os avisos de matrícula e pagamento, separados por vírgula.
const EMAILS_AVISO = "";

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
    let statusAnterior = null;
    if (index >= 0) {
      statusAnterior = String(sheet.getRange(index + 2, STATUS_COL).getValue());
      sheet.getRange(index + 2, 1, 1, values.length).setValues([values]);
    } else {
      sheet.appendRow(values);
    }
    avisarEquipe(row, index < 0, statusAnterior);
    return out({ ok: true });
  } catch (err) {
    return out({ ok: false, error: String(err) });
  } finally {
    lock.releaseLock();
  }
}

// ---- Aviso por e-mail para a equipe ----
// Destinatários: a conta dona do script e os e-mails em EMAILS_AVISO (separados por vírgula).
const STATUS_COL = HEADERS.findIndex(([key]) => key === "status_pagamento") + 1;
const AVISOS = {
  "Assinatura ativa": "✅ Pagamento confirmado",
  "Cobrança recusada": "⚠️ Cartão recusado",
  "Assinatura cancelada": "❌ Assinatura cancelada",
};

function avisarEquipe(row, nova, statusAnterior) {
  try {
    const status = row.status_pagamento || "";
    let titulo = null;
    if (nova) titulo = "🆕 Nova matrícula";
    else if (status !== statusAnterior && AVISOS[status]) titulo = AVISOS[status];
    if (!titulo) return;

    const destino = [Session.getEffectiveUser().getEmail()]
      .concat(EMAILS_AVISO.split(",").map((x) => x.trim()).filter(Boolean)).join(",");
    const digitos = String(row.whatsapp || "").replace(/\D/g, "");
    const whats = digitos ? "https://wa.me/55" + digitos : "";
    const linhas = [
      ["Aluno", row.nome], ["WhatsApp", row.whatsapp], ["E-mail", row.email],
      ["Plano", row.plano + " (" + row.valor_mensal + "/mês)"], ["Objetivo", row.objetivo],
      ["Nível", row.nivel], ["Disponibilidade", row.disponibilidade], ["Observações", row.observacoes],
      ["Status do pagamento", status],
    ].filter(([, v]) => v);
    const esc = (v) => String(v).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    const proximo = {
      "🆕 Nova matrícula": "O aluno recebeu o link de pagamento. Se ele não pagar hoje, vale chamar no WhatsApp.",
      "⚠️ Cartão recusado": "Chame o aluno no WhatsApp: ele pode pagar com outro cartão pelo mesmo link de pagamento.",
      "❌ Assinatura cancelada": "Confira no Asaas o motivo do cancelamento e fale com o aluno, se for o caso.",
      "✅ Pagamento confirmado": "Agende a primeira aula com o aluno.",
    }[titulo];
    const html = "<p><b>" + esc(titulo) + "</b></p><table>"
      + linhas.map(([k, v]) => "<tr><td style='padding:2px 12px 2px 0;color:#555'>" + esc(k) + "</td><td>" + esc(v) + "</td></tr>").join("")
      + "</table><p>" + esc(proximo) + "</p>"
      + (whats ? "<p><a href='" + whats + "'>Abrir conversa no WhatsApp</a></p>" : "")
      + "<p><a href='https://docs.google.com/spreadsheets/d/" + (PLANILHA_ID || SpreadsheetApp.getActiveSpreadsheet().getId()) + "'>Abrir a planilha</a></p>";
    MailApp.sendEmail({
      to: destino,
      subject: titulo + ": " + row.nome + " (" + row.plano + ")",
      htmlBody: html,
      body: linhas.map(([k, v]) => k + ": " + v).join("\n") + "\n\n" + proximo + (whats ? "\nWhatsApp: " + whats : ""),
      name: "Site Dash Idiomas",
    });
  } catch (err) {
    console.error("Falha ao enviar aviso: " + err);
  }
}

/** Executar uma vez: cria o cabeçalho, pede a autorização e gera o segredo. */
function configurar() {
  getSheet();
  console.log("E-mails de aviso disponíveis hoje: " + MailApp.getRemainingDailyQuota());
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
