<p align="center"><img src="assets/brand/svg/isotype.svg" alt="La capibara de Booki" height="64" /></p>

<h1 align="center">Booki</h1>

<p align="center">Tus apps, carpetas y widgets. Un espacio más tranquilo en Windows.</p>

<p align="center"><a href="https://github.com/punkable/booki/releases/latest">Descargar versión disponible</a> · <a href="README.md">English</a></p>

**Estado:** la versión publicada es **0.69.0**. El overhaul **0.70 todavía no está publicado**; está en el [PR #75](https://github.com/punkable/booki/pull/75). Las imágenes y el video siguientes muestran esa próxima versión con datos de ejemplo.

## Instalar y empezar

1. En [Releases](https://github.com/punkable/booki/releases/latest), elige el instalador `x64` para Intel/AMD o `arm64` para Windows ARM. También hay MSI x64.
2. Instala y abre Booki desde Inicio. Requiere Windows 10/11; el instalador obtiene WebView2 si falta.
3. Arrastra una app o carpeta al dock, o usa su menú contextual para añadir elementos. Ajustes también está disponible desde el icono de la bandeja.

El instalador beta aún no tiene firma Authenticode y puede activar SmartScreen. Las firmas del actualizador verifican los archivos de actualización; son un mecanismo distinto. Las actualizaciones conservan la configuración.

## El próximo Booki

[![Vista previa de Booki 0.70: logo oficial y dock con apps y widgets](docs/presentation/hero-es.jpg)](docs/presentation/booki-070-preview-es.mp4)

**[Ver la presentación de 30 segundos](docs/presentation/booki-070-preview-es.mp4)** · [Subtítulos](docs/presentation/booki-070-preview-es.vtt)

El video es silencioso y explica las funciones en pantalla. Está renderizado con la interfaz real, datos de ejemplo y el logo oficial; no sustituye una grabación de las funciones nativas en Windows.

- **Inicio más claro:** vista previa del dock, escenarios de comportamiento, perfiles y ajustes agrupados que se adaptan a ventanas pequeñas.
- **Añadir apps con sentido:** búsqueda, apps instaladas y abiertas, y sugerencias basadas en uso local.
- **Widgets útiles:** galería visual, tamaños configurables, temporizador, tareas, calendario y clima opcional por ciudad.
- **Un dock más flexible:** desplazamiento o adaptación cuando no cabe, reducción de transparencia y recuperación de widgets ocultos.
- **Arreglos del issue #64:** accesos `.lnk` completos, traslado explícito al escritorio o a Booki, paginación de carpetas, idioma y cancelación de arrastres.
- **Guardado y distribución:** cambios parciales que conservan ajustes ajenos, consultas sin solapamientos, mejoras del instalador, actualizador y changelog.

![Inicio de Booki 0.70 con datos de ejemplo](docs/presentation/settings-es.jpg)

Consulta las [notas completas](docs/releases/v0.70.0.md). Pasaron los controles automáticos, las pruebas nativas Windows y los paquetes x64/ARM64 del overhaul. Antes de publicar quedan las pruebas interactivas de Win+D, pantallas/DPI e instalación/actualización real. Compilar ARM64 no verifica su ejecución en hardware.

## Uso diario

| Acción | Resultado |
|---|---|
| Clic en un acceso | Abrirlo o enfocar su ventana |
| Arrastrar al dock | Anclarlo conservando el original |
| Arrastrar fuera | Desanclar; 0.70 ofrece además devolver accesos directos al escritorio |
| Clic derecho | Añadir elementos, cambiar perfil o abrir Ajustes |
| Clic central | Mostrar la ubicación en Explorer |
| `Alt` + `1…9` | Abrir el acceso correspondiente; modificador configurable |
| Cursor al borde | Revelar el dock si elegiste ese comportamiento |

## Privacidad

No hay cuentas, telemetría ni sincronización en la nube. La configuración y las recomendaciones de uso permanecen en tu equipo, en `%APPDATA%\Booki`. El portapapeles persistente está desactivado inicialmente y, al activarlo, se protege para tu usuario de Windows.

Las consultas de red se usan para actualizaciones y favicons; 0.70 añade clima opcional mediante Open-Meteo al elegir una ciudad, sin pedir la ubicación del dispositivo. La desinstalación conserva los ajustes salvo que marques **Eliminar datos de la aplicación**.

## Desarrollo y soporte

Booki usa Tauri 2, Rust/Win32, JavaScript y React. Puedes previsualizar la interfaz en un navegador; las funciones nativas requieren Windows.

```bash
npm ci
npm run dev
npm run check:all
```

El [README en inglés](README.md) incluye instrucciones de compilación, auditoría de releases, donaciones y créditos. La [presentación Remotion](tools/presentation/README.md) tiene su código y pasos de reproducción; sus dependencias no entran en la aplicación.

Problemas: [GitHub Issues](https://github.com/punkable/booki/issues) o [punkable@protonmail.com](mailto:punkable@protonmail.com). Seguridad: [SECURITY.md](SECURITY.md).

Booki es libre y de código abierto, con licencia [MIT](LICENSE), creado por [Punkable](https://github.com/punkable). Se conservan las capturas anteriores y los originales de marca porque siguen siendo útiles.
