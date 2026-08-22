# MuniAlpha

## Objetivo

Construir un dataset reproducible para evaluar todos los municipios de Cataluña desde el punto de vista de una posible inversión inmobiliaria.

La versión actual del proyecto se limita exclusivamente a:

1. localizar fuentes públicas;
2. descargar/recolectar los datos;
3. normalizarlos territorialmente;
4. calcular scores municipales;
5. generar un CSV independiente para cada score.

No desarrollar todavía mapas, frontend, recomendador de propiedades ni score compuesto final.

El sistema debe priorizar:

- fuentes oficiales;
- datos abiertos;
- granularidad municipal;
- reproducibilidad;
- trazabilidad;
- capacidad de actualización automática;
- separación entre dato bruto y score calculado.

No utilizar scraping de Idealista, Fotocasa, Airbnb u otros portales privados en la v0.1.

---

# 1. Identificador territorial canónico

Usar como clave primaria en todo el proyecto el **código municipal IDESCAT de seis caracteres**.

Nunca realizar joins usando únicamente el nombre del municipio.

Crear primero:

`municipalities.csv`

Formato:

```csv
municipality_code,municipality_name,comarca_code,comarca_name,province_code,province_name,territorial_area_code,territorial_area_name,capital_lat,capital_lon,area_km2,geometry_source_date
```

Fuente principal:

- IDESCAT — tabla de correspondencias de municipios, comarcas, ámbitos y provincias.
- ICGC — Divisiones administrativas para geometrías y capitales municipales.

Todas las tablas posteriores deben contener exactamente una fila por municipio vigente, aunque no exista dato para alguno de ellos.

Cuando un dato no esté publicado:

- dejar el dato vacío;
- no utilizar `0`;
- indicar el motivo en `missing_reason`;
- no imputar datos en la fase de recolección.

---

# 2. Contrato común para todos los CSV

Todos los CSV deben:

- codificarse como UTF-8;
- usar `,` como separador;
- usar `.` como separador decimal;
- representar valores desconocidos como vacío;
- expresar todos los scores de 0 a 100;
- hacer que `100` signifique siempre "mejor";
- mantener las variables brutas utilizadas para calcular el score.

Columnas comunes obligatorias:

```csv
municipality_code,municipality_name,comarca_code,comarca_name,reference_period,score_0_100,confidence_0_100,data_scope,source_id,source_updated_at,retrieved_at,method_version,missing_reason,notes
```

Valores recomendados de `data_scope`:

```text
municipality
comarca
derived
proxy
missing
```

En v0.1 no sustituir automáticamente valores municipales ausentes por datos de comarca.

---

# 3. Normalización general

## Contrato de publicación v0.2

Además de las columnas comunes, todos los scores incluyen:

```csv
score_status,score_min_0_100,score_max_0_100,coverage_weight_pct,rank_stability_0_100,source_tier,method_variant,usable_for_composite
```

Estados válidos: `complete`, `partial`, `engineering_pending`,
`methodology_pending` y `external_blocked`. Un score parcial conserva el
intervalo compatible con los componentes ausentes y no se utiliza en el futuro
score compuesto salvo regla explícita. La ausencia nunca se representa como
cero.

Excepto cuando un score tenga una función explícita propia, utilizar normalización robusta.

Para métricas donde un valor alto es mejor:

```text
L = percentil 5 de los municipios con datos válidos
U = percentil 95

x' = clamp(x, L, U)

score = 100 × (x' - L) / (U - L)
```

Para variables donde un valor bajo es mejor:

```text
score = 100 - positive_score(x)
```

Guardar siempre `L` y `U` utilizados durante la ejecución.

Nunca sustituir el dato bruto por el score.

---

# 4. SALE PRICE SCORE

Archivo:

`01_sale_price_score.csv`

Objetivo:

Medir fortaleza/demanda implícita del mercado inmobiliario mediante el precio observado de vivienda usada.

Fuente:

Agència de l'Habitatge de Catalunya.

Dataset:

**Compravendes d'habitatges registrades i preu de venda**, tabla anual por municipios.

Usar preferentemente:

- vivienda usada;
- último año completo;
- precio por m² construido.

Actualmente la publicación municipal no cubre necesariamente todos los municipios pequeños. Mantener los `null` originales.

Extracción:

1. localizar el último año completo;
2. descargar la tabla de vivienda usada por municipios;
3. extraer número de operaciones, precio total medio, superficie media y €/m²;
4. unir por código municipal siempre que esté disponible;
5. resolver nombres únicamente como fallback.

Variable principal:

```text
sale_price_eur_m2
```

Score:

```text
score = robust_positive(sale_price_eur_m2)
```

CSV:

```csv
municipality_code,municipality_name,comarca_code,comarca_name,reference_period,sales_count,avg_surface_m2,avg_sale_price_eur,sale_price_eur_m2,score_0_100,confidence_0_100,data_scope,source_id,source_updated_at,retrieved_at,method_version,missing_reason,notes
```

---

# 5. SALE MOMENTUM SCORE

Archivo:

`02_sale_momentum_score.csv`

Objetivo:

Detectar municipios donde el mercado se está apreciando.

Fuente:

Las mismas series históricas de compraventa.

Calcular usando vivienda usada.

Métrica preferida:

```text
price_cagr_3y =
((price_t / price_t_minus_3) ^ (1/3) - 1) × 100
```

Si no existen exactamente tres años:

- no extrapolar;
- dejar vacío;
- opcionalmente guardar también crecimiento 1 año.

Score:

```text
score = robust_positive(price_cagr_3y)
```

CSV:

```csv
municipality_code,municipality_name,comarca_code,comarca_name,reference_period,price_eur_m2_current,price_eur_m2_1y_ago,price_eur_m2_3y_ago,growth_1y_pct,cagr_3y_pct,score_0_100,confidence_0_100,data_scope,source_id,source_updated_at,retrieved_at,method_version,missing_reason,notes
```

---

# 6. RENTAL PRICE SCORE

Archivo:

`03_rental_price_score.csv`

Objetivo:

Medir fortaleza de la demanda residencial en alquiler.

Fuente:

Agència de l'Habitatge de Catalunya / INCASÒL.

Dataset:

**Mercat de lloguer — fiances dipositades a l'INCASÒL**, tabla anual por municipio.

Preferir el último año natural completo en lugar del último trimestre para evitar estacionalidad.

Variables:

- número de contratos;
- renta contractual media mensual.

Variable principal:

```text
avg_monthly_rent_eur
```

Score:

```text
score = robust_positive(avg_monthly_rent_eur)
```

CSV:

```csv
municipality_code,municipality_name,comarca_code,comarca_name,reference_period,rental_contracts,avg_monthly_rent_eur,score_0_100,confidence_0_100,data_scope,source_id,source_updated_at,retrieved_at,method_version,missing_reason,notes
```

---

# 7. GROSS YIELD PROXY SCORE

Archivo:

`04_yield_proxy_score.csv`

Objetivo:

Aproximar la rentabilidad bruta residencial.

No presentarlo como yield real de una propiedad concreta.

Combinar:

- renta media mensual de INCASÒL;
- precio total medio de vivienda usada registrada.

Fórmula:

```text
gross_yield_proxy_pct =
12 × avg_monthly_rent_eur
/
avg_sale_price_eur
× 100
```

Este indicador compara stocks diferentes y, por tanto, es un **proxy de mercado**, no una estimación contractual.

Score:

```text
score = robust_positive(gross_yield_proxy_pct)
```

CSV:

```csv
municipality_code,municipality_name,comarca_code,comarca_name,reference_period,avg_monthly_rent_eur,avg_sale_price_eur,gross_yield_proxy_pct,score_0_100,confidence_0_100,data_scope,source_id,retrieved_at,method_version,missing_reason,notes
```

Confidence debe reducirse cuando venta y alquiler correspondan a periodos diferentes.

---

# 8. MARKET LIQUIDITY SCORE

Archivo:

`05_market_liquidity_score.csv`

Objetivo:

Distinguir mercados activos de municipios donde existe un precio publicado pero apenas se producen transacciones.

Datos:

- compraventas registradas;
- contratos nuevos de alquiler;
- población residente IDESCAT.

Calcular:

```text
sales_per_1000 =
sales_count / population × 1000

rental_contracts_per_1000 =
rental_contracts / population × 1000
```

Subscores:

```text
sale_liquidity_score =
robust_positive(sales_per_1000)

rental_liquidity_score =
robust_positive(rental_contracts_per_1000)
```

Score:

```text
market_liquidity_score =
0.60 × sale_liquidity_score +
0.40 × rental_liquidity_score
```

CSV:

```csv
municipality_code,municipality_name,comarca_code,comarca_name,reference_period,population,sales_count,sales_per_1000,rental_contracts,rental_contracts_per_1000,sale_liquidity_score,rental_liquidity_score,score_0_100,confidence_0_100,data_scope,source_id,retrieved_at,method_version,missing_reason,notes
```

En futuras versiones debería estudiarse sustituir población por stock total de viviendas.

---

# 9. BARCELONA ACCESS SCORE

Archivo:

`06_barcelona_access_score.csv`

Objetivo:

Medir accesibilidad real por carretera a Barcelona.

No utilizar distancia geodésica ni kilómetros en línea recta.

Punto origen por defecto:

```text
Plaça de Catalunya, Barcelona
```

Punto destino:

capital o núcleo administrativo principal del municipio según ICGC.

Routing:

OpenStreetMap + openrouteservice, perfil `driving-car`.

Utilizar Matrix API para procesar municipios por lotes.

Guardar:

- duración;
- distancia de carretera;
- fecha del grafo/routing.

Variable principal:

```text
drive_minutes_to_barcelona
```

Score mediante interpolación lineal entre estos puntos:

```text
<= 45 min    → 100
90 min       → 75
120 min      → 60
180 min      → 35
240 min      → 15
>= 300 min   → 0
```

CSV:

```csv
municipality_code,municipality_name,comarca_code,comarca_name,origin_name,destination_lat,destination_lon,drive_minutes,road_distance_km,score_0_100,confidence_0_100,routing_engine,routing_profile,routing_date,source_id,retrieved_at,method_version,missing_reason,notes
```

No incorporar tráfico en tiempo real en v0.1.

---

# 10. SKI ACCESS SCORE

Archivo:

`07_ski_access_score.csv`

Crear además un fichero auxiliar:

`ski_stations.csv`

Formato:

```csv
station_id,station_name,country,region,base_lat,base_lon,skiable_km,slopes_count,source_id,source_date,notes
```

V0.1:

estaciones alpinas catalanas.

V0.2 recomendada:

añadir Andorra y estaciones francesas relevantes para municipios catalanes.

Obtener para cada municipio el tiempo por carretera desde su capital hasta la base/aparcamiento principal de cada estación.

Importancia de una estación:

```text
station_weight =
sqrt(min(skiable_km,150) / 150)
```

Atractivo de una estación para un municipio:

```text
c_i =
station_weight × exp(-drive_minutes / 60)
```

Ordenar todos los `c_i`.

Score bruto:

```text
ski_raw =
c1 +
0.50 × c2 +
0.25 × c3
```

Esto premia:

- proximidad;
- tamaño del dominio;
- tener varias alternativas próximas.

Normalizar `ski_raw` usando `robust_positive`.

CSV:

```csv
municipality_code,municipality_name,comarca_code,comarca_name,nearest_station,nearest_station_minutes,nearest_station_km,best_station,best_station_minutes,best_station_skiable_km,second_station,second_station_minutes,third_station,third_station_minutes,ski_raw,score_0_100,confidence_0_100,source_id,retrieved_at,method_version,missing_reason,notes
```

---

# 11. COAST ACCESS SCORE

Archivo:

`08_coast_access_score.csv`

Score adicional recomendado.

Objetivo:

Capturar una fuente de demanda inmobiliaria y turística tan relevante en Cataluña como el esquí.

Fuente geográfica:

línea de costa ICGC.

Calcular inicialmente la distancia geográfica mínima desde la capital municipal hasta la costa.

Variables:

```text
touches_coast
distance_to_coast_km
```

Score:

```text
if touches_coast:
    score = 100
else:
    score = 100 × exp(-distance_to_coast_km / 50)
```

CSV:

```csv
municipality_code,municipality_name,comarca_code,comarca_name,touches_coast,distance_to_coast_km,score_0_100,confidence_0_100,source_id,source_updated_at,retrieved_at,method_version,missing_reason,notes
```

Una futura versión puede sustituir distancia lineal por tiempo de conducción hasta la playa accesible más cercana.

---

# 12. LANDSCAPE SCORE

Archivo:

`09_landscape_score.csv`

Objetivo:

Construir un indicador reproducible de atractivo paisajístico sin pedir inicialmente a un LLM que decida qué municipio es "bonito".

Fuentes:

### A. Cobertura natural

ICGC — Mapa de Cobertes del Sòl.

Intersectar la geometría municipal con las categorías:

- bosques;
- matorral;
- prados/pastizales;
- humedales;
- otras coberturas naturales.

Calcular:

```text
natural_area_pct
forest_area_pct
```

### B. Espacios protegidos

Cartografía del Sistema d'Espais Naturals Protegits:

- PEIN;
- ENPE;
- Natura 2000.

Realizar una unión geométrica para evitar doble conteo.

Calcular:

```text
protected_area_pct
```

### C. Relieve

ICGC — Modelo Digital de Elevaciones.

Por municipio:

```text
elevation_mean
elevation_p05
elevation_p95
elevation_range_p90 = p95 - p05
mean_slope_deg
```

Subscore:

```text
relief_score =
0.50 × robust_positive(elevation_range_p90) +
0.50 × robust_positive(mean_slope_deg)
```

### D. Agua / costa

Desde coberturas ICGC:

```text
water_wetland_pct
touches_coast
```

```text
water_score =
0.60 × robust_positive(water_wetland_pct)
+
0.40 × (100 if touches_coast else 0)
```

### E. Reconocimiento y diversidad paisajística

Observatori del Paisatge de Catalunya:

- 134 unidades de paisaje;
- capas de miradores de los catálogos.

Intersectar municipios/unidades.

Calcular:

```text
landscape_units_count
landscape_diversity_entropy
official_viewpoints_count
viewpoints_per_100km2
```

Recognition:

```text
recognition_score =
0.60 × robust_positive(viewpoints_per_100km2)
+
0.40 × robust_positive(landscape_diversity_entropy)
```

### Landscape final

```text
landscape_score =
0.30 × natural_score +
0.25 × protected_score +
0.20 × relief_score +
0.10 × water_score +
0.15 × recognition_score
```

CSV:

```csv
municipality_code,municipality_name,comarca_code,comarca_name,area_km2,natural_area_pct,forest_area_pct,protected_area_pct,elevation_mean,elevation_p05,elevation_p95,elevation_range_p90,mean_slope_deg,water_wetland_pct,touches_coast,landscape_units_count,landscape_diversity_entropy,official_viewpoints_count,viewpoints_per_100km2,natural_score,protected_score,relief_score,water_score,recognition_score,score_0_100,confidence_0_100,source_id,retrieved_at,method_version,missing_reason,notes
```

No introducir un `AI beauty score` en v0.1.

Puede añadirse más adelante como indicador separado y nunca sustituir los componentes objetivos.

---

# 13. TOURISM DEMAND SCORE

Archivo:

`10_tourism_demand_score.csv`

Objetivo:

Medir presencia efectiva de visitantes y profundidad del mercado turístico.

### Fuente A — población estacional ETCA

IDESCAT.

Obtener:

```text
resident_population
non_resident_present
resident_absent
seasonal_population_total
population_etca
population_etca_pct
```

Usar:

```text
etca_pressure =
population_etca / resident_population
```

### Fuente B — Registro de Turismo

Dades Obertes Catalunya.

Dataset Socrata:

```text
t2h3-cgys
```

Filtrar establecimientos en alta.

Agrupar por `codi_municipi_idescat`.

Obtener:

```text
hut_count
hotel_count
rural_count
camping_count
tourist_establishments_count
```

Calcular:

```text
hut_per_1000 =
hut_count / population × 1000

tourist_establishments_per_1000 =
tourist_establishments_count / population × 1000
```

### Fuente C — IEET

Dataset Socrata:

```text
q4sr-68c3
```

Cuando exista información municipal:

```text
ieet_total_eur
ieet_hut_eur
ieet_eur_per_resident
```

La ausencia de fila municipal de IEET **no equivale a cero** porque existen reglas de secreto tributario y agregación.

### Score base

```text
base =
0.55 × robust_positive(etca_pressure) +
0.25 × robust_positive(hut_per_1000) +
0.20 × robust_positive(tourist_establishments_per_1000)
```

Si existe IEET municipal válido:

```text
score =
0.80 × base +
0.20 × robust_positive(ieet_eur_per_resident)
```

Si no existe:

```text
score = base
```

Registrar esta circunstancia en `confidence_0_100`.

CSV:

```csv
municipality_code,municipality_name,comarca_code,comarca_name,reference_period,resident_population,non_resident_present,resident_absent,population_etca,population_etca_pct,etca_pressure,hut_count,hut_per_1000,hotel_count,rural_count,camping_count,tourist_establishments_count,tourist_establishments_per_1000,ieet_available,ieet_total_eur,ieet_hut_eur,ieet_eur_per_resident,etca_score,hut_density_score,tourist_supply_score,ieet_score,score_0_100,confidence_0_100,source_id,retrieved_at,method_version,missing_reason,notes
```

Guardar `hut_per_1000` aunque pueda representar también competencia futura.

---

# 14. HUT FEASIBILITY / REGULATORY SCORE

Archivo:

`11_hut_feasibility_score.csv`

Este indicador debe considerarse un **gate regulatorio** y no simplemente otra señal económica.

Fuente inicial:

Decreto-ley 3/2023 y normativa consolidada posterior.

Existe una lista de municipios sometidos al régimen de licencia urbanística previa.

Variables:

```text
subject_to_special_hut_license_regime
existing_hut_count
hut_per_100_residents
explicit_local_moratorium
explicit_local_prohibition
local_regulation_checked
```

En v0.1:

```text
explicit local prohibition/moratorium → 0
special licence regime              → 40
not included in special regime      → 100
```

No inferir automáticamente que una nueva licencia puede conseguirse porque el municipio tenga menos de 10 HUT por 100 habitantes.

Si no se ha revisado el planeamiento municipal:

```text
local_regulation_checked = false
```

CSV:

```csv
municipality_code,municipality_name,comarca_code,comarca_name,subject_to_special_hut_license_regime,existing_hut_count,population,hut_per_100_residents,explicit_local_moratorium,explicit_local_prohibition,local_regulation_checked,regulation_reference,score_0_100,confidence_0_100,source_id,source_updated_at,retrieved_at,method_version,missing_reason,notes
```

---

# 15. DEMOGRAPHIC SCORE

Archivo:

`12_demographic_score.csv`

Fuente:

IDESCAT.

Obtener población municipal del año actual disponible y de cinco años antes.

Calcular:

```text
population_cagr_5y =
((population_current / population_5y_ago) ^ (1/5) - 1) × 100
```

Score:

```text
score =
robust_positive(population_cagr_5y)
```

Guardar también tamaño actual de población.

CSV:

```csv
municipality_code,municipality_name,comarca_code,comarca_name,population_current,population_1y_ago,population_5y_ago,growth_1y_pct,cagr_5y_pct,score_0_100,confidence_0_100,source_id,reference_period,retrieved_at,method_version,missing_reason,notes
```

---

# 16. INCOME SCORE

Archivo:

`13_income_score.csv`

Objetivo:

Proxy de capacidad adquisitiva de la demanda residencial local.

Fuente:

IDESCAT — Renda familiar disponible bruta territorial.

Variable:

```text
rfdb_eur_per_capita
```

Score:

```text
score =
robust_positive(rfdb_eur_per_capita)
```

La estadística municipal no cubre necesariamente los pueblos más pequeños.

No imputar en v0.1.

CSV:

```csv
municipality_code,municipality_name,comarca_code,comarca_name,reference_period,rfdb_total_eur,rfdb_eur_per_capita,rfdb_index_catalonia_100,score_0_100,confidence_0_100,data_scope,source_id,retrieved_at,method_version,missing_reason,notes
```

---

# 17. SERVICES SCORE

Archivo:

`14_services_score.csv`

Objetivo:

Medir la practicidad de vivir o pasar temporadas en el municipio.

Fuente base:

OpenStreetMap.

No realizar miles de consultas individuales a Overpass.

Preferir:

1. descargar un extracto OSM;
2. extraer POIs;
3. calcular ubicaciones localmente;
4. usar routing por lotes para tiempos de conducción.

POIs mínimos:

- hospital;
- centro de atención primaria/clinic;
- supermercado;
- farmacia;
- colegio;
- estación ferroviaria.

Para cada municipio calcular tiempo desde la capital hasta el POI más cercano.

Convertir cada tiempo en score:

```text
<= 5 min  → 100
15 min    → 80
30 min    → 50
60 min    → 10
>= 90 min → 0
```

Interpolación lineal.

Pesos:

```text
hospital        25%
primary care    15%
supermarket     20%
school          10%
rail station    20%
pharmacy        10%
```

CSV:

```csv
municipality_code,municipality_name,comarca_code,comarca_name,hospital_minutes,primary_care_minutes,supermarket_minutes,school_minutes,rail_station_minutes,pharmacy_minutes,hospital_score,primary_care_score,supermarket_score,school_score,rail_station_score,pharmacy_score,score_0_100,confidence_0_100,source_id,osm_snapshot_date,retrieved_at,method_version,missing_reason,notes
```

---

# 18. NATURAL RISK SCORE

Archivo:

`15_natural_risk_score.csv`

El score debe significar:

```text
100 = menor riesgo
0   = mayor riesgo
```

V0.1 debe incluir al menos:

### Riesgo de inundación

Cartografía ACA + cartografía equivalente del SNCZI para las cuencas que no gestiona ACA.

Calcular porcentaje del municipio afectado por:

```text
flood_t10_pct
flood_t100_pct
flood_t500_pct
preferred_flow_zone_pct
```

Riesgo bruto:

```text
flood_risk_raw =
1.50 × flood_t10_pct +
1.25 × flood_t100_pct +
1.00 × flood_t500_pct
```

Normalizar como riesgo y posteriormente invertir:

```text
flood_safety_score =
100 - robust_positive(flood_risk_raw)
```

### Incendio forestal

Utilizar cartografía pública de peligro básico de incendio forestal.

Calcular:

```text
high_fire_risk_area_pct
very_high_fire_risk_area_pct
```

```text
fire_risk_raw =
high_fire_risk_area_pct +
2 × very_high_fire_risk_area_pct

fire_safety_score =
100 - robust_positive(fire_risk_raw)
```

Score final provisional:

```text
natural_risk_score =
0.60 × flood_safety_score +
0.40 × fire_safety_score
```

No publicar el score final si falta cobertura territorial de alguna de las fuentes.

CSV:

```csv
municipality_code,municipality_name,comarca_code,comarca_name,flood_t10_pct,flood_t100_pct,flood_t500_pct,preferred_flow_zone_pct,flood_risk_raw,flood_safety_score,high_fire_risk_area_pct,very_high_fire_risk_area_pct,fire_risk_raw,fire_safety_score,score_0_100,confidence_0_100,source_id,source_updated_at,retrieved_at,method_version,missing_reason,notes
```

---

# 19. Confidence score

No ocultar la incertidumbre.

Regla inicial:

```text
100 = dato municipal directo, actual y suficiente
 85 = dato municipal directo pero antiguo
 70 = proxy municipal o muestra reducida
 50 = dato territorial superior utilizado como referencia
 25 = estimación débil
  0 = sin dato
```

El cálculo concreto puede especializarse por dataset.

Nunca aumentar artificialmente confidence mediante imputación.

---

# 20. Validación

Cada collector debe validar:

- código municipal conocido;
- ausencia de duplicados;
- unidades correctas;
- rangos numéricos razonables;
- periodo temporal;
- número de municipios con dato;
- número de municipios sin dato;
- cambios abruptos respecto a la ejecución anterior.

Generar para cada ejecución:

```text
rows_total
rows_with_data
rows_missing
coverage_pct
source_date
retrieval_date
```

---

# 21. Provenance

Además de los CSV finales, guardar un manifiesto:

`manifest.json`

Para cada dataset:

```json
{
  "score": "sale_price",
  "method_version": "0.1",
  "source": "...",
  "source_dataset_id": "...",
  "source_reference_period": "...",
  "retrieved_at": "...",
  "raw_file": "...",
  "output_file": "...",
  "rows": 0,
  "coverage_pct": 0,
  "normalization": {
    "method": "winsorized_minmax",
    "p05": 0,
    "p95": 0
  }
}
```

Nunca borrar los ficheros brutos utilizados para producir una versión del score.

---

# 22. Orden de implementación

Implementar en este orden:

```text
municipalities
sale_price
rental_price
sale_momentum
yield_proxy
market_liquidity
barcelona_access
ski_access
landscape
tourism_demand
hut_feasibility
demographic
income
coast_access
services
natural_risk
```

Los primeros diez ya permiten construir posteriormente un mapa de inversión inmobiliaria muy informativo.

---

# 23. Criterio de finalización de la fase de datos

La fase se considera terminada cuando:

- existe un catálogo canónico de municipios;
- cada score dispone de un CSV reproducible;
- todos conservan raw data y score;
- todas las filas utilizan códigos IDESCAT;
- se conoce la cobertura de cada fuente;
- los missing están documentados;
- existe provenance;
- los pipelines pueden volver a ejecutarse sin intervención manual significativa.

El score compuesto y el mapa interactivo pertenecen a una fase posterior.
