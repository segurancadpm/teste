// DPM — Orçamento por ano
// Mantém 2026, 2027, etc. separados sem copiar nem apagar o catálogo mestre.
const YEAR_KEY = 'dpm_budget_selected_year';
const currentYear = () => new Date().getFullYear();
const validYear = y => Number.isInteger(Number(y)) && Number(y) >= 2020 && Number(y) <= 2100;

function ensureYearSelector(){
  const root = document.querySelector('.budget-management-root');
  if(!root || root.querySelector('[data-budget-year]')) return;
  const year = Number(localStorage.getItem(YEAR_KEY)) || currentYear();
  const bar = document.createElement('div');
  bar.dataset.budgetYearBar = '1';
  bar.style.cssText='display:flex;align-items:center;gap:10px;flex-wrap:wrap;padding:10px 14px;margin:0 0 12px;border:1px solid rgba(127,160,180,.22);border-radius:10px;background:rgba(255,255,255,.03)';
  bar.innerHTML=`<strong style="font-size:14px">Ano do orçamento</strong><select class="select" data-budget-year style="min-width:110px"></select><span style="font-size:12px;opacity:.7">O catálogo de EPI é comum; planeamento e execução são separados por ano.</span>`;
  root.prepend(bar);
  const select=bar.querySelector('[data-budget-year]');
  for(let y=currentYear()-2;y<=currentYear()+5;y++) select.add(new Option(String(y),String(y),y===year,y===year));
  select.addEventListener('change',()=>{const y=Number(select.value);if(validYear(y)){localStorage.setItem(YEAR_KEY,String(y));window.dispatchEvent(new CustomEvent('dpm:budget-year-changed',{detail:{year:y}}));}});
}

function applyYearToKnownPlanning(){
  const year=Number(localStorage.getItem(YEAR_KEY))||currentYear();
  const root=document.querySelector('.budget-management-root');
  if(root) root.dataset.budgetYear=String(year);
  window.DPMBudgetYear=year;
}

const observer=new MutationObserver(()=>{ensureYearSelector();applyYearToKnownPlanning();});
observer.observe(document.body,{childList:true,subtree:true});
setTimeout(()=>{ensureYearSelector();applyYearToKnownPlanning();},500);
window.addEventListener('dpm:open-budget',()=>setTimeout(()=>{ensureYearSelector();applyYearToKnownPlanning();},50));
