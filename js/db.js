// =============================================================================
// db.js - camada de dados (DuckDB-WASM)
// -----------------------------------------------------------------------------
// Le o CSV ja tratado pelo ETL (coordenadas normalizadas, BOROUGH preenchido
// e corrigido, linhas sem coordenada/borough removidas). O CREATE TABLE
// materializa SO as 11 colunas uteis e SO as linhas com data parseavel,
// reduzindo RAM em comparacao com guardar as 29 colunas como texto.
// =============================================================================

import * as duckdb from "https://cdn.jsdelivr.net/npm/@duckdb/duckdb-wasm@1.29.0/+esm";

// Tabela analitica "c": derivada do CSV ja limpo pelo ETL.
//   - dt   : "CRASH DATE" (MM/DD/YYYY) -> DATE
//   - hour : hora extraida de "CRASH TIME" (H:MM)
//   - dow  : dia da semana ISO (1=segunda ... 7=domingo)
// TRY_CAST/TRY_STRPTIME devolvem NULL (em vez de quebrar) em dados sujos
// remanescentes.
//
// O que o ETL ja garante (sem necessidade de tratar aqui):
//   - LATITUDE/LONGITUDE com ponto decimal e sem nulos
//   - BOROUGH preenchido, em caixa alta e geograficamente correto
//   - Linhas fora da bbox de NY e sem coordenada ja removidas
const TABLE_SQL = `
CREATE OR REPLACE TABLE c AS
SELECT
  "COLLISION_ID"                                              AS id,
  TRY_CAST("LATITUDE"  AS DOUBLE)                            AS lat,
  TRY_CAST("LONGITUDE" AS DOUBLE)                            AS lng,
  TRIM("BOROUGH")                                            AS borough,
  TRY_STRPTIME("CRASH DATE", '%m/%d/%Y')::DATE               AS dt,
  TRY_CAST(SPLIT_PART("CRASH TIME", ':', 1) AS INTEGER)      AS hour,
  ISODOW(TRY_STRPTIME("CRASH DATE", '%m/%d/%Y'))             AS dow,
  COALESCE(TRY_CAST("NUMBER OF PERSONS INJURED" AS INTEGER), 0) AS injured,
  COALESCE(TRY_CAST("NUMBER OF PERSONS KILLED"  AS INTEGER), 0) AS killed,
  NULLIF(TRIM("CONTRIBUTING FACTOR VEHICLE 1"), '')           AS factor,
  NULLIF(TRIM("ON STREET NAME"), '')                         AS street
FROM read_csv_auto(
  'collisions.csv',
  header        = true,
  all_varchar   = true,   -- le tudo como texto; convertemos acima
  ignore_errors = true,   -- pula linhas malformadas em vez de abortar
  null_padding  = true    -- tolera linhas com colunas faltando no fim
)
WHERE TRY_STRPTIME("CRASH DATE", '%m/%d/%Y') IS NOT NULL;
`;

let conn = null;

// DuckDB devolve COUNT/SUM como BIGINT (BigInt no JS); o D3 nao escala BigInt.
function coerce(v) {
  return typeof v === "bigint" ? Number(v) : v;
}

// --- Barra de progresso visual -----------------------------------------------
function setProgressBar(pct) {
  const bar  = document.getElementById("progress-bar");
  const wrap = document.getElementById("progress-wrap");
  if (!bar || !wrap) return;
  if (pct === null) { wrap.style.display = "none"; return; }
  wrap.style.display = "block";
  bar.style.width = `${Math.min(100, pct)}%`;
}

// --- Fetch com progresso ------------------------------------------------------
// Le o corpo da resposta em pedacos para reportar o andamento do download.
async function fetchWithProgress(url, onProgress) {
  const resp = await fetch(url);
  if (!resp.ok) throw new Error(`HTTP ${resp.status} ao carregar ${url}`);

  const total  = parseInt(resp.headers.get("Content-Length") || "0", 10);
  const reader = resp.body.getReader();
  const chunks = [];
  let received = 0;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    received += value.length;
    if (onProgress) {
      const pct = total ? Math.round((received / total) * 100) : 0;
      onProgress(pct, received / 1048576, total / 1048576);
    }
  }

  const out = new Uint8Array(received);
  let off = 0;
  for (const c of chunks) { out.set(c, off); off += c.length; }
  return out;
}

const fileName = (url) => url.split("/").pop();

// --- initDB -------------------------------------------------------------------
// @param {string|string[]} csvUrls  um caminho, ou uma lista de candidatos
//        tentados em ordem (ex.: dataset completo primeiro, amostra depois).
export async function initDB(csvUrls, onStatus) {
  onStatus?.("Carregando o motor DuckDB…");
  setProgressBar(0);

  // 1) Instancia o DuckDB-WASM
  const bundles = duckdb.getJsDelivrBundles();
  const bundle  = await duckdb.selectBundle(bundles);
  const workerUrl = URL.createObjectURL(
    new Blob([`importScripts("${bundle.mainWorker}");`], { type: "text/javascript" })
  );
  const worker = new Worker(workerUrl);
  const db     = new duckdb.AsyncDuckDB(new duckdb.ConsoleLogger(), worker);
  await db.instantiate(bundle.mainModule, bundle.pthreadWorker);
  URL.revokeObjectURL(workerUrl);
  conn = await db.connect();

  // 2) Baixa o CSV. Tenta cada candidato em ordem: assim, se voce colocar o
  //    arquivo completo em data/, ele é usado; senao, cai na amostra de teste.
  setProgressBar(5);
  const candidates = Array.isArray(csvUrls) ? csvUrls : [csvUrls];
  let csvBytes = null;
  for (const url of candidates) {
    try {
      onStatus?.(`Baixando ${fileName(url)}…`);
      csvBytes = await fetchWithProgress(url, (pct, mb, totalMb) => {
        const totalStr = totalMb > 0 ? `/${totalMb.toFixed(0)} MB` : "";
        onStatus?.(`Lendo ${fileName(url)}… ${mb.toFixed(1)} MB${totalStr} (${pct}%)`);
        setProgressBar(5 + pct * 0.60); // 5% → 65%
      });
      break;
    } catch (e) {
      console.warn(`Fonte indisponível: ${url} (${e.message})`);
    }
  }
  if (!csvBytes) throw new Error("Nenhum CSV encontrado em data/ - confira os nomes dos arquivos.");

  // 3) Registra o CSV no FS virtual do DuckDB
  onStatus?.("Construindo a tabela em memória…");
  setProgressBar(70);
  await db.registerFileBuffer("collisions.csv", csvBytes);

  // 4) Cria a tabela analitica (limpa, tipada e filtrada) e libera o buffer cru
  onStatus?.("Limpando e tipando os dados…");
  setProgressBar(80);
  await conn.query(TABLE_SQL);
  try { await db.dropFile("collisions.csv"); } catch { /* libera a memoria do CSV cru */ }

  setProgressBar(100);
  setTimeout(() => setProgressBar(null), 500);
}

// --- query --------------------------------------------------------------------
export async function query(sql) {
  const table = await conn.query(sql);
  return table.toArray().map((row) => {
    const obj = row.toJSON();
    for (const k in obj) obj[k] = coerce(obj[k]);
    return obj;
  });
}