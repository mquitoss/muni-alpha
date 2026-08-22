---
title: "MuniAlpha — Plan de acción para desbloquear la fase 1"
status: proposed
version: "0.1"
date: "2026-08-21"
owner: "MuniAlpha"
related:
  - "docs/phase-1-blockers.md"
  - "docs/data-specs.md"
  - "docs/phase-1-gis-source-inventory.md"
---

# MuniAlpha — Plan de acción para desbloquear la fase 1

## 1. Propósito

Este documento define el plan técnico y metodológico para desbloquear los cinco datasets pendientes de la fase 1 de MuniAlpha:

- acceso a estaciones de esquí;
- paisaje;
- demografía;
- servicios;
- riesgos naturales.

El objetivo no es preservar literalmente la primera fórmula diseñada, sino mantener la finalidad del proyecto: **comparar municipios de Cataluña de forma objetiva, reproducible, explicable y útil para tomar decisiones de inversión inmobiliaria**.

El plan parte de dos principios:

1. una métrica alternativa bien documentada es preferible a un score permanentemente vacío;
2. la incertidumbre debe mostrarse explícitamente, no ocultarse mediante ceros, imputaciones silenciosas o falsa precisión.

## 2. Alcance

### Incluido

- localizar o aprobar fuentes alternativas;
- descargar y versionar snapshots de datos;
- implementar collectors, transformaciones GIS y routing;
- definir fórmulas revisadas;
- generar los cinco CSV municipales;
- actualizar el manifiesto y la trazabilidad;
- añadir validaciones automáticas y revisión manual por muestras;
- conservar una fila por cada municipio vigente.

### Fuera de alcance

- mapa interactivo;
- score compuesto global;
- recomendación automática de inmuebles;
- predicción de rentabilidad de una propiedad concreta;
- análisis parcelario o de edificio;
- revisión jurídica individual de licencias HUT;
- datos en tiempo real de tráfico, nieve, incendios o inundaciones.

## 3. Resultado esperado

Al finalizar este plan:

- los cinco datasets dejarán de aparecer como `blocked`;
- cada dataset tendrá un método reproducible y versionado;
- los componentes opcionales no impedirán publicar un score central útil;
- cada CSV distinguirá dato, score, cobertura, confianza y estado;
- los scores estarán disponibles para los 947 municipios, con valores vacíos únicamente cuando exista una imposibilidad real y documentada;
- `data/manifest.json` describirá fuentes, snapshots, método, cobertura y limitaciones.

## 4. Decisiones metodológicas transversales

### D-01. Separar componentes core y opcionales

Cada score podrá contener:

- **core**: componentes necesarios para una primera señal útil;
- **optional**: componentes que enriquecen el modelo, pero no deben bloquearlo.

Ejemplo:

```text
Landscape Core
    cobertura natural
    protección ambiental
    relieve
    agua

Landscape Recognition
    miradores
    singularidades oficiales
    reconocimiento paisajístico
```

### D-02. Sustituir el estado binario `complete/blocked`

Estados permitidos:

```text
complete
partial
engineering_pending
methodology_pending
external_blocked
```

Definiciones:

- `complete`: todos los componentes requeridos están disponibles y validados;
- `partial`: existe un score core comparable, pero faltan componentes opcionales;
- `engineering_pending`: las fuentes están identificadas y falta implementación;
- `methodology_pending`: faltan decisiones de cálculo;
- `external_blocked`: no existe una fuente o acceso razonable después de documentar alternativas.

### D-03. No cambiar silenciosamente la fórmula por municipio

Dentro de una misma `method_version`, todos los municipios deben utilizar la misma fórmula.

No se reponderarán automáticamente los componentes disponibles en cada municipio. Si falta un componente requerido, se debe:

- publicar un intervalo de score; o
- marcar el score como no utilizable para el compuesto; o
- publicar únicamente los subscores.

### D-04. Aceptar fuentes públicas heterogéneas

El orden de preferencia será:

1. fuente oficial y abierta;
2. fuente pública verificable;
3. fuente abierta colaborativa y versionable;
4. catálogo auxiliar curado manualmente con procedencia por fila;
5. proxy reproducible claramente etiquetado.

Una fuente no oficial no se descartará únicamente por no ser institucional. Debe evaluarse por cobertura, trazabilidad, estabilidad y posibilidad de validación.

### D-05. Crear una abstracción común de routing

Implementar una interfaz de proveedor para evitar dependencia rígida de un único servicio:

```python
class RoutingProvider:
    def matrix(self, origins, destinations, profile): ...
    def route(self, origin, destination, profile): ...
```

Proveedores previstos:

- `openrouteservice` para una primera ejecución o fallback;
- `osrm_local` o `valhalla_local` para procesamiento reproducible en local.

Todas las respuestas deben persistirse en una caché versionada.

### D-06. Medir exposición inmobiliaria, no solo superficie territorial

Para riesgos naturales, el porcentaje del término municipal es informativo, pero no suficiente.

El score debe priorizar la exposición de:

- superficie urbanizada;
- huellas de edificios;
- núcleos habitados;
- accesos principales, cuando sea viable.

### D-07. Mantener 100 como “mejor”

La convención se mantiene en todos los datasets:

```text
0   = peor
100 = mejor
```

En riesgos:

```text
0   = mayor exposición o menor seguridad
100 = menor exposición o mayor seguridad
```

## 5. Cambios en el contrato común de CSV

Mantener las columnas existentes y añadir:

```csv
score_status,
score_min_0_100,
score_max_0_100,
coverage_weight_pct,
rank_stability_0_100,
source_tier,
method_variant,
usable_for_composite
```

### Semántica

- `score_status`: estado del dataset para el municipio;
- `score_min_0_100`: mínimo compatible con los componentes conocidos;
- `score_max_0_100`: máximo compatible con los componentes ausentes;
- `coverage_weight_pct`: porcentaje de peso de la fórmula cubierto por datos válidos;
- `confidence_0_100`: calidad y fiabilidad de los datos;
- `rank_stability_0_100`: estabilidad del ranking ante cambios razonables de método;
- `source_tier`: `official`, `public`, `open_community`, `curated` o `proxy`;
- `method_variant`: variante concreta de cálculo;
- `usable_for_composite`: indica si el score puede participar en un futuro score compuesto.

### Intervalo de score

Cuando falten componentes y los pesos sumen 1:

```text
score_min = suma(peso_i × score_i) para componentes disponibles

score_max = score_min
          + 100 × suma(peso_i) para componentes ausentes
```

No usar el punto medio como score por defecto.

## 6. Cambios en `data/manifest.json`

Cada dataset debe registrar como mínimo:

```json
{
  "score": "landscape",
  "status": "partial",
  "method_version": "0.2",
  "method_variant": "landscape_core",
  "source_tier": "official",
  "source_datasets": [],
  "snapshots": [],
  "retrieved_at": "",
  "reference_period": "",
  "rows_total": 947,
  "rows_with_score": 0,
  "coverage_pct": 0,
  "coverage_weight_pct": 0,
  "usable_for_composite": false,
  "limitations": [],
  "validation": {
    "schema": "pending",
    "geometry": "pending",
    "manual_sample": "pending",
    "regression": "pending"
  }
}
```

## 7. Orden de ejecución

| Orden | Workstream | Prioridad | Complejidad | Motivo |
|---:|---|---|---|---|
| 1 | Contrato, estados y manifiesto | P0 | S | Evita que la arquitectura vuelva a bloquear scores útiles |
| 2 | Demografía | P0 | S | Cambio de serie; desbloqueo rápido y bajo riesgo |
| 3 | Catálogo de esquí | P0 | M | Conjunto pequeño y curable; habilita routing reutilizable |
| 4 | Landscape Core | P1 | L | Proporciona señal de calidad territorial sin esperar miradores |
| 5 | Riesgos naturales | P1 | L | Requiere GIS, pero tiene alto valor como gate de inversión |
| 6 | Servicios y routing local | P1 | L | Trabajo de ingeniería más amplio y reutilizable |
| 7 | Reconocimiento paisajístico | P2 | M | Mejora opcional del score de paisaje |
| 8 | Estabilidad de ranking | P2 | M | Valida que las decisiones no dependan de pesos frágiles |

Complejidad:

- `S`: cambio localizado;
- `M`: varias fuentes o módulos;
- `L`: procesamiento GIS, routing o integración amplia.

---

# 8. Workstream transversal: contrato, estados y publicación parcial

## Responsable sugerido

- Owner: Product/Data Methodology
- Implementación: Data Engineer
- Revisión: Reviewer independiente o segunda pasada del agente

## Fuente aprobada

No aplica.

## Licencia

No aplica.

## Decisión metodológica

Permitir scores `partial` cuando exista un núcleo comparable, preservando intervalos, cobertura y confianza.

## Acciones

1. Actualizar `docs/data-specs.md` con los nuevos estados y columnas.
2. Modificar `src/munialpha/pipeline.py` para no tratar todo resultado incompleto como `blocked`.
3. Añadir funciones comunes:

```python
calculate_score_interval(...)
calculate_coverage_weight(...)
resolve_score_status(...)
```

4. Actualizar el schema de `data/manifest.json`.
5. Añadir validación de `usable_for_composite`.
6. Mantener compatibilidad con `confidence_0_100`.
7. Añadir tests para:
   - componentes completos;
   - opcionales ausentes;
   - core incompleto;
   - intervalos;
   - ausencia total de datos.

## Criterios de aceptación

- ningún `null` se convierte en cero;
- todas las filas contienen un estado válido;
- el intervalo está dentro de `[0, 100]`;
- `score_min_0_100 <= score_max_0_100`;
- un score parcial no se usa en el compuesto sin una regla explícita;
- el manifiesto diferencia bloqueo externo de trabajo pendiente.

## Riesgos

- hacer que demasiados scores parciales parezcan definitivos;
- romper compatibilidad con consumidores futuros;
- mezclar confianza del dato con cobertura de la fórmula.

## Mitigación

- mostrar `score_status`, cobertura e intervalo siempre juntos;
- no rellenar `score_0_100` cuando el punto estimado no esté justificado;
- conservar subscores y variables originales.

---

# 9. Workstream 1: acceso a estaciones de esquí

## Objetivo

Publicar un score municipal de accesibilidad a esquí sin depender de una API homogénea de todas las estaciones ni de una definición discutible de kilómetros esquiables.

## Responsable sugerido

- Owner: Data Methodology
- Implementación: Data Engineer
- Validación: revisión manual de puntos de acceso

## Fuentes aprobadas

- datasets oficiales disponibles para estaciones públicas;
- páginas públicas de cada estación para información factual;
- OpenStreetMap o cartografía pública para coordenadas de acceso;
- catálogo auxiliar versionado en el repositorio.

## Licencia

Mixta. Debe registrarse por fila o por campo:

- no copiar textos descriptivos protegidos;
- conservar únicamente datos factuales necesarios;
- registrar procedencia y fecha de comprobación;
- conservar la licencia de coordenadas y geometrías utilizadas.

## Tamaño estimado

- catálogo: pequeño;
- matriz de routing: 947 municipios × número de estaciones;
- salida: un CSV municipal y una caché de rutas.

## Decisión metodológica

1. Aprobar `ski_stations.csv` como configuración de dominio.
2. Eliminar `skiable_km` como dependencia obligatoria de v0.1.
3. Priorizar tiempo de acceso y variedad de estaciones próximas.
4. Modelar Vall de Núria mediante coche + transferencia de cremallera.
5. Mantener `skiable_km` y `station_tier` como enriquecimientos opcionales.

## Fichero auxiliar

Ruta propuesta:

```text
config/ski_stations.csv
```

Schema:

```csv
station_id,
station_name,
country,
region,
access_lat,
access_lon,
access_mode,
fixed_transfer_minutes,
station_tier,
skiable_km,
source_type,
source_reference,
source_checked_at,
manually_verified,
confidence_0_100,
notes
```

## Fórmula v0.1

Para cada estación:

```text
generalized_minutes_j = drive_minutes_j + fixed_transfer_minutes_j

c_j = exp(-generalized_minutes_j / 60)
```

Ordenar los valores de mayor a menor:

```text
ski_raw = c1 + 0.50 × c2 + 0.25 × c3
```

Normalización:

```text
score_0_100 = robust_positive(ski_raw)
```

### Variante opcional por categoría

Cuando `station_tier` esté validado:

```text
c_j = tier_weight_j × exp(-generalized_minutes_j / 60)
```

La variante debe guardarse en `method_variant` y no sustituir silenciosamente la fórmula anterior.

## Acciones

1. Crear las diez filas iniciales del catálogo.
2. Verificar manualmente el punto real de acceso por carretera.
3. Definir transferencias fijas para accesos no directos.
4. Implementar `RoutingProvider` y caché.
5. Calcular tiempos desde el núcleo principal de cada municipio.
6. Seleccionar las tres mejores contribuciones.
7. Generar `07_ski_access_score.csv`.
8. Comparar resultados de municipios conocidos de montaña y de costa.
9. Documentar que no se modelan nieve, tráfico, aparcamiento ni duración de temporada.

## Criterios de aceptación

- catálogo con las diez estaciones previstas;
- fuente y fecha en todas las filas;
- punto de acceso revisado manualmente;
- rutas para los 947 municipios o error documentado;
- ninguna estación privada queda excluida por falta de API;
- Vall de Núria no se enruta directamente hasta las pistas;
- pruebas unitarias de la fórmula;
- revisión manual de una muestra de municipios próximos y lejanos.

## Riesgos

- coordenadas que apunten al centro geométrico en vez del acceso;
- tiempos de transferencia aproximados;
- estaciones de distinta escala tratadas como equivalentes;
- cambios en accesos o aparcamientos.

## Mitigación

- `manually_verified=true` únicamente después de revisión;
- versionar el catálogo;
- separar fórmula sin categoría y fórmula con `station_tier`;
- no presentar el score como calidad de la estación, sino como accesibilidad a la oferta de esquí.

## Prioridad

P0.

---

# 10. Workstream 2: paisaje

## Objetivo

Publicar un score objetivo de atractivo natural y paisajístico sin bloquearlo por la ausencia de una capa nacional homogénea de miradores.

## Responsable sugerido

- Owner: Data Methodology
- Implementación: GIS Engineer
- Revisión: GIS + validación visual

## Fuentes aprobadas

- cobertura del suelo;
- espacios naturales protegidos;
- modelo digital de elevaciones;
- hidrografía y costa;
- unidades oficiales de paisaje;
- capas de miradores e itinerarios cuando puedan armonizarse.

Las URLs, formatos, tamanos, esquemas y licencias comprobados se mantienen en
`docs/phase-1-gis-source-inventory.md`.

Prioridad de DEM:

1. DEM oficial remuestreado;
2. DEM público de 25–30 m como fallback documentado.

## Licencia

Debe validarse y registrarse para cada snapshot antes de incorporarlo al pipeline.

## Tamaño estimado

Grande. Incluye ráster, geometrías municipales, overlays y estadísticas zonales.

## Decisión metodológica

Dividir el score en:

```text
Landscape Core
Landscape Recognition
```

### Landscape Core

```text
landscape_core_score =
    0.35 × natural_score
  + 0.25 × protected_score
  + 0.25 × relief_score
  + 0.15 × water_score
```

### Landscape Recognition

Se publicará inicialmente como subscore opcional:

```text
recognition_score =
    0.60 × viewpoints_density_score
  + 0.40 × landscape_diversity_score
```

Cuando exista cobertura homogénea:

```text
landscape_extended_score =
    0.90 × landscape_core_score
  + 0.10 × recognition_score
```

La v0.1 publicará `landscape_core_score` como `score_0_100` y marcará el método como `landscape_core`.

## Variables mínimas

```text
natural_area_pct
forest_area_pct
protected_area_pct
elevation_p05
elevation_p95
elevation_range_p90
mean_slope_deg
terrain_ruggedness
water_wetland_pct
touches_coast
landscape_units_count
landscape_diversity_entropy
official_viewpoints_count
```

## Acciones

1. Inventariar capas, URLs, fechas, licencias y formatos.
2. Descargar y conservar snapshots raw.
3. Reproyectar capas a un CRS métrico común, preferentemente ETRS89 / UTM 31N.
4. Validar y reparar geometrías municipales cuando sea necesario.
5. Reagrupar clases de cobertura del suelo.
6. Disolver figuras de protección para evitar doble conteo.
7. Remuestrear el DEM a una resolución operativa de 25–30 m.
8. Calcular elevación, pendiente y rugosidad por ventanas o teselas.
9. Calcular presencia de agua y contacto con costa.
10. Intersectar unidades de paisaje y calcular diversidad.
11. Generar `09_landscape_score.csv` con método `landscape_core`.
12. Crear un collector separado para miradores e itinerarios.
13. Añadir `recognition_score` cuando la cobertura sea comparable.

## Criterios de aceptación

- las 947 geometrías municipales se procesan;
- porcentajes entre 0 y 100;
- el área protegida no tiene doble conteo;
- el remuestreo del DEM está documentado;
- las estadísticas no dependen del orden de ejecución;
- `Landscape Core` está disponible aunque falten miradores;
- se revisan visualmente muestras urbanas, costeras, rurales y de montaña;
- se comparan resultados con y sin DEM de mayor resolución en una muestra.

## Riesgos

- confundir naturalidad con belleza;
- favorecer excesivamente relieve montañoso;
- penalizar humedales o paisajes llanos;
- introducir diferencias por resolución del DEM;
- cobertura territorial desigual de miradores.

## Mitigación

- mantener agua y costa como dimensión separada;
- limitar el peso del relieve;
- publicar subscores;
- ejecutar análisis de sensibilidad;
- no usar miradores como requisito del score core.

## Prioridad

P1.

---

# 11. Workstream 3: demografía

## Objetivo

Calcular una tendencia poblacional municipal comparable a cinco años usando dos extremos de la misma operación estadística.

## Responsable sugerido

- Owner: Data Methodology
- Implementación: Data Engineer
- Revisión: Data QA

## Fuente aprobada

Serie anual municipal de población del padrón o equivalente oficial, con cobertura histórica suficiente.

No mezclar en una misma fórmula:

- padrón;
- censo;
- estimaciones semestrales;
- proyecciones.

## Licencia

Registrar la licencia y los términos de reutilización de la fuente oficial seleccionada.

## Tamaño estimado

Pequeño.

## Decisión metodológica

Sustituir el endpoint semestral por una serie anual municipal estable.

Métricas:

```text
population_cagr_5y =
((population_t / population_t_minus_5) ^ (1/5) - 1) × 100

population_change_5y =
population_t - population_t_minus_5
```

Subscores:

```text
trend_score = robust_positive(population_cagr_5y)

scale_adjusted_growth_score = robust_positive(
    sign(population_change_5y)
    × log1p(abs(population_change_5y))
)
```

Score:

```text
demographic_score =
    0.70 × trend_score
  + 0.30 × scale_adjusted_growth_score
```

El componente absoluto reduce el riesgo de sobrerrepresentar cambios de pocas personas en municipios muy pequeños.

## Acciones

1. Seleccionar la serie anual oficial.
2. Descargar `t`, `t-1` y `t-5`.
3. Construir correspondencia de códigos municipales.
4. Detectar altas, bajas, fusiones o cambios de código.
5. Calcular crecimiento anual y CAGR.
6. Implementar la normalización robusta.
7. Generar `12_demographic_score.csv`.
8. Comparar con la ejecución anterior y revisar outliers.

## Criterios de aceptación

- ambos extremos proceden de la misma definición estadística;
- existe cobertura para `t`, `t-1` y `t-5` o ausencia documentada;
- no se extrapolan años;
- cambios territoriales quedan registrados;
- el score no se dispara únicamente por variaciones mínimas en pueblos pequeños;
- una fila por municipio vigente;
- tests de división por cero y poblaciones ausentes.

## Riesgos

- cambios administrativos de municipios;
- series revisadas retroactivamente;
- sesgo de porcentajes en poblaciones pequeñas;
- diferencias entre población empadronada y población efectiva.

## Mitigación

- conservar valores absolutos;
- versionar snapshot;
- documentar que ETCA cubre otra dimensión y no sustituye esta métrica.

## Prioridad

P0.

---

# 12. Workstream 4: servicios

## Objetivo

Medir el acceso real por carretera desde el núcleo principal del municipio hasta servicios esenciales, combinando fuentes oficiales y OpenStreetMap.

## Responsable sugerido

- Owner: Data Methodology
- Implementación: Data Engineer + Routing/GIS
- Revisión: QA por muestras

## Fuentes aprobadas

### Fuente autoritativa preferente

- directorios oficiales para hospitales y atención primaria;
- registros oficiales para centros educativos;
- registros públicos de farmacias cuando estén disponibles.

### Fuente geográfica y complementaria

- snapshot local de OpenStreetMap para supermercados, estaciones ferroviarias, coordenadas y cobertura adicional.

### Fuente opcional de contraste

- un segundo catálogo abierto de lugares para detectar posibles omisiones, sin sustituir automáticamente la fuente principal.

## Licencia

- registrar las condiciones de reutilización de cada directorio oficial;
- respetar y documentar la licencia del snapshot OSM;
- no mezclar datos sin conservar procedencia por POI.

## Tamaño estimado

Grande, por snapshot OSM, índice espacial y routing por lotes.

## Decisión metodológica

1. Aprobar OSM como fuente principal para categorías sin directorio oficial completo.
2. Descargar un único extracto regional; no hacer miles de consultas Overpass.
3. Crear una tabla canónica de POI con procedencia y deduplicación.
4. Reducir candidatos geográficamente antes del routing.
5. Utilizar un motor local cuando sea posible, con ORS como fallback.

## Tabla canónica de POI

Ruta propuesta:

```text
data/intermediate/services_poi.parquet
```

Schema mínimo:

```text
poi_id
category
name
municipality_code
lat
lon
source
source_record_id
source_priority
coordinate_source
is_active
dedup_status
confidence_0_100
snapshot_date
```

## Reglas de clasificación v0.1

| Categoría | Fuente preferente | Regla complementaria OSM |
|---|---|---|
| hospital | directorio oficial | `amenity=hospital` o equivalente sanitario validado |
| primary_care | directorio oficial | clínica o centro sanitario, excluyendo especialistas privados cuando sea posible |
| supermarket | OSM | `shop=supermarket` |
| pharmacy | registro oficial | `amenity=pharmacy` o `healthcare=pharmacy` |
| school | registro oficial | `amenity=school`; excluir guarderías y universidades |
| rail_station | OSM o feed público | estación con servicio de viajeros; excluir infraestructura abandonada o solo mercancías |

Las reglas exactas deben implementarse como configuración testeable, no como condiciones dispersas en el código.

## Deduplicación

Candidato a duplicado cuando:

```text
same_category
AND distance_m <= 100
AND normalized_name_similarity >= threshold
```

Precedencia:

1. categoría y nombre del registro oficial;
2. coordenadas oficiales válidas;
3. coordenadas OSM cuando las oficiales falten o sean inválidas;
4. OSM como registro independiente cuando no exista equivalente oficial.

Estados:

```text
automatic
reviewed
unresolved
```

## Punto de origen municipal

Orden de preferencia:

1. núcleo principal o capital municipal;
2. punto representativo de población;
3. centroide interior como fallback.

No usar un centroide geométrico que pueda caer en una zona deshabitada o inaccesible.

## Estrategia de routing

Para cada municipio y categoría:

1. buscar los cinco POI más próximos por distancia geográfica;
2. solicitar rutas únicamente para esos candidatos;
3. seleccionar el menor tiempo por carretera;
4. guardar duración, distancia, proveedor y fecha;
5. persistir el resultado en caché.

## Conversión de tiempo a score

Interpolación lineal:

```text
<= 5 min  → 100
15 min    → 80
30 min    → 50
60 min    → 10
>= 90 min → 0
```

## Subscores y fórmula

```text
health_access =
    0.50 × hospital_score
  + 0.30 × primary_care_score
  + 0.20 × pharmacy_score

daily_needs = supermarket_score
family_services = school_score
regional_connectivity = rail_station_score
```

```text
services_score =
    0.35 × health_access
  + 0.30 × daily_needs
  + 0.15 × family_services
  + 0.20 × regional_connectivity
```

Conservar subscores para futuros presets de inversión.

## Acciones

1. Descargar y versionar snapshot OSM de Cataluña.
2. Implementar extracción local de los seis tipos de POI.
3. Importar registros oficiales existentes.
4. Resolver coordenadas ausentes mediante matching con OSM.
5. Implementar deduplicación y reporte de conflictos.
6. Crear índice espacial.
7. Implementar candidatos nearest-neighbour.
8. Integrar `RoutingProvider` y caché.
9. Calcular tiempos para los 947 municipios.
10. Generar `14_services_score.csv`.
11. Revisar manualmente muestras urbanas, rurales, costeras y de montaña.
12. Registrar cobertura por categoría.

## Criterios de aceptación

- snapshot OSM con fecha y checksum;
- reglas de extracción versionadas y testeadas;
- todos los POI utilizados tienen coordenadas válidas;
- duplicados automáticos y dudosos están documentados;
- routing para los 947 municipios;
- cobertura por categoría publicada;
- resultados plausibles en las muestras;
- ningún fallo de API destruye resultados ya cacheados;
- el score conserva los seis tiempos y subscores.

## Riesgos

- OSM incompleto en zonas rurales;
- establecimientos cerrados o mal etiquetados;
- confundir distancia geográfica con acceso real;
- elegir el núcleo municipal incorrecto;
- estaciones sin servicio de pasajeros;
- supermercados pequeños no representados.

## Mitigación

- combinar fuentes;
- conservar `source` y `confidence` por POI;
- ejecutar revisiones por muestra;
- no convertir ausencia de POI en ausencia absoluta de servicio sin advertencia;
- registrar antigüedad del snapshot.

## Prioridad

P1.

---

# 13. Workstream 5: riesgos naturales

## Objetivo

Publicar indicadores municipales de seguridad frente a inundación e incendio forestal que sean relevantes para la exposición inmobiliaria.

## Responsable sugerido

- Owner: Risk Methodology
- Implementación: GIS Engineer
- Revisión: GIS + revisión de casos extremos

## Fuentes aprobadas

- capas de inundación de las administraciones hidráulicas competentes;
- cartografía oficial de periodos de retorno;
- ráster oficial de peligro básico de incendio forestal;
- cobertura del suelo o huellas de edificios para construir la máscara urbanizada.

Los endpoints ACA/SNCZI, la regla de mosaico y la inspeccion del raster de
incendio se documentan en `docs/phase-1-gis-source-inventory.md`.

## Licencia

Validar y registrar la licencia de cada capa y snapshot antes de procesarlos.

## Tamaño estimado

Grande. Incluye ráster, vectores, overlays, máscaras urbanizadas y estadísticas zonales.

## Decisión metodológica

1. No depender del WFS municipal estilizado para obtener porcentajes de incendio.
2. Descargar y procesar el ráster subyacente con clases espaciales.
3. Mantener métricas territoriales, pero priorizar exposición urbanizada.
4. Publicar subscores de inundación e incendio por separado.
5. Tratar banderas graves como gates y no diluirlas completamente en una media.

## Variables de contexto territorial

```text
municipal_flood_t10_pct
municipal_flood_t100_pct
municipal_flood_t500_pct
municipal_high_fire_risk_pct
municipal_very_high_fire_risk_pct
```

## Variables de exposición inmobiliaria

```text
built_up_flood_t10_pct
built_up_flood_t100_pct
built_up_flood_t500_pct
built_up_high_fire_risk_pct
built_up_very_high_fire_risk_pct
```

## Fórmulas

### Inundación

```text
flood_exposure_raw =
    1.50 × built_up_flood_t10_pct
  + 1.25 × built_up_flood_t100_pct
  + 1.00 × built_up_flood_t500_pct

flood_safety_score =
    100 - robust_positive(flood_exposure_raw)
```

### Incendio

```text
fire_exposure_raw =
    built_up_high_fire_risk_pct
  + 2 × built_up_very_high_fire_risk_pct

fire_safety_score =
    100 - robust_positive(fire_exposure_raw)
```

### Score final

```text
natural_risk_score =
    0.55 × flood_safety_score
  + 0.45 × fire_safety_score
```

## Gates y alertas

Añadir:

```text
flood_red_flag
fire_red_flag
risk_review_required
```

Un municipio puede conservar un score numérico, pero `risk_review_required=true` debe impedir una recomendación automática sin revisión adicional.

## Política de publicación

- si ambos componentes están completos: `score_status=complete`;
- si solo existe uno: publicar subscore, intervalo y `score_status=partial`;
- un score parcial de riesgo tendrá `usable_for_composite=false`;
- no interpretar el score municipal como evaluación de una parcela concreta.

## Acciones

1. Localizar y descargar el ráster oficial de incendio.
2. Documentar clases, nodata, fecha y resolución.
3. Descargar capas de inundación y periodos de retorno.
4. Construir un mosaico territorial sin huecos ni duplicados.
5. Reproyectar a CRS métrico común.
6. Crear máscara de superficie urbanizada.
7. Calcular estadísticas municipales y urbanizadas.
8. Implementar fórmulas y flags.
9. Generar `15_natural_risk_score.csv`.
10. Revisar visualmente municipios con valores extremos.
11. Documentar limitaciones de escala y actualización.

## Criterios de aceptación

- cartografía de incendio con clases espaciales utilizables;
- cobertura completa o huecos explícitamente documentados;
- sin doble conteo entre fuentes de inundación;
- porcentajes dentro de `[0, 100]`;
- métricas territoriales y urbanizadas disponibles;
- flags coherentes con los valores;
- score final solo utilizable cuando ambos componentes estén disponibles;
- revisión manual de casos extremos y municipios fronterizos entre fuentes.

## Riesgos

- diferencias de resolución entre fuentes;
- solapamientos entre administraciones hidráulicas;
- clases de incendio interpretadas incorrectamente;
- datos de peligro confundidos con riesgo real;
- resultados municipales que oculten riesgo parcelario.

## Mitigación

- registrar clase y leyenda original;
- validar con histogramas y mapas;
- mantener `hazard`, `exposure` y `safety_score` como conceptos distintos;
- añadir advertencia obligatoria de diligencia debida a nivel de inmueble.

## Prioridad

P1.

---

# 14. Validaciones comunes

## 14.1. Schema

- exactamente una fila por municipio vigente;
- `municipality_code` único y no vacío;
- tipos y unidades correctos;
- scores dentro de `[0, 100]`;
- no usar `0` para representar ausencia;
- fechas en ISO 8601;
- `method_version` y `source_id` presentes.

## 14.2. Procedencia

Para cada fuente:

- URL o identificador;
- licencia;
- fecha de consulta;
- periodo de referencia;
- checksum del snapshot;
- parser utilizado;
- versión del método.

## 14.3. GIS

- CRS de entrada y salida registrados;
- geometrías reparadas y auditadas;
- overlays sin áreas negativas;
- porcentajes de superficie entre 0 y 100;
- suma de clases revisada;
- tolerancias numéricas explícitas.

## 14.4. Routing

- origen y destino guardados;
- proveedor y perfil registrados;
- duración y distancia no negativas;
- caché determinista;
- rutas imposibles documentadas;
- comparación manual con varias rutas conocidas.

## 14.5. Regresión

En cada ejecución:

- comparar cobertura;
- detectar cambios bruscos de score;
- listar nuevos outliers;
- impedir publicar si desaparece una proporción significativa de datos sin explicación;
- conservar el resultado anterior para comparación.

## 14.6. Revisión manual estratificada

Seleccionar una muestra que incluya:

- gran ciudad;
- municipio metropolitano;
- capital interior;
- costa;
- delta o humedal;
- alta montaña;
- valle pirenaico;
- municipio rural pequeño;
- municipio sin ferrocarril;
- municipio próximo a estación de esquí.

La muestra debe revisar tanto valores brutos como interpretación del score.

---

# 15. Estabilidad de ranking

La calidad de la fuente no garantiza que el ranking sea estable.

Añadir una fase posterior de sensibilidad:

1. variar pesos de cada componente en ±20%;
2. variar tiempos de routing en ±10%;
3. comparar DEM de distinta resolución;
4. ejecutar paisaje con y sin reconocimiento;
5. comparar distintas reglas de categoría de estación;
6. simular ausencia de una fuente secundaria de POI.

Para cada municipio guardar:

```text
median_rank
rank_p10
rank_p90
rank_stability_0_100
```

Interpretación:

- alta estabilidad: el municipio mantiene una posición similar;
- baja estabilidad: su posición depende fuertemente de decisiones metodológicas.

Este campo no sustituye `confidence_0_100`.

---

# 16. Descomposición sugerida en issues de GitHub

## Infraestructura

- `DATA-001` — ampliar estados del manifiesto;
- `DATA-002` — añadir intervalo y cobertura ponderada;
- `DATA-003` — implementar `usable_for_composite`;
- `ROUTE-001` — crear interfaz `RoutingProvider`;
- `ROUTE-002` — implementar caché de routing;
- `QA-001` — reporte común de cobertura y regresión.

## Esquí

- `SKI-001` — crear schema y catálogo de estaciones;
- `SKI-002` — verificar puntos de acceso;
- `SKI-003` — modelar transferencia de Vall de Núria;
- `SKI-004` — calcular matriz y score;
- `SKI-005` — validación manual.

## Paisaje

- `LAND-001` — inventario y snapshots de capas;
- `LAND-002` — cobertura natural y forestal;
- `LAND-003` — espacios protegidos sin doble conteo;
- `LAND-004` — pipeline DEM remuestreado;
- `LAND-005` — agua y costa;
- `LAND-006` — Landscape Core;
- `LAND-007` — armonizar miradores y recognition score.

## Demografía

- `DEM-001` — seleccionar serie anual;
- `DEM-002` — collector `t`, `t-1`, `t-5`;
- `DEM-003` — gestionar cambios territoriales;
- `DEM-004` — score y validación de outliers.

## Servicios

- `SERV-001` — descargar snapshot OSM;
- `SERV-002` — extraer reglas de POI;
- `SERV-003` — importar directorios oficiales;
- `SERV-004` — reparar coordenadas;
- `SERV-005` — deduplicar catálogo;
- `SERV-006` — nearest candidates e índice espacial;
- `SERV-007` — routing por lotes;
- `SERV-008` — score y revisión manual.

## Riesgos

- `RISK-001` — descargar y documentar ráster de incendio;
- `RISK-002` — mosaico de inundación;
- `RISK-003` — máscara urbanizada;
- `RISK-004` — estadísticas de exposición;
- `RISK-005` — score, flags y validación extrema.

---

# 17. Entregables

Al completar el plan deben existir:

```text
config/ski_stations.csv

data/raw/ski/...
data/raw/landscape/...
data/raw/demography/...
data/raw/services/...
data/raw/natural_risk/...

data/intermediate/services_poi.parquet
data/intermediate/routing_cache.*

data/scores/07_ski_access_score.csv
data/scores/09_landscape_score.csv
data/scores/12_demographic_score.csv
data/scores/14_services_score.csv
data/scores/15_natural_risk_score.csv

data/manifest.json

docs/phase-1-unblocking-action-plan.md
docs/data-specs.md
```

También deben existir tests para collectors, fórmulas, geometrías, routing y contratos CSV.

---

# 18. Definición de terminado

La fase de desbloqueo se considera terminada cuando:

- los cinco CSV conservan una fila por cada municipio;
- ninguno aparece como `blocked` sin una causa externa real;
- demografía y esquí están completos;
- paisaje dispone al menos de `Landscape Core`;
- servicios tiene cobertura publicada por categoría y rutas cacheadas;
- riesgos publica inundación e incendio por separado y el score combinado cuando corresponda;
- las fuentes y snapshots están versionados;
- el manifiesto refleja estado, cobertura y limitaciones;
- no se han convertido ausencias en ceros;
- los resultados superan tests y revisión manual estratificada;
- las decisiones metodológicas están documentadas y versionadas.

# 19. Decisiones que deben quedar registradas

| ID | Decisión | Valor recomendado |
|---|---|---|
| D-01 | Publicar scores parciales | Sí, con intervalo y cobertura |
| D-02 | Catálogo curado de esquí | Sí |
| D-03 | `skiable_km` obligatorio | No en v0.1 |
| D-04 | Landscape Core sin miradores | Sí |
| D-05 | Resolución DEM operativa | 25–30 m |
| D-06 | Serie demográfica | anual y homogénea |
| D-07 | OSM para servicios | Sí, con snapshot local |
| D-08 | Motor de routing | abstracción con local preferente y ORS fallback |
| D-09 | Riesgo sobre área urbanizada | Sí, como señal principal |
| D-10 | Riesgo parcial en compuesto | No |

# 20. Referencias internas del repositorio

- Informe de bloqueos: `docs/phase-1-blockers.md`
- Especificación de datos: `docs/data-specs.md`
- Pipeline: `src/munialpha/pipeline.py`
- Fuentes y parsers: `src/munialpha/sources.py`
- Procesamiento GIS: `src/munialpha/geo.py`
- Routing: `src/munialpha/routing.py`
- Estado y procedencia: `data/manifest.json`
