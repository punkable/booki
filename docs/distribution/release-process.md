# Preparar cada actualización

No publicar desde Booki Dev. `npm run tauri:dev:local` y `npm run tauri:build:dev` usan identificador, datos e icono propios; no consumen el feed de actualizaciones oficial.

## Requisitos obligatorios

1. Actualizar versión coherente en `package.json`, `package-lock.json`, `src-tauri/tauri.conf.json`, `src-tauri/Cargo.toml` y `src-tauri/Cargo.lock`.
2. Actualizar `currentRelease()` en `src/release-notes.js`, sus textos en los cinco idiomas y `docs/releases/v<VERSION>.md`. Describir solo comportamiento comprobado.
3. Ejecutar `npm run check:all`, `cargo fmt --manifest-path src-tauri/Cargo.toml --check`, `cargo clippy --locked --manifest-path src-tauri/Cargo.toml --all-targets -- -D warnings` y `cargo test --locked --manifest-path src-tauri/Cargo.toml --lib`.
4. Ejecutar **`npm run release:prepare` desde entorno oficial**. Compila frontend, sincroniza README en inglés/español con el changelog, actualiza botones NSIS x64/ARM64 y MSI x64, renueva textos alternativos y genera 12 capturas de la versión actual.
5. Revisar visualmente las capturas de `docs/presentation/`, notch y changelog. Las capturas usan datos de ejemplo, sin escritorio ni archivos del usuario; no prueban acrylic nativo, detección real de agentes ni instalación.
6. Probar actualización firmada desde la versión anterior: buscar, descargar, guardar configuración, respaldo, instalar, reiniciar y comprobar versión/configuración. Probar error de descarga/reintento y MSI/portable por su ruta manual. No cerrar esta comprobación únicamente con firma/SHA/build.
7. Guardar fuentes, README, notas, capturas y `docs/presentation/release-captures.json` en el mismo commit. Toda modificación posterior del frontend requiere regenerar las capturas.
8. Publicar solo cuando el usuario dé por lista la actualización. El workflow exige código en `main`, comprobaciones completas y documentación coherente antes de usar claves de firma.

## Control automático

`npm run release:check` comprueba versión de notas/changelog, bloques de README, enlaces de descarga, captions y SHA-256 de las 12 imágenes. La huella del código y assets evita reutilizar capturas de otra interfaz o versión; también rechaza capturas de la edición Dev.

El workflow de release y `scripts/publish-release.mjs` ejecutan ese control antes de publicar. Si falla, corregir el contenido o ejecutar `npm run release:prepare`; no omitir el control.

Los vídeos históricos conservan su versión explícita en el nombre. No presentarlos como demostración de una nueva versión sin regenerarlos y revisarlos.
