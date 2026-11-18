# Guia de acessos e manutenção — Site Dash Idiomas

Tudo do site fica em contas da própria escola. Este guia diz onde cada parte está,
como dar acesso a outra pessoa e como restaurar o projeto a partir do backup.

## Onde cada coisa fica

| Parte | Onde | Conta dona |
| --- | --- | --- |
| Código do site (fonte oficial) | GitHub: `github.com/dashidiom/dash-idiomas-site`, branch `main` | conta GitHub `dashidiom` |
| Hospedagem e publicação | Cloudflare > Workers e Pages > `dash-idiomas-site` | dashidiomas@gmail.com |
| Banco de dados (matrículas, status, tokens) | Cloudflare > Armazenamento e bancos de dados > D1 > `dash-idiomas` | dashidiomas@gmail.com |
| Senhas e chaves do site | Cloudflare > `dash-idiomas-site` > Configurações > Variáveis e segredos | dashidiomas@gmail.com |
| Logs (erros do site) | Cloudflare > `dash-idiomas-site` > Observability | dashidiomas@gmail.com |
| Pagamentos e assinaturas | Asaas (sandbox para testes; conta de produção para valer) | conta Asaas da escola |
| Planilha de matrículas | Google Drive: "Matrículas Dash Idiomas" (aba "Matrículas") | dashidiomas@gmail.com |
| Script que grava na planilha | script.google.com: "Matrículas Dash Idiomas - Site" | dashidiomas@gmail.com |
| Domínio | Registro.br: `dashidiomas.com.br` (em compra) | conta da escola |

## Como alterar algo

- **Qualquer mudança no site** (texto, preço, foto, página) é feita no código e enviada ao
  GitHub na branch `main`. A Cloudflare publica sozinha em cerca de 1 minuto
  (Cloudflare > `dash-idiomas-site` > Implantações mostra o andamento).
- Mudanças simples de texto podem ser feitas direto no site do GitHub: abra o arquivo
  (ex.: `public/index.html`), clique no lápis, edite e clique em "Commit changes".
- O `README.md` explica a estrutura e onde ficam textos, preços e cores.
  Preço muda em dois lugares: `src/config.ts` (o que é cobrado) e as páginas em `public/`.
- Antes de mexer em pagamento ou matrícula, rode os testes (`npm test`).

## Como dar acesso completo a outra pessoa

Dê acesso só a quem precisa e retire quando a pessoa sair. Nunca envie senhas ou chaves
por WhatsApp ou e-mail: cada serviço tem convite próprio.

1. **GitHub (código):** no repositório, Settings > Collaborators > Add people.
   Para quem só vai editar, papel "Write"; para outro responsável técnico, "Admin".
2. **Cloudflare (hospedagem, banco, chaves):** Gerenciar conta > Membros > Convidar.
   Para um desenvolvedor, o papel "Workers Admin" basta; "Administrator" dá acesso total.
3. **Planilha:** botão "Compartilhar" na planilha. Para a equipe que só consulta,
   "Leitor"; para quem organiza, "Editor".
4. **Script da planilha:** em script.google.com, abra o projeto > ícone de compartilhar
   (pessoa com +) > Editor. Só é preciso para quem for mexer na integração.
5. **Asaas:** na área de usuários da conta (menu do seu perfil), adicione um usuário com o perfil adequado
   (financeiro, atendimento etc.).
6. **Domínio:** no Registro.br, cadastre a pessoa como contato técnico, se necessário.

Para alguém (ou o Claude) trabalhar no código, basta o acesso ao GitHub. Os passos 2 a 6
só são necessários para mexer nas configurações.

## O que tem no backup e o que não tem

O arquivo `dash-idiomas-site-backup-*.zip` contém:

- todo o código do site, páginas, imagens, testes e o script da planilha;
- `dash-idiomas-site.bundle`: o histórico completo de versões (Git);
- este guia e o `README.md`.

**Não estão no backup, de propósito:**

- **Senhas e chaves** (Asaas, webhook, planilha). Elas ficam só na Cloudflare e no
  Apps Script. Se for preciso recriar, gere novas: no Asaas (Integrações > Chaves de API),
  um novo token de webhook (no Asaas e na Cloudflare iguais) e um novo segredo da planilha
  (rodando a função `configurar` do script depois de apagar a propriedade `SHEETS_SECRET`
  em Configurações do projeto > Propriedades do script).
- **Dados dos alunos.** Ficam no banco D1 e na planilha. Para uma cópia, baixe a planilha
  (Arquivo > Fazer download > Excel) ou exporte o banco no painel da Cloudflare (D1 >
  `dash-idiomas`). Guarde essas cópias com cuidado: são dados pessoais (LGPD).

## Como restaurar a partir do backup

1. Descompacte o zip.
2. Para recuperar o histórico completo: `git clone dash-idiomas-site.bundle dash-idiomas-site`.
3. Crie um repositório novo no GitHub da escola e envie o código
   (`git remote add origin <url>` e `git push -u origin main`).
4. Na Cloudflare, conecte o Worker ao novo repositório (Configurações > Compilações),
   com o comando de implantação `npm run deploy`.
5. Confira as variáveis e segredos na Cloudflare (lista no `README.md`).
