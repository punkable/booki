# Handoff para Claude — Booki, trabajo pendiente de revisión

## Instrucción vigente del usuario

**Dejar los cambios preparados en esta rama para continuar en Claude. No fusionar a main, no crear tags y no publicar una actualización. No seguir trabajando en Booki Dev.** Esta instrucción sustituye la autorización anterior para publicar al terminar. El PR debe permanecer en borrador.

- Repositorio: `punkable/booki`.
- Rama de trabajo: `fix/widget-workspaces`.
- PR en borrador: https://github.com/punkable/booki/pull/134
- Base estable: `main`, commit `5acd0d9a432f3be51c61a35490b8b05ed3e880d3`, versión pública **0.95.1**.
- La rama prepara **0.96.0**, todavía sin publicar. Su versión, README, notas y capturas están adelantados como material de preparación: los enlaces 0.96.0 de esta rama no implican que exista esa descarga pública.
- El primer bloque de widgets ya se subió en `1ce6dccbb15cc9c7a4642970dc98f7421271f7c3`. Este handoff acompaña el siguiente bloque de paneles, avisos, IA y preparación de versión.

Para continuar, abrir esta rama (no main), leer este archivo y revisar el diff del PR. No sobrescribir cambios locales ajenos. Las últimas comprobaciones y sus resultados están en el PR; algunos resultados locales se estaban completando al escribir este documento.

## Qué pidió el usuario

1. Clic normal en un widget = abrir sus detalles/controles. Clic derecho → configurar esa copia.
2. Ajustes funcionales propios de cada widget, por pasos/pestañas, separados de apariencia.
3. Complementos no debe ofrecer repetidamente «Añadir Recolector», especialmente para integraciones que no corresponden ni cuando el widget ya existe dentro de un grupo.
4. Avisos de actualización/descarga/batería fuera del dock; posiciones y comportamiento coherentes.
5. Revisar integraciones con Windows y pulir ventanas/paneles. En sus capturas señaló Dispositivos, la ayuda permanente del Portapapeles y la búsqueda/vista de grupos.
6. Mejorar detección de Claude, Codex, Cursor y OpenCode en distintos PCs, sin copiar ni leer credenciales ni inventar porcentajes de cuota.
7. Una sola actualización grande cuando vuelva a autorizar publicar. Por ahora, solo preparar y entregar a Claude.

## Cambios implementados

### Widgets y ajustes

- Ruta común `openWidget` para los 15 widgets en dock, grupos y hub. Corrige clics inactivos de widgets agrupados.
- Media/Volumen abren controles con clic normal. Botones explícitos de reproducción y rueda conservan acciones rápidas. Doble clic de widget ya no abre ajustes accidentalmente.
- Menús contextuales y engranajes apuntan al ID exacto. Portapapeles también tiene acceso directo a sus ajustes, incluso agrupado.
- Inspector con Contenido / Apariencia / Conexiones opcionales, Anterior/Siguiente, teclado y selector explícito de copias. Desplazamiento interno en ventanas amplias para mantener el inspector accesible.
- Reloj: formato 12/24/regional, segundos/fecha; Calendario: inicio de semana; Clima: ciudad/unidades; Dispositivos: selección/rotación; IA: proveedor/rotación; Sistema: métricas; Enfoque: duración/DND; Volumen: incremento de rueda; políticas de Notas/Portapapeles/Recolector/Actualizaciones/Iluminación.
- Los ajustes afectan al widget en ejecución. Reloj ampliado muestra la hora; Clima configurado abre el pronóstico. Sistema/Batería actualizan detalles abiertos y liberan sus temporizadores al cerrar.
- Complementos tiene mapeo explícito y busca instancias recursivamente: HeadsetControl→Dispositivos, LHM→Sistema, yt-dlp/FFmpeg/gallery-dl→Recolector, OpenRGB→Iluminación, winget→Actualizaciones. Ofrece configurar la instancia existente en lugar de duplicarla.
- Instalar espera el guardado de aceptación de términos; un fallo no inicia la instalación.

### Avisos y Windows

- `notice-layout.js` coloca actualizaciones y avisos en una misma zona hacia el interior de la pantalla, fuera del dock y sus iconos ampliados, en los cuatro bordes.
- Se mide el contenido completo después de añadir botones. Observadores/eventos siguen cambios de tamaño y movimiento sin un bucle permanente de polling.
- Aviso de actualización cerrable, con versión conservada al aplicar ajustes. Acción asíncrona antigua no puede ocultar un aviso posterior.
- Detección de cambios de pantalla incluye el origen del área disponible (`availLeft/availTop`), no solo sus dimensiones.
- Cabeceras de paneles consistentes; paneles grandes se limitan al espacio disponible junto al dock. El cuerpo desplaza su contenido y mantiene la cabecera visible.
- Portapapeles: ayuda bajo botón Info, búsqueda/cabecera fijas e historial con scroll interno. Grupos: búsqueda y vista integradas con iconos y controles compactos, conservando Ctrl+rueda.
- Dispositivos: detalles más reconocibles, color de alerta legible sobre vidrio claro y oferta de soporte USB plegada, sin términos/instalación ocupando siempre el panel.

### IA: alcance real, sin promesas falsas

- El backend antes devolvía solo Claude/Codex; ahora devuelve los cuatro proveedores con `detected`, incluyendo una explicación cuando no hay datos locales. Cursor/OpenCode no se eliminan silenciosamente.
- Se revisan homes personalizados y predeterminados, XDG y sesiones Codex archivadas. La detección de presencia de Cursor/OpenCode usa metadatos de carpetas.
- El watcher de actividad comparte rutas; OpenCode admite metadatos de SQLite/WAL y almacenamiento antiguo message/part. Detecta escrituras del mismo tamaño mediante mtime, sin leer su contenido.
- Deduplicación Codex por sesión: contadores iguales en sesiones distintas no se pierden. Se rechazan porcentajes no finitos.
- El widget rota proveedores detectados; permite seleccionar Cursor/OpenCode. Detalles incluyen volver a consultar y una explicación plegada de fuentes/limitaciones.
- **Claude local aporta consumo, no cuota de suscripción. Cursor/OpenCode no publican cuota mediante esta integración. No se leen auth.json, cuentas, cookies, tokens ni bases de credenciales para obtenerla.** Se muestra cuota desconocida; las ventanas reales Codex se usan cuando están en el registro. No confundir tiempo de bloque Claude con saldo disponible.
- WSL, equipos remotos y uso exclusivo en navegador pueden no dejar registros accesibles en este PC. No se ha probado cobertura física universal de versiones de proveedores.

## Archivos para orientarse

| Área | Entradas principales |
| --- | --- |
| Apertura/configuración | `src/dock/widget-editors.js`, `launch.js`, `menus.js`, `stack.js` |
| Ajustes por pasos | `src/settings/pages/widgets.jsx`, `src/settings/widget-content.jsx` |
| Complementos | `src/widget-integrations.js`, `src/settings/pages/plugins.jsx` |
| Estado y detalles | `src/dock/live-widgets.js`, `readings.js`, `system-panel.js`, `productivity-panel.js` |
| Avisos | `src/dock/notice-layout.js`, `undo-toast.js`, `updates.js`, `dom.js` |
| Ventanas/Windows | `src/dock/frame.js`, `clipboard-stack.js`, `group-view.js`, CSS |
| IA nativa | `src-tauri/src/ai_usage.rs`, `agent_activity.rs` |
| Versionado/documentación | `src/release-notes.js`, `src/refinement-strings.js`, `docs/releases/v0.96.0.md`, ambos README, `docs/presentation/` |

Documentación de detalle y límites:

- `docs/quality/widget-workspaces.md`
- `docs/quality/notifications-windows-audit.md`
- `docs/quality/ai-provider-discovery.md`
- `docs/distribution/release-process.md` (solo para una futura publicación autorizada)

## Validación y estado al preparar el handoff

- 53 casos de dispositivos, grupos, accesibilidad, widgets y complementos pasaron durante la revisión.
- 14 casos de paneles/avisos/geometría pasaron, incluidos los cuatro bordes, cabeceras fijas, ayuda del Portapapeles y ausencia de porcentajes inventados.
- La revisión completa anterior detectó un inspector que dejaba de estar accesible al hacer scroll; se corrigió y los 43 casos de widgets/biblioteca pasaron. No es un fallo pendiente.
- Un primer refactor del observador de avisos produjo un error al observar una función como elemento; se corrigió antes del último conjunto de 14 casos, que pasó completo. No es un fallo pendiente.
- Se corrigió una llamada de Rust incompatible con MSRV 1.77 sin relajar lint. Formato y clippy con `-D warnings` pasaron en el código posterior. Los tests nativos completos estaban compilándose al escribir esto.
- `npm run release:prepare` pasó en la fuente final: versiones, notas, README, enlaces y 12 capturas coherentes. Se inspeccionaron capturas reales de los paneles en español y capturas de presentación con datos de ejemplo.
- `npm run check:all` final estaba en curso; las tres pruebas de validación de instaladores ya habían pasado. **Consultar resultados finales en el PR.** No tomar una suite anterior como prueba de todas las adiciones posteriores.
- CI empaqueta la edición oficial sin firmas de updater para pruebas. La extensión experimental del workflow para generar Dev se retiró al pedir el usuario parar ese trabajo. El soporte Dev previo del proyecto no se ha eliminado.
- El validador exige los MSI en inglés/español configurados y no admite restos de otra edición/versión. Una primera compilación experimental había fallado al considerar el MSI español un resto; eso está corregido con un test específico. No reintentar builds Dev.

Comandos normales de verificación (Node 24/npm 11 según package.json):

```bash
npm ci
npx playwright install --with-deps chromium
npm run check:all
cargo fmt --manifest-path src-tauri/Cargo.toml --check
cargo clippy --locked --manifest-path src-tauri/Cargo.toml --all-targets -- -D warnings
cargo test --locked --manifest-path src-tauri/Cargo.toml --lib
```

Si se cambia frontend/assets antes de una futura entrega, regenerar capturas con `npm run release:prepare` y revisar `npm run release:check`. Ese comando prepara archivos locales; **no autoriza publicar**.

## Pendiente para continuar

1. Leer los resultados finales del PR y revisar el diff del backend IA y del nuevo layout. Corregir cualquier fallo real sin desactivar verificaciones.
2. Dar otra pasada UX a los paneles que señaló el usuario. Sus mejoras están implementadas pero él quiere continuar refinándolas en Claude.
3. Validar en Windows real, cuando haya un PC disponible: cuota/detección de las versiones concretas de agentes, batería/periféricos, vidrio nativo, Snipping Tool, DND, múltiples monitores/DPI y actualización instalada desde 0.95.1. Las pruebas de navegador usan puente simulado; compilación/firma no demuestran ese comportamiento físico.
4. Revisar si hacen falta rutas de agentes adicionales a partir de evidencia de las instalaciones concretas; no resolver cuota desconocida leyendo credenciales o inventando números.
5. Mantener este PR en borrador y todos los cambios fuera de main. La preparación 0.96.0 no se ha publicado. Pedir una nueva instrucción explícita antes de integrar/publicar.

No hay cambios de producción ni SQL en otro repositorio. Una petición sobre Louisville Gaming fue retirada por el usuario por estar en el chat equivocado.
