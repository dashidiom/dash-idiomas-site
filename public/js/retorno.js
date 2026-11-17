(() => {
  // Mostra apenas o status confirmado pelo sistema (notificação do Asaas), nunca o simples retorno do checkout.
  const token = new URLSearchParams(location.search).get("t");
  const $ = (id) => document.getElementById(id);
  const MAX_TRIES = 40; // ~2 minutos
  let tries = 0;

  const STATES = {
    ativa: {
      badge: "Assinatura ativa", cls: "status-ativa", titulo: "Matrícula confirmada! 🎉",
      texto: "Seu pagamento foi aprovado e a assinatura está ativa. A equipe da Dash vai falar com você pelo WhatsApp para combinar os horários das aulas.",
      acao: '<a class="btn btn-primary" href="/">Voltar ao site</a>',
    },
    recusada: {
      badge: "Cobrança recusada", cls: "status-recusada", titulo: "O cartão recusou a cobrança",
      texto: "Nada foi cobrado. Você pode tentar de novo com outro cartão.",
      acao: null,
    },
    cancelada: {
      badge: "Assinatura cancelada", cls: "status-cancelada", titulo: "Assinatura cancelada",
      texto: "Esta assinatura está cancelada. Se foi um engano, fale com a Dash Idiomas.",
      acao: '<a class="btn btn-outline" href="/">Voltar ao site</a>',
    },
  };

  function render(state) {
    const s = STATES[state];
    $("badge").textContent = s.badge;
    $("badge").className = `status-badge ${s.cls}`;
    $("titulo").textContent = s.titulo;
    $("texto").textContent = s.texto;
    $("acoes").innerHTML = s.acao || `<a class="btn btn-primary" href="/pagamento/?t=${encodeURIComponent(token)}">Tentar novamente</a>`;
  }

  async function poll() {
    if (!token) {
      $("titulo").textContent = "Link inválido";
      $("texto").textContent = "Não encontramos esta matrícula.";
      return;
    }
    tries++;
    try {
      const res = await fetch(`/api/pagamento?t=${encodeURIComponent(token)}`, { cache: "no-store" });
      const data = await res.json();
      if (!res.ok) {
        $("titulo").textContent = "Não encontramos esta matrícula";
        $("texto").textContent = data.error || "";
        return;
      }
      if (STATES[data.status]) return render(data.status);
    } catch { /* tenta de novo */ }
    if (tries < MAX_TRIES) return setTimeout(poll, 3000);
    $("badge").textContent = "Pagamento pendente";
    $("titulo").textContent = "Ainda não recebemos a confirmação";
    $("texto").textContent = "Se você concluiu o pagamento, a confirmação pode levar alguns minutos. Você pode recarregar esta página mais tarde; a equipe da Dash também acompanha sua matrícula.";
    $("acoes").innerHTML = '<button class="btn btn-outline" onclick="location.reload()">Verificar de novo</button>';
  }

  poll();
})();
