# Changelog

Los cambios relevantes de MuniAlpha se documentan en este archivo.

## [Unreleased]

## [0.5.0] - 2026-08-25

### Added

- Integración reproducible de Tesela `v0.3.0` como submódulo fijado por tag y commit.
- Tests E2E Chromium para HTTP, `file://` y contratos de publicación estática.
- CI completa y validación Cloudflare mediante Wrangler.

### Changed

- El bundle se genera mediante el pipeline común de Tesela.
- El mapa utiliza el engine, componentes UI, providers y shell de Tesela.
- La configuración, el tema, el Source y las extensiones inmobiliarias permanecen en MuniAlpha.
- El build publica un inventario exacto, validado y sujeto a presupuestos de tamaño.

### Removed

- Copias locales del engine y shell.
- Wrapper transitorio del builder de datos.

[Unreleased]: https://github.com/mquitoss/muni-alpha/compare/v0.5.0...HEAD
[0.5.0]: https://github.com/mquitoss/muni-alpha/releases/tag/v0.5.0
