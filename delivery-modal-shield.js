// DPM — proteção externa da janela de Entrega
// A Entrega é uma janela modal. Os eventos dos controlos não podem chegar
// aos handlers globais do app.js, caso contrário o render/navegação fecha a janela.
(function(){
  const inside = (target) => {
    const root = document.getElementById('modal-root');
    return !!(root && root.children.length && target instanceof Node && root.contains(target));
  };
  const shield = (e) => {
    if(!inside(e.target)) return;
    // Impede que o evento continue para document/window handlers do app.js.
    e.stopPropagation();
  };
  ['click','dblclick','pointerdown','pointerup','mousedown','mouseup','change','input','focusin','submit'].forEach(type=>{
    window.addEventListener(type, shield, true);
  });
  window.DPMDeliveryModalShield={version:()=>1};
})();
