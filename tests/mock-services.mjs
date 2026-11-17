// Simula a API do Asaas e o Web App da planilha para testes locais (dados fictícios).
import http from "node:http";

const state = { checkouts: [], deleted: [], sheetRows: new Map(), sheetPosts: 0 };
const port = Number(process.env.MOCK_PORT || 9911);

http.createServer(async (req, res) => {
  let body = "";
  for await (const chunk of req) body += chunk;
  const send = (code, obj) => { res.writeHead(code, { "content-type": "application/json" }); res.end(JSON.stringify(obj)); };

  if (req.url === "/__state") return send(200, { ...state, sheetRows: Object.fromEntries(state.sheetRows) });
  if (req.method === "POST" && req.url === "/v3/checkouts") {
    if (req.headers["access_token"] !== "chave-sandbox-ficticia") return send(401, { errors: [{ description: "invalid key" }] });
    const data = JSON.parse(body);
    const id = `chk_${state.checkouts.length + 1}`;
    state.checkouts.push({ id, body: data });
    return send(200, { id, link: `http://127.0.0.1:${port}/checkout/${id}` });
  }
  if (req.method === "DELETE" && req.url.startsWith("/v3/subscriptions/")) {
    state.deleted.push(req.url.split("/").pop());
    return send(200, { deleted: true });
  }
  if (req.method === "GET" && req.url.startsWith("/checkout/")) {
    res.writeHead(200, { "content-type": "text/html" });
    return res.end("<h1>Checkout Asaas (simulado)</h1>");
  }
  if (req.method === "POST" && req.url === "/sheets") {
    const data = JSON.parse(body);
    if (data.secret !== "segredo-planilha-ficticio") return send(200, { ok: false, error: "unauthorized" });
    state.sheetPosts++;
    state.sheetRows.set(data.row.id, data.row);
    return send(200, { ok: true });
  }
  send(404, { error: "not found" });
}).listen(port, "127.0.0.1", () => console.log(`mock on ${port}`));
