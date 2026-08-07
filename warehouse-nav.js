// Gestão de Armazéns — acesso exclusivo ao SuperAdmin.
// Não altera dados do Firestore.
(() => {
  const STORAGE_KEY = 'dpm_superadmin_warehouse_nav';

  const text = el => (el?.textContent || '').trim();
  const isWarehouseAction = el => /armaz[eé]ns/i.test(text(el));
  const hasWarehouseAction = () => [...document.querySelectorAll('button, a')].some(isWarehouseAction);

  // A presença da ação original é a única prova de que a sessão atual tem
  // permissão. Nunca damos acesso a outro perfil apenas porque este browser
  // já foi usado pelo SuperAdmin.
  const markSuperAdminSession = () => {
    if (hasWarehouseAction()) sessionStorage.setItem(STORAGE_KEY, '1');
  };

  const isLoginScreen = () => {
    const body = document.body?.innerText || '';
    return /introduza o pin|introduzir pin|c[oó]digo pin|iniciar sess[aã]o/i.test(body) &&
           document.querySelector('input[type="password"], input[inputmode="numeric"]');
  };

  const isKnownSuperAdmin = () => sessionStorage.getItem(STORAGE_KEY) === '1' && !isLoginScreen();

  const ensureWarehouseButton = () => {
    const nav = document.querySelector('.bottom-nav');
    if (!nav) return;

    // Se apareceu a ação original, esta sessão é efetivamente SuperAdmin.
    markSuperAdminSession();

    // Se voltámos ao ecrã de login, limpar a autorização antiga para impedir
    // que outro perfil herde o botão no mesmo browser.
    if (isLoginScreen()) {
      sessionStorage.removeItem(STORAGE_KEY);
      nav.querySelector('[data-nav-warehouse]')?.remove();
      return;
    }

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
      const openExisting = () => {
        const action = [...document.querySelectorAll('button, a')]
          .find(el => isWarehouseAction(el) && el !== btn);
        if (action) { action.click(); return true; }
        return false;
      };
      if (openExisting()) return;
      const home = [...document.querySelectorAll('button, a')]
        .find(el => /^(in[ií]cio|home)$/i.test(text(el)));
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
