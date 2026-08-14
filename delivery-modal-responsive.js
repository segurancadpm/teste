/* DPM — Responsive delivery modal sizing
 * Visual-only: does not alter delivery logic, Firebase, or event handling.
 * Keeps the delivery form large enough for model/size/quantity on desktop and mobile.
 */
(() => {
  const isDeliveryModal = (el) => {
    if (!el || el.nodeType !== 1) return false;
    const text = (el.textContent || '').replace(/\s+/g, ' ').trim();
    return /Registar Entrega(?: de EPI)?/i.test(text) &&
      (el.querySelector('select') || el.querySelector('input'));
  };

  function findDeliveryBox() {
    const heading = [...document.querySelectorAll('h1,h2,h3,h4,[role="heading"]')]
      .find(el => /Registar Entrega(?: de EPI)?/i.test((el.textContent || '').trim()));
    if (!heading) return null;

    let node = heading;
    for (let i = 0; node && i < 7; i++, node = node.parentElement) {
      if (isDeliveryModal(node)) {
        const rect = node.getBoundingClientRect();
        if (rect.width > 0 || getComputedStyle(node).position === 'fixed' || getComputedStyle(node).position === 'absolute') {
          return node;
        }
      }
    }
    return null;
  }

  function fitDeliveryModal() {
    const box = findDeliveryBox();
    if (!box) return;

    box.style.setProperty('width', 'min(96vw, 960px)', 'important');
    box.style.setProperty('max-width', '960px', 'important');
    box.style.setProperty('min-width', 'min(0px, 100%)', 'important');
    box.style.setProperty('max-height', '92dvh', 'important');
    box.style.setProperty('overflow-y', 'auto', 'important');
    box.style.setProperty('overflow-x', 'hidden', 'important');
    box.style.setProperty('box-sizing', 'border-box', 'important');

    const viewport = window.innerWidth;
    if (viewport <= 600) {
      box.style.setProperty('width', 'calc(100vw - 16px)', 'important');
      box.style.setProperty('max-width', 'calc(100vw - 16px)', 'important');
      box.style.setProperty('max-height', '90dvh', 'important');
      box.style.setProperty('border-radius', '12px', 'important');
    }
  }

  const observer = new MutationObserver(() => requestAnimationFrame(fitDeliveryModal));
  observer.observe(document.body, { childList: true, subtree: true });
  window.addEventListener('resize', fitDeliveryModal, { passive: true });
  window.addEventListener('orientationchange', () => setTimeout(fitDeliveryModal, 100), { passive: true });
  requestAnimationFrame(fitDeliveryModal);
})();
