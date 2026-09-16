// =============================================================================
// views/map.js - visão "WHERE" (mapa de pontos)
// =============================================================================

import * as d3 from "https://cdn.jsdelivr.net/npm/d3@7/+esm";
import { query } from "../db.js";
import { filters, buildWhere } from "../state.js";
import { requestRefresh } from "../bus.js";
import { PALETTE, factorLabel, boroughLabel, fmtInt, pad2 } from "../config.js";
import { showTip, hideTip } from "../tooltip.js";

const W = 760, H = 470;
const M = { top: 10, right: 10, bottom: 10, left: 10 };

const R_BASE = 1.6;
const R_FATAL = 3.4;
const rOf = (d) => (d.killed > 0 ? R_FATAL : R_BASE) / zoomTransform.k;

const GEOJSON_SOURCES = [
  "https://data.cityofnewyork.us/api/geospatial/7t3b-ywvw?method=export&type=GeoJSON",
  "https://raw.githubusercontent.com/dwillis/nyc-maps/master/boroughs.geojson",
  "https://raw.githubusercontent.com/codeforgermany/click_that_hood/main/public/data/new-york-city-boroughs.geojson",
];

const FALLBACK_GEOJSON = {
  type: "FeatureCollection",
  features: [
    { type: "Feature", properties: { borough: "MANHATTAN" }, geometry: { type: "Polygon", coordinates: [[ [-74.0479,40.6931],[-74.0200,40.6994],[-74.0085,40.7189],[-74.0127,40.7234], [-73.9983,40.7300],[-73.9745,40.7329],[-73.9421,40.7839],[-73.9287,40.8147], [-73.9221,40.8299],[-73.9281,40.8378],[-73.9246,40.8672],[-73.9326,40.8725], [-73.9338,40.8831],[-73.9284,40.8741],[-73.9216,40.8820],[-73.9093,40.8934], [-73.9025,40.8903],[-73.8977,40.8786],[-73.9127,40.8763],[-73.9290,40.9016], [-73.9349,40.9050],[-73.9480,40.9017],[-73.9555,40.8726],[-73.9598,40.8360], [-73.9636,40.8196],[-73.9673,40.7939],[-73.9730,40.7789],[-73.9762,40.7607], [-73.9780,40.7469],[-73.9851,40.7349],[-73.9952,40.7125],[-74.0027,40.6934], [-74.0479,40.6931] ]] } },
    { type: "Feature", properties: { borough: "BROOKLYN" }, geometry: { type: "Polygon", coordinates: [[ [-74.0420,40.5698],[-74.0068,40.5795],[-73.9599,40.5993],[-73.9265,40.6105], [-73.8927,40.6296],[-73.8718,40.6808],[-73.8817,40.6977],[-73.9151,40.7095], [-73.9375,40.7234],[-73.9412,40.7346],[-73.9232,40.7477],[-73.8858,40.7361], [-73.8688,40.7218],[-73.8545,40.7050],[-73.8452,40.6958],[-73.8580,40.6720], [-73.8620,40.6530],[-73.8750,40.6350],[-73.9153,40.6159],[-73.9723,40.5954], [-73.9960,40.5840],[-74.0197,40.5722],[-74.0420,40.5698] ]] } },
    { type: "Feature", properties: { borough: "QUEENS" }, geometry: { type: "Polygon", coordinates: [[ [-73.9620,40.7714],[-73.9504,40.7680],[-73.9375,40.7234],[-73.9413,40.7288], [-73.9168,40.7480],[-73.8858,40.7361],[-73.8452,40.6958],[-73.8200,40.6800], [-73.7700,40.6600],[-73.7000,40.6400],[-73.7200,40.5800],[-73.7600,40.5600], [-73.8000,40.5600],[-73.8400,40.5700],[-73.8700,40.5850],[-73.9100,40.5900], [-73.9400,40.5950],[-73.9700,40.5900],[-73.9620,40.6150],[-73.9200,40.6400], [-73.8800,40.6700],[-73.8688,40.7218],[-73.8920,40.7401],[-73.9287,40.7459], [-73.9413,40.7288],[-73.9570,40.7400],[-73.9620,40.7714] ]] } },
    { type: "Feature", properties: { borough: "BRONX" }, geometry: { type: "Polygon", coordinates: [[ [-73.9620,40.7714],[-73.9504,40.7680],[-73.9326,40.8725],[-73.9340,40.8401], [-73.9281,40.8378],[-73.9221,40.8299],[-73.9287,40.8147],[-73.9421,40.7839], [-73.9745,40.7329],[-73.9983,40.7300],[-74.0095,40.7376],[-74.0200,40.7316], [-74.0174,40.7195],[-74.0107,40.7071],[-74.0169,40.7057],[-73.9862,40.7263], [-73.9729,40.7411],[-73.9795,40.7482],[-73.9694,40.7547],[-73.9580,40.7657], [-73.9620,40.7714] ]] } },
    { type: "Feature", properties: { borough: "STATEN ISLAND" }, geometry: { type: "Polygon", coordinates: [[ [-74.2591,40.4960],[-74.2477,40.4874],[-74.2050,40.5000],[-74.1750,40.5100], [-74.1100,40.5400],[-74.0700,40.5800],[-74.0420,40.5698],[-74.0197,40.5722], [-74.0068,40.5795],[-74.0200,40.6150],[-74.0420,40.6500],[-74.0600,40.6400], [-74.0900,40.6200],[-74.1300,40.5900],[-74.1700,40.5600],[-74.2200,40.5300], [-74.2591,40.4960] ]] } }
  ]
};

function normalizeBoroughName(props) {
  const raw = props.BoroName || props.name || props.borough || props.BOROUGH || "";
  const map = {
    "Manhattan": "MANHATTAN", "Brooklyn": "BROOKLYN", "Queens": "QUEENS",
    "The Bronx": "BRONX", "Bronx": "BRONX", "Staten Island": "STATEN ISLAND",
  };
  return map[raw] || raw.toUpperCase();
}

async function loadBoroughGeoJSON() {
  for (const url of GEOJSON_SOURCES) {
    try {
      const resp = await fetch(url, { signal: AbortSignal.timeout(8000) });
      if (!resp.ok) continue;
      const gj = await resp.json();
      if (!gj?.features?.length) continue;
      gj.features = gj.features.map(f => ({
        ...f, properties: { borough: normalizeBoroughName(f.properties) }
      })).filter(f => f.properties.borough);
      console.log(`✓ GeoJSON carregado de: ${url}`);
      return gj;
    } catch (err) {
      console.warn(`GeoJSON indisponível (${url}):`, err.message);
    }
  }
  console.warn("Todas as fontes GeoJSON falharam - usando esboço embutido.");
  return FALLBACK_GEOJSON;
}

let svg, gZoom, gBoroughs, gHeat, gPoints, gBrush, projection, brush, boroughFeatures = [];
let zoomBehavior;
let zoomTransform = d3.zoomIdentity;
let mapMode = "points";

export const NAME = "map";

export async function init() {
  svg = d3.select("#map").attr("viewBox", `0 0 ${W} ${H}`);

  gZoom     = svg.append("g").attr("class", "zoom-layer");
  gBoroughs = gZoom.append("g").attr("class", "boroughs");
  gHeat     = gZoom.append("g").attr("class", "heat-layer").style("display", "none");
  gBrush    = gZoom.append("g").attr("class", "brush");
  gPoints   = gZoom.append("g").attr("class", "points");

  const gj = await loadBoroughGeoJSON();
  boroughFeatures = gj.features;

  const fc = { type: "FeatureCollection", features: boroughFeatures };
  projection = d3.geoMercator().fitExtent([[M.left, M.top], [W - M.right, H - M.bottom]], fc);
  const path = d3.geoPath(projection);

  gBoroughs.selectAll("path")
    .data(boroughFeatures)
    .join("path")
    .attr("d", path)
    .attr("class", "borough-shape")
    .attr("fill", PALETTE.grid)
    .attr("stroke", "#fff")
    .attr("stroke-width", 1.2)
    .attr("vector-effect", "non-scaling-stroke")
    .style("pointer-events", "none");

  // Salva cx/cy como atributos dedicados para o handler de zoom poder
  // aplicar transform="translate(cx,cy) scale(1/k) translate(-cx,-cy)"
  // - única forma confiável de contra-escalar texto dentro de gZoom.
  gBoroughs.selectAll("text")
    .data(boroughFeatures)
    .join("text")
    .attr("class", "borough-label")
    .attr("cx", (d) => path.centroid(d)[0])
    .attr("cy", (d) => path.centroid(d)[1])
    .attr("x",  (d) => path.centroid(d)[0])
    .attr("y",  (d) => path.centroid(d)[1])
    .attr("text-anchor", "middle")
    .attr("dominant-baseline", "middle")
    .attr("font-size", "11px")
    .attr("fill", PALETTE.muted)
    .style("pointer-events", "none")
    .text((d) => boroughLabel(d.properties.borough));

  svg.select("defs").remove();
  const defs = svg.append("defs");
  defs.append("clipPath")
    .attr("id", "map-boroughs-clip")
    .selectAll("path").data(boroughFeatures).join("path").attr("d", path);
  gHeat.attr("clip-path", "url(#map-boroughs-clip)");

  brush = d3.brush()
    .extent([[M.left, M.top], [W - M.right, H - M.bottom]])
    .keyModifiers(false)
    .handleSize(0)
    // Shift+arrastar ativa o brush; sem Shift, o evento cai para o zoom
    // keyModifiers(false) impede que o d3.brush interprete Shift como
    // modificador de seleção retangular (comportamento padrão que conflita)
    .filter((event) => event.shiftKey && !event.button)
    .on("end", onBrushEnd);
  gBrush.call(brush);
  gBrush.selectAll(".selection")
    .style("pointer-events", "none")
    .attr("vector-effect", "non-scaling-stroke");

  setupZoom();
  setupSeverityControl();
  setupModeControl();
}

function setupZoom() {
  zoomBehavior = d3.zoom()
    .scaleExtent([1, 8])
    .translateExtent([[0, 0], [W, H]])
    .filter((event) => {
      if (event.type === "wheel") return true;
      if (event.button) return false;
      // Shift reservado para o brush: zoom só ativa sem Shift.
      // O brush faz o inverso (filter: shiftKey && !button), garantindo
      // que os dois nunca competem pelo mesmo gesto.
      return !event.shiftKey;
    })
    .on("zoom", (event) => {
      zoomTransform = event.transform;
      gZoom.attr("transform", zoomTransform);
      const k = zoomTransform.k;

      // Contra-escala via transform SVG: escala cada label em torno do seu
      // próprio centroide (cx, cy), cancelando exatamente o zoom do gZoom.
      // Resultado: tamanho aparente fixo de 11px em qualquer nível de zoom.
      gBoroughs.selectAll(".borough-label").attr("transform", function () {
        const cx = +d3.select(this).attr("cx");
        const cy = +d3.select(this).attr("cy");
        return `translate(${cx},${cy}) scale(${1 / k}) translate(${-cx},${-cy})`;
      });

      gPoints.selectAll("circle").attr("r", rOf);
    });

  svg.call(zoomBehavior).on("dblclick.zoom", null);

  const overlay = gBrush.select(".overlay").style("cursor", "grab");
  window.addEventListener("keydown", (e) => { if (e.key === "Shift") overlay.style("cursor", "crosshair"); });
  window.addEventListener("keyup",   (e) => { if (e.key === "Shift") overlay.style("cursor", "grab"); });

  const sub = document.querySelector(".panel-map .panel-sub");
  if (sub) sub.textContent =
    "arraste p/ mover · shift+arraste filtra uma área · role p/ ampliar · coral = vítima fatal";
}

function setupSeverityControl() {
  const seg = document.getElementById("severity");
  if (!seg) return;
  seg.querySelectorAll(".seg-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      filters.severity = btn.dataset.sev;
      syncSeverity();
      requestRefresh();
    });
  });
  syncSeverity();
}

export function syncSeverity() {
  document.querySelectorAll("#severity .seg-btn").forEach((b) => {
    const on = b.dataset.sev === filters.severity;
    b.classList.toggle("active", on);
    b.setAttribute("aria-pressed", String(on));
  });
}

function setupModeControl() {
  const seg = document.getElementById("mapmode");
  const legend = document.getElementById("map-legend");
  if (legend) legend.innerHTML = `<span>menor índice</span><div class="bar"></div><span>maior índice</span>`;
  if (!seg) return;
  seg.querySelectorAll(".seg-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      mapMode = btn.dataset.mode;
      syncMapMode();
    });
  });
  syncMapMode();
}

function syncMapMode() {
  document.querySelectorAll("#mapmode .seg-btn").forEach((b) => {
    const on = b.dataset.mode === mapMode;
    b.classList.toggle("active", on);
    b.setAttribute("aria-pressed", String(on));
  });
  if (gPoints) gPoints.style("display", mapMode === "points" ? null : "none");
  if (gHeat)   gHeat.style("display", mapMode === "heat" ? null : "none");
  document.getElementById("map-legend")?.classList.toggle("visible", mapMode === "heat");

  const sub = document.querySelector(".panel-map .panel-sub");
  if (sub) sub.textContent = mapMode === "heat"
    ? "mancha = concentração de acidentes · arraste para selecionar uma área · role p/ ampliar"
    : "arraste p/ mover · shift+arraste filtra uma área · role p/ ampliar · coral = vítima fatal";
}

function renderHeat(pts) {
  if (!pts.length) { gHeat.selectAll("path").remove(); return; }
  const contours = d3.contourDensity()
    .x((d) => d.px).y((d) => d.py)
    .size([W, H]).bandwidth(16).thresholds(12)(pts);
  const maxVal = d3.max(contours, (d) => d.value) || 1;
  const color = d3.scaleSequential(d3.interpolateRgbBasis(PALETTE.seq)).domain([0, maxVal]);
  gHeat.selectAll("path").data(contours).join("path")
    .attr("d", d3.geoPath())
    .attr("fill", (d) => color(d.value))
    .attr("fill-opacity", 0.85)
    .attr("stroke", "none");
}

function onBrushEnd(event) {
  const sel = event.selection;
  if (!sel) {
    filters.geo = null;
  } else {
    const [[x0, y0], [x1, y1]] = sel;
    const sw = projection.invert([x0, y1]);
    const ne = projection.invert([x1, y0]);
    filters.geo = { minLng: sw[0], maxLng: ne[0], minLat: sw[1], maxLat: ne[1] };
  }
  requestRefresh(NAME);
}

export function clearBrush() {
  if (gBrush && brush) gBrush.call(brush.move, null);
}

export async function update() {
  syncSeverity();
  syncMapMode();

  const isSelected = (d) => filters.boroughs.includes(d.properties.borough);
  gBoroughs.selectAll(".borough-shape")
    .attr("fill", (d) => (isSelected(d) ? PALETTE.point : PALETTE.grid))
    .attr("fill-opacity", (d) => (isSelected(d) ? 0.25 : 1))
    .attr("stroke", (d) => (isSelected(d) ? PALETTE.point : "#fff"));

  const rows = await query(`
    SELECT id, lat, lng, killed, injured, borough, street, factor,
           strftime(dt, '%d/%m/%Y') AS d, hour
    FROM c
    WHERE ${buildWhere("geo")}
  `);

  rows.forEach((r) => {
    const p = projection([r.lng, r.lat]);
    r.px = p ? p[0] : null;
    r.py = p ? p[1] : null;
  });
  const pts = rows.filter((r) => r.px != null);
  pts.sort((a, b) => (a.killed > 0 ? 1 : 0) - (b.killed > 0 ? 1 : 0));

  gPoints.selectAll("circle")
    .data(pts, (d) => d.id)
    .join(
      (enter) => enter.append("circle").attr("cx", (d) => d.px).attr("cy", (d) => d.py),
      (upd) => upd,
      (exit) => exit.remove()
    )
    .attr("cx", (d) => d.px)
    .attr("cy", (d) => d.py)
    .attr("r", rOf)
    .attr("fill", (d) => (d.killed > 0 ? PALETTE.accent : PALETTE.point))
    .attr("fill-opacity", (d) => (d.killed > 0 ? 0.9 : 0.28))
    .attr("stroke", (d) => (d.killed > 0 ? "#fff" : "none"))
    .attr("stroke-width", 0.6)
    .attr("vector-effect", "non-scaling-stroke")
    .on("mouseenter", (event, d) => showTip(event, tipHtml(d)))
    .on("mousemove",  (event, d) => showTip(event, document.getElementById("tooltip").innerHTML))
    .on("mouseleave", hideTip)
    .on("click", (event, d) => { event.stopPropagation(); showTip(event, tipHtml(d)); });

  gPoints.raise();
  renderHeat(pts);
}

function tipHtml(d) {
  return `
    <strong>${d.d} · ${pad2(d.hour)}h</strong><br>
    ${d.street || "via não informada"} - ${boroughLabel(d.borough)}<br>
    <span class="tip-num">${fmtInt(d.injured)}</span> feridos ·
    <span class="tip-num" style="color:${PALETTE.accent}">${fmtInt(d.killed)}</span> mortos<br>
    <span class="tip-dim">${factorLabel(d.factor)}</span>`;
}