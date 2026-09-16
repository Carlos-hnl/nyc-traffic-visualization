// =============================================================================
// views/heatmap.js - visao "WHEN" ciclica (faixa de horario x dia da semana)
// -----------------------------------------------------------------------------
// Marcador: AREA (celula). Canal: LUMINANCIA de cor (rampa azul sequencial).
// A luminancia é um canal mais fraco que posicao/comprimento no ranking de
// Munzner, MAS aqui se justifica: as DUAS dimensoes categoricas (horario e
// dia) ja ocupam os dois eixos espaciais da grade, entao a magnitude precisa
// ir para a cor. Revela o ritmo: rush da tarde, madrugadas de fim de semana.
//
// Granularidade do eixo Y: blocos de 4 HORAS (6 linhas), e nao hora a hora
// (24 linhas). Hora a hora produz 168 celulas finas que pesam na leitura sem
// agregar sinal extra; em blocos de 4h o ritmo do dia continua visivel com
// uma grade bem mais legivel.
//
// Interacao: ALVO = padrao/celula; ACAO = selecionar (multipla). Clique
// adiciona/remove a celula {faixa de horario, dia} da lista de filtros ativos;
// details on demand no hover.
// =============================================================================

import * as d3 from "https://cdn.jsdelivr.net/npm/d3@7/+esm";
import { query } from "../db.js";
import { filters, buildWhere } from "../state.js";
import { requestRefresh } from "../bus.js";
import { PALETTE, WEEKDAYS, HOUR_BINS, HOUR_BIN_SIZE, fmtInt } from "../config.js";
import { showTip, hideTip } from "../tooltip.js";

const W = 460, H = 215;
// left: 48 garante espaco para o rotulo completo "20–24h" (6 caracteres na
// fonte monoespacada). Com menos que isso o texto, alinhado a direita, vaza
// pra fora do viewBox e o primeiro digito some ("20–24h" virava "0–24h").
const M = { top: 26, right: 14, bottom: 8, left: 48 };

let svg, gCells, gxLab, gyLab, x, y, color;

export const NAME = "heat";

export async function init() {
  svg = d3.select("#heatmap").attr("viewBox", `0 0 ${W} ${H}`);

  // Escalas de banda: dias (ISO 1..7) no X, faixas de 4h (0..5) no Y.
  x = d3.scaleBand().domain(d3.range(1, 8)).range([M.left, W - M.right]).padding(0.06);
  y = d3.scaleBand().domain(HOUR_BINS.map((b) => b.bin)).range([M.top, H - M.bottom]).padding(0.10);

  // Escala de cor sequencial usando a paleta do projeto (interpolacao entre as
  // 7 paradas). Dominio definido a cada update conforme o maximo do recorte.
  color = d3.scaleSequential(d3.interpolateRgbBasis(PALETTE.seq));

  gCells = svg.append("g").attr("class", "cells");

  // Rotulos dos dias (topo) - estaticos.
  gxLab = svg.append("g").attr("class", "hm-axis");
  gxLab.selectAll("text").data(d3.range(1, 8)).join("text")
    .attr("x", (d) => x(d) + x.bandwidth() / 2).attr("y", M.top - 9)
    .attr("text-anchor", "middle").text((d) => WEEKDAYS[d - 1]);

  // Rotulos de faixa de horario (esquerda) - agora so 6 linhas, cabem todas.
  gyLab = svg.append("g").attr("class", "hm-axis");
  gyLab.selectAll("text").data(HOUR_BINS).join("text")
    .attr("x", M.left - 7).attr("y", (d) => y(d.bin) + y.bandwidth() / 2 + 3)
    .attr("text-anchor", "end").text((d) => d.label);
}

export async function update() {
  const rows = await query(`
    SELECT CAST(FLOOR(hour / ${HOUR_BIN_SIZE}.0) AS INTEGER) AS bin, dow, COUNT(*)::INTEGER AS n
    FROM c
    WHERE ${buildWhere("cell")}
    GROUP BY bin, dow
  `);

  // Lookup faixa-dia -> n, e a grade completa 7x6 (celulas vazias = 0).
  const lookup = new Map(rows.map((r) => [`${r.bin}-${r.dow}`, r.n]));
  const grid = [];
  for (let dow = 1; dow <= 7; dow++)
    for (const b of HOUR_BINS) grid.push({ bin: b.bin, label: b.label, dow, n: lookup.get(`${b.bin}-${dow}`) || 0 });

  color.domain([0, d3.max(grid, (d) => d.n) || 1]);

  // DATA-JOIN das celulas (chave faixa-dia). A cor codifica o volume; a
  // celula selecionada ganha contorno coral.
  gCells.selectAll("rect")
    .data(grid, (d) => `${d.bin}-${d.dow}`)
    .join("rect")
    .attr("x", (d) => x(d.dow)).attr("y", (d) => y(d.bin))
    .attr("width", x.bandwidth()).attr("height", y.bandwidth())
    .attr("rx", 2)
    .attr("fill", (d) => (d.n > 0 ? color(d.n) : PALETTE.seq[0]))
    .attr("stroke", (d) => isSelected(d) ? PALETTE.accent : PALETTE.hair)
    .attr("stroke-width", (d) => isSelected(d) ? 2 : 0.5)
    .style("cursor", "pointer")
    .on("mouseenter", (event, d) => showTip(event,
      `<strong>${WEEKDAYS[d.dow - 1]} · ${d.label}</strong><br>
       <span class="tip-num">${fmtInt(d.n)}</span> colisões`))
    .on("mousemove", (event) => showTip(event, document.getElementById("tooltip").innerHTML))
    .on("mouseleave", hideTip)
    .on("click", (event, d) => onClick(d));
}

function isSelected(d) {
  return filters.cells.some((c) => c.bin === d.bin && c.dow === d.dow);
}

function onClick(d) {
  // Multipla selecao: clicar adiciona a celula a lista; clicar numa celula ja
  // selecionada a remove (toggle), sem afetar as outras celulas escolhidas.
  const bin = HOUR_BINS[d.bin];
  const i = filters.cells.findIndex((c) => c.bin === d.bin && c.dow === d.dow);
  if (i === -1) filters.cells.push({ bin: d.bin, dow: d.dow, hourStart: bin.start, hourEnd: bin.end, label: bin.label });
  else filters.cells.splice(i, 1);
  // Sem 'except': a propria visao re-renderiza para mostrar o contorno das
  // celulas selecionadas (o redesenho de 42 celulas é barato).
  requestRefresh();
}