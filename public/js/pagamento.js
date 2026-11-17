(() => {
  const params = new URLSearchParams(location.search);
  const token = params.get("t");
  const $ = (id) => document.getElementById(id);
  const show = (el, msg) => { el.textContent = msg; el.classList.add("show"); };

  if (params.get("checkout") === "cancelado") show($("aviso"), "O pagamento não foi concluído. Quando quiser, é só tentar de novo.");
  if (params.get("checkout") === "expirado") show($("aviso"), "A página de pagamento expirou por tempo. Clique de novo para abrir uma nova.");

  async function load() {
    if (!token) {
      $("carregando").hidden = true;
      show($("erro"), "Link inválido. Comece pela página de planos.");
      return;
    }
    try {
      const res = await fetch(`/api/pagamento?t=${encodeURIComponent(token)}`);
      const data = await res.json();
      $("carregando").hidden = true;
      if (!res.ok) return show($("erro"), data.error || "Link inválido.");
      if (data.status === "ativa") {
        location.replace(`/pagamento/retorno/?t=${encodeURIComponent(token)}`);
        return;
      }
      if (data.status === "cancelada") return show($("erro"), "Esta matrícula foi cancelada. Fale com a Dash Idiomas.");
      if (data.status === "recusada") show($("aviso"), "A última cobrança foi recusada pelo cartão. Você pode tentar com outro cartão.");
      $("titulo").textContent = `${data.nome}, confira sua assinatura`;
      $("r-plano").textContent = data.plano;
      $("r-objetivo").textContent = data.objetivo;
      $("r-valor").textContent = `${data.valor} por mês`;
      $("r-periodicidade").textContent = data.periodicidade;
      $("r-primeira").textContent = `Hoje, ${data.primeiraCobranca}`;
      $("resumo").hidden = false;
    } catch {
      $("carregando").hidden = true;
      show($("erro"), "Sem conexão. Verifique sua internet e recarregue a página.");
    }
  }

  $("confirmo").addEventListener("change", (e) => { $("pagar").disabled = !e.target.checked; });

  $("pagar").addEventListener("click", async () => {
    const btn = $("pagar");
    btn.disabled = true;
    btn.textContent = "Abrindo pagamento…";
    $("erro").classList.remove("show");
    try {
      const res = await fetch("/api/checkout", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ t: token }),
      });
      const data = await res.json();
      if (res.ok && data.checkoutUrl) {
        location.href = data.checkoutUrl;
        return;
      }
      show($("erro"), data.error || "Não foi possível abrir o pagamento.");
    } catch {
      show($("erro"), "Sem conexão. Tente de novo.");
    }
    btn.disabled = false;
    btn.textContent = "Ir para o pagamento seguro";
  });

  load();
})();
