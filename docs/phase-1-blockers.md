# MuniAlpha — Bloqueos pendientes de la fase 1

Fecha del informe: 2026-08-21

## Resumen

El pipeline genera el catálogo canónico y los 15 CSV de scores con una fila
para cada uno de los 947 municipios de Cataluña. Actualmente hay 11 datasets
completos y 5 bloqueados.

Los datasets bloqueados conservan el contrato CSV, pero dejan las métricas y
el score vacíos, utilizan `confidence_0_100 = 0`, documentan el motivo en
`missing_reason` y aparecen con estado `blocked` en `data/manifest.json`.
No se han convertido ausencias en cero ni se han generado datos artificiales.

| Dataset | Archivo | Motivo principal |
|---|---|---|
| Acceso a esquí | `07_ski_access_score.csv` | Catálogo oficial incompleto de estaciones |
| Paisaje | `09_landscape_score.csv` | Componentes GIS incompletos y ausencia de capa de miradores |
| Demografía | `12_demographic_score.csv` | Falta el periodo municipal exacto de cinco años antes |
| Servicios | `14_services_score.csv` | POI incompletos y routing todavía no preparado |
| Riesgos naturales | `15_natural_risk_score.csv` | Falta aprobar la equivalencia de clases `1..10` de peligro de incendio |

## 1. Acceso a esquí

### Estado

FGC ofrece datos abiertos y estructurados para seis estaciones alpinas:

- La Molina;
- Vall de Núria;
- Vallter;
- Espot;
- Port Ainé;
- Boí Taüll.

No existe una fuente pública, abierta y homogénea para las cuatro estaciones
restantes que deben formar parte de la v0.1:

- Baqueira Beret;
- Masella;
- Port del Comte;
- Tavascan.

### Razón del bloqueo

Calcular el score únicamente con estaciones de FGC introduciría un sesgo
territorial importante. Los municipios próximos a Baqueira, Masella, Port del
Comte o Tavascan obtendrían resultados artificialmente bajos.

Además, Vall de Núria no tiene acceso final directo por carretera. Debe
definirse como destino de routing la estación o el aparcamiento desde el que se
toma el cremallera, y no la ubicación de las pistas.

### Decisiones necesarias

1. Aprobar un catálogo auxiliar versionado para estaciones sin API abierta.
2. Definir qué se considera `skiable_km` y si se excluyen itinerarios.
3. Revisar manualmente el punto de acceso por carretera de cada estación.
4. Decidir el nivel de confianza aplicable a las estaciones privadas.

### Criterio de desbloqueo

- Existe `ski_stations.csv` con las diez estaciones esperadas.
- Cada fila tiene fuente, fecha, coordenadas de acceso, kilómetros y estado de
  verificación.
- Los puntos de routing han sido revisados.
- La matriz ORS se ha ejecutado y validado para los 947 municipios.

## 2. Paisaje

### Componentes requeridos

El score necesita:

- cobertura natural y forestal;
- espacios protegidos;
- elevación y pendiente;
- agua y costa;
- unidades de paisaje;
- miradores oficiales.

### Razón del bloqueo

Algunos componentes son accesibles, pero no existe todavía una cadena completa
y reproducible:

- El modelo de elevaciones ICGC de 5 metros ocupa aproximadamente 5 GB y debe
  procesarse por ventanas o mediante descargas territoriales selectivas.
- Las coberturas naturales y los espacios protegidos requieren overlays GIS y
  control de solapamientos.
- Las 134 unidades de paisaje están disponibles y son procesables.
- No se ha localizado una capa oficial abierta y estructurada de miradores.

Sin el componente de reconocimiento no puede aplicarse la fórmula y los pesos
definidos sin cambiar la metodología.

### Decisiones necesarias

1. Seleccionar la resolución del modelo de elevaciones.
2. Decidir si se acepta una fuente alternativa y reproducible de miradores.
3. Definir si la primera versión puede publicar subscores sin score final.
4. Establecer límites de almacenamiento y tiempo de procesamiento GIS.

### Criterio de desbloqueo

- Todas las capas tienen URL, licencia, fecha y snapshot conservado.
- Se calculan y validan los cinco componentes para los 947 municipios.
- Los solapamientos de espacios protegidos no producen doble conteo.
- Existe una fuente aceptada para miradores o se aprueba una nueva fórmula.

## 3. Demografía

### Razón del bloqueo

La fórmula requiere el CAGR entre la población actual y la de exactamente
cinco años antes:

```text
((population_current / population_5y_ago) ^ (1/5) - 1) × 100
```

El endpoint de estimaciones de población utilizado actualmente:

- limita la consulta a seis semestres;
- ofrece cobertura municipal completa en esta serie desde 2021;
- tiene 2025S1 como último periodo disponible;
- no aporta 2020S1 mediante la consulta utilizada.

La especificación prohíbe extrapolar, imputar o sustituir el periodo requerido.

### Decisiones necesarias

1. Localizar una serie histórica anual municipal compatible de IDESCAT.
2. Decidir entre padrón, censo o estimaciones de población.
3. Confirmar que ambos extremos utilizan la misma definición estadística.

### Criterio de desbloqueo

- Hay datos comparables para `t`, `t-1` y `t-5`.
- La serie cubre los municipios vigentes o documenta claramente sus ausencias.
- Los cambios territoriales y metodológicos están registrados.
- El CAGR no combina poblaciones de definiciones incompatibles.

## 4. Servicios

### Componentes requeridos

Se necesitan tiempos de conducción al equipamiento más próximo de cada tipo:

- hospital;
- atención primaria;
- supermercado;
- farmacia;
- colegio;
- estación ferroviaria.

### Razón del bloqueo

Los registros oficiales localizados cubren parcialmente hospitales, centros de
atención primaria y colegios. Sin embargo:

- no existe una fuente oficial completa de supermercados;
- la cobertura de estaciones ferroviarias y farmacias es insuficiente;
- alrededor de 1.300 registros de equipamientos presentan coordenadas ausentes
  o inválidas;
- todavía no se ha preparado la extracción local de POI desde OpenStreetMap.

La especificación prohíbe realizar miles de consultas individuales a Overpass.
La alternativa prevista es descargar un extracto OSM de Cataluña, extraer los
POI localmente y ejecutar routing por lotes.

### Decisiones necesarias

1. Aprobar OpenStreetMap como fuente principal o complementaria de POI.
2. Definir reglas de clasificación para cada tipo de servicio.
3. Elegir entre routing ORS y un motor local para el volumen de matrices.
4. Definir validación y deduplicación de POI oficiales y OSM.

### Criterio de desbloqueo

- Existe un snapshot OSM versionado y con fecha conocida.
- Los seis tipos de servicio tienen reglas de extracción testeadas.
- Los POI tienen coordenadas válidas y se han eliminado duplicados.
- Las matrices de routing cubren los 947 municipios.
- Se han revisado manualmente muestras urbanas, rurales y de montaña.

## 5. Riesgos naturales

### Componentes requeridos

La v0.1 exige combinar:

- inundaciones de ACA y SNCZI;
- peligro de incendio forestal.

### Razón del bloqueo

Las fuentes espaciales ya estan localizadas y se documentan en
`docs/phase-1-gis-source-inventory.md`:

- ACA expone T10, T100 y T500 mediante WFS;
- SNCZI expone T10, T100, T500 y zona de flujo preferente mediante WFS;
- el producto oficial `PERILLBASICINCENDI.zip` contiene un GeoTIFF tematico de
  100 m con clases espaciales `1..10`.

El bloqueo restante es metodologico. La tabla de atributos del raster solo
contiene valor y recuento, y no se ha localizado una equivalencia oficial entre
`1..10` y las categorias `high` y `very_high`. Sin esa equivalencia no pueden
calcularse de forma reproducible:

```text
high_fire_risk_area_pct
very_high_fire_risk_area_pct
```

La especificación prohíbe publicar el score final si falta cobertura de uno de
los componentes.

### Decisiones necesarias

1. Aprobar una equivalencia oficial de las clases de incendio o sustituir la
   formula por una metrica continua versionada.
2. Definir la combinacion territorial ACA/SNCZI sin huecos ni duplicados.
3. Aprobar si se publican subscores de inundacion antes del score final.

### Criterio de desbloqueo

- Existe cartografía de incendio con clases espaciales utilizables. Cumplido.
- Se acredita cobertura completa de Cataluña para inundación e incendio.
- Los overlays se realizan en un CRS métrico adecuado.
- Se validan porcentajes, solapamientos y límites de 0 a 100.
- El score final solo se publica cuando ambos componentes están disponibles.

## Formato sugerido para el plan de acción

Para cada bloqueo conviene definir:

```text
responsable:
fuente aprobada:
licencia:
tamaño estimado:
decisión metodológica:
acciones:
criterio de aceptación:
riesgos:
prioridad:
```

## Referencias del repositorio

- Especificación: `docs/data-specs.md`
- Pipeline: `src/munialpha/pipeline.py`
- Fuentes y parsers: `src/munialpha/sources.py`
- Procesamiento GIS: `src/munialpha/geo.py`
- Routing: `src/munialpha/routing.py`
- Estado y procedencia: `data/manifest.json`
