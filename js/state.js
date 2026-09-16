// =============================================================================
// state.js - estado da interacao (cross-filter)
// -----------------------------------------------------------------------------
// O nucleo das VISOES COORDENADAS é um unico objeto de filtros, compartilhado
// por todas as visoes. Cada visao escreve na SUA dimensao (o mapa em `geo`, a
// linha do tempo em `date`, etc.) e LE todas as outras.
//
// Padrao cross-filter (Becker & Cleveland; dc.js): ao calcular seus proprios
// dados, cada visao aplica todos os filtros ATIVOS, MENOS o seu. Assim, ao
// selecionar uma barra, o grafico de barras continua mostrando as demais
// categorias (a barra fica so destacada), enquanto mapa/heatmap/linha do tempo
// reagem ao novo recorte. É isso que reduz a carga cognitiva: o cruzamento de
// "Brooklyn + sexta 17h + álcool" aparece visualmente, sem o usuario precisar
// cruzar numeros de cabeca.
// =============================================================================

// Estado global. null = dimensao sem filtro.
// `cells` e `factors` sao ARRAYS: What e When (heatmap) aceitam MULTIPLAS
// selecoes simultaneas (ex.: "Álcool" + "Velocidade excessiva", ou duas
// celulas de horario/dia). Lista vazia equivale a "sem filtro".
export const filters = {
  boroughs: [],    // [string, ...] ex.: ["BROOKLYN", "QUEENS"] - multi-selecao (acumula, igual a factors/cells)
  date: null,      // [Date, Date] vindo do brush da linha do tempo
  geo: null,       // { minLng, maxLng, minLat, maxLat } vindo do brush do mapa
  cells: [],       // [{ bin, dow, hourStart, hourEnd, label }, ...] vindo de cliques no mapa de calor
  factors: [],     // [string, ...] valores originais em ingles, ex.: "Alcohol Involvement"
  severity: "all", // "all" | "fatal" | "nonfatal" - controle de gravidade no mapa (filtro GLOBAL)
};

// --- Helpers para montar literais SQL com seguranca ---
const sqlStr = (s) => "'" + String(s).replace(/'/g, "''") + "'"; // escapa aspas
const pad = (n) => String(n).padStart(2, "0");
const sqlDate = (d) => `'${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}'`;

/**
 * Monta a expressao booleana SQL com todos os filtros ativos, exceto `exclude`.
 * Retorna "TRUE" quando nada se aplica (assim pode ir direto no WHERE).
 * @param {string|null} exclude  nome da dimensao a ignorar (a propria visao)
 */
export function buildWhere(exclude = null) {
  const p = [];

  // Multi-selecao de bairros: OR entre os escolhidos (IN), AND com as demais
  // dimensoes - mesma logica de `factors`. Lista vazia = sem filtro de bairro.
  if (filters.boroughs.length && exclude !== "borough")
    p.push(`borough IN (${filters.boroughs.map(sqlStr).join(", ")})`);

  // Multipla selecao = OR entre os valores escolhidos (IN); cada item dentro
  // do grupo amplia o recorte, mas o grupo como um todo continua um filtro AND
  // com as demais dimensoes.
  if (filters.factors.length && exclude !== "factor")
    p.push(`factor IN (${filters.factors.map(sqlStr).join(", ")})`);

  if (filters.date && exclude !== "date")
    p.push(`dt BETWEEN ${sqlDate(filters.date[0])} AND ${sqlDate(filters.date[1])}`);

  if (filters.geo && exclude !== "geo") {
    const g = filters.geo;
    p.push(`lng BETWEEN ${g.minLng} AND ${g.maxLng}`);
    p.push(`lat BETWEEN ${g.minLat} AND ${g.maxLat}`);
  }

  if (filters.cells.length && exclude !== "cell") {
    const conds = filters.cells.map(
      (c) => `(hour BETWEEN ${c.hourStart} AND ${c.hourEnd} AND dow = ${c.dow})`
    );
    p.push(`(${conds.join(" OR ")})`);
  }

  // Gravidade (controle "where"): isola colisoes fatais ou nao-fatais. É um
  // filtro GLOBAL - afeta TODAS as visoes (por isso nao recebe `exclude`), o
  // que permite, por ex., ver no heatmap/barras o padrao SO das colisoes fatais.
  if (filters.severity === "fatal") p.push("killed > 0");
  else if (filters.severity === "nonfatal") p.push("killed = 0");

  return p.length ? p.join(" AND ") : "TRUE";
}

// Ha algum filtro ativo? (usado para habilitar o botao "limpar tudo")
export const hasAnyFilter = () =>
  filters.boroughs.length > 0 ||
  filters.date !== null ||
  filters.geo !== null ||
  filters.cells.length > 0 ||
  filters.factors.length > 0 ||
  filters.severity !== "all";
