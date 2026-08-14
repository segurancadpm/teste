// DPM — fronteira DOM da Entrega
// O formulário de entrega é uma janela funcional independente.
// Os handlers do próprio delivery-core-v2 correm primeiro no modal-root;
// esta camada impede que o mesmo evento continue para os handlers globais do app.
(function(){
  const root=document.getElementById('modal-root');
  if(!root) return;
  const isDelivery=e=>!!e.target?.closest?.('#df2-form, [data-df2], .kiosk');
  ['click','change','input','focusin','keydown','submit'].forEach(type=>{
    root.addEventListener(type,e=>{
      if(isDelivery(e)) e.stopPropagation();
    },false);
  });
})();
