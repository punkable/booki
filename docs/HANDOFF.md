# Booki: traspaso para seguir con otros agentes

Estado al 11 de octubre de 2026. Este documento es el punto de partida para cualquier persona o agente que retome Booki. Léelo junto con [`AGENTS.md`](../AGENTS.md) (cómo está hecho y cómo trabajar) y la [guía de identidad visual](brand/README.md) (cómo se ve).

## Dónde está el proyecto

- **Versión publicada:** 0.84.0 (x64 y arm64, NSIS y MSI, `latest.json` firmado). Notas en [`docs/releases/v0.84.0.md`](releases/v0.84.0.md).
- **Identidad visual:** definida y documentada en [`docs/brand/README.md`](brand/README.md). Lo nuevo debe seguirla, no rediseñarla.
- **Funciones principales:** dock en cualquier borde con apps, carpetas, archivos y sitios; grupos con color y glifo; diez widgets (reloj, calendario, clima, sistema, batería, multimedia, volumen, notas, portapapeles, foco con tareas); notch con tres formas (pestaña, píldora flotante, punto inteligente) y actividades en vivo; lanzador rápido (Ctrl+Alt+Space); perfiles automáticos por monitor u horario; Ajustes con cinco páginas (Inicio, Dock, Widgets, Apps, Sistema); cinco idiomas.
- **Colores:** el usuario elige entre su propio color, seguir a Windows (acento y barra de tareas) o el fondo de pantalla. Paleta sugerida con el tan de Booki y colores Pantone del año.

## Corregido después de 0.84.0 (sin publicar)

El PR #111 corrigió tres errores visuales. Entra en la próxima versión cuando Pedro la pida:

1. **Tema:** elegir Claro ya no deja el dock oscuro cuando Windows pinta el acento en la barra de tareas; ese relleno de acento solo aplica en oscuro. Si el color del vidrio fuerza su propia tinta (Vidrio oscuro, el color de la barra), toda la ventana del dock y del notch toma el tema que corresponde, así que menús, paneles y placas de widgets ya no se mezclan. Ajustes en "Sistema" sigue el modo de las apps de Windows.
2. **Punto del notch:** la pestaña, la cápsula en vivo y el punto ya no usan el desenfoque nativo, que se recortaba y los partía en dos bandas, ni el brillo superior. Tienen un relleno parejo, y solo la tarjeta y el aviso piden el desenfoque.
3. **De actividad en vivo al dock:** con una actividad o la tarjeta abierta en el notch, el dock se abre estirando esa cápsula hasta su tamaño completo (`clip-path` desde la forma que informa el notch en `booki://notch-shape`). Si el notch no tiene nada, el dock aparece con la animación de siempre.

Falta verlos en un Windows 11 real.

## Pendiente

Por prioridad:

1. **Probar en un Windows 11 real.** Nada desde 0.83 se ha probado en un equipo real; la CI solo compila y empaqueta. La lista de qué probar está en [`docs/quality/auditoria-0.83.md`](quality/auditoria-0.83.md#probar-en-un-windows-11-real). Añadir: tema claro/oscuro/sistema, colores que siguen a Windows y al fondo, notch en sus tres formas y en los cuatro bordes.
2. **Firma Authenticode** del instalador para que SmartScreen no avise. Necesita Azure Trusted Signing o un certificado y los secretos en GitHub. Guía en [`docs/distribution/firma-y-winget.md`](distribution/firma-y-winget.md).
3. **Primer envío a winget.** Los manifiestos se generan en cada build (`scripts/winget-manifest.mjs`); falta enviarlos.
4. **Reservar espacio como AppBar,** para que las ventanas maximizadas no queden debajo del dock.
5. **Actualizaciones mayores de Dependabot** (Vite 8, ESLint 10, TypeScript 7, plugin-react 6, windows-core 0.62, acciones). Se dejaron abiertas a propósito; cada una merece su propio PR con pruebas.

El historial de auditorías está en `docs/quality/` (`auditoria-0.72.md`, `auditoria-0.83.md`). Muchos puntos "pendientes" de la auditoría 0.83 ya se resolvieron en los PR #107, #108 y #109; las secciones "Avance posterior" del mismo documento lo detallan.

## Cómo le gusta trabajar al dueño

- Escribe en español; respóndele en español. El código, los comentarios, los commits y los PR van en inglés.
- **Junta cambios.** Se pueden mezclar PR, pero **no se publica una versión hasta que él lo pida.**
- Prefiere editar en el mismo lugar: un grupo se abre en el espacio que ocupa, sin paneles que se despliegan hacia abajo. Arrastrar fuera para quitar, arrastrar dentro para añadir.
- Quiere que el dock se vea como parte de Windows (que siga la barra de tareas) sin perder el carácter cálido de Booki.
- Cuando se mezclan varios PR seguidos, mezcla `main` en el siguiente después de cada uno para evitar conflictos.

## Cómo publicar una versión (solo cuando se pida)

1. Subir la versión en `package.json`, `package-lock.json`, `src-tauri/tauri.conf.json`, `src-tauri/Cargo.toml` y `Cargo.lock` (`npm run check:versions` lo comprueba).
2. Escribir `docs/releases/vX.Y.Z.md`, actualizar `src/release-notes.js` y sus textos `release<NN>.*` en los cinco idiomas, y la sección "New in" de `README.md` y `README.es.md`.
3. Mezclar el PR en `main` con la CI en verde.
4. Lanzar el workflow **Release** (`release.yml`) desde `main` con la etiqueta `vX.Y.Z`. Construye, firma las actualizaciones, sube los archivos, los vuelve a descargar para verificarlos y publica.

## Verificación honesta

Las pruebas corren en Chromium con datos de ejemplo. Demuestran la interfaz, no el comportamiento nativo de Windows (blur, Mica, barra de tareas, DPI, instalador). Al cerrar un trabajo, di qué se verificó y qué no.
