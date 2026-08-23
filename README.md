# MuniAlpha

**MuniAlpha** es un proyecto de análisis territorial orientado a identificar municipios de Cataluña potencialmente interesantes para inversión inmobiliaria.

El objetivo es construir una base de datos reproducible a nivel municipal utilizando, siempre que sea posible, **datos públicos y fuentes oficiales**.

> Estado actual: **Fase 2, modelo exploratorio y mapa estático**.
> El índice es relativo, configurable y no sustituye una evaluación profesional.

## Objetivo

Para cada municipio de Cataluña, MuniAlpha recopila diferentes indicadores relacionados con:

- mercado inmobiliario;
- alquiler;
- rentabilidad potencial;
- accesibilidad;
- turismo;
- paisaje y entorno natural;
- servicios;
- demografía;
- regulación;
- riesgos.

Cada indicador se procesa de manera independiente y genera su propio CSV.

La filosofía del proyecto es conservar siempre:

```text
fuente pública
    ↓
datos originales
    ↓
datos normalizados por municipio
    ↓
métrica calculada
    ↓
score 0–100
```

De esta forma, los pesos y el score compuesto podrán cambiar posteriormente sin necesidad de volver a recopilar todos los datos.

---

## Principios

### Granularidad municipal

La unidad territorial principal es el **municipio**.

Se utiliza como identificador canónico el código municipal de IDESCAT, evitando realizar joins únicamente por nombre.

Cuando una fuente no ofrece datos municipales:

- el dato se mantiene como ausente;
- no se interpreta como cero;
- se documenta el motivo;
- no se imputa automáticamente en esta primera fase.

### Datos públicos

Se priorizan fuentes oficiales y abiertas, entre ellas:

- IDESCAT
- Generalitat de Catalunya
- Agència de l'Habitatge de Catalunya
- INCASÒL
- ICGC
- Observatori del Paisatge de Catalunya
- ACA
- Registre de Turisme de Catalunya
- OpenStreetMap
- openrouteservice

No se pretende depender de scraping de portales privados como Idealista, Fotocasa o Airbnb.

### Reproducibilidad

Cada dataset debe conservar:

- fuente;
- periodo de referencia;
- fecha de descarga;
- datos originales;
- transformación realizada;
- versión del algoritmo;
- cobertura obtenida.

### Scores interpretables

Todos los scores utilizan la misma convención:

```text
0   = peor
100 = mejor
```

El dato original siempre se conserva junto al score.

---

# Scores previstos

## Mercado inmobiliario

### Sale Price Score

Precio de compraventa de vivienda usada por metro cuadrado.

Un precio elevado se considera una señal de demanda y fortaleza del mercado, aunque no necesariamente de buena rentabilidad.

Output:

```text
01_sale_price_score.csv
```

### Sale Momentum Score

Evolución reciente del precio inmobiliario.

Métrica principal prevista:

```text
CAGR del precio €/m² durante 3 años
```

Output:

```text
02_sale_momentum_score.csv
```

### Rental Price Score

Nivel del alquiler residencial utilizando contratos reales registrados mediante las fianzas depositadas en INCASÒL.

Output:

```text
03_rental_price_score.csv
```

### Gross Yield Proxy Score

Estimación aproximada de rentabilidad bruta:

```text
alquiler anual medio / precio medio de compraventa
```

Debe interpretarse como proxy municipal y no como rentabilidad esperada de un inmueble concreto.

Output:

```text
04_yield_proxy_score.csv
```

### Market Liquidity Score

Actividad del mercado mediante:

- compraventas;
- nuevos contratos de alquiler;
- población municipal.

Output:

```text
05_market_liquidity_score.csv
```

---

# Accesibilidad

## Barcelona Access Score

Tiempo por carretera entre el núcleo principal del municipio y Barcelona.

Origen inicial:

```text
Plaça de Catalunya, Barcelona
```

Se utiliza tiempo de conducción en lugar de distancia geográfica.

Output:

```text
06_barcelona_access_score.csv
```

## Ski Access Score

Accesibilidad a estaciones de esquí considerando:

- tiempo de conducción;
- tamaño de la estación;
- número de estaciones próximas.

El modelo está pensado para incluir estaciones de:

- Cataluña;
- Andorra;
- Pirineo francés.

Output:

```text
07_ski_access_score.csv
```

## Coast Access Score

Proximidad al litoral catalán.

Output:

```text
08_coast_access_score.csv
```

---

# Entorno

## Landscape Score

Indicador compuesto de atractivo paisajístico basado principalmente en datos geográficos objetivos.

Incluye:

- superficie forestal;
- superficie natural;
- espacios protegidos;
- relieve;
- pendiente;
- presencia de agua;
- costa;
- unidades oficiales de paisaje;
- miradores reconocidos.

Output:

```text
09_landscape_score.csv
```

No se utiliza inicialmente un modelo de IA para decidir si un municipio es "bonito".

---

# Turismo

## Tourism Demand Score

Intenta medir demanda turística efectiva mediante varias señales independientes:

- población estacional ETCA;
- viviendas de uso turístico;
- hoteles;
- campings;
- turismo rural;
- plazas y establecimientos turísticos;
- recaudación del impuesto sobre estancias turísticas cuando exista información municipal.

Output:

```text
10_tourism_demand_score.csv
```

## HUT Feasibility Score

Indicador regulatorio separado del atractivo turístico.

Evalúa la facilidad potencial para explotar una vivienda como **Habitatge d'Ús Turístic (HUT)**.

Puede funcionar posteriormente como un *gate*:

```text
Investment Score: 87
HUT Feasibility: 0
```

Es decir: un municipio puede ser muy atractivo como inversión pero no ser viable para una estrategia basada en alquiler turístico.

Output:

```text
11_hut_feasibility_score.csv
```

---

# Demografía y capacidad económica

## Demographic Score

Evolución de la población municipal, principalmente mediante CAGR a cinco años.

Output:

```text
12_demographic_score.csv
```

## Income Score

Renta familiar disponible por habitante como proxy de capacidad adquisitiva local.

Output:

```text
13_income_score.csv
```

---

# Servicios

## Services Score

Accesibilidad desde el núcleo principal del municipio a servicios básicos como:

- hospital;
- atención primaria;
- supermercado;
- farmacia;
- colegio;
- estación ferroviaria.

Output:

```text
14_services_score.csv
```

---

# Riesgos

## Natural Risk Score

Indicador donde:

```text
100 = menor riesgo
0   = mayor riesgo
```

La primera versión contempla:

- inundaciones;
- incendios forestales.

Output:

```text
15_natural_risk_score.csv
```

---

# Estructura prevista

```text
munialpha/
│
├── README.md
│
├── pyproject.toml
│
├── config/
│   ├── sources.yaml
│   └── scoring.yaml
│
├── data/
│   ├── raw/
│   ├── intermediate/
│   └── scores/
│
├── src/
│   └── munialpha/
│       ├── collectors/
│       ├── geo/
│       ├── scoring/
│       ├── validation/
│       └── cli/
│
├── tests/
│
└── output/
    ├── municipalities.csv
    ├── 01_sale_price_score.csv
    ├── 02_sale_momentum_score.csv
    ├── 03_rental_price_score.csv
    └── ...
```

La estructura es provisional y evolucionará a medida que se implementen los collectors.

---

# Formato común de los datasets

Siempre que tenga sentido, los CSV incluirán:

```csv
municipality_code,
municipality_name,
comarca_code,
comarca_name,
reference_period,
score_0_100,
confidence_0_100,
data_scope,
source_id,
source_updated_at,
retrieved_at,
method_version,
missing_reason,
notes
```

Cada score añadirá además sus variables originales.

Ejemplo:

```csv
municipality_code,municipality_name,sale_price_eur_m2,score_0_100
08019,Barcelona,XXXX.XX,XX.XX
```

---

# Confidence Score

Los scores disponen también de un indicador independiente de calidad del dato.

Orientativamente:

```text
100 = dato municipal directo, reciente y suficiente
 85 = dato municipal directo pero antiguo
 70 = proxy municipal o muestra limitada
 50 = dato procedente de una unidad territorial superior
 25 = estimación débil
  0 = sin dato
```

Un resultado como:

```text
Score:      88
Confidence: 42
```

debe interpretarse de forma diferente a:

```text
Score:      84
Confidence: 97
```

---

# Normalización

Salvo que un indicador defina una función específica, se utilizará una normalización robusta basada en los percentiles 5 y 95 del conjunto de municipios.

Esto reduce la influencia de outliers extremos.

Conceptualmente:

```text
P05 → score 0
P95 → score 100
```

Los valores exteriores al intervalo se limitan a 0 o 100.

Los parámetros exactos utilizados deberán quedar registrados en cada ejecución.

---

# Provenance

Los datos originales utilizados para calcular un score no deben sobrescribirse ni eliminarse.

Cada ejecución generará información de procedencia incluyendo:

- URL o identificador del dataset;
- periodo;
- fecha de recuperación;
- versión del método;
- cobertura municipal;
- fichero raw utilizado;
- fichero generado.

Se mantendrá un:

```text
manifest.json
```

con esta información.

---

# Estado del proyecto

### Fase 1 — Data pipeline

- [ ] catálogo canónico de municipios
- [ ] compraventa
- [ ] alquiler
- [ ] momentum
- [ ] yield
- [ ] liquidez
- [ ] acceso Barcelona
- [ ] acceso esquí
- [ ] costa
- [ ] paisaje
- [ ] turismo
- [ ] regulación HUT
- [ ] demografía
- [ ] renta
- [ ] servicios
- [ ] riesgos naturales

### Fase 2 — Modelo

- [ ] estudiar correlaciones entre indicadores
- [ ] eliminar señales redundantes
- [ ] definir presets de inversión
- [ ] definir score compuesto
- [ ] análisis de sensibilidad de pesos

### Fase 3 — Visualización

- [ ] API de consulta
- [ ] mapa interactivo
- [ ] filtros
- [ ] comparación de municipios
- [ ] explicación del score
- [ ] exploración de oportunidades y outliers

---

# Visión

MuniAlpha no pretende responder simplemente:

> ¿Cuáles son los municipios más caros de Cataluña?

La pregunta interesante es:

> **¿Qué municipios presentan una combinación inusualmente buena de precio, demanda, crecimiento, rentabilidad, accesibilidad, turismo y calidad del entorno?**

El objetivo final es encontrar esos **outliers territoriales** que pueden representar oportunidades inmobiliarias antes de que sean evidentes mirando únicamente el precio de mercado.

---

# Pipeline de datos

La primera fase dispone de un pipeline Python reproducible. Descarga snapshots
de las fuentes oficiales en `data/raw/`, genera una fila para cada uno de los
947 municipios y registra cobertura, hashes y parámetros de normalización en
`data/manifest.json`.

```bash
python -m venv .venv
.venv/bin/pip install -e '.[dev]'
.venv/bin/munialpha --data-dir data
```

Para volver a descargar todos los snapshots:

```bash
.venv/bin/munialpha --data-dir data --refresh
```

El contrato v0.2 distingue resultados `complete`, `partial`,
`engineering_pending`, `methodology_pending` y `external_blocked`. Los
resultados parciales incluyen intervalo, cobertura de la fórmula y una bandera
que impide utilizarlos silenciosamente en un futuro score compuesto. No se
inventan datos ni se convierte una ausencia en cero.

El routing de servicios es reanudable. Si openrouteservice alcanza su cuota
diaria, la ejecución conserva las matrices ya descargadas, publica la cobertura
obtenida como `partial` y continúa en la siguiente ejecución:

```bash
.venv/bin/munialpha --data-dir data
```

# Mapa estático (Fase 2)

La versión visible del mapa sigue versionado semántico y actualmente es
`0.4.0`. El número se declara en `package.json` y se valida contra la
configuración mostrada en la interfaz.

El mapa zero-build combina `municipalities.csv` y los 15 CSV de scores mediante
`municipality_code`, y une la geometría ICGC por `CODIMUNI`. Los vacíos se
publican como `null`; no se imputan ni se convierten en cero.

```bash
python scripts/build_map_data.py
open index.html
```

El artefacto generado y versionable es `data/map_bundle.js`. La generación
simplifica la geometría de `data/raw/icgc_municipal_boundaries.geojson` con
tolerancia conservadora y serializa JSON compacto para que el mapa pueda abrirse
directamente mediante `file://`. Leaflet y el mapa base se cargan desde CDN, por
lo que el fondo cartográfico requiere conexión; los límites y datos municipales
están embebidos.

Las tesis disponibles son equilibrado, rentabilidad residencial, crecimiento,
turístico, calidad de vida, deportes de invierno y senderismo. Deportes de
invierno prioriza el acceso a estaciones de esquí; senderismo utiliza paisaje
(superficie natural, protegida y pendiente) como proxy principal. HUT se
presenta como gate regulatorio y el riesgo natural como indicador de revisión:
ninguno entra en el índice compuesto. La aplicación no constituye asesoramiento
financiero, legal, fiscal ni urbanístico.

La ficha municipal incluye un glosario de indicadores y hasta tres fotografías
geolocalizadas cercanas procedentes de Wikimedia Commons. Las imágenes se
solicitan al abrir la ficha, conservan enlace a autor y licencia y pueden mostrar
el entorno próximo en lugar del núcleo exacto. Si Commons no está disponible,
la ficha mantiene todos los indicadores y muestra un fallback informativo.

La barra lateral resume las fuentes y las fases del pipeline: snapshots
trazables, validación por código IDESCAT, normalización, conservación de `null`
y cálculo dinámico con cobertura mínima.

Pruebas y linters:

```bash
pytest
ruff check .
npm test
npm run lint
```

## Despliegue en Cloudflare

El build web copia exclusivamente los recursos públicos a `dist/`; de este modo
el despliegue no incluye `node_modules`, el entorno Python ni los ficheros de
desarrollo:

```bash
npm run build
npm run deploy
```

En Cloudflare Workers Builds debe utilizarse `npm run build` como comando de
build y `npm run deploy` como comando de despliegue. `wrangler.jsonc` publica
únicamente `dist/`.
