/* Posicionamento do módulo Orçamento: substitui o cartão antigo pelo módulo profissional. */
(function(){
  const APP="#app";
  function findOriginal(){
    const nodes=[...document.querySelectorAll(`${APP} h1,${APP} h2,${APP} h3,${APP} .title,${APP} .section-title` )];
    const heading=nodes.find(el=>el.textContent.trim()==="Orçamento de Segurança");
    if(!heading) return null;
    return heading.closest(".section") || heading.closest("section") || heading.parentElement?.parentElement || heading.parentElement;
  }
  function fix(){
    const app=document.querySelector(APP), enhanced=document.querySelector("#budget-enhanced");
    if(!app||!enhanced) return;
    const original=findOriginal();
    if(!original || original===enhanced) return;
    original.style.display="none";
    const head=enhanced.querySelector(".section > .section-head");
    if(head){
      const h2=head.querySelector("h2");
      if(h2) h2.textContent="Orçamento de Segurança";
      const meta=head.querySelector(".meta");
      if(meta) meta.textContent="Gestão do orçamento 2026";
    }
    if(original.previousElementSibling!==enhanced) original.parentNode.insertBefore(enhanced,original);
  }
  new MutationObserver(fix).observe(document.querySelector(APP)||document.body,{childList:true,subtree:true});
  setTimeout(fix,50); setTimeout(fix,300); setTimeout(fix,1000);
})();
