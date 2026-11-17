(() => {
  const btn = document.querySelector(".menu-toggle");
  const nav = document.getElementById("menu");
  if (btn && nav) {
    btn.addEventListener("click", () => {
      const open = nav.classList.toggle("open");
      btn.setAttribute("aria-expanded", String(open));
    });
    nav.querySelectorAll("a").forEach((a) => a.addEventListener("click", () => {
      nav.classList.remove("open");
      btn.setAttribute("aria-expanded", "false");
    }));
  }
  const ano = document.getElementById("ano");
  if (ano) ano.textContent = String(new Date().getFullYear());
})();
