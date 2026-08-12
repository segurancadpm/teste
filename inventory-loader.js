// DPM — carregador seguro do Inventário Geral
// O módulo extra só é carregado quando o Super Admin o abre.
let loading = false;
let loaded = false;

const isSuper = () => !!document.querySelector('.bottom-nav [data-page="budget"]');

async function openInventory() {
  if (loading) return;
  if (loaded) {
    window.dispatchEvent(new CustomEvent('dpm:open-inventory'));
    return;
  }
  loading = true;
  try {
    await import('./inventory-general-v3.js?v=20260812-catalog');
    loaded = true;
    window.dispatchEvent(new CustomEvent('dpm:open-inventory'));
  } catch (e) {
    console.error('Inventário Geral:', e);
    alert(`Não foi possível abrir o Inventário Geral.\n\n${e.message || e}`);
  } finally {
    loading = false;
  }
}

function inject() {
  if (!isSuper()) return;
  const page = document.querySelector('.screen-title h1')?.textContent?.trim();
  if (page !== 'Armazém') return;
  if (document.querySelector('[data-safe-inventory-button]')) return;
  const target = document.querySelector('main .section-head') || document.querySelector('.screen-title');
  if (!target) return;
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'ghost-btn';
  button.dataset.safeInventoryButton = '1';
  button.textContent = '▦ Inventário Geral';
  button.addEventListener('click', e => {
    e.preventDefault();
    e.stopImmediatePropagation();
    openInventory();
  }, true);
  target.prepend(button);
}

const observer = new MutationObserver(inject);
observer.observe(document.body, { childList:true, subtree:true });
setTimeout(inject, 500);
