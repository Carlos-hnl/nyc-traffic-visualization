// =============================================================================
// bus.js - canal de eventos minimo entre visoes e orquestrador
// -----------------------------------------------------------------------------
// As visoes precisam disparar um "re-render geral" quando o usuario interage,
// mas nao devem importar o main.js (isso criaria import circular). O main
// registra aqui o seu orquestrador; as visoes apenas pedem refresh.
// =============================================================================

let handler = async () => {};

// Chamado uma vez pelo main para registrar o orquestrador de atualizacao.
export function setRefreshHandler(fn) {
  handler = fn;
}

// Chamado pelas visoes apos alterar um filtro.
// @param {string|null} except  nome da visao a NAO re-renderizar (a propria),
//                              ja que seus dados excluem a propria dimensao.
export function requestRefresh(except = null) {
  return handler(except);
}
