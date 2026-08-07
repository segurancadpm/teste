// Gestão de Armazéns: torna o acesso permanente no menu para o SuperAdmin.
// Não altera nem lê dados do Firestore; apenas acrescenta o atalho à interface.
(() => {
  const ensureWarehouseButton = () => {
    const nav = document.querySelector('.bottom-nav');
    if (!nav) return;

    // A app só renderiza o botão de gestão de armazéns para SuperAdmin.
    const isSuperAdmin = !!document.querySelector('[data-modal="warehouses"]');
    const existing = nav.querySelector('[data-nav-warehouse]');

    if (!isSuperAdmin) {
      existing?.remove();
      return;
    }
    if (existing) return;

    const btn = document.createElement('button');
    btn.className = 'nav-btn';
    btn.dataset.navWarehouse = '1';
    btn.dataset.modal = 'warehouses';
    btn.innerHTML = `
      <span class="nav-icon" aria-hidden="true">
        <svg viewBox="0 0 24 24" fill="none" stroke-width="2">
          <path d="M3 10h18v10H3z"/><path d="M3 10l3-5h12l3 5"/>
          <path d="M7 10v10M12 10v10M17 10v10"/>
        </svg>
      </span>
      <span>Armazéns</span>`;
    nav.appendChild(btn);
  };

  const observer = new MutationObserver(ensureWarehouseButton);
  observer.observe(document.body, { childList: true, subtree: true });
  ensureWarehouseButton();
})();
