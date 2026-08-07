// Gestão de Armazéns: acesso persistente para o SuperAdmin.
// Não altera dados do Firestore.
(() => {
  const STORAGE_KEY = 'dpm_superadmin_warehouse_nav';

  const hasWarehouseAction = () => [...document.querySelectorAll('button, a')]
    .some(el => /armaz[eé]ns/i.test((el.textContent || '').trim()));

  const isKnownSuperAdmin = () => sessionStorage.getItem(STORAGE_KEY) === '1';

  const ensureWarehouseButton = () => {
    const nav = document.querySelector('.bottom-nav');
    if (!nav) return;

    // Quando a ação original aparece no ecrã inicial, confirmamos que esta sessão
    // tem acesso à gestão de armazéns. A marca fica apenas na sessão do browser.
    if (hasWarehouseAction()) sessionStorage.setItem(STORAGE_KEY, '1');

    const existing = nav.querySelector('[data-nav-warehouse]');
    if (!isKnownSuperAdmin()) {
      existing?.remove();
      return;
    }
    if (existing) return;

    const btn = document.createElement('button');
    btn.className = 'nav-btn';
    btn.dataset.navWarehouse = '1';
    btn.type = 'button';
    btn.setAttribute('aria-label', 'Gerir Armazéns');
    btn.innerHTML = `
      <span class="nav-icon" aria-hidden="true">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M3 10h18v10H3z"/><path d="M3 10l3-5h12l3 5"/>
          <path d="M7 10v10M12 10v10M17 10v10"/>
        </svg>
      </span>
      <span>Armazéns</span>`;

    btn.addEventListener('click', () => {
      // A gestão original é aberta a partir da página inicial. Se já estiver
      // presente, abrimos diretamente; caso contrário voltamos ao Início e
      // acionamos a opção original, preservando toda a lógica existente.
      const openExisting = () => {
        const action = [...document.querySelectorAll('button, a')]
          .find(el => /armaz[eé]ns/i.test((el.textContent || '').trim()) && el !== btn);
        if (action) {
          action.click();
          return true;
        }
        return false;
      };

      if (openExisting()) return;

      const home = [...document.querySelectorAll('button, a')]
        .find(el => /^(in[ií]cio|home)$/i.test((el.textContent || '').trim()));
      if (home) home.click();

      let attempts = 0;
      const timer = setInterval(() => {
        attempts += 1;
        if (openExisting() || attempts >= 20) clearInterval(timer);
      }, 100);
    });

    nav.appendChild(btn);
  };

  const observer = new MutationObserver(ensureWarehouseButton);
  observer.observe(document.body, { childList: true, subtree: true });
  ensureWarehouseButton();
})();
