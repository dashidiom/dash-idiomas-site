import { NIVEIS, OBJETIVOS, PLANS } from "./config";

export interface EnrollmentInput {
  nome: string;
  email: string;
  whatsapp: string;
  objetivo: string;
  plano: string;
  nivel: string;
  disponibilidade: string;
  observacoes: string;
  autorizaImagem: boolean;
  autorizaMarketing: boolean;
}

export type ValidationResult =
  | { ok: true; data: EnrollmentInput }
  | { ok: false; errors: Record<string, string> };

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

function str(v: unknown): string {
  return typeof v === "string" ? v.trim().replace(/\s+/g, " ") : "";
}

/** Valida os dados da matrícula no servidor. Retorna mensagens em português por campo. */
export function validateEnrollment(raw: Record<string, unknown>): ValidationResult {
  const errors: Record<string, string> = {};
  const nome = str(raw.nome);
  const email = str(raw.email).toLowerCase();
  const whatsappDigits = str(raw.whatsapp).replace(/\D/g, "");
  const objetivo = str(raw.objetivo);
  const plano = str(raw.plano);
  const nivel = str(raw.nivel);
  const disponibilidade = str(raw.disponibilidade);
  const observacoes = typeof raw.observacoes === "string" ? raw.observacoes.trim() : "";
  const truthy = (v: unknown) => v === true || v === "true" || v === "on";
  const aceite = truthy(raw.aceite);

  if (nome.length < 3 || nome.length > 120 || !nome.includes(" ")) errors.nome = "Informe seu nome completo.";
  if (!EMAIL_RE.test(email) || email.length > 160) errors.email = "Informe um e-mail válido.";
  // Celular brasileiro: DDD + 9 dígitos (aceita +55 na frente)
  const phone = whatsappDigits.startsWith("55") && whatsappDigits.length === 13 ? whatsappDigits.slice(2) : whatsappDigits;
  if (!/^[1-9]{2}9\d{8}$/.test(phone)) errors.whatsapp = "Informe um celular com DDD, por exemplo (11) 91234-5678.";
  if (!(objetivo in OBJETIVOS)) errors.objetivo = "Escolha o seu objetivo.";
  if (!(plano in PLANS)) errors.plano = "Escolha um plano.";
  if (!(nivel in NIVEIS)) errors.nivel = "Escolha o seu nível.";
  if (disponibilidade.length < 3 || disponibilidade.length > 300) errors.disponibilidade = "Conte quais dias e horários funcionam para você.";
  if (observacoes.length > 500) errors.observacoes = "Use no máximo 500 caracteres.";
  if (!aceite) errors.aceite = "É preciso aceitar os termos e a política de privacidade.";

  if (Object.keys(errors).length) return { ok: false, errors };
  return { ok: true, data: { nome, email, whatsapp: phone, objetivo, plano, nivel, disponibilidade, observacoes,
    autorizaImagem: truthy(raw.autoriza_imagem), autorizaMarketing: truthy(raw.autoriza_marketing) } };
}
