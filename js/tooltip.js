// =============================================================================
// tooltip.js - tooltip flutuante compartilhado (details on demand)
// -----------------------------------------------------------------------------
// Um unico elemento reutilizado por todas as visoes. Posicionado em
// coordenadas de PAGINA (clientX/clientY), de modo que funciona mesmo com os
// SVGs escalados por CSS (viewBox responsivo).
// =============================================================================

let el = null;

function ensure() {
  if (!el) el = document.getElementById("tooltip");
  return el;
}

// Mostra o tooltip com HTML proximo ao ponteiro, sem deixar sair da janela.
export function showTip(event, html) {
  const t = ensure();
  t.innerHTML = html;
  t.style.opacity = "1";
  const pad = 14;
  const r = t.getBoundingClientRect();
  let x = event.clientX + pad;
  let y = event.clientY + pad;
  if (x + r.width > window.innerWidth) x = event.clientX - r.width - pad;
  if (y + r.height > window.innerHeight) y = event.clientY - r.height - pad;
  t.style.left = `${x}px`;
  t.style.top = `${y}px`;
}

export function hideTip() {
  const t = ensure();
  t.style.opacity = "0";
}
