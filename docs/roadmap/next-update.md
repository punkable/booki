# Booki — auditoría y backlog

Documento vivo: se agregan puntos a medida que aparecen y se marcan cuando salen en una versión.

## Hecho en 1.0.3

- #145: el notch se queda, más pequeño y tenue, sobre ventanas maximizadas y solo se aparta en pantalla completa
  real (`booki://screen-full`). Los menús del navegador cuentan como la ventana del navegador (`GA_ROOTOWNER`).
- Pines con ruta vacía ("//") dan un error claro.
- `Mutex` sin propagar panics; clases del shell unificadas en `is_shell_class` (con prueba nativa).
- El bucle de vigilancia salió de `lib.rs` a `watcher.rs`.
- Textos: un archivo por idioma en `src/locales/`; pt/fr/de se cargan bajo demanda, uno a la vez.
- Temporizadores que ya no consultan con la ventana oculta (conectividad, notch).
- Seguridad: zip 9.8.2, url 2.5.9, cookie 0.18.3, tauri-plugin-updater 2.14.1 (elimina zip 4.x),
  `tools/presentation` sin avisos de npm. Cubre los PR de Dependabot #144 y #135.
- Pruebas renombradas por área; imágenes sin uso borradas.

## Evaluado y descartado (por ahora)

- **Vigilancia por eventos en vez de cada 300 ms:** la cercanía del puntero al notch y el borde de revelado
  necesitan sondeo de todos modos, y Windows no avisa al maximizar sin cambio de foco salvo con
  `EVENT_OBJECT_LOCATIONCHANGE`, que es muy ruidoso. La ganancia no compensa el riesgo.
- **`rust-version = "1.77"`:** sin una herramienta de MSRV no hay forma fiable de fijar el valor real; CI usa stable.

## Pendiente para próximas versiones

**Para el mantenedor**
- Borrar las ramas `wip` y `claude/practical-mayer-pm3igx` (ya fusionadas). El entorno de Claude no puede borrar
  ramas remotas.
- Cerrar #144 y #135 tras fusionar 1.0.3; fusionar #139 (rust-cache) si CI pasa.
- Probar en un PC con Windows: notch tenue sobre Edge/Chrome maximizado, apartado en video y juegos a pantalla completa.
- Firmar el instalador (SmartScreen).

**Código**
- `styles.css` (~3000 líneas): pasar a CSS por componente con `@layer`.
- Prueba de humo en Windows CI que arranque la app de verdad.
- Crates sin mantenimiento que llegan por Tauri (chrono, proc-macro-error, zbus): seguir las versiones de Tauri.

**Diseño e intuitividad**
- Aviso de una sola vez la primera vez que el notch se atenúa o se aparta: "Me hago a un lado cuando una app ocupa
  la pantalla. Acerca el puntero para verme".
- Animación con resorte en el paso de reposo a tarjeta; salidas más cortas que entradas.
- Ajustes: botón "restablecer esta sección".
- Accesibilidad: contraste del vidrio sobre fondos claros y navegación por teclado en el notch.

**Funciones que podríamos integrar**
- Perfiles por monitor.
- Barra de progreso arrastrable para la música en el notch.
- Resumen de notificaciones de Windows en el notch (con lista de apps permitidas).
- Atajos globales configurables para grupos y widgets.
- Sincronizar la configuración en una carpeta de OneDrive.
