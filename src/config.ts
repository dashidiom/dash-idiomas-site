// Planos e opções do formulário. Alterar valores aqui atualiza a página de pagamento e o checkout.
// Os valores do site institucional ficam em public/index.html.

export interface Plan {
  id: string;
  nome: string;
  descricao: string;
  valorCentavos: number;
}

export const PLANS: Record<string, Plan> = {
  "1x": { id: "1x", nome: "1 aula por semana", descricao: "Aula individual online, 1 vez por semana", valorCentavos: 39000 },
  "2x": { id: "2x", nome: "2 aulas por semana", descricao: "Aula individual online, 2 vezes por semana", valorCentavos: 78000 },
  "3x": { id: "3x", nome: "3 aulas por semana", descricao: "Aula individual online, 3 vezes por semana", valorCentavos: 117000 },
};

export const OBJETIVOS: Record<string, string> = {
  "dia-a-dia": "Inglês para o dia a dia",
  viagens: "Inglês para viagens",
  negocios: "Inglês para negócios",
  provas: "Inglês para provas de proficiência",
};

export const NIVEIS: Record<string, string> = {
  "nunca-estudei": "Nunca estudei",
  basico: "Básico",
  intermediario: "Intermediário",
  avancado: "Avançado",
  "nao-sei": "Não sei dizer",
};

export const PAYMENT_STATUS_LABEL: Record<string, string> = {
  pendente: "Pagamento pendente",
  ativa: "Assinatura ativa",
  recusada: "Cobrança recusada",
  cancelada: "Assinatura cancelada",
};

export function formatBRL(centavos: number): string {
  return (centavos / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}
