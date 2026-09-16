// =============================================================================
// views/timeline.js - visao "WHEN" (tendencia temporal)
// -----------------------------------------------------------------------------
// Marcador: AREA/LINHA. Canal: POSICAO (x = tempo, y = contagem) - alto no
// ranking de eficacia para quantitativos. Mostra a evolucao mensal das
// colisoes e serve de FILTRO temporal principal.
//
// Interacao: ALVO = tendencia/intervalo; ACAO = selecionar faixa. Um brushX
// (1D) define [data_inicial, data_final]. A AREA é calculada excluindo a
// dimensao 'date' (buildWhere('date')), logo ela mostra sempre a distribuicao
// completa como CONTEXTO e nao muda quando voce arrasta o proprio brush - so
// as outras visoes reagem.
// =============================================================================

import * as d3 from "https://cdn.jsdelivr.net/npm/d3@7/+esm";
import { query } from "../db.js";
import { filters, buildWhere } from "../state.js";
import { requestRefresh } from "../bus.js";
import { PALETTE } from "../config.js";

const W = 1180, H = 165;
const M = { top: 12, right: 18, bottom: 24, left: 48 };
const parseDay = d3.timeParse("%Y-%m-%d");

let svg, gArea, gLine, gx, gy, gBrush, x, y, brush;

export const NAME = "time";

export async function init() {
  svg = d3.select("#timeline").attr("viewBox", `0 0 ${W} ${H}`);

  // Dominio temporal FIXO (extensao real dos dados): mantem eixo e brush
  // estaveis enquanto o usuario filtra por outras dimensoes.
  const [r] = await query(
    `SELECT strftime(min(dt), '%Y-%m-%d') AS a, strftime(max(dt), '%Y-%m-%d') AS b FROM c`
  );
  x = d3.scaleTime().domain([parseDay(r.a), parseDay(r.b)]).range([M.left, W - M.right]);
  y = d3.scaleLinear().range([H - M.bottom, M.top]);

  gArea = svg.append("path").attr("class", "tl-area").attr("fill", PALETTE.seq[1]).attr("fill-opacity", 0.9);
  gLine = svg.append("path").attr("class", "tl-line").attr("fill", "none")
    .attr("stroke", PALETTE.seq[5]).attr("stroke-width", 1.6);
  gx = svg.append("g").attr("class", "axis").attr("transform", `translate(0,${H - M.bottom})`);
  gy = svg.append("g").attr("class", "axis").attr("transform", `translate(${M.left},0)`);

  // Eixo X: rotulos so nos limites de ano (limpo, sem poluir).
  gx.call(d3.axisBottom(x).ticks(d3.timeYear.every(1)).tickFormat(d3.timeFormat("%Y")).tickSizeOuter(0));

  // Brush em grupo persistente (criado uma vez).
  brush = d3.brushX()
    .extent([[M.left, M.top], [W - M.right, H - M.bottom]])
    .on("end", onBrushEnd);
  gBrush = svg.append("g").attr("class", "brush").call(brush);
}

function onBrushEnd(event) {
  if (!event.selection) {
    filters.date = null;
  } else {
    const [x0, x1] = event.selection;
    filters.date = [x.invert(x0), x.invert(x1)]; // pixels -> datas
  }
  requestRefresh(NAME);
}

export function clearBrush() {
  if (gBrush && brush) gBrush.call(brush.move, null);
}

export async function update() {
  const rows = await query(`
    SELECT strftime(date_trunc('month', dt), '%Y-%m-%d') AS m, COUNT(*)::INTEGER AS n
    FROM c
    WHERE ${buildWhere("date")}
    GROUP BY 1 ORDER BY 1
  `);
  rows.forEach((d) => { d.date = parseDay(d.m); });

  // Escala Y recalculada conforme o recorte atual (guarda contra max=0).
  y.domain([0, d3.max(rows, (d) => d.n) || 1]).nice();
  gy.call(d3.axisLeft(y).ticks(4).tickSizeOuter(0));

  const area = d3.area().x((d) => x(d.date)).y0(y(0)).y1((d) => y(d.n)).curve(d3.curveMonotoneX);
  const line = d3.line().x((d) => x(d.date)).y((d) => y(d.n)).curve(d3.curveMonotoneX);

  // Transicao curta da forma (fluidez sem distrair). respeita prefers-reduced-motion via CSS.
  gArea.datum(rows).transition().duration(180).attr("d", area);
  gLine.datum(rows).transition().duration(180).attr("d", line);

  gBrush.raise();
}
