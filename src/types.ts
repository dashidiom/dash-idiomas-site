export interface Env {
  DB: D1Database;
  ASSETS: Fetcher;
  SITE_URL: string;
  ASAAS_BASE_URL: string;
  TOKEN_TTL_HOURS: string;
  ASAAS_API_KEY?: string;
  ASAAS_WEBHOOK_TOKEN?: string;
  SHEETS_WEBAPP_URL?: string;
  SHEETS_SECRET?: string;
}

export interface Enrollment {
  id: string;
  created_at: string;
  updated_at: string;
  nome: string;
  email: string;
  whatsapp: string;
  objetivo: string;
  plano: string;
  valor_centavos: number;
  nivel: string;
  disponibilidade: string;
  observacoes: string;
  consent_at: string;
  enrollment_status: string;
  payment_status: "pendente" | "ativa" | "recusada" | "cancelada";
  token_hash: string;
  token_expires_at: string;
  checkout_id: string | null;
  checkout_created_at: string | null;
  subscription_id: string | null;
  last_payment_at: string | null;
  last_event: string | null;
}
