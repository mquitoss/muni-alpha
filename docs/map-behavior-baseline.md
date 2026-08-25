# Baseline de comportamiento cartográfico de MuniAlpha 0.4.0

Este documento conserva el baseline de entrada usado para validar la migración
sin regresiones publicada posteriormente como MuniAlpha `v0.5.0`.

Este documento congela el comportamiento previo a integrar Tesela 0.3.0. No
define la arquitectura futura: describe lo que la migración debe conservar.

## Selección

- Seleccionar un municipio dibuja un perímetro GeoJSON de grosor 4, sin relleno y
  sin interacción propia.
- Una selección nueva sustituye el perímetro anterior.
- Cerrar el detalle elimina el perímetro.
- Una selección procedente del buscador ajusta los bounds con zoom máximo 12.

## Etiquetas y zoom

- Las etiquetas municipales están ocultas por debajo de zoom 11.
- Desde zoom 11 solo se crean etiquetas para municipios contenidos en los bounds
  visibles ampliados un 15 %.
- Los eventos `zoomend`, `moveend` y `overlayadd` actualizan las etiquetas.

## Overlays

- Carreteras/etiquetas de referencia y capitales de comarca comparten un overlay
  activado inicialmente.
- Los nombres municipales forman otro overlay activado inicialmente.
- Activar o desactivar overlays no recalcula joins, factores, cobertura ni scores.

## Gate de migración

Tesela podrá implementar estas capacidades mediante descriptores declarativos,
pero MuniAlpha debe conservar los límites de zoom, la sustitución de selección,
el ajuste de bounds y la independencia del scoring aquí descritos.
