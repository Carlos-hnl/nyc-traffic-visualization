// =============================================================================
// main.js - orquestrador do painel
// -----------------------------------------------------------------------------
// Responsavel por: (1) subir o DuckDB e a amostra; (2) inicializar as visoes;
// (3) coordenar o re-render (cross-filter); (4) montar os controles globais
// (chips de bairro, barra de filtros ativos, "limpar tudo"). É o unico modulo
// que conhece todas as visoes.
// =============================================================================

import { initDB } from "./db.js";
import { setRefreshHandler } from "./bus.js";
import { filters, hasAnyFilter } from "./state.js";
import { BOROUGHS, boroughLabel, factorLabel, WEEKDAYS } from "./config.js";

import * as mapView from "./views/map.js";
import * as timeView from "./views/timeline.js";
import * as heatView from "./views/heatmap.js";
import * as barsView from "./views/bars.js";
import * as statsView from "./views/stats.js";

// Visoes que produzem dados a partir de uma query (ordem: das mais baratas para
// a mais cara - o mapa, com milhares de pontos, fica por ultimo).
const dataViews = [timeView, heatView, barsView, mapView];

const $ = (id) => document.getElementById(id);

// ----------------------------------------------------------------------------
// Orquestracao do re-render (coracao das VISOES COORDENADAS)
// ----------------------------------------------------------------------------
// As queries rodam em SEQUENCIA na mesma conexao DuckDB (evita concorrencia na
// conexao). Uma trava simples impede sobreposicao: se um refresh chega durante
// outro, agendamos um unico refresh final para garantir consistencia.
let running = false;
let queued = false;

async function refresh(except = null) {
  if (running) { queued = true; return; }
  running = true;
  try {
    for (const v of dataViews) {
      if (v.NAME !== except) await v.update();
    }
    await statsView.update();
  } catch (err) {
    console.error("Falha ao atualizar as visões:", err);
  } finally {
    running = false;
    renderFilterBar();
    if (queued) { queued = false; await refresh(); }
  }
}

// ----------------------------------------------------------------------------
// Chips de bairro (filtro categorico "borough")
// ----------------------------------------------------------------------------
function buildChips() {
  const box = $("chips");
  box.innerHTML = "";
  for (const [value, label] of BOROUGHS) {
    const b = document.createElement("button");
    b.className = "chip";
    b.dataset.value = value;
    b.textContent = label;
    b.setAttribute("aria-pressed", "false");
    b.addEventListener("click", () => {
      // Multipla selecao: adiciona/remove este bairro da lista (acumula),
      // sem afetar os demais ja escolhidos - igual aos fatores e celulas.
      const i = filters.boroughs.indexOf(value);
      if (i === -1) filters.boroughs.push(value);
      else filters.boroughs.splice(i, 1);
      syncChips();
      refresh(); // muda contagens de todas as visoes
    });
    box.appendChild(b);
  }
}

// Reflete o estado de filters.boroughs nas classes/aria dos chips.
function syncChips() {
  document.querySelectorAll("#chips .chip").forEach((b) => {
    const on = filters.boroughs.includes(b.dataset.value);
    b.classList.toggle("active", on);
    b.setAttribute("aria-pressed", String(on));
  });
}

// ----------------------------------------------------------------------------
// Barra de filtros ativos (narra o recorte em linguagem simples)
// ----------------------------------------------------------------------------
const pad = (n) => String(n).padStart(2, "0");
const monthYear = (d) => `${pad(d.getMonth() + 1)}/${String(d.getFullYear()).slice(2)}`;

function renderFilterBar() {
  const bar = $("filters");
  bar.innerHTML = "";

  // Lista de pills: [rotulo, funcao que remove o filtro].
  const pills = [];
  // Um pill por bairro selecionado (cada um removivel individualmente).
  if (filters.boroughs.length)
    for (const b of filters.boroughs)
      pills.push([`Bairro: ${boroughLabel(b)}`, () => {
        filters.boroughs = filters.boroughs.filter((x) => x !== b);
        syncChips();
      }]);
  // Gravidade (so aparece quando diferente de "todos"). Remover volta a "all" e
  // ressincroniza o controle segmentado do mapa.
  if (filters.severity !== "all")
    pills.push([
      filters.severity === "fatal" ? "Só com mortes" : "Só sem mortes",
      () => { filters.severity = "all"; mapView.syncSeverity(); },
    ]);
  if (filters.factors.length)
    for (const f of filters.factors)
      pills.push([`Fator: ${factorLabel(f)}`, () => {
        filters.factors = filters.factors.filter((x) => x !== f);
      }]);
  if (filters.cells.length)
    for (const c of filters.cells)
      pills.push([`${WEEKDAYS[c.dow - 1]} · ${c.label}`, () => {
        filters.cells = filters.cells.filter((x) => !(x.bin === c.bin && x.dow === c.dow));
      }]);
  if (filters.date)
    pills.push([`${monthYear(filters.date[0])}–${monthYear(filters.date[1])}`,
      () => { filters.date = null; timeView.clearBrush(); }]);
  if (filters.geo)
    pills.push(["Área no mapa", () => { filters.geo = null; mapView.clearBrush(); }]);

  if (pills.length === 0) {
    const hint = document.createElement("span");
    hint.className = "filter-hint";
    hint.textContent = "Nenhum filtro - explore arrastando no mapa/linha do tempo ou clicando nas barras e células.";
    bar.appendChild(hint);
  } else {
    for (const [label, remove] of pills) {
      const pill = document.createElement("button");
      pill.className = "pill";
      pill.innerHTML = `<span>${label}</span><span class="pill-x" aria-hidden="true">✕</span>`;
      pill.setAttribute("aria-label", `Remover filtro ${label}`);
      pill.addEventListener("click", () => { remove(); refresh(); });
      bar.appendChild(pill);
    }
  }

  $("reset").disabled = !hasAnyFilter();
}

// Limpa tudo: zera filtros, brushes e chips.
function resetAll() {
  filters.date = filters.geo = null;
  filters.boroughs = [];
  filters.cells = [];
  filters.factors = [];
  filters.severity = "all";
  mapView.clearBrush();
  mapView.syncSeverity();
  timeView.clearBrush();
  syncChips();
  refresh();
}

// Reage ao clique num bairro do mapa (views/map.js dispara este evento ao
// acumular/remover um bairro em filters.boroughs), mantendo chips e mapa
// sempre coerentes e disparando o refresh global das visoes.
document.addEventListener("borough-toggle", () => {
  syncChips();
  refresh();
});

// ----------------------------------------------------------------------------
// Tela de carga / erro
// ----------------------------------------------------------------------------
const setStatus = (msg) => { const e = $("loading-msg"); if (e) e.textContent = msg; };
const hideLoading = () => $("loading").classList.add("hidden");
function showError(err) {
  $("loading").classList.remove("hidden");
  $("loading-spinner")?.remove();
  setStatus("Erro ao carregar o painel.");
  const hint = $("loading-hint");
  if (hint) {
    // Mostra o erro real para facilitar depuração
    const msg = err?.message || String(err);
    hint.innerHTML =
      `<strong>Erro:</strong> ${msg}<br><br>` +
      "Certifique-se de servir a pasta via HTTP (não file://). Use: <code>npm run dev</code> ou <code>python3 -m http.server 8080</code>";
  }
  console.error("Boot error:", err);
}

// ----------------------------------------------------------------------------
// Boot
// ----------------------------------------------------------------------------
async function boot() {
  $("reset").addEventListener("click", resetAll);
  try {
// Fonte de dados: tenta o ETL da amostra (~40.000 linhas) que acompanha
// o projeto. Para usar o dataset completo, substitua pelo caminho
// "data/collisions_total_etl.csv" como primeiro candidato.
    await initDB(
      ["./data/collisions_amostra_etl.csv", "./data/collisions_amostra.csv"],
      setStatus
    );
    // init em sequencia: map/timeline consultam limites na mesma conexao.
    await mapView.init();
    await timeView.init();
    await heatView.init();
    await barsView.init();
    await statsView.init();

    setRefreshHandler(refresh);
    buildChips();
    setStatus("Renderizando…");
    await refresh();   // primeira pintura, sem filtros
    hideLoading();
  } catch (err) {
    showError(err);
  }
}

boot();