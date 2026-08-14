// DPM — catálogo mestre na Entrega
// A Entrega já possui o seu próprio fluxo de artigo/modelo/tamanho.
// Este módulo NÃO injeta, substitui ou re-renderiza o seletor de modelo.
// Serve apenas para invalidar o cache quando o Inventário Mestre muda.
let cacheVersion=0;
window.addEventListener('dpm:master-changed',()=>{cacheVersion++;window.DPMDeliveryCatalogVersion=cacheVersion});
window.DPMDeliveryCatalog={version:()=>cacheVersion};