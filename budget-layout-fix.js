// Corrige apenas a posição do módulo financeiro dentro do <main>.
// O app principal cria .app-top (logo/título) e depois o conteúdo da página.
// O módulo de orçamento não deve ficar antes do cabeçalho.
(() => {
  function fix() {
    const main = document.querySelector("main");
    if (!main) return;
    const root = main.querySelector(":scope > .budget-management-root");
    const top = main.querySelector(":scope > .app-top");
    if (!root || !top) return;
    if (top.nextElementSibling !== root) top.insertAdjacentElement("afterend", root);
  }

  const observer = new MutationObserver(fix);
  observer.observe(document.body, { childList: true, subtree: true });
  fix();
})();
