---
title: "MuniAlpha - Inventario de fuentes GIS para paisaje y riesgos"
status: verified
version: "0.1"
date: "2026-08-21"
related:
  - "docs/phase-1-unblocking-action-plan.md"
  - "docs/data-specs.md"
---

# Inventario de fuentes GIS para paisaje y riesgos

## 1. Alcance

Este inventario concreta las fuentes procesables para `Landscape Core` y
`natural risk`. Las URLs se comprobaron el 21 de agosto de 2026. Los tamanos
son los observados en origen y pueden cambiar cuando se publique una revision.

Antes de procesar cada fuente se debe guardar el fichero bruto, la respuesta de
metadatos, la fecha de descarga y el checksum. No se debe depender de una URL
`vigent` sin conservar tambien el identificador fechado del producto.

## 2. Paisaje

| Variable | Fuente y acceso verificado | Formato / tamano | Licencia | Decision |
|---|---|---:|---|---|
| `natural_area_pct`, `forest_area_pct`, `water_wetland_pct`, mascara urbanizada | ICGC, Mapa de Cobertes del Sol v1.0 - 2024: [GeoPackage ZIP](https://datacloud.icgc.cat/datacloud/cobertes-sol/gpkg/cobertes-sol-v1r0-2024.zip) o [GeoTIFF](https://datacloud.icgc.cat/datacloud/cobertes-sol/tif_unzip/cobertes-sol-v1r0-2024.tif) | 810,439,129 B ZIP; 1,786,008,665 B TIFF | [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/), confirmada en los [metadatos IDEC](https://catalegs.ide.cat/geonetwork/srv/api/records/cobertes-sol-v1r0-2024/formatters/xml) | Preferir GeoPackage para areas exactas y GeoTIFF para estadisticas repetidas. Versionar la reclasificacion de clases. |
| `protected_area_pct` | WFS Generalitat: `https://sig.gencat.cat/ows/ESPAIS_NATURALS/wfs`, capas `ESPAIS_NATURALS:ESPAISNATURALS_PEIN`, `..._ENPE` y `..._XARNAT_2000` | GeoJSON; aprox. 29.6 MB, 8.2 MB y 23.2 MB | Aplicar la licencia declarada por el snapshot; si no incluye una especifica, usar y citar la [Llicencia oberta d'us d'informacio - Catalunya](https://web.gencat.cat/ca/generalitat/dades-indicadors/dades-obertes/llicencies) | Descargar las tres capas y hacer `union`/`dissolve` antes del overlay municipal para impedir doble conteo. |
| elevacion, pendiente y rugosidad | ICGC, [MDE topografico 5 m, 2009-2018](https://datacloud.icgc.cat/datacloud/model-elevacions-terreny/tif_unzip/model-elevacions-terreny-topografic-catalunya-5m-2009-2018.tif) | GeoTIFF, 5,127,012,981 B | Verificar y archivar los metadatos especificos junto al snapshot | Recortar por teselas y remuestrear a 25-30 m antes de calcular derivados. |
| fallback de elevacion | [Copernicus DEM GLO-30](https://copernicus-dem-30m.s3.amazonaws.com/readme.html) | COG por tesela, unas 266 MB para las nueve teselas necesarias | [Copernicus DEM Licence](https://dataspace.copernicus.eu/explore-data/data-collections/copernicus-contributing-missions/collections-description/COP-DEM) | Solo fallback. Es un DSM, no un DTM; registrar `method_variant=copernicus_dsm_glo30`. |
| `touches_coast` | ICGC, [Linia de costa v1r0 202602](https://datacloud.icgc.cat/datacloud/linia-costa/gpkg/linia-costa-v1r0-202602-202602.zip) | GeoPackage ZIP, 2,841,007 B | Verificar y archivar los metadatos especificos junto al snapshot | Usar interseccion geometrica, con tolerancia metrica explicita para errores topologicos. |
| `landscape_units_count`, `landscape_diversity_entropy` | Observatori del Paisatge, [134 paisatges](https://content.catpaisatge.net/uploads/unitats_paisatge_224d64f51f.zip?uat=2025-07-03T13:08:33.413Z) | Shapefile ZIP, 2,238,613 B | Licencia especifica no localizada en el paquete: pendiente de confirmacion antes de redistribuir | Es una capa opcional de reconocimiento/diversidad, no bloquea `Landscape Core`. |

### 2.1. Esquema de unidades de paisaje

El snapshot contiene 134 geometrias y los campos:

```text
CODI_UP
NOM_UP
AREA
CATALEG_1
FITXA_1
CARTO_1
CATALEG_2
FITXA_2
CARTO_2
CATALEG_3
FITXA_3
CARTO_3
```

`CODI_UP` y `NOM_UP` son las claves necesarias para el overlay. Los campos de
catalogo y ficha conservan trazabilidad documental, pero no intervienen en la
metrica de diversidad.

### 2.2. Metadatos de coberturas

El identificador estable es `cobertes-sol-v1r0-2024`, el CRS es EPSG:25831 y la
escala equivalente declarada es 1:5.000. La fuente temporal va del 16 de abril
al 19 de noviembre de 2024. La especificacion tecnica enlazada por los
metadatos es:

`https://datacloud.ide.cat/especificacions/cobertes-sol-v1r0-esp-01ca-20160919.pdf`

La tabla de reclasificacion a `natural`, `forest`, `water_wetland` y `built_up`
debe quedar en configuracion y citar los codigos originales. No se debe inferir
la clase a partir del color de visualizacion.

## 3. Inundacion

### 3.1. Cuencas internas: ACA

Servicio WFS:

`https://aplicacions.aca.gencat.cat/geoserver/ows`

| Periodo | `typeNames` | Entidades verificadas |
|---|---|---:|
| T10 | `vishid:Zones_inundables_T10` | disponible; GeoJSON completo observado: 191,343,518 B |
| T100 | `vishid:Zones_inundables_T100` | 46,922 |
| T500 | `vishid:Zones_inundables_T500` | 77,039 |

Peticion reproducible, sustituyendo la capa:

```text
https://aplicacions.aca.gencat.cat/geoserver/ows?service=WFS&version=2.0.0&request=GetFeature&typeNames=vishid:Zones_inundables_T10&outputFormat=application/json&srsName=EPSG:25831
```

Campos comunes observados:

```text
the_geom, OBJECTID, CODI, ID_P, ID_ES, HISTORIA, DATMODIFIC,
OBJECTID_1, ID_P_1, EQUIVALENC
```

No se localizo en este WFS una capa ACA denominada o descrita como zona de
flujo preferente. Para esa variable se usara SNCZI, aplicando el filtro de
autoridad descrito abajo.

### 3.2. Cuencas intercomunitarias y flujo preferente: SNCZI

Los enlaces antiguos de descarga de MITECO devuelven 404, pero los servicios
vectoriales actuales de GeoServer estan operativos. Todos soportan WFS 2.0,
GeoJSON y EPSG:25831.

| Variable | Endpoint WFS | `typeNames` | Entidades que intersectan el bbox de prueba catalan |
|---|---|---|---:|
| T10 | `https://gis.miteco.gob.es/geoserver/agua/Zi_laminas_q10/ows` | `agua:Zi_laminas_q10` | 786 |
| T100 | `https://gis.miteco.gob.es/geoserver/agua/Zi_laminas_q100/ows` | `agua:Zi_laminas_q100` | 789 |
| T500 | `https://gis.miteco.gob.es/geoserver/agua/Zi_laminas_q500/ows` | `agua:Zi_laminas_q500` | 777 |
| flujo preferente | `https://gis.miteco.gob.es/geoserver/agua/ZI_Laminas_ZFP/ows` | `agua:ZI_Laminas_ZFP` | 759 |

Ejemplo para T10:

```text
https://gis.miteco.gob.es/geoserver/agua/Zi_laminas_q10/ows?service=WFS&version=2.0.0&request=GetFeature&typeNames=agua:Zi_laminas_q10&outputFormat=application/json&srsName=EPSG:25831&bbox=0.03,40.48,3.49,43.06,EPSG:4258
```

La licencia declarada por el servicio es **CC BY 4.0**, citando `Ministerio
para la Transicion Ecologica y el Reto Demografico`, sin limitaciones de acceso
publico.

Los campos de T10 incluyen:

```text
id_zona, zona, tipo_zona, rio, long_km, hipotesis, hidrologia,
precision, hidraul, estudio, tipo_est, documento, fecha_apro,
organismo, clave_expe, demarcacio, id_demar, q_m3_s, zi_directiva,
ciclo, fecha_geo, shape, fecha_lim
```

La capa de flujo preferente es similar y anade `escala_rep`; usa `fecha` en
lugar de `fecha_apro` y no contiene `hipotesis`, `zi_directiva`, `ciclo` ni
`fecha_geo`.

### 3.3. Regla de mosaico

No concatenar ACA y SNCZI y sumar areas. Para cada periodo:

1. usar ACA para las cuencas internas;
2. usar SNCZI para las demarcaciones intercomunitarias, filtrando por
   `organismo` o `demarcacio`;
3. recortar ambas fuentes a su ambito de competencia;
4. reparar, unir y disolver las geometrias antes de intersectar municipios;
5. publicar huecos de cobertura como tales.

Si no se dispone aun de una mascara jurisdiccional validada, la union disuelta
puede emplearse para una ejecucion diagnostica, pero no para publicar el score.

## 4. Incendio

Fuente oficial 2024:

`https://gencat.cat/agricultura/sig/bases/PERILLBASICINCENDI.zip`

El ZIP mide 1,182,266 B y contiene un GeoTIFF tematico de 100 x 100 m, su
piramide y una VAT. Los valores validos son los enteros `1..10`; la VAT solo
contiene `Value` y `Count`. No contiene etiquetas cualitativas.

No se ha localizado una tabla oficial que convierta esos valores en las clases
`high` y `very_high` exigidas por la formula actual. Por tanto:

- no asumir silenciosamente que `7..8` es alto y `9..10` muy alto;
- mantener `RISK-001` en `methodology_pending` para esa reclasificacion;
- conservar mientras tanto el histograma municipal y urbanizado de las diez
  clases, que permite validar el procesamiento sin publicar un subscore falso;
- registrar que la capa representa **peligro basico**, no riesgo parcelario ni
  probabilidad de incendio en tiempo real.

La reutilizacion debe citar a la Generalitat y la fecha de actualizacion bajo
la licencia declarada por el conjunto; si no aparece una licencia especifica,
aplican las condiciones de la Llicencia oberta d'us d'informacio - Catalunya.

## 5. Orden de implementacion recomendado

1. Descargar MCSC 2024 y versionar la reclasificacion de coberturas.
2. Descargar y disolver PEIN, ENPE y Natura 2000.
3. Procesar el MDE por teselas a una resolucion operativa comun.
4. Calcular `Landscape Core`; incorporar unidades de paisaje solo cuando se
   confirme su licencia.
5. Descargar ACA y SNCZI por bbox/paginacion y construir la mascara de
   competencias hidraulicas.
6. Reutilizar la clase `built_up` de MCSC para exposicion urbanizada.
7. Calcular inundacion territorial y urbanizada.
8. Procesar las diez clases de incendio y detener la publicacion del subscore
   hasta aprobar una equivalencia oficial o una nueva formula continua.

## 6. Decisiones abiertas

| ID | Decision pendiente | Bloquea |
|---|---|---|
| GIS-01 | Confirmar licencia especifica del ZIP de unidades de paisaje | Solo diversidad/reconocimiento |
| GIS-02 | Aprobar tabla de reclasificacion MCSC y fixture de prueba | Landscape Core y mascara urbanizada |
| GIS-03 | Validar mascara ACA/SNCZI por demarcacion | Publicacion de inundacion |
| GIS-04 | Obtener equivalencia oficial de incendio `1..10` o aprobar una formula continua | Subscore y score final de riesgo |
