(() => {
  const tabs = [
    ["epi", "EPI / Planeamento"],
    ["compras", "Compras"],
    ["trimestres", "Trimestres"]
  ];
  const STORAGE_KEY = "dpm.budgetTab";
  let active = "epi";
  let scheduled = false;

  try {
    const saved = sessionStorage.getItem(STORAGE_KEY);
    if (tabs.some(([id]) => id === saved)) active = saved;
  } catch (_) {}

  function budgetMain() {
    const title = document.querySelector(".screen-title h1");
    const main = document.querySelector("main");
    if (!title || title.textContent.trim() !== "Orçamento" || !main) return null;
    return main;
  }

  function sections(main) {
    return [...main.children].filter(el => el.matches(".section"));
  }

  function apply(main, nav) {
    const currentSections = sections(main);
    if (!currentSections.length) return;

    const index = { epi: 0, compras: 1, trimestres: 2 }[active];
    currentSections.forEach((section, i) => {
      section.style.display = i === index ? "" : "none";
    });

    nav.querySelectorAll("[data-budget-tab]").forEach(button => {
      const selected = button.dataset.budgetTab === active;
      button.classList.toggle("active", selected);
      button.setAttribute("aria-selected", selected ? "true" : "false");
    });
  }

  function install() {
    const main = budgetMain();
    if (!main) return;

    let nav = main.querySelector(".budget-module-tabs");
    if (!nav) {
      nav = document.createElement("nav");
      nav.className = "budget-module-tabs";
      nav.setAttribute("aria-label", "Secções do orçamento");
      nav.setAttribute("role", "tablist");
      nav.innerHTML = tabs.map(([id, label]) =>
        `<button type="button" role="tab" class="budget-module-tab" data-budget-tab="${id}" aria-selected="false">${label}</button>`
      ).join("");
      const firstSection = sections(main)[0];
      if (firstSection) main.insertBefore(nav, firstSection);
    }

    if (!nav.dataset.bound) {
      nav.dataset.bound = "1";
      nav.addEventListener("click", event => {
        const button = event.target.closest("[data-budget-tab]");
        if (!button) return;
        active = button.dataset.budgetTab;
        try { sessionStorage.setItem(STORAGE_KEY, active); } catch (_) {}
        apply(main, nav);
      });
    }

    apply(main, nav);
  }

  function scheduleInstall() {
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(() => {
      scheduled = false;
      install();
    });
  }

  // O app.js recria o conteúdo do <main> sempre que muda de página.
  // Mantemos o observer ativo para reinstalar a barra e nunca usar referências
  // a secções antigas.
  const observer = new MutationObserver(scheduleInstall);
  observer.observe(document.body, { childList: true, subtree: true });
  scheduleInstall();
})();
