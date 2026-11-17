-- Matrículas e assinaturas
CREATE TABLE enrollments (
  id TEXT PRIMARY KEY,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  nome TEXT NOT NULL,
  email TEXT NOT NULL,
  whatsapp TEXT NOT NULL,
  objetivo TEXT NOT NULL,
  plano TEXT NOT NULL,
  valor_centavos INTEGER NOT NULL,
  nivel TEXT NOT NULL,
  disponibilidade TEXT NOT NULL,
  observacoes TEXT NOT NULL DEFAULT '',
  consent_at TEXT NOT NULL,
  enrollment_status TEXT NOT NULL DEFAULT 'recebida',
  payment_status TEXT NOT NULL DEFAULT 'pendente',
  token_hash TEXT NOT NULL UNIQUE,
  token_expires_at TEXT NOT NULL,
  checkout_id TEXT,
  checkout_created_at TEXT,
  subscription_id TEXT,
  last_payment_at TEXT,
  last_event TEXT
);
CREATE INDEX idx_enr_checkout ON enrollments(checkout_id);
CREATE INDEX idx_enr_subscription ON enrollments(subscription_id);

-- Notificações recebidas do Asaas (id único garante que repetidas não sejam processadas de novo)
CREATE TABLE webhook_events (
  id TEXT PRIMARY KEY,
  event TEXT NOT NULL,
  received_at TEXT NOT NULL,
  enrollment_id TEXT,
  result TEXT NOT NULL,
  payload TEXT NOT NULL
);

-- Assinaturas substituídas (aluno refez o pagamento após recusa). Eventos delas são ignorados.
CREATE TABLE replaced_subscriptions (
  subscription_id TEXT PRIMARY KEY,
  enrollment_id TEXT NOT NULL,
  replaced_at TEXT NOT NULL
);
