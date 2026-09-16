// =============================================================================
// config.js - constantes compartilhadas por todas as visoes
// -----------------------------------------------------------------------------
// Centraliza o vocabulario visual do painel. Decisao de codificacao (Munzner,
// canal de COR): a rampa azul sequencial codifica VOLUME (quanto mais escuro,
// mais colisoes); o coral quente é reservado para GRAVIDADE (mortes) e para a
// SELECAO ATIVA. Frio = contagem neutra, quente = algo que exige atencao.
// =============================================================================

// Rampa sequencial de luminancia (clara -> escura) usada no mapa de calor,
// nas barras e nos pontos do mapa. 7 paradas para interpolacao suave.
export const SEQ = ["#EAF1F8", "#C7DBEF", "#9FC1E8", "#6BA0D6", "#3E7CBE", "#1F5C9E", "#0B3A6B"];

export const PALETTE = {
  seq: SEQ,
  ink: "#15202B",        // texto principal
  muted: "#5B6876",      // texto secundario / eixos
  faint: "#9AA4AF",      // dicas
  grid: "#E4E8EC",       // linhas de grade
  hair: "#D7DCE1",       // bordas finas
  point: "#3E7CBE",      // ponto de colisao (volume)
  accent: "#E0662B",     // coral: gravidade + selecao
  accentDeep: "#A8410F", // coral escuro: texto sobre coral
};

// Dias da semana na ordem ISO (1 = segunda ... 7 = domingo), que é o que a
// funcao isodow() do DuckDB retorna. Mantemos o mesmo indice 1..7.
export const WEEKDAYS = ["Seg", "Ter", "Qua", "Qui", "Sex", "Sáb", "Dom"];

// Blocos de 4 horas (0-3, 4-7, ... 20-23): reduz as 24 horas a 6 faixas no
// mapa de calor "hora x dia". Granularidade fina (hora a hora) cria 168
// células e ruído visual sem ganho de leitura; blocos de 4h ainda capturam o
// ritmo do dia (rush da manhã/tarde, madrugada) com uma grade muito mais
// legível.
export const pad2 = (n) => String(n).padStart(2, "0");
export const HOUR_BIN_SIZE = 4;
export const HOUR_BINS = Array.from({ length: 24 / HOUR_BIN_SIZE }, (_, bin) => {
  const start = bin * HOUR_BIN_SIZE;
  const end = start + HOUR_BIN_SIZE - 1;
  return { bin, start, end, label: `${pad2(start)}–${pad2(end + 1)}h` };
});

// Traducao dos fatores contribuintes (valor original em ingles -> rotulo PT).
// IMPORTANTE: filtramos sempre pelo valor original; o PT é apenas exibicao.
export const FACTOR_PT = {
  "Driver Inattention/Distraction": "Desatenção do motorista",
  "Failure to Yield Right-of-Way": "Não deu preferência",
  "Following Too Closely": "Distância insuficiente",
  "Passing or Lane Usage Improper": "Ultrapassagem indevida",
  "Unsafe Speed": "Velocidade excessiva",
  "Backing Unsafely": "Ré insegura",
  "Traffic Control Disregarded": "Desrespeito à sinalização",
  "Passing Too Closely": "Passou muito perto",
  "Turning Improperly": "Conversão indevida",
  "Driver Inexperience": "Inexperiência",
  "Reaction to Uninvolved Vehicle": "Reação a outro veículo",
  "Alcohol Involvement": "Álcool",
  "Pedestrian/Bicyclist/Other Pedestrian Error/Confusion": "Erro de pedestre/ciclista",
};

// Bairros: valor no dado (maiusculo) -> rotulo exibido (caixa de titulo).
export const BOROUGHS = [
  ["BROOKLYN", "Brooklyn"],
  ["QUEENS", "Queens"],
  ["MANHATTAN", "Manhattan"],
  ["BRONX", "Bronx"],
  ["STATEN ISLAND", "Staten Island"],
];

// Formatadores numericos em pt-BR (12.345 / 87%).
const nf = new Intl.NumberFormat("pt-BR");
export const fmtInt = (n) => nf.format(Math.round(n || 0));
export const fmtPct = (x) => `${Math.round((x || 0) * 100)}%`;

// Rotulo PT de um fator, com fallback para o proprio valor.
export const factorLabel = (f) => FACTOR_PT[f] || f || "-";

// Rotulo exibido de um bairro (caixa de titulo), com fallback.
export const boroughLabel = (b) => (BOROUGHS.find((x) => x[0] === b)?.[1]) || b || "-";

// Trunca rotulos longos de eixo.
export const truncate = (s, n) => (s && s.length > n ? s.slice(0, n - 1) + "…" : s);
