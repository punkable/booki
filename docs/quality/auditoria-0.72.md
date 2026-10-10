# Auditoría general de Booki 0.72

Fecha: 2026-10-09. Base: `main` en `8c844e5` (PR #87). Método: lectura del código,
capturas reales de Ajustes y del dock con el puente falso de las pruebas (Chromium,
temas claro y oscuro, los cuatro acabados) y `npm run check:all`.

Límite importante: este entorno es Linux. Todo lo que depende de Windows (blur
nativo, DWM, ventanas Win32) se revisó en el código y no se probó en un equipo real.

## Estado de partida

- Lint, `tsc`, i18n (5 idiomas completos), comprobación de iconos y de texto: verdes.
- 200 pruebas pasan tras `npm run build`.
- Las pruebas verifican que las piezas existen y no lanzan errores, pero no cómo se ven.
  Por eso pasaban con los defectos visuales de abajo.

## Hallazgos

### Corregido en esta rama

| # | Área | Problema | Solución |
|---|------|----------|----------|
| 1 | Ajustes | El preview del dock tenía `overflow: auto` en la escena, `overflow-x: auto` en la barra y `max-height: 280px; overflow-y: auto` en bordes laterales. Resultado: scroll interno (vertical u horizontal) y barra recortada. | El preview se escala para caber (`useFitScale`), sin ningún scroll interno. Se quitó además la caja de fondo de la escena. |
| 2 | Dock (Windows) | El blur nativo es una ventana Win32 recortada con `SetWindowRgn` poligonal. Si Windows ignora la región (o la dibuja dentada), el rectángulo asoma fuera de las esquinas redondeadas: el "cuadro de fondo". | La forma nativa se encoge `r·(1−1/√2)` por lado, así su rectángulo cabe siempre dentro de la curva CSS, se respete o no la región. **Pendiente de verificar en Windows.** |
| 3 | Widgets | Cada widget era una placa sólida fija (`#161618` / `#fff`) que ignoraba el acabado. En "Tinted" con tema claro: placas blancas sobre barra negra. | Las placas derivan de la tinta de la superficie (`--ink`) y siguen cada acabado y tinte personalizado. |
| 4 | Widgets (Ajustes) | El catálogo tenía su propio scroll dentro de la página. | Ahora solo hace scroll la página. |
| 5 | Apps y carpetas | La tira del dock hacía scroll horizontal y mostraba una casilla sin etiqueta junto a cada pin. | La tira se ajusta en varias líneas y las casillas aparecen al pasar el ratón, con foco de teclado o cuando ya hay una selección. |
| 6 | Sistema | "Update failed." aparecía dos veces y había textos sueltos fuera de las filas. | El error se muestra una vez y los textos quedan alineados con las filas. |
| 7 | Sistema | "Exportar diagnóstico" era un botón suelto dentro de una tarjeta vacía. | Ahora es una fila normal con su descripción. |

### Resuelto en 0.80 (overhaul)

| Pendiente de 0.72 | Qué se hizo |
|---|---|
| CSS en capas que se pisan | Ajustes tiene su propia hoja (`settings.css`) y ya no carga el CSS del dock. Los tokens se comparten en `tokens.css`. Se borraron `workspace.css`, `overhaul.css` y `design-tokens.css`. |
| CSS muerto | Se quitaron unas 1.150 líneas de `styles.css` que solo daban estilo a la Ajustes antigua, y una sección "premium polish" que volvía a dibujar un segundo borde en el dock. |
| Ajustes repetitivo | Pasó de 9 secciones a 5: Inicio, Dock, Widgets, Apps y Sistema. Nada aparece dos veces. |
| `settings.jsx` monolítico | De 1.800 líneas a un shell de unas 200: el estado vive en `store.js`, los controles en `controls.jsx` y hay una página por sección. |
| Mica ≈ Acrylic | Tres acabados reales: Vidrio (desenfoque nativo, intensidad, color), Mica (opaco, teñido por el fondo de pantalla) y Sólido. "Vidrio oscuro" reemplaza a Tinted. |
| Detalles visuales | Las placas de los widgets siguen el acabado. La línea de red se sustituyó por lecturas. El texto del clima ya no queda cortado. |
| Notch | Ahora es solo pestaña o píldora, con disparador y posición. Se retiraron el punto inteligente, la escala y el notch siempre visible, junto con su sondeo de 4 Hz. |
| Widgets | Pasaron de 15 a 10, con migración automática (config rev 9) en Rust. Esa migración también se aplica a perfiles y copias. |
| Traducciones | Se borraron 199 claves sin uso en los 5 idiomas. Los textos nuevos están en `src/strings.js`. |

### Sigue pendiente

- **Verificar en Windows 11:** la contención del blur, el tinte Mica y la geometría del notch.
  El código nativo compila y pasa clippy contra `x86_64-pc-windows-msvc`, pero no se ejecutó en Windows.
- **Archivos grandes:** `dock.js` (~4.900 líneas) y `lib.rs` (~3.600). Conviene partirlos al tocarlos.
- **Pruebas visuales:** añadir capturas de referencia de los acabados y de las páginas de Ajustes.

## Revisión 2026-10-10 (0.81.0)

- **Dependencias al día:** Tauri 2.12 con sus plugins (crates y paquetes npm en la misma
  versión menor), `sysinfo` 0.39, `ureq` 3, `dirs` 7, `base64` 0.23 y `png` 0.18. Los dos
  PRs de Dependabot (#79 y #86) fallaban en CI: uno por desalinear el puente de Tauri y el
  otro por cambios de API en `sysinfo` y `ureq`. Este cambio los sustituye.
- **Dependabot:** las versiones menores y de parche llegan juntas y cada versión mayor llega
  en su propio PR. `windows` y `windows-core` se actualizan siempre juntos.
- **CI:** `actions/checkout`, `actions/setup-node` y `actions/upload-artifact` pasan a v5
  (Node 24), lo que quita el aviso de Node 20 obsoleto en cada ejecución.
- **Sigue pendiente:** todo lo de la lista anterior. La migración de `ureq` y `sysinfo` toca
  el clima, el favicon de los sitios y el widget Sistema, así que conviene revisarlos en un
  Windows real junto con el blur, Mica y el notch.
