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

### Pendiente (por prioridad)

**P1. Verificar el blur nativo en Windows 10 y 11.** Si el inset no basta, la alternativa
robusta es dejar de recortar con región y pintar la tinta solo en CSS con un blur sin
región, o usar `DWMWA_SYSTEMBACKDROP_TYPE` sobre una ventana del tamaño exacto, con
`DWMWCP_ROUND`.

**P1. CSS en capas que se pisan.** Hay siete hojas (`styles.css` 4.074 líneas,
`overhaul.css`, `workspace.css`, `design-tokens.css`…) y cada una redefine los mismos
selectores: `.live-preview-bar` en 9 bloques, `.tile` en 84, `.s-content` en 8. Además hay
32 `!important`. Cada "overhaul" anterior añadió una capa encima en lugar de reemplazar
la de abajo. Propuesta: fusionar Ajustes en una sola hoja por componente y borrar las
reglas vencidas.

**P1. CSS muerto.** `.pin-card`, `.pin-item` y `.pin-kid-menu` (unos 40 bloques) no se
usan en ningún JS/JSX.

**P2. Ajustes repetitivos y difíciles de entender.**
- "Cómo se comporta tu dock" aparece completo en Inicio **y** en Dock.
- "Perfiles y copia" aparece como acceso directo en Inicio y como sección propia.
- Inicio tiene tres tarjetas de acción, tres tarjetas de escenario, un resumen
  numérico y un enlace "Configurar dock" que repite el menú lateral.
- Propuesta: Inicio = preview editable + 3 accesos. Fusionar Dock y Apariencia en "Dock"
  (posición, comportamiento, aspecto). Pasar "Ayuda" y "Acerca de" al pie de Sistema.
  Resultado: de 9 secciones a 5.

**P2. `settings.jsx` monolítico.** 1.800 líneas y 22 `useState` en un componente. Hay que
partirlo en una página por sección (ya existe el patrón en `src/settings/`).

**P2. Mica vs Acrylic casi idénticos.** En CSS solo cambian el blur (20 vs 36 px) y la
opacidad. Mica en Windows no es blur de lo que hay detrás sino el tinte del fondo de
pantalla. O se diferencia de verdad o se fusionan en un solo acabado "Vidrio" con
intensidad.

**P2. Detalles visuales del dock.**
- El separador desaparece sobre "Tinted" en tema claro, porque usa el color del tema
  y no la tinta de la superficie.
- El grupo vacío muestra un cuadrado gris claro sobre fondos oscuros personalizados.
- La línea de la gráfica de red toca el borde inferior de su placa.

**P3. `dock.js` (4.951 líneas) y `lib.rs` (3.656 líneas).** Funcionan, pero cualquier
cambio es caro. Conviene extraer módulos cuando se toquen, no en una reescritura aparte.

**P3. Pruebas visuales.** Añadir capturas de referencia (Playwright `toHaveScreenshot`) del
dock en los cuatro acabados y de cada página de Ajustes. Así los defectos de este
informe no vuelven a pasar CI sin que nadie los vea.

**P3. Node.** `package.json` exige Node ≥ 24.18. Es correcto para CI, pero bloquea
`check:all` en entornos con Node 22, aunque todo lo demás funciona.
