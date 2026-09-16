# Colisões de trânsito em Nova York — Visualização Interativa

Painel de quatro visões coordenadas sobre colisões registradas pelo
[NYC Open Data](https://data.cityofnewyork.us/), construído com D3.js e DuckDB-WASM.
Implementa os conceitos de *Overview + Details on Demand*, *Linked Views* e exploração
nas dimensões **what–when–where**.

## Como rodar

```bash
npm install
npm run dev   # inicia servidor em http://localhost:8080
```

## Dados

O projeto inclui dois CSVs, ambos gerados pelo `ETL.py`:

| Arquivo                           | Descrição                         |
|-----------------------------------|-----------------------------------|
| `data/collisions_amostra_etl.csv` | Amostra (~7 MB) — desenvolvimento |
| `data/collisions_total_etl.csv`   | Dataset completo (~394 MB)        |

O `main.js` tenta o ETL da amostra primeiro; para usar o dataset completo, renomeie
ou ajuste os caminhos em `initDB()`.

### O que o ETL faz (`ETL.py`)

- Corrige casas decimais em LATITUDE/LONGITUDE (vírgula → ponto, locale pt-BR)
- Descarta linhas sem coordenada válida
- Preenche BOROUGH ausente via tabela ZIP CODE → bairro
- Corrige BOROUGH geograficamente errado via spatial join (GeoPandas + `nyc_boroughs.geojson`)
- Remove linhas sem BOROUGH após as etapas anteriores
- Exporta com sufixo `_etl.csv`

### O que o DuckDB faz em tempo de carga (`db.js`)

O `TABLE_SQL` materializa apenas 11 colunas tipadas, descartando as demais 18 do schema
original e as linhas com data inválida:

| Coluna    | Origem                        | Tipo    |
|-----------|-------------------------------|---------|
| `id`      | COLLISION_ID                  | INTEGER |
| `lat`     | LATITUDE                      | DOUBLE  |
| `lng`     | LONGITUDE                     | DOUBLE  |
| `borough` | BOROUGH                       | VARCHAR |
| `dt`      | CRASH DATE (MM/DD/YYYY)       | DATE    |
| `hour`    | CRASH TIME (H:MM)             | INTEGER |
| `dow`     | derivado de dt via ISODOW()   | INTEGER |
| `injured` | NUMBER OF PERSONS INJURED     | INTEGER |
| `killed`  | NUMBER OF PERSONS KILLED      | INTEGER |
| `factor`  | CONTRIBUTING FACTOR VEHICLE 1 | VARCHAR |
| `street`  | ON STREET NAME                | VARCHAR |

## Estrutura do projeto

```
nyc-viz/
├── css/
│   └── styles.css
├── data/
│   ├── collisions_amostra.csv        ← CSV original (amostra)
│   ├── collisions_amostra_etl.csv    ← amostra pré-processada pelo ETL
│   ├── collisions_total.csv          ← CSV original completo
│   └── collisions_total_etl.csv      ← dataset completo pré-processado
├── js/
│   ├── main.js       ← orquestrador: boot, chips de bairro, fila de refresh
│   ├── db.js         ← DuckDB-WASM: carga, limpeza e query
│   ├── state.js      ← filtros cross-filter + buildWhere()
│   ├── bus.js        ← pub/sub entre visões e orquestrador
│   ├── config.js     ← paleta de cores, rótulos PT, constantes
│   ├── tooltip.js    ← details on demand flutuante
│   └── views/
│       ├── map.js        ← WHERE: mapa de pontos e mapa de calor
│       ├── timeline.js   ← WHEN (tendência): linha do tempo mensal
│       ├── heatmap.js    ← WHEN (cíclico): faixa de hora × dia da semana
│       ├── bars.js       ← WHAT: fatores contribuintes
│       └── stats.js      ← cartões-resumo do recorte atual
├── ETL.py
├── nyc_boroughs.geojson
└── package.json
```

## Visões e interações

### WHERE — Mapa de ocorrências (`map.js`)
- **Pontos:** cada colisão como círculo; coral = vítima fatal, azul = sem morte
- **Calor:** densidade por contorno (`d3.contourDensity`) com clip nos boroughs
- `Shift + arrastar` seleciona uma área geográfica (brush 2D)
- Rolar o mouse amplia/reduz; arrastar sem Shift move o mapa
- Clicar num borough destaca e filtra por ele (sincronizado com os chips do cabeçalho)
- Controle segmentado **Todos / Com mortes / Sem mortes** filtra por gravidade (global — afeta todas as visões)

### WHEN tendência — Linha do tempo (`timeline.js`)
- Gráfico de área mensal com domínio X fixo (não muda ao filtrar)
- Arrastar seleciona um intervalo de datas (brushX)

### WHEN cíclico — Heatmap hora × dia (`heatmap.js`)
- Grade 6 × 7: faixas de 4 horas (linhas) × dias da semana ISO (colunas)
- Luminância da rampa azul sequencial codifica o volume de colisões
- Clicar em uma célula adiciona/remove o filtro {faixa, dia} — múltipla seleção

### WHAT — Fatores contribuintes (`bars.js`)
- Top 8 fatores do recorte atual, ordenados por contagem
- Clicar em uma barra seleciona/deseleciona o fator — múltipla seleção
- A visão aplica cross-filter excluindo a própria dimensão (padrão dc.js)

### Overview — Cartões de resumo (`stats.js`)
- Totais do recorte atual: colisões, feridos, mortes e % com vítimas
- Atualizam a cada interação em qualquer visão

## Arquitetura de coordenação (cross-filter)

Todas as visões compartilham um único objeto `filters` (`state.js`). Ao interagir,
a visão escreve na sua dimensão e chama `requestRefresh(NAME)` via `bus.js`. O
orquestrador (`main.js`) re-renderiza todas as visões **exceto a que disparou**,
que passa seu próprio nome como `exclude` para `buildWhere()`.

Isso garante que, ao selecionar um fator, o gráfico de barras continua exibindo
todas as categorias (para comparação), enquanto mapa, heatmap e linha do tempo
reagem ao novo recorte.

## Tecnologias

| Biblioteca        | Versão  | Uso                                 |
|-------------------|---------|-------------------------------------|
| D3.js             | ^7.9.0  | Escalas, eixos, brush, zoom, DOM    |
| DuckDB-WASM       | ^1.29.0 | SQL analítico no navegador          |
| GeoPandas         | —       | Spatial join no ETL (Python)        |
| http-server       | ^14.1.1 | Servidor de desenvolvimento         |