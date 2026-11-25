# Booki — auditoría y backlog para la próxima actualización

Documento vivo: se agregan puntos a medida que aparecen y se tachan cuando salen en una versión.
Estado del repo revisado: `main` en 1.0.2 (noviembre 2026).

## 1. Estado general

- `npm run lint`, `npm run typecheck`, `npm run build` y `npm test` (397 pruebas) pasan sin errores.
- Solo hay un issue abierto (#145) y tres PR de Dependabot pendientes (#135, #139, #144).
- Arquitectura: Tauri 2 + Rust en `src-tauri/`, dock y notch en JS sin framework, Ajustes en React 19.

## 2. Arreglado en esta rama

- **#145 — el notch aparece y desaparece en Edge.** Al abrir un menú, la ventana de extensiones,
  historial o descargas, Edge crea una ventana emergente propia que no está maximizada. Booki la tomaba
  como "ya no hay una app maximizada" y mostraba el notch; al volver a la página lo escondía otra vez.
  Ahora `foreground_maximized_on` e `is_fullscreen_on` miran la ventana dueña (`GA_ROOTOWNER`), así que
  la emergente cuenta como parte del navegador y el comportamiento es estable.
- **Pendiente de decisión (mismo issue):** con la opción por defecto ("auto") el notch se aparta sobre
  *cualquier* ventana maximizada y en pantalla completa. El usuario esperaba ver batería y música mientras
  navega. Opciones:
  1. Que "auto" solo se aparte en pantalla completa real (juegos, video) y no en ventanas maximizadas.
  2. Mantenerlo, pero explicarlo en el primer arranque y en Ajustes → Notch ("Siempre visible").
  3. Dejar el notch en modo mínimo (una línea fina con el porcentaje) sobre ventanas maximizadas en vez de esconderlo.
  Recomendación: la 3, porque no tapa las pestañas del navegador y no "desaparece" la información.

## 3. Limpieza del repositorio

| Elemento | Estado | Acción sugerida |
|---|---|---|
| Rama `wip` | Todo su contenido ya está en `main` (1.0.2 y #143) | Borrar |
| Rama `claude/practical-mayer-pm3igx` | Trabajo de 1.0.1 ya publicado en #141; su último commit solo toca `tools/presentation/clips.mjs` | Borrar (o rescatar ese único cambio) |
| PR #144 (zip 9.3.0), #139 (rust-cache), #135 (fast-uri en tools) | Dependabot, cambios de versión menores | Fusionar si CI pasa |
| `docs/presentation/social-*.jpg`, `hero-real-es.jpg` | No referenciados en el repo | Mover a releases/assets externos o enlazarlos desde un README en español |
| Pruebas `bug-pass-084`, `issue-64`, `overhaul*`, `settings-hotfix` | Nombres por evento, no por función | Renombrar por área (`notch-*.test.mjs`, `settings-*.test.mjs`) |
| `package.json` pide Node 24 | El entorno de CI/desarrollo puede ir en 22 | Documentar o relajar `engines` |

Recomendación de flujo: una sola rama de trabajo por versión (`release/1.0.x`) y ramas cortas por
función; activar "borrar rama al fusionar" en GitHub.

## 4. Código — falencias y mejoras

**Rust**
- `lib.rs` tiene ~2600 líneas, con el bucle de vigilancia (foreground, pantalla completa, notch, cursor) dentro
  de `setup`. Separarlo en un módulo `watcher.rs` con un estado propio facilitaría probarlo.
- Ese bucle sondea cada 300 ms. Ya existen ganchos de eventos (`win/system_events.rs`); mover la detección de
  maximizado/pantalla completa a `EVENT_SYSTEM_FOREGROUND` + `EVENT_OBJECT_LOCATIONCHANGE` reduciría CPU y latencia.
- ~25 `lock().unwrap()` (sobre todo `clipboard.rs` y `dock_window.rs`): un panic con el mutex tomado envenena el
  estado y tumba funciones enteras. Usar `parking_lot::Mutex` o `lock().unwrap_or_else(|e| e.into_inner())`.
- `rust-version = "1.77"` en Cargo.toml es muy viejo frente a lo que realmente compila CI; subirlo para que el
  aviso sea real.
- Detección de pantalla completa por clases conocidas (`MultitaskingViewFrame`, etc.): conviene una lista
  central compartida entre `is_fullscreen_on` y `foreground_maximized_on` (hoy está duplicada).

**Frontend**
- Textos repartidos en `strings.js`, `i18n.js`, `i18n-extra.js` y `refinement-strings.js`: unificar en archivos
  JSON por idioma; facilitaría sumar idiomas y traductores externos.
- `styles.css` (~3000 líneas) + varios `*-shell.css`: pasar a CSS por componente con capas (`@layer`) y tokens
  de diseño en un solo archivo.
- `changelog-data.js` (~2800 líneas) se carga en el bundle: generarlo desde `docs/releases/` y cargarlo bajo
  demanda al abrir "Novedades".
- 21 `setInterval` en `src/`: revisar que todos se pausen cuando la ventana está oculta (`visibilitychange`).

**CI / calidad**
- La CI de Windows empaqueta pero no ejecuta la app. Añadir una prueba de humo en Windows que arranque Booki,
  maximice una ventana de prueba y verifique `notch_screen_busy` (cubriría regresiones como #145).
- Firmar el instalador (SmartScreen) si aún no se hace; reduce desconfianza en descargas.

## 5. Diseño, intuitividad y animación

- **Explicar los comportamientos "inteligentes".** El notch que se esconde solo se percibe como bug (#145).
  Mostrar una vez un aviso: "Me aparto cuando una app ocupa la pantalla. Acerca el puntero para verme".
- **Indicador mínimo** en vez de ocultar del todo (ver punto 2.3).
- Respetar `prefers-reduced-motion` en todas las animaciones nuevas (hoy hay ~54 usos; auditar las del notch y
  de los widgets).
- Animaciones del notch: usar resortes (spring) en el morph de reposo → tarjeta, y que el contenido entre
  con un pequeño retraso escalonado; transiciones de salida más cortas que las de entrada.
- Ajustes: buscador global de opciones y un botón "restablecer esta sección".
- Accesibilidad: comprobar contraste del vidrio sobre fondos claros y navegación completa por teclado en el notch.

## 6. Funciones que podríamos integrar

- Perfiles automáticos por monitor (dock distinto en cada pantalla).
- Control de medios con miniatura y barra de progreso arrastrable en el notch.
- Notificaciones de Windows resumidas en el notch (con lista de apps permitidas).
- Atajos globales configurables para abrir grupos/widgets.
- Sincronizar configuración (exportar/importar ya existe; añadir carpeta en OneDrive).
- Plugins: un catálogo con versión mínima de Booki y página de permisos clara.

## 7. Tecnología

- Evaluar `windows-rs` más reciente y `tauri` 2.x último en cada versión (Dependabot ya lo propone).
- Considerar Preact o Solid para el dock si crece la complejidad del JS sin framework, manteniendo el tamaño.
- Telemetría opcional y local (contador de errores) para detectar fallos como #145 antes de que lleguen como issue.
