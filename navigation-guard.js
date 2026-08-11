// Navegação estável da aplicação DPM.
// Mantém o Orçamento como uma página única e evita que renders sucessivos
// deixem o utilizador noutra página por engano.
(() => {
  const KEY = "dpm.lastPage";
  let correcting = false;

  function setPage(page) {
    try {
      if (page === "budget") sessionStorage.setItem(KEY, "budget");
      else sessionStorage.removeItem(KEY);
    } catch (_) {}
  }

  function budgetButton() {
    return document.querySelector('.bottom-nav [data-page="budget"]');
  }

  function enforceBudget() {
    if (correcting) return;
    let wanted = false;
    try { wanted = sessionStorage.getItem(KEY) === "budget"; } catch (_) {}
    if (!wanted) return;

    const btn = budgetButton();
    if (!btn || btn.classList.contains("active")) return;

    correcting = true;
    btn.click();
    setTimeout(() => { correcting = false; }, 80);
  }

  document.addEventListener("click", (ev) => {
    const btn = ev.target.closest('.bottom-nav [data-page]');
    if (!btn) return;
    setPage(btn.dataset.page);
  }, true);

  const observer = new MutationObserver(() => {
    enforceBudget();
  });
  observer.observe(document.body, { childList: true, subtree: true });

  // Se o utilizador estiver a voltar à aplicação depois de um refresh,
  // recupera apenas a última página se ela era o Orçamento.
  setTimeout(enforceBudget, 250);
  setTimeout(enforceBudget, 800);
})();
