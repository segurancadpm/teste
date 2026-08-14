// DPM — carregador seguro do Inventário Mestre
// O Inventário Mestre é carregado apenas quando solicitado; não altera o Firebase até o utilizador guardar uma ação.
let loading=false, loaded=false;
async function openInventory(){
  if(loading)return;
  loading=true;
  try{
    if(!loaded){
      await import('./inventory-general-v4.js?v=20260814-inventory-fix2');
      loaded=true;
    }
    if(window.DPMInventoryGeneral?.open){
      await window.DPMInventoryGeneral.open();
    }else{
      throw new Error('O módulo do Inventário Mestre foi carregado, mas não disponibilizou a função de abertura.');
    }
  }catch(e){
    console.error('Inventário Mestre:',e);
    alert(`Não foi possível abrir o Inventário Mestre.\n\n${e?.message||e}`);
  }finally{loading=false}
}
function bindExisting(){
  document.querySelectorAll('[data-inventory-general]').forEach(el=>{
    if(el.dataset.inventoryBound==='1')return;
    el.dataset.inventoryBound='1';
    el.addEventListener('click',e=>{e.preventDefault();e.stopImmediatePropagation();openInventory()},true);
  });
}
function inject(){
  const title=document.querySelector('.screen-title h1')?.textContent?.trim();
  if(title!=='Armazém')return;
  if(document.querySelector('[data-safe-inventory-button]'))return;
  const target=document.querySelector('main .section-head')||document.querySelector('.screen-title');
  if(!target)return;
  const button=document.createElement('button');
  button.type='button';button.className='ghost-btn';button.dataset.safeInventoryButton='1';button.textContent='▦ Inventário Mestre';
  button.addEventListener('click',e=>{e.preventDefault();e.stopImmediatePropagation();openInventory()},true);
  target.prepend(button);
}
new MutationObserver(()=>{bindExisting();inject()}).observe(document.body,{childList:true,subtree:true});
setTimeout(()=>{bindExisting();inject()},300);
window.DPMOpenInventoryMaster=openInventory;
