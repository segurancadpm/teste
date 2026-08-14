// DPM — Entrega fora da árvore DOM da aplicação.
// Mantém o trabalhador exato da ficha, incluindo o código inicial (ex.: 0241),
// porque o catálogo de trabalhadores pode usar o nome completo como identificador.
(function(){
  let frame=null,overlay=null;
  function close(){overlay?.remove();overlay=null;frame=null}
  function open(){
    const h=document.querySelector('.detail-header h1');
    if(!h){alert('Não foi possível identificar o trabalhador.');return}
    const full=h.textContent.trim();
    // NÃO remover o código do trabalhador: o iframe tenta primeiro a correspondência exata.
    const name=full;
    const responsavel=document.querySelector('.user-chip span:last-child')?.textContent?.trim()||'SuperAdmin';
    overlay=document.createElement('div');
    overlay.id='dpm-delivery-frame-overlay';
    overlay.style.cssText='position:fixed;inset:0;z-index:10000;background:rgba(0,0,0,.65);display:flex;align-items:center;justify-content:center;padding:18px;box-sizing:border-box';
    frame=document.createElement('iframe');
    frame.title='Registar Entrega de EPI';
    frame.style.cssText='width:min(820px,100%);height:min(850px,96vh);border:0;border-radius:12px;background:#fff;box-shadow:0 20px 70px rgba(0,0,0,.4)';
    frame.src='delivery-iframe.html?name='+encodeURIComponent(name)+'&responsavel='+encodeURIComponent(responsavel)+'&v=20260814-iframe2';
    overlay.appendChild(frame);document.body.appendChild(overlay);
  }
  document.addEventListener('click',e=>{
    const launch=e.target.closest?.('[data-modal="delivery"]');
    if(!launch)return;
    e.preventDefault();e.stopImmediatePropagation();open();
  },true);
  window.addEventListener('message',e=>{
    if(e.origin!==location.origin)return;
    if(e.data?.type==='dpm-delivery-cancel'||e.data?.type==='dpm-delivery-saved')close();
  });
})();
