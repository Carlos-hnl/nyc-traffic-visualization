// =============================================================================
// views/bars.js - visao "WHAT" (fatores contribuintes)
// -----------------------------------------------------------------------------
// Marcador: BARRA. Canal: COMPRIMENTO alinhado a uma base comum - um dos
// canais mais eficazes para comparar quantidades (Munzner). Mostra os
// principais fatores que contribuiram para as colisoes do recorte atual.
//
// Interacao: ALVO = distribuicao por categoria; ACAO = selecionar (multipla).
// Clique alterna o filtro daquele fator (entra/sai da lista; as barras
// selecionadas ficam em coral); a propria visao calcula os dados excluindo
// 'factor', entao continua mostrando TODAS as categorias - so destaca as
// escolhidas.
// =============================================================================

import * as d3 from "https://cdn.jsdelivr.net/npm/d3@7/+esm";
import { query } from "../db.js";
import { filters, buildWhere } from "../state.js";
import { requestRefresh } from "../bus.js";
import { PALETTE, factorLabel, truncate, fmtInt } from "../config.js";
import { showTip, hideTip } from "../tooltip.js";

const W = 460, H = 215;
const M = { top: 8, right: 52, bottom: 8, left: 132 };

let svg, gBars, gVals, gLabs, x, y;

export const NAME = "bars";

export async function init() {
  svg = d3.select("#bars").attr("viewBox", `0 0 ${W} ${H}`);
  x = d3.scaleLinear().range([M.left, W - M.right]);
  y = d3.scaleBand().range([M.top, H - M.bottom]).padding(0.22);
  gBars = svg.append("g").attr("class", "bars");
  gVals = svg.append("g").attr("class", "bar-vals");
  gLabs = svg.append("g").attr("class", "bar-labs");
}

export async function update() {
  // Excluimos 'Unspecified' (sem valor analitico) e o fator nulo. buildWhere
  // ('factor') deixa o proprio filtro de fator de fora (cross-filter).
  const rows = await query(`
    SELECT factor, COUNT(*)::INTEGER AS n
    FROM c
    WHERE factor IS NOT NULL AND factor <> 'Unspecified' AND (${buildWhere("factor")})
    GROUP BY factor ORDER BY n DESC LIMIT 8
  `);

  x.domain([0, d3.max(rows, (d) => d.n) || 1]);
  y.domain(rows.map((d) => d.factor));

  // Barras (chave = fator). Comprimento = contagem; cor coral se selecionada.
  gBars.selectAll("rect")
    .data(rows, (d) => d.factor)
    .join("rect")
    .attr("x", M.left).attr("y", (d) => y(d.factor))
    .attr("height", y.bandwidth()).attr("rx", 2)
    .style("cursor", "pointer")
    .attr("fill", (d) => (filters.factors.includes(d.factor) ? PALETTE.accent : PALETTE.point))
    .on("mouseenter", (event, d) => showTip(event,
      `<strong>${factorLabel(d.factor)}</strong><br>
       <span class="tip-num">${fmtInt(d.n)}</span> colisões`))
    .on("mousemove", (event) => showTip(event, document.getElementById("tooltip").innerHTML))
    .on("mouseleave", hideTip)
    .on("click", (event, d) => onClick(d))
    .transition().duration(180)
    .attr("width", (d) => x(d.n) - M.left);

  // Valor numerico ao fim de cada barra (fonte mono, via classe CSS).
  gVals.selectAll("text")
    .data(rows, (d) => d.factor)
    .join("text")
    .attr("class", "bar-val")
    .attr("y", (d) => y(d.factor) + y.bandwidth() / 2 + 4)
    .attr("x", (d) => x(d.n) + 6)
    .text((d) => fmtInt(d.n))
    .transition().duration(180)
    .attr("x", (d) => x(d.n) + 6);

  // Rotulo do fator (PT, truncado), com o nome completo no <title>.
  gLabs.selectAll("text")
    .data(rows, (d) => d.factor)
    .join("text")
    .attr("class", "bar-lab")
    .attr("x", M.left - 8).attr("text-anchor", "end")
    .attr("y", (d) => y(d.factor) + y.bandwidth() / 2 + 4)
    .text((d) => truncate(factorLabel(d.factor), 20))
    .each(function (d) {
      const t = d3.select(this);
      t.selectAll("title").data([0]).join("title").text(factorLabel(d.factor));
    });
}

function onClick(d) {
  // Multipla selecao: clicar adiciona/remove este fator da lista, sem afetar
  // os demais ja escolhidos.
  const i = filters.factors.indexOf(d.factor);
  if (i === -1) filters.factors.push(d.factor);
  else filters.factors.splice(i, 1);
  requestRefresh(); // re-renderiza tudo, inclusive esta visao (destaca as barras)
}
