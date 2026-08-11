/* Posiciona o módulo Orçamento no topo da área principal sem manipulação DOM frágil. */
(function () {
  const APP = "#app";
  let scheduled = false;

  function findOriginal() {
    const nodes = [...document.querySelectorAll(`${APP} h1,${APP} h2,${APP} h3,${APP} .title,${APP} .section-title`)];
    const heading = nodes.find(el => el.textContent.trim() === "Orçamento de Segurança");
    if (!heading) return null;
    return heading.closest(".section") || heading.closest("section") || heading.parentElement?.parentElement || heading.parentElement;
  }

  function fix() {
    scheduled = false;
    const app = document.querySelector(APP);
    const enhanced = document.querySelector("#budget-enhanced");
    if (!app || !enhanced) return;

    const original = findOriginal();
    if (!original || original === enhanced) return;

    /* Primeiro movemos o módulo para o topo do #app.
       Não usamos original.parentNode.insertBefore(), porque o módulo pode
       estar inicialmente dentro de outro contentor e isso causa:
       "The new child element contains the parent". */
    if (app.firstElementChild !== enhanced) {
      app.insertBefore(enhanced, app.firstElementChild || null);
    }

    /* Só depois escondemos o cartão antigo. */
    original.style.display = "none";

    const head = enhanced.querySelector(".section > .section-head");
    if (head) {
      const h2 = head.querySelector("h2");
      if (h2) h2.textContent = "Orçamento de Segurança";
      const meta = head.querySelector(".meta");
      if (meta) meta.textContent = "Gestão do orçamento 2026";
    }
  }

  function schedule() {
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(fix);
  }

  const observer = new MutationObserver(schedule);
  observer.observe(document.querySelector(APP) || document.body, { childList: true, subtree: true });
  window.addEventListener("dpm:catalog-updated", schedule);
  setTimeout(fix, 50);
  setTimeout(fix, 300);
  setTimeout(fix, 1000);
})();
