# Auditoría general de Booki 0.83

Fecha: 2026-10-11. Base: `main` en `15ced01` (0.83.0). Método: lectura del núcleo Rust,
del dock, del notch, de Ajustes, de las herramientas y de la CI. Además se ejecutaron
`eslint`, `tsc`, `check:i18n`, `check:text`, `build`, las 238 pruebas de Node, y
`cargo clippy` y `cargo test` en Linux.

Límite: este entorno es Linux. El código exclusivo de Windows se revisó leyendo, sin
ejecutarlo.

Estado de partida: lint, typecheck, i18n (747 claves × 5 idiomas), build y las 238
pruebas en verde. No hay XSS: los nombres, rutas y URLs pasan por `esc()` o se asignan
con `textContent`, y las notas de versión remotas se muestran como texto.

## Corregido en esta rama

| # | Prioridad | Área | Problema | Solución |
|---|---|---|---|---|
| 1 | Alta | Notch / Rust | Arrastrar el notch a otro borde no se guardaba nunca. `set_dock_edge` también enviaba `notchEdge`, un campo antiguo que ya no existe. El parche se rechazaba entero y el error se perdía sin aviso. | El parche envía solo `edge`, y un fallo queda en el registro. |
| 2 | Media | Dock | Si Ajustes guardaba mientras el dock tenía un guardado en cola, la recarga sustituía `cfg` y el guardado en cola escribía la copia del backend. La edición del dock (reordenar, quitar) se perdía sin aviso. | `reloadConfig` espera a que terminen los guardados en cola. El guardado que recarga tras un error no se espera a sí mismo. |
| 3 | Media | Dock | No se podía renombrar una app dentro de un grupo desde el menú del flyout, porque solo se buscaba en el primer nivel. | La búsqueda incluye los hijos de los grupos (`findPinnedById`). |
| 4 | Media | Dock | Cambiar o quitar un icono con el selector abierto durante una recarga escribía sobre un objeto viejo, y el cambio se perdía. | Se vuelve a buscar el pin vivo por id después del selector. |
| 5 | Media | Notch | Un arrastre cancelado (táctil, lápiz o la ventana ocultándose) dejaba el notch en estado "arrastrando". Toda la ventana quedaba clicable y el modo "apartarse mientras trabajas" dejaba de funcionar. | Se manejan `pointercancel` y `lostpointercapture`. |
| 6 | Media | Ajustes | Lecturas de config fuera de orden podían revertir valores en pantalla y provocar un aviso de conflicto falso. | Solo se aplica la lectura más reciente y el listener se libera bien al cerrar. |
| 7 | Media | Ajustes | Un resultado de búsqueda viejo volvía a hacer scroll y robaba el foco al regresar a su página. | `navigate()` limpia el objetivo de búsqueda. |
| 8 | Media | Ajustes | La migración del aviso de bienvenida guardaba la config entera y podía pisar un pin que el dock acababa de añadir. | Ahora es un parche de un solo campo. |
| 9 | Media | Rust | `image_data_uri` devolvía cualquier archivo, de cualquier tamaño, al webview. | Solo devuelve imágenes, con un máximo de 8 MB. Hay una prueba nueva. |
| 10 | Baja | Rust | "Añadir a Booki" con varios archivos podía crear pins con el mismo id (misma milésima). | Al id se le añade un contador. |
| 11 | Baja | Rust | Exportar diagnóstico escribía el archivo sin el patrón atómico. | Usa `snapshot::write_bytes`. |
| 12 | Baja | Dock | Escape soltaba el dock fijado aunque no hubiera panel abierto. | Solo cierra el panel si existe. |
| 13 | Baja | Dock | La píldora de actualización solo respondía al primer clic. | El listener se registra una vez y queda fijo. |
| 14 | Baja | Dock / Notch | Nombres con `$&` o `` $` `` se mostraban mal en los avisos, por los patrones especiales de `String.replace`. | Se reemplaza con una función. |
| 15 | Baja | Notch | `notch_reveal` sin `.catch` (rechazos sin manejar), y `cfg.pinned = null` rompía `applyLook`. | Se añadió `.catch` y un valor por defecto. |
| 16 | Baja | Ajustes | Un cambio rápido de idioma podía terminar en el idioma equivocado si un paquete cargaba más lento. | Solo se aplica si sigue siendo el idioma elegido. |
| 17 | Baja | Herramientas | `check:i18n` ignoraba 140 llamadas `t('…')` con comillas simples. | El patrón acepta ambas comillas. Todas las claves existen hoy. |

## Pendiente, por prioridad

### Media

- **Comandos lentos en el hilo de la interfaz.** Los comandos síncronos `paths_exist` (una
  ruta `\\servidor` caída tarda segundos), `move_paths`, `volume_set`, `launch_app`
  (escribe el uso con fsync) y `clipboard_*` congelan el dock mientras corren. Además,
  varios `async fn` bloquean los hilos del runtime sin `spawn_blocking`: miniaturas,
  papelera, `wallpaper_accent`, favicon y recientes. Hay que probarlo en Windows,
  sobre todo `move_paths`, porque sus diálogos cambian de hilo.
- **El historial del portapapeles puede revivir.** El vigilante copia el historial, el
  usuario lo borra y se escribe la lista vacía, pero luego el vigilante escribe su copia
  vieja. Tras reiniciar, todo vuelve. Solución: tomar la copia dentro del candado de
  escritura (`clipboard.rs`).
- **Papelera y mover sin validar rutas.** Una ruta vacía corta la lista de `pFrom`, y
  una relativa se resuelve contra `System32` en el arranque automático. Hay que
  rechazar las rutas vacías, las que tienen NUL y las que no son absolutas
  (`win/windows_impl.rs`).
- **Un atajo rechazado desactiva todos.** `hotkeys_apply` suelta todos los atajos y
  vuelve con error si el primero ya lo usa otra app. El lanzador y los atajos de
  posición quedan sin registrar hasta reiniciar.
- **Detección de "app abierta" por título.** Un pin de carpeta llamado "Docs" se marca
  como abierto con cualquier pestaña que contenga esa palabra, y el clic enfoca esa
  ventana (`dock.js`, `windowsFor`).
- **Lector de pantalla saturado.** `aria-live` en los widgets Sistema y Portapapeles
  anuncia la CPU cada 2,4 s y puede leer en voz alta texto copiado privado.
- **Controles solo con ratón.** Las filas del portapapeles no copian con Enter. Los
  botones para sacar de un grupo son `<span>`. Los popovers de confirmación no reciben
  el foco. Hay un `<button>` dentro de otro `<button>` en los tiles.
- **Ajustes en blanco si falla la primera carga.** `configApi.get()` no tiene `.catch`.
  Falta un estado de error con reintentar.
- **CI de publicación.** Las acciones van fijadas por etiqueta, no por SHA, incluidas
  las de terceros (`dtolnay/rust-toolchain`, `Swatinem/rust-cache`). Además, el trabajo
  que firma restaura cachés. Conviene fijar por SHA, quitar las cachés del job de
  publicación y aceptar solo `main` en `release.yml`.

### Baja

- Unas 70 esperas fijas (`waitForTimeout`) en las pruebas: son lentas y pueden fallar
  en máquinas cargadas. Además, `npm test` usa el `dist/` que ya exista, aunque esté
  desactualizado.
- `react-hooks/exhaustive-deps` no está en eslint, y `@eslint/js` se importa sin estar
  declarado. `tsconfig` solo revisa 6 archivos.
- Hay unas 120 líneas de componentes sin uso en `src/settings/ui.jsx`.
- El dock escribe textos de widgets cada segundo aunque no cambien. Cada escritura
  dispara el `MutationObserver`, que vuelve a medir todo el dock.
- `render()` y `closeStack()` reinician todos los sondeos.
- `set_material` calcula un tinte que nunca se usa. `favicon.rs` tiene ramas que no
  pueden coincidir.
- Las copias de configs dañadas y de perfiles borrados no se limpian nunca.
- Hay sondeo de pantalla completa cada 300 ms aunque la opción esté apagada.
- Señales nativas pueden perderse si la cola de 32 eventos se llena.

### Para el hilo de grupos y colores

- `theme.js`: el temporizador de tema automático mira `cfg.theme` y no el tema resuelto
  (`paintedLook(cfg).theme`). Si el aspecto da "auto" por `colorSource`, el cambio
  día/noche no se programa.

## Partir `dock.js`

El archivo tiene unas 40 variables de módulo que se reasignan (`cfg`, `hiddenState`,
`stackOpen`…). Otro módulo no puede reasignar un `let` importado, así que el primer
paso, y el único que no es mecánico, es mover ese estado a un objeto compartido
(`dock/state.js`). Después, cada bloque se corta y se pega con el patrón `deps` que ya
usan `add-panel.js` y `launcher.js`. Orden propuesto, de menos a más acoplado:
actualizaciones, portapapeles, apps abiertas, popovers, regiones de clic, marco, y luego
el resto. La parte de edición y reordenación espera a que termine el trabajo de arrastre
de grupos.

## Avance posterior (PR #107)

Lo pendiente de arriba quedó resuelto salvo lo que se indica al final. Además se
revisaron Ajustes y el dock, y se integró Booki más con Windows.

### Pendientes resueltos

- **Núcleo:** el trabajo lento sale del hilo de la interfaz: rutas de red, volumen,
  miniaturas, papelera, favicon, recientes, portapapeles e iconos. `move_paths` sigue en
  el hilo principal porque sus diálogos lo necesitan. El historial del portapapeles se
  escribe en orden. Papelera y mover rechazan rutas vacías, relativas o con NUL. Cada
  atajo se registra por separado. El menú del Explorador no queda a medias. Se quitó
  código muerto. Las copias de configs dañadas y de perfiles borrados se limitan a 10.
  Las señales nativas ya no se pierden.
- **Dock:** "app abierta" ya no coincide por título con ventanas ajenas. `aria-live`
  queda solo en batería, música y volumen. Las filas del portapapeles copian con Enter.
  Sacar de un grupo es un botón real. Las confirmaciones son diálogos que reciben el
  foco. No se reescribe el DOM si nada cambió, y los sondeos ya no se reinician en cada
  render. Las notas se guardan tras 1 s de pausa.
- **Ajustes:** si falla la primera carga se muestra el error con un botón para
  reintentar. Fechas en el idioma elegido. Se borró código sin uso. eslint revisa los
  hooks de React.
- **CI y pruebas:** todos los jobs tienen tiempo máximo. Las acciones de terceros van
  fijadas por SHA. Solo se publica desde `main`, sin cachés en el job que firma. Las
  pruebas rechazan un `dist/` desactualizado y usan esperas por condición.

### Más nativo de Windows

- **Teclado como la barra de tareas:** flechas entre iconos, Inicio y Fin, una sola
  parada de Tab. El lector de pantalla anuncia "En ejecución · N ventanas".
- **Clics como la barra de tareas:** Mayús+clic y clic central abren otra ventana.
  Ctrl+Mayús+clic ejecuta como administrador, y la opción también está en el menú.
  Ctrl+clic central abre la ubicación del archivo.
- **Avisos de atención:** cuando una app parpadea en la barra de tareas, su icono en el
  dock se marca hasta que la abres.
- **Alto contraste:** dock, notch, menús y Ajustes usan los colores del sistema.
- **Tamaño del texto de Windows:** Ajustes lo respeta. El dock no, porque su tamaño lo
  elige el usuario.
- **Bandeja y título de Ajustes** en el idioma de Booki. Antes estaban siempre en
  español.
- **Inicio con Windows fiel:** si lo desactivas en el Administrador de tareas, Booki lo
  respeta y no vuelve a activarlo.
- **Energía:** con la pantalla apagada se detienen los sondeos. Con el ahorro de
  energía, van a la mitad de ritmo.
- **Escala por monitor:** al cambiar la escala de un monitor, el dock se recoloca.
- **Atajos** con los nombres de teclas de Windows en cada idioma (Ctrl+Mayús+Espacio).

### Probar en un Windows 11 real

Nada de lo anterior se ejecutó en Windows; la CI de Windows lo compila y empaqueta.
Conviene probar:

- la rueda de volumen;
- el portapapeles, borrándolo y reiniciando;
- la papelera;
- soltar archivos para moverlos;
- el menú del Explorador;
- un atajo ya ocupado por otra app;
- ocultar en pantalla completa;
- las combinaciones de clic y la ventana de UAC;
- desactivar Booki en el Administrador de tareas y reiniciar;
- el tamaño de texto de Windows;
- el alto contraste;
- apagar la pantalla y el ahorro de energía;
- cambiar la escala de un monitor;
- una app que parpadea, como un chat.

### Sigue pendiente

- Partir `dock.js`, ahora que terminó el arrastre de grupos.
- Avisos nativos (toasts), listas de saltos de cada app y reservar espacio como la
  barra de tareas: necesitan probarse en Windows mientras se hacen.
- Firma Authenticode y manifiesto de winget.
- El botón de quitar sigue dentro del botón del icono.
