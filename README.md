# Site Dash Idiomas

Site institucional, matrícula e assinatura mensal no cartão (Asaas) da Dash Idiomas.
Hospedado na Cloudflare (Workers + banco D1); matrículas espelhadas numa planilha Google.

## Como funciona

```
Site (planos) ──> /matricula/?plano=2x ──POST /api/matricula──> banco D1 + planilha
                                                     │
                                                     └──> /pagamento/?t=<token individual, validade 7 dias>
                                                               │ aluno confere plano, valor, datas e condições
                                                               └──POST /api/checkout──> Checkout do Asaas (cartão, recorrente mensal)
Asaas ──POST /api/webhooks/asaas (token no cabeçalho)──> atualiza status no D1 + planilha
Aluno volta do Asaas ──> /pagamento/retorno/?t=... mostra o status confirmado pelo sistema
```

- **Status do pagamento:** `pendente` → `ativa` (pagamento confirmado) → `recusada` (cartão recusou) → `cancelada` (assinatura removida/inativada).
- **Notificações repetidas:** cada evento do Asaas tem um id único guardado no banco; repetidos são ignorados.
- **Refazer pagamento após recusa:** o aluno abre o mesmo link de pagamento e paga com outro cartão. A assinatura nova substitui a antiga, que é removida automaticamente no Asaas.
- **Privacidade:** matrícula e pagamento ficam fora do menu e do sitemap, enviam `noindex` e só mostram dados com o token individual. O cartão é digitado só na página do Asaas.

## Estrutura

| Pasta | Conteúdo |
| --- | --- |
| `public/` | Páginas, CSS, JS e imagens. `index.html` é a página inicial. |
| `src/` | Servidor (Worker): matrícula, checkout, webhook, planilha. Planos e valores em `src/config.ts`. |
| `migrations/` | Tabelas do banco D1. |
| `apps-script/Code.gs` | Script da planilha Google que recebe as matrículas. |
| `tests/` | Testes automáticos com dados fictícios e Asaas simulado. |

## Editar conteúdo

- **Textos da página inicial:** `public/index.html`.
- **Preços:** em dois lugares: `src/config.ts` (o que é cobrado) e `public/index.html` + `public/matricula/index.html` (o que aparece). Atualize também `public/termos/index.html`.
- **Cores e fontes:** variáveis no topo de `public/css/style.css`.
- Cada alteração enviada ao GitHub (branch `main`) publica o site automaticamente.

## Consultar matrículas e assinaturas

- **Planilha "Matrículas Dash Idiomas":** uma linha por matrícula, atualizada a cada mudança de status.
- **Painel do Asaas:** Assinaturas e Cobranças mostram cada aluno; cancelar uma assinatura lá atualiza a planilha sozinho.
- **Banco D1 (fonte de verdade):** painel da Cloudflare > Storage & Databases > D1 > `dash-idiomas`.

## Configuração (feita uma vez)

Segredos ficam no painel da Cloudflare (Workers & Pages > dash-idiomas-site > Settings > Variables and Secrets), **nunca no código**:

| Nome | Tipo | O que é |
| --- | --- | --- |
| `SITE_URL` | variável | Endereço público, ex.: `https://dashidiomas.com.br` |
| `ASAAS_BASE_URL` | variável | `https://api-sandbox.asaas.com` (testes) ou `https://api.asaas.com` (produção) |
| `ASAAS_API_KEY` | segredo | Chave de API do Asaas (Integrações > Chaves de API) |
| `ASAAS_WEBHOOK_TOKEN` | segredo | Texto aleatório de 32+ caracteres; o mesmo vai no webhook do Asaas |
| `SHEETS_WEBAPP_URL` | segredo | URL do Web App do Apps Script |
| `SHEETS_SECRET` | segredo | Texto aleatório; o mesmo vai nas propriedades do Apps Script |

Webhook no Asaas (Integrações > Webhooks): URL `https://SEU-DOMINIO/api/webhooks/asaas`, token de autenticação = `ASAAS_WEBHOOK_TOKEN`, eventos de **Checkout**, **Assinaturas** e **Cobranças**.

Banco: `npx wrangler d1 create dash-idiomas`, copiar o `database_id` para `wrangler.jsonc` e rodar `npm run db:migrate:remote`.

## Desenvolvimento local

```bash
npm install
cp .dev.vars.example .dev.vars   # valores fictícios
npm run db:migrate:local
npm run dev                      # http://localhost:8787
npm test                         # testes da API com Asaas e planilha simulados
SCREENSHOTS=1 node tests/run.mjs tests/ui.test.mjs   # fluxo no celular (requer Playwright)
```
