<p align="center">
  <img src="assets/brand/svg/isotype.svg" alt="Capibara de Booki" height="84" />
</p>

<h1 align="center">Booki</h1>

<h3 align="center">Tu escritorio, más en calma.</h3>

<p align="center">Un dock precioso para Windows 11: apps, carpetas y widgets en vivo en una sola barra tranquila.<br/>Gratis, privado y de código abierto.</p>

<!-- booki:download:start -->
<p align="center">
  <a href="https://github.com/punkable/booki/releases/download/v0.95.0/Booki_0.95.0_x64-setup.exe"><b>Descargar para Windows v0.95.0 (x64)</b></a> ·
  <a href="https://github.com/punkable/booki/releases/download/v0.95.0/Booki_0.95.0_arm64-setup.exe">ARM64</a> ·
  <a href="https://github.com/punkable/booki/releases/download/v0.95.0/Booki_0.95.0_x64_en-US.msi">MSI x64</a> ·
  <a href="docs/releases/v0.95.0.md">Novedades v0.95.0</a> ·
  <a href="README.md">English</a>
</p>
<!-- booki:download:end -->

<p align="center">
  <a href="https://github.com/punkable/booki/releases/latest"><img src="https://img.shields.io/github/v/release/punkable/booki?label=versi%C3%B3n&style=flat-square&color=dfaa75" alt="Última versión" /></a>
  <img src="https://img.shields.io/badge/Windows-10%20%2F%2011-0078d4?style=flat-square" alt="Windows 10 y 11" />
  <img src="https://img.shields.io/badge/hecho%20con-Tauri%202%20%2B%20React-24c8db?style=flat-square" alt="Hecho con Tauri 2 y React" />
  <a href="LICENSE"><img src="https://img.shields.io/badge/licencia-MIT-lightgrey?style=flat-square" alt="Licencia MIT" /></a>
</p>

<p align="center"><img src="docs/presentation/hero-es.jpg" width="1000" alt="Dock de Booki con apps de ejemplo, grupo, reloj, sistema, temporizador y Recolector" /></p>

<table align="center">
<tr>
<td align="center" width="25%"><b>⚡ Ligero</b><br/><sub>Núcleo nativo en Rust. Los widgets se pausan cuando el dock se oculta.</sub></td>
<td align="center" width="25%"><b>🔒 Privado</b><br/><sub>Sin cuentas, sin telemetría, sin nube.</sub></td>
<td align="center" width="25%"><b>🎨 Tuyo</b><br/><sub>Barra de tareas, vidrio o sólido. Cualquier borde. Cinco idiomas.</sub></td>
<td align="center" width="25%"><b>🧡 Abierto</b><br/><sub>Licencia MIT. Hecho a la vista de todos.</sub></td>
</tr>
</table>

---

<h2 align="center">El notch que te cuenta cosas.</h2>

<p align="center">Un punto discreto arriba de la pantalla que se abre en cápsula con tu temporizador, la canción que suena o la batería baja.<br/>Pasa el ratón para ver una tarjeta con más. ¿Prefieres algo más simple? Elige pestaña pegada o píldora flotante.</p>

<p align="center"><img src="docs/presentation/island-es.jpg" width="1000" alt="Claude Code, Cursor y Codex con estados de trabajo, espera y finalización en el notch compacto de Booki" /></p>

<h2 align="center">Grupos con tu estilo.</h2>

<p align="center">Ancla apps, carpetas, archivos y sitios web, y júntalos en grupos.<br/>Dale a cada grupo un color de una paleta cuidada y un icono de la librería: se ve en el dock y en Ajustes.</p>

<p align="center"><img src="docs/presentation/groups-es.jpg" width="1000" alt="Grupo de Booki con búsqueda, densidad seleccionable e iconos de apps de ejemplo" /></p>

<h2 align="center">En vivo, de un vistazo.</h2>

<p align="center">Reloj, calendario, clima, sistema (CPU, memoria, disco, red), batería, música, volumen, notas, portapapeles y enfoque (temporizador + tareas).<br/>Fichas compactas en la propia barra.<br/>Un bloque de enfoque activa No molestar de Windows (y lo desactiva al terminar), retiene los avisos de Booki y puede mantener el dock oculto.</p>

<p align="center"><img src="docs/presentation/widgets-es.jpg" width="1000" alt="Panel de widgets en vivo y cola de sesión del Recolector de Booki" /></p>

<h2 align="center">Ajustes que da gusto usar.</h2>

<p align="center">Seis secciones claras —Inicio, Dock, Widgets, Apps, Complementos y Sistema— con una vista previa en vivo de tu dock y todo de un vistazo.</p>

<p align="center"><img src="docs/presentation/settings-es.jpg" width="1000" alt="Inicio actual de Ajustes de Booki con dock de ejemplo" /></p>

<h2 align="center">Como en casa a oscuras.</h2>

<p align="center">Sigue el tema y el color de Windows. Iguala la barra de tareas, desenfoca lo de atrás con vidrio, o quédate en sólido.<br/>Cuando un juego o vídeo pasa a pantalla completa, Booki se aparta.</p>

<p align="center"><img src="docs/presentation/dark-es.jpg" width="1000" alt="Ajustes actuales del Dock de Booki en modo oscuro" /></p>

---

<h2 align="center">Privado por diseño.</h2>

<p align="center">Sin cuentas. Sin telemetría. Sin sincronización en la nube. Tus tareas, notas y uso se quedan en tu PC.<br/>El clima solo pide la ciudad que eliges, nunca tu ubicación.</p>

<!-- booki:media:start -->
<p align="center"><sub>Capturas del frontend del código fuente v0.95.0, con datos de ejemplo. El desenfoque nativo de Windows requiere comprobación en la app.</sub></p>
<!-- booki:media:end -->

## Instalar y empezar

1. Abre [Releases](https://github.com/punkable/booki/releases/latest) y elige `Booki_*_x64-setup.exe` (Intel/AMD) o `Booki_*_arm64-setup.exe` (Windows on ARM). También hay un MSI x64.
2. Abre **Booki** desde el menú Inicio. El instalador es por usuario y descarga WebView2 si falta.
3. Arrastra una app o carpeta al dock, o haz clic derecho en el dock para añadir elementos.

Requiere Windows 10 u 11. El instalador aún no tiene firma Authenticode, así que SmartScreen puede mostrar un aviso. Las actualizaciones se verifican y conservan tu configuración.

<!-- booki:news:start -->
## Novedades de 0.95.0

Un Booki más fluido: grupos claros, notch discreto y Recolector completo.

- Busca dentro del grupo y cambia entre lista e iconos pequeños, medianos o grandes con Ctrl + rueda. Al reorganizar se conservan búsqueda, vista y desplazamiento.
- Al arrastrar desde un grupo ves el icono o inicial, el nombre, el destino y dónde se insertará. Escape cancela. Arrastra el fondo del dock para cambiar de borde o pantalla.
- Menús contextuales más cortos: Personalizar reúne nombre, icono y color en un panel con paletas desplegables y Aplicar/Cancelar. Apariencia, organización, ventanas, recientes y perfiles se abren por separado.
- Los estilos predefinidos son opcionales y empiezan plegados: Windows, Compacto y Con aumento explican qué aplican. Desplazamiento suave y animaciones contenidas; los estilos conservan la forma y activación del notch.
- Los agentes ocupan solo logo y estado. Rotan según la actividad, con prioridad para espera y error. La música aparece brevemente y sus controles siguen disponibles al acercarte mientras un agente trabaja.
- Un panel reúne tus widgets en vivo. El menú y el lanzador ofrecen controles de audio y acciones rápidas. Al abrir un dispositivo puedes ver fuente y hora de consulta; el consumo de IA sin cuota publicada aparece como aproximado.
- Vídeo, audio, archivos y galerías visibles desde el inicio. Añade varios enlaces a una cola de sesión, cancela o reintenta, elige calidad y carpeta, y abre, muestra o copia el archivo al terminar, también desde el aviso del notch.
- Las actualizaciones de Booki se anuncian discretamente junto al dock. Descargar e instalar siguen separados, con guardado y respaldo antes de aplicar.

[Notas completas](docs/releases/v0.95.0.md)
<!-- booki:news:end -->

<!-- booki:history:start -->
## Actualizaciones recientes

| Versión | Qué cambió |
|---|---|
| [0.94.0](docs/releases/v0.94.0.md) | Grupos más ágiles, widgets más claros y un README renovado. |
| [0.93.0](docs/releases/v0.93.0.md) | Agentes más claros, descargas que conservan tus archivos y actualizaciones al día. |
| [0.92.0](docs/releases/v0.92.0.md) | Claude y Codex en el notch, concentración con No molestar y copia automática. |

[Todas las versiones publicadas](https://github.com/punkable/booki/releases)
<!-- booki:history:end -->

## Uso diario

| Acción | Resultado |
|---|---|
| Clic en un acceso | Abrirlo o enfocar su ventana |
| Arrastrar al dock | Anclarlo conservando el original |
| Arrastrar fuera | Desanclar, o devolver un acceso directo al escritorio |
| Clic derecho | Añadir elementos, cambiar perfil o abrir Ajustes |
| Clic central | Mostrar la ubicación en Explorer |
| `Alt` + `1…9` | Abrir el acceso correspondiente; modificador configurable |
| Clic derecho en grupo → Personalizar | Cambiar nombre, icono y color; desplegar la paleta al necesitarla, y Aplicar o Cancelar |
| `Ctrl` + rueda en un grupo | Cambiar entre lista y tamaños de iconos |
| Arrastrar desde un grupo | Ver el acceso y su destino; `Escape` cancela |
| Panel de widgets / Controles de audio | Disponibles desde el menú y la búsqueda de acciones |
| Cursor al borde | Revelar el dock si elegiste ese comportamiento |

El Recolector admite vídeo, audio, archivos y galerías: pega un enlace por línea para añadir varios a la cola. Su engranaje permite elegir carpeta, formato y calidad; esos ajustes también están en Widgets y Complementos. La cola y los resultados duran mientras Booki esté abierto.

## Privacidad

No hay cuentas, telemetría ni sincronización en la nube. La configuración y las recomendaciones de uso permanecen en tu equipo, en `%APPDATA%\Booki`. El portapapeles persistente está desactivado inicialmente y, al activarlo, se protege para tu usuario de Windows.

Las consultas de red se usan para actualizaciones y favicons, más funciones que solo ocurren si las activas: el clima de Open-Meteo al elegir una ciudad (nunca la ubicación del dispositivo), la descarga de complementos desde su página de versiones oficial (verificada con una suma SHA-256 fijada en el código de Booki). El widget Uso de IA no consulta la red.

El widget Uso de IA solo lee, en modo lectura, los registros de uso locales de Claude Code (`~/.claude/projects`) y Codex (`~/.codex/sessions`), cuando activas el widget o los avisos locales de uso. Booki nunca lee, usa, guarda ni envía tus credenciales de Claude o ChatGPT, no conserva el contenido de los mensajes y no hace ninguna petición de red para él. La batería de los dispositivos sale de Windows, de los receptores Logitech por USB y, si lo instalaste, de HeadsetControl en tu PC: nada sale de tu equipo. Los complementos viven en `%LOCALAPPDATA%\Booki\plugins` y quitarlos desde Ajustes borra su carpeta. Son herramientas independientes de terceros, con sus propias licencias, que solo se instalan si tú lo decides; usarlas conforme a la ley es tu responsabilidad. Consulta los [términos de uso](TERMS.md#términos-de-uso-y-aviso-sobre-complementos).

La desinstalación conserva los ajustes salvo que marques **Eliminar datos de la aplicación**.

## Desarrollo y soporte

Booki usa Tauri 2, Rust/Win32, JavaScript y React. Puedes previsualizar la interfaz en un navegador; las funciones nativas requieren Windows.

```bash
npm ci
npm run dev
npm run check:all
```

Los cambios de interfaz siguen la [identidad visual y sistema de diseño](docs/brand/README.md).

El [README en inglés](README.md) incluye instrucciones de compilación, auditoría de releases, donaciones y créditos. Las imágenes y el video se regeneran desde la interfaz real con [tools/presentation](tools/presentation/README.md).

Problemas: [GitHub Issues](https://github.com/punkable/booki/issues) o [punkable@protonmail.com](mailto:punkable@protonmail.com). Seguridad: [SECURITY.md](SECURITY.md).

Booki es libre y de código abierto, con licencia [MIT](LICENSE) y [términos de uso](TERMS.md#términos-de-uso-y-aviso-sobre-complementos), creado por [Punkable](https://github.com/punkable). Se conservan las capturas anteriores y los originales de marca porque siguen siendo útiles.
