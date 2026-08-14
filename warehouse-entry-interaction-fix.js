// DPM — Correção do modal de entrada de stock.
// O overlay antigo tinha data-wh-close e fechava também quando se clicava
// dentro dos selects. Aqui impedimos que esses cliques cheguem ao listener
// de fecho do overlay. Não altera Firebase nem o fluxo de gravação.
const modalRoot = document.getElementById('modal-root');
if (modalRoot) {
  modalRoot.addEventListener('click', (event) => {
    const overlay = event.target.closest?.('.modal-overlay[data-wh-close]');
    if (!overlay) return;
    if (event.target === overlay) return;
    if (event.target.closest?.('button[data-wh-close]')) return;
    if (event.target.closest?.('#wh-entry-form')) {
      event.stopPropagation();
    }
  }, true);
}
