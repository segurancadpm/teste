const tabs=[['epi','EPI / Planeamento'],['compras','Compras'],['trimestres','Trimestres']];
let active='epi';
function installBudgetTabs(){
  const title=document.querySelector('.screen-title h1');
  const main=document.querySelector('main');
  if(!title||title.textContent.trim()!=='Orçamento'||!main)return false;
  if(main.querySelector('.budget-module-tabs'))return true;
  const sections=[...main.children].filter(el=>el.matches('.section'));
  if(!sections.length)return false;
  const nav=document.createElement('nav');
  nav.className='budget-module-tabs';
  nav.setAttribute('aria-label','Secções do orçamento');
  nav.innerHTML=tabs.map(([id,label],i)=>`<button type="button" class="budget-module-tab ${i===0?'active':''}" data-budget-tab="${id}">${label}</button>`).join('');
  main.insertBefore(nav,sections[0]);
  const apply=()=>{
    const index={epi:0,compras:1,trimestres:2}[active];
    sections.forEach((s,i)=>s.style.display=i===index?'':'none');
    nav.querySelectorAll('[data-budget-tab]').forEach(b=>b.classList.toggle('active',b.dataset.budgetTab===active));
  };
  nav.addEventListener('click',e=>{const b=e.target.closest('[data-budget-tab]');if(!b)return;active=b.dataset.budgetTab;apply();});
  apply();
  return true;
}
const observer=new MutationObserver(()=>{if(installBudgetTabs())observer.disconnect();});
observer.observe(document.body,{childList:true,subtree:true});
setTimeout(installBudgetTabs,300);