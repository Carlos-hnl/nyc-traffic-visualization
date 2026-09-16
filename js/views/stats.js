// =============================================================================
// views/stats.js - cartoes-resumo do cabecalho (overview)
// -----------------------------------------------------------------------------
// Numeros agregados do recorte ATUAL (aplica todos os filtros - buildWhere(null)).
// É o "overview" textual que acompanha as visoes graficas.
// =============================================================================

import { query } from "../db.js";
import { buildWhere } from "../state.js";
import { fmtInt, fmtPct } from "../config.js";

export const NAME = "stats";

export async function init() { /* nada a montar: os cartoes ja existem no HTML */ }

export async function update() {
  const [r] = await query(`
    SELECT
      COUNT(*)::INTEGER AS crashes,
      SUM(injured)::INTEGER AS injured,
      SUM(killed)::INTEGER AS killed,
      SUM(CASE WHEN injured > 0 OR killed > 0 THEN 1 ELSE 0 END)::INTEGER AS vit
    FROM c
    WHERE ${buildWhere(null)}
  `);

  const crashes = r.crashes || 0;
  document.getElementById("stat-crashes").textContent = fmtInt(crashes);
  document.getElementById("stat-injured").textContent = fmtInt(r.injured);
  document.getElementById("stat-killed").textContent = fmtInt(r.killed);
  // Proporcao de colisoes com ao menos uma vitima.
  document.getElementById("stat-pct").textContent =
    crashes ? fmtPct(r.vit / crashes) : "-";
}
