<p align="center">
  <img src="assets/brand/svg/isotype.svg" alt="Capibara de Booki" height="84" />
</p>

<h1 align="center">Booki</h1>

<h3 align="center">Tu escritorio, más en calma.</h3>

<p align="center">Un dock precioso para Windows 11: apps, carpetas y widgets en vivo en una sola barra tranquila.<br/>Gratis, privado y de código abierto.</p>

<p align="center">
  <a href="https://github.com/punkable/booki/releases/latest"><b>Descargar para Windows</b></a> ·
  <a href="docs/releases/v0.86.0.md"><b>Novedades de 0.86</b></a> ·
  <a href="README.md">English</a>
</p>

<p align="center">
  <a href="https://github.com/punkable/booki/releases/latest"><img src="https://img.shields.io/github/v/release/punkable/booki?label=versi%C3%B3n&style=flat-square&color=dfaa75" alt="Última versión" /></a>
  <img src="https://img.shields.io/badge/Windows-10%20%2F%2011-0078d4?style=flat-square" alt="Windows 10 y 11" />
  <img src="https://img.shields.io/badge/hecho%20con-Tauri%202%20%2B%20React-24c8db?style=flat-square" alt="Hecho con Tauri 2 y React" />
  <a href="LICENSE"><img src="https://img.shields.io/badge/licencia-MIT-lightgrey?style=flat-square" alt="Licencia MIT" /></a>
</p>

<p align="center"><img src="docs/presentation/hero-es.jpg" width="1000" alt="Dock de Booki en un escritorio suave con apps, dos grupos de color, reloj, clima, sistema, temporizador y música, y la Isla del notch con el temporizador" /></p>

<table align="center">
<tr>
<td align="center" width="25%"><b>⚡ Ligero</b><br/><sub>Núcleo nativo en Rust. Los widgets se pausan cuando el dock se oculta.</sub></td>
<td align="center" width="25%"><b>🔒 Privado</b><br/><sub>Sin cuentas, sin telemetría, sin nube.</sub></td>
<td align="center" width="25%"><b>🎨 Tuyo</b><br/><sub>Barra de tareas, vidrio, claro o sólido. Cualquier borde. Cinco idiomas.</sub></td>
<td align="center" width="25%"><b>🧡 Abierto</b><br/><sub>Licencia MIT. Hecho a la vista de todos.</sub></td>
</tr>
</table>

---

<h2 align="center">El notch que te cuenta cosas.</h2>

<p align="center">Un punto discreto arriba de la pantalla que se abre en cápsula con tu temporizador, la canción que suena o la batería baja.<br/>Pasa el ratón para ver una tarjeta con más. ¿Prefieres algo más simple? Elige pestaña pegada o píldora flotante.</p>

<p align="center"><img src="docs/presentation/island-es.jpg" width="1000" alt="La Isla del notch mostrando un temporizador sobre un dock oscuro de Booki" /></p>

<h2 align="center">Grupos con tu estilo.</h2>

<p align="center">Ancla apps, carpetas, archivos y sitios web, y júntalos en grupos.<br/>Dale a cada grupo un color de una paleta cuidada y un icono de la librería: se ve en el dock y en Ajustes.</p>

<p align="center"><img src="docs/presentation/groups-es.jpg" width="1000" alt="Ajustes de Booki, Apps y carpetas: el dock como cuadrícula ordenada, biblioteca con iconos grandes e inspector de grupo con color e icono" /></p>

<h2 align="center">En vivo, de un vistazo.</h2>

<p align="center">Reloj, calendario, clima, sistema (CPU, memoria, disco, red), batería, música, volumen, notas, portapapeles y enfoque (temporizador + tareas).<br/>Fichas compactas en la propia barra.</p>

<p align="center"><img src="docs/presentation/widgets-es.jpg" width="1000" alt="Galería de widgets de Booki con vistas previas en vivo" /></p>

<h2 align="center">Ajustes que da gusto usar.</h2>

<p align="center">Cinco páginas claras —Inicio, Dock, Widgets, Apps y Sistema— con una vista previa en vivo de tu dock y todo de un vistazo.</p>

<p align="center"><img src="docs/presentation/settings-es.jpg" width="1000" alt="Inicio de Ajustes con el dock sobre un escritorio y fichas de resumen" /></p>

<h2 align="center">Como en casa a oscuras.</h2>

<p align="center">Sigue el tema y el color de Windows. Iguala la barra de tareas, desenfoca lo de atrás con vidrio o vidrio claro, o quédate en sólido.<br/>Cuando un juego o vídeo pasa a pantalla completa, Booki se aparta.</p>

<p align="center"><img src="docs/presentation/dark-es.jpg" width="1000" alt="Ajustes del dock de Booki en modo oscuro" /></p>

---

<h2 align="center">Privado por diseño.</h2>

<p align="center">Sin cuentas. Sin telemetría. Sin sincronización en la nube. Tus tareas, notas y uso se quedan en tu PC.<br/>El clima solo pide la ciudad que eliges, nunca tu ubicación.</p>

<p align="center"><sub>Las imágenes muestran la interfaz real de Booki 0.86 con datos y app de ejemplo.</sub></p>

## Instalar y empezar

1. Abre [Releases](https://github.com/punkable/booki/releases/latest) y elige `Booki_*_x64-setup.exe` (Intel/AMD) o `Booki_*_arm64-setup.exe` (Windows on ARM). También hay un MSI x64.
2. Abre **Booki** desde el menú Inicio. El instalador es por usuario y descarga WebView2 si falta.
3. Arrastra una app o carpeta al dock, o haz clic derecho en el dock para añadir elementos.

Requiere Windows 10 u 11. El instalador aún no tiene firma Authenticode, así que SmartScreen puede mostrar un aviso. Las actualizaciones se verifican y conservan tu configuración.

## Novedades de 0.86

- **Se siente como Windows 11**: menús al estilo WinUI, colores de acento de Windows, esquinas de 4/8 px, tamaños de texto y ritmos de animación de Windows, avisos como los de la barra de tareas y barras de desplazamiento finas.
- **El notch en vivo se estira hasta ser el dock** desde donde esté, con un solo muelle para todo el movimiento, y el dock ya no parpadea detrás de la app activa.
- **Widget Dispositivos**: batería de audífonos, mouse y teclados Bluetooth, de dispositivos Logitech con receptor Bolt o Unifying y de audífonos inalámbricos con el complemento opcional HeadsetControl.
- **Widget Uso de IA (opcional)**: tus límites de Claude y ChatGPT/Codex, leídos de la sesión que esas apps ya guardan en tu PC.
- **Complementos**: herramientas de código abierto opcionales que instalas desde Ajustes y que se verifican antes de usarse.
- **Inicio con Windows más inteligente**: el dock aparece al instante y Booki no compite con el resto de programas al iniciar sesión.
- **Un primer dock que ya se parece a ti**, una página Dock más simple con "Más ajustes", un aviso de "Cargando" en el notch y muchos arreglos.

Detalles en las [notas de 0.86](docs/releases/v0.86.0.md).

## Uso diario

| Acción | Resultado |
|---|---|
| Clic en un acceso | Abrirlo o enfocar su ventana |
| Arrastrar al dock | Anclarlo conservando el original |
| Arrastrar fuera | Desanclar, o devolver un acceso directo al escritorio |
| Clic derecho | Añadir elementos, cambiar perfil o abrir Ajustes |
| Clic central | Mostrar la ubicación en Explorer |
| `Alt` + `1…9` | Abrir el acceso correspondiente; modificador configurable |
| Cursor al borde | Revelar el dock si elegiste ese comportamiento |

## Privacidad

No hay cuentas, telemetría ni sincronización en la nube. La configuración y las recomendaciones de uso permanecen en tu equipo, en `%APPDATA%\Booki`. El portapapeles persistente está desactivado inicialmente y, al activarlo, se protege para tu usuario de Windows.

Las consultas de red se usan para actualizaciones y favicons, más tres cosas que solo ocurren si las activas: el clima de Open-Meteo al elegir una ciudad (nunca la ubicación del dispositivo), la descarga de complementos desde su release oficial en GitHub (verificada con la firma SHA-256 que publica GitHub) y el widget Uso de IA.

El widget Uso de IA lee la sesión que Claude Code (`~/.claude`) y Codex (`~/.codex`) ya guardan en tu PC y la envía solo a su propio servicio (Anthropic u OpenAI) para consultar el uso de tu plan. Booki nunca la guarda, registra ni reenvía, y solo consulta mientras el widget está en el dock. La batería de los dispositivos sale de Windows, de los receptores Logitech por USB y, si lo instalaste, de HeadsetControl en tu PC: nada sale de tu equipo. Los complementos viven en `%LOCALAPPDATA%\Booki\plugins` y quitarlos desde Ajustes borra su carpeta.

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

Booki es libre y de código abierto, con licencia [MIT](LICENSE), creado por [Punkable](https://github.com/punkable). Se conservan las capturas anteriores y los originales de marca porque siguen siendo útiles.
