# ============================================================
# ETL - Enriquecimento do campo BOROUGH
# ============================================================

import pandas as pd
import geopandas as gpd
from shapely.geometry import Point
import os

# ------------------------------------------------------------
# Configuração dos caminhos (ÚNICA ALTERAÇÃO ESTRUTURAL)
# ------------------------------------------------------------
INPUT_PATH = "./data/collisions_total.csv"  # <- variável para o CSV de entrada
base_name = os.path.splitext(os.path.basename(INPUT_PATH))[0]  # "collisions_amostra"
output_file = f"{base_name}_etl.csv"
OUTPUT_PATH = os.path.join("data", output_file)  # ex.: "data/collisions_amostra_etl.csv"

# ------------------------------------------------------------
# 1. Carregar dataset (Forçando leitura como texto)
# ------------------------------------------------------------

# O parâmetro dtype força o Pandas a ler essas colunas como texto desde o início
df = pd.read_csv(
    INPUT_PATH,
    low_memory=False,
    dtype={"BOROUGH": str, "ZIP CODE": str}
)

print(f"Registros originais: {len(df)}")

# ------------------------------------------------------------
# TRATAMENTO CRÍTICO: Correção de Latitude/Longitude
# ------------------------------------------------------------
df["LATITUDE"] = df["LATITUDE"].astype(str).str.replace(",", ".").astype(float)
df["LONGITUDE"] = df["LONGITUDE"].astype(str).str.replace(",", ".").astype(float)

# Descartar linhas sem coordenada válida
antes = len(df)
df = df[df["LATITUDE"].notna() & df["LONGITUDE"].notna()].copy()
print(f"Removidos por coordenada ausente: {antes - len(df)}")

# ------------------------------------------------------------
# 2. Padronização
# ------------------------------------------------------------

# O .fillna("") mata o erro do .str eliminando qualquer float (NaN) oculto
df["BOROUGH"] = (
    df["BOROUGH"]
    .fillna("")
    .astype(str)
    .str.upper()
    .str.strip()
)

df["BOROUGH"] = df["BOROUGH"].replace({
    "NAN": None,
    "": None
})

# ------------------------------------------------------------
# 3. Preenchimento via ZIP CODE
# ------------------------------------------------------------

zip_to_borough = {
    # Manhattan
    "10001": "MANHATTAN", "10002": "MANHATTAN", "10003": "MANHATTAN", "10004": "MANHATTAN",
    
    # Brooklyn
    "11201": "BROOKLYN", "11203": "BROOKLYN", "11204": "BROOKLYN", "11206": "BROOKLYN",
    
    # Bronx
    "10451": "BRONX", "10452": "BRONX", "10453": "BRONX",
    
    # Queens
    "11354": "QUEENS", "11355": "QUEENS", "11356": "QUEENS",
    
    # Staten Island
    "10301": "STATEN ISLAND", "10302": "STATEN ISLAND", "10303": "STATEN ISLAND",
}

# Blindando a coluna ZIP CODE contra o mesmo erro
df["ZIP CODE"] = df["ZIP CODE"].fillna("").astype(str)

mask = df["BOROUGH"].isna()

df.loc[mask, "BOROUGH"] = (
    df.loc[mask, "ZIP CODE"]
    .str.split(".")
    .str[0]
    .map(zip_to_borough)
)

print("Após ZIP CODE:")
print(df["BOROUGH"].isna().sum())

# ------------------------------------------------------------
# 4. Preenchimento E CORREÇÃO do BOROUGH pela coordenada
# ------------------------------------------------------------
# A coordenada (LAT/LON) costuma ser mais confiavel que o campo BOROUGH
# digitado. Entao, para TODA linha com coordenada valida, descobrimos via
# spatial join em qual bairro o ponto realmente cai e usamos isso para:
#   (a) PREENCHER quando BOROUGH esta vazio;
#   (b) CORRIGIR quando BOROUGH foi informado mas diverge da geografia
#       (ex.: registrado como QUEENS, mas o ponto cai dentro de BROOKLYN).
# Obs.: rodar o sjoin em TODAS as linhas (e nao so nas vazias) e mais pesado,
# mas e um passo unico de pre-processamento.

# GeoJSON oficial dos boroughs (boro_name já vem em CAIXA ALTA: "BROOKLYN" etc.)
boroughs = gpd.read_file("nyc_boroughs.geojson").to_crs("EPSG:4326")

# Pontos de todas as linhas com coordenada válida.
valid = df["LATITUDE"].notna() & df["LONGITUDE"].notna()

pts = gpd.GeoDataFrame(
    df.loc[valid, ["BOROUGH"]],
    geometry=gpd.points_from_xy(
        df.loc[valid, "LONGITUDE"],
        df.loc[valid, "LATITUDE"],
    ),
    crs="EPSG:4326",
)

# Spatial join: cada ponto recebe o bairro do polígono que o contém (within).
joined = gpd.sjoin(
    pts,
    boroughs[["boro_name", "geometry"]],
    how="left",
    predicate="within",
)

# Um ponto exatamente sobre a divisa pode casar com 2 polígonos e duplicar a
# linha; mantemos a primeira ocorrência.
joined = joined[~joined.index.duplicated(keep="first")]

# Bairro GEOGRÁFICO de cada linha (verdade de campo), alinhado ao índice do df.
geo = joined["boro_name"].str.upper().reindex(df.index)

# (a) PREENCHER: BOROUGH vazio e a geografia sabe o bairro.
fill_mask = df["BOROUGH"].isna() & geo.notna()
n_fill = int(fill_mask.sum())
df.loc[fill_mask, "BOROUGH"] = geo[fill_mask]

# (b) CORRIGIR: BOROUGH informado, mas a coordenada cai em OUTRO bairro.
#     Pontos sem match (geo NaN, ex.: fora dos 5 boroughs) ficam como estão.
fix_mask = df["BOROUGH"].notna() & geo.notna() & (df["BOROUGH"] != geo)
n_fix = int(fix_mask.sum())
df.loc[fix_mask, "BOROUGH"] = geo[fix_mask]

print(f"Bairros preenchidos pela coordenada: {n_fill}")
print(f"Bairros corrigidos (informado divergia da geografia): {n_fix}")
print("Após Spatial Join, ainda sem bairro:", int(df["BOROUGH"].isna().sum()))

# ------------------------------------------------------------
# 5. Remover registros ainda sem Borough
# ------------------------------------------------------------

antes = len(df)

df = df[df["BOROUGH"].notna()].copy()

depois = len(df)

print(f"Removidos: {antes - depois}")
print(f"Restantes: {depois}")

# ------------------------------------------------------------
# 6. Exportar dataset tratado
# ------------------------------------------------------------

df.to_csv(
    OUTPUT_PATH,
    index=False
)

print(f"Arquivo salvo com sucesso em: {OUTPUT_PATH}")