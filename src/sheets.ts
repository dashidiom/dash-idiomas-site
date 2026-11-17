import { NIVEIS, OBJETIVOS, PAYMENT_STATUS_LABEL, PLANS, formatBRL } from "./config";
import type { Enrollment, Env } from "./types";

/**
 * Envia (cria ou atualiza) a linha da matrícula na planilha da equipe,
 * via Web App do Google Apps Script (ver apps-script/Code.gs).
 * Falhas não interrompem o fluxo do aluno: o banco D1 é a fonte de verdade
 * e cada mudança de status reenvia a linha completa.
 */
export async function syncToSheet(env: Env, e: Enrollment): Promise<void> {
  if (!env.SHEETS_WEBAPP_URL || !env.SHEETS_SECRET) return;
  const row = {
    id: e.id,
    criado_em: e.created_at,
    atualizado_em: e.updated_at,
    nome: e.nome,
    email: e.email,
    whatsapp: e.whatsapp,
    objetivo: OBJETIVOS[e.objetivo] ?? e.objetivo,
    plano: PLANS[e.plano]?.nome ?? e.plano,
    valor_mensal: formatBRL(e.valor_centavos),
    nivel: NIVEIS[e.nivel] ?? e.nivel,
    disponibilidade: e.disponibilidade,
    observacoes: e.observacoes,
    status_matricula: e.enrollment_status,
    status_pagamento: PAYMENT_STATUS_LABEL[e.payment_status] ?? e.payment_status,
    assinatura_asaas: e.subscription_id ?? "",
    ultimo_pagamento: e.last_payment_at ?? "",
  };
  try {
    const res = await fetch(env.SHEETS_WEBAPP_URL, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ secret: env.SHEETS_SECRET, row }),
      redirect: "follow",
    });
    if (!res.ok) console.error("sheets sync failed", res.status);
  } catch (err) {
    console.error("sheets sync error", err);
  }
}
