// DPM — lançador de Entrega ISOLADO
// Mantém o formulário fora da árvore DOM principal para impedir conflitos de eventos.
(function () {
  let overlay = null;

  function close() {
    if (overlay) overlay.remove();
    overlay = null;
  }

  function openDelivery() {
    const heading = document.querySelector('.detail-header h1');
    if (!heading) {
      alert('Não foi possível identificar o trabalhador.');
      return;
    }

    // Não remover o número/identificador: ele faz parte da identificação do trabalhador.
    const workerLabel = heading.textContent.trim();
    const responsavel = document.querySelector('.user-chip span:last-child')?.textContent?.trim() || 'SuperAdmin';

    close();
    overlay = document.createElement('div');
    overlay.id = 'dpm-delivery-isolated-overlay';
    overlay.style.cssText = [
      'position:fixed', 'inset:0', 'z-index:2147483000',
      'background:rgba(0,0,0,.68)', 'display:flex',
      'align-items:center', 'justify-content:center',
      'padding:16px', 'box-sizing:border-box'
    ].join(';');

    const frame = document.createElement('iframe');
    frame.title = 'Registar Entrega de EPI';
    frame.setAttribute('allow', 'pointer-lock');
    frame.style.cssText = [
      'display:block', 'width:min(900px,100%)',
      'height:min(900px,96vh)', 'border:0',
      'border-radius:12px', 'background:#fff',
      'box-shadow:0 24px 80px rgba(0,0,0,.45)'
    ].join(';');
    frame.src = 'delivery-iframe.html?name=' + encodeURIComponent(workerLabel) +
      '&responsavel=' + encodeURIComponent(responsavel) +
      '&v=20260814-isolated-v3';

    overlay.appendChild(frame);
    document.body.appendChild(overlay);
  }

  document.addEventListener('click', function (event) {
    const launcher = event.target?.closest?.('[data-modal="delivery"]');
    if (!launcher) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    openDelivery();
  }, true);

  window.addEventListener('message', function (event) {
    if (event.origin !== location.origin) return;
    if (event.data?.type === 'dpm-delivery-saved' || event.data?.type === 'dpm-delivery-cancel') close();
  });
})();
