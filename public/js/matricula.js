(() => {
  const form = document.getElementById("form-matricula");
  const alertBox = document.getElementById("alert");
  const submit = document.getElementById("enviar");

  // Pré-seleciona o plano vindo do botão do site (?plano=2x)
  const plano = new URLSearchParams(location.search).get("plano");
  if (plano) {
    const radio = form.querySelector(`input[name="plano"][value="${CSS.escape(plano)}"]`);
    if (radio) radio.checked = true;
  }

  // Máscara simples de celular
  const tel = form.querySelector("#whatsapp");
  tel.addEventListener("input", () => {
    const d = tel.value.replace(/\D/g, "").slice(0, 11);
    let out = d;
    if (d.length > 2) out = `(${d.slice(0, 2)}) ${d.slice(2)}`;
    if (d.length > 7) out = `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
    tel.value = out;
  });

  function clearErrors() {
    form.querySelectorAll(".has-error").forEach((el) => el.classList.remove("has-error"));
    alertBox.classList.remove("show");
  }

  function showErrors(fields) {
    let first = null;
    for (const [name, msg] of Object.entries(fields)) {
      const box = form.querySelector(`[data-field="${name}"]`);
      if (!box) continue;
      box.classList.add("has-error");
      box.querySelector(".error").textContent = msg;
      first = first || box;
    }
    if (first) {
      first.scrollIntoView({ behavior: "smooth", block: "center" });
      const input = first.querySelector("input, select, textarea");
      if (input) input.focus({ preventScroll: true });
    }
  }

  form.addEventListener("submit", async (ev) => {
    ev.preventDefault();
    clearErrors();
    const data = Object.fromEntries(new FormData(form).entries());
    data.aceite = form.querySelector('input[name="aceite"]').checked;
    data.autoriza_imagem = form.querySelector('input[name="autoriza_imagem"]').checked;
    data.autoriza_marketing = form.querySelector('input[name="autoriza_marketing"]').checked;
    submit.disabled = true;
    submit.textContent = "Enviando…";
    try {
      const res = await fetch("/api/matricula", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(data),
      });
      const body = await res.json().catch(() => ({}));
      if (res.ok && body.pagamentoUrl) {
        location.href = body.pagamentoUrl;
        return;
      }
      alertBox.textContent = body.error || "Não foi possível enviar agora. Tente de novo.";
      alertBox.classList.add("show");
      if (body.fields) showErrors(body.fields);
      else alertBox.scrollIntoView({ behavior: "smooth", block: "center" });
    } catch {
      alertBox.textContent = "Sem conexão. Verifique sua internet e tente de novo.";
      alertBox.classList.add("show");
    }
    submit.disabled = false;
    submit.textContent = "Continuar para o pagamento";
  });
})();
