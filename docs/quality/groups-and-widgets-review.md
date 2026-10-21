# Booki 0.94.0: revisión de grupos, widgets y publicación

Base: `v0.93.0` / `e12e4ee`. El usuario confirmó que no hay otra copia local que contrastar. Los cambios pertenecen al repositorio principal.

## Cambios y decisiones

- Los archivos y carpetas de Explorer se pueden anclar directamente dentro de un grupo abierto. Su contenido desplaza internamente con cabecera fija, y conserva el desplazamiento después de guardar. Cuatro era la cantidad de iconos de la miniatura, no un límite de miembros.
- Se retiran los botones de extracción de las esquinas. Se mantienen arrastre hacia fuera, menú contextual y menú de teclado. El arrastre interno desplaza el contenido al acercarse a los bordes.
- El icono de la cabecera abre la apariencia con la paleta Pantone de Booki. Cambiarla actualiza solo el grupo y conserva los widgets; el grupo se vuelve a resolver por id tras guardar un nombre.
- Los paneles de vidrio usan traslación sin desvanecimiento de opacidad cuando hay material nativo, y reportan su geometría durante la apertura.
- Las baterías visibles se consultan cada 15 segundos, menos en ahorro de energía. El panel permite actualizar la lectura y abrir ajustes Bluetooth. Una lectura ausente muestra `?`; ya no se conserva indefinidamente un dato antiguo.
- El código no añade una caché nativa prolongada para MX Keys Mini. Windows puede devolver su último nivel Bluetooth, y HID++ depende de los protocolos y conexiones disponibles. No se puede deducir una carga real a partir del tiempo enchufado: no se inventan niveles ni estado de carga.
- La tarjeta de IA rota incluso entre proveedores inactivos. Codex muestra cuota restante de su ventana más restrictiva. Claude muestra tokens y cuota desconocida cuando no hay un límite en sus registros. No se encontró una fuente local fiable de cuota de Cursor en los metadatos que Booki observa; no se añaden credenciales ni consultas de red.
- El reproductor del notch se retira tras un minuto en pausa y vuelve al reproducir. Se conservan las reglas de vídeo/juegos y los avisos breves. No se ha añadido una API para identificar el monitor del reproductor.
- El Recolector conserva resultados finales ante eventos tardíos de progreso y expone el detalle de error en su tarjeta. Se mantiene la descarga única nativa y la separación de audio/vídeo introducida en 0.93. Cancelación y colas reanudables no forman parte de esta versión.
- Los avisos del actualizador también respetan concentración y No molestar. Descarga, guardado, respaldo e instalación mantienen sus pasos explícitos.

## Integraciones evaluadas

El catálogo ya contiene winget/App Installer, HeadsetControl, yt-dlp, FFmpeg, gallery-dl, OpenRGB y LibreHardwareMonitor. Se prioriza mejorar los controles existentes y añadir acceso a los ajustes Bluetooth de Windows. No se instalan ni activan herramientas, servicios o cuentas adicionales por defecto.

## Documentación y comprobaciones

Las notas de 0.94 están traducidas a cinco idiomas. Ambos README y sus doce imágenes se regeneran desde la interfaz con iconos y datos ficticios; el historial reciente se genera desde el changelog. El manifiesto de imágenes identifica versión, edición, código, composición y SHA-256. La publicación comprueba que todo coincide antes de usar la firma del actualizador.

Las regresiones cubren grupos de 48 a 50 elementos mediante arrastre externo, conservación de widgets al editar color y símbolo, menús de teclado, desconexión, refresco manual, rotación de IA, pausa prolongada y eventos tardíos del Recolector. Las pruebas del actualizador cubren bloqueo, error/reintento, guardado y respaldo antes de instalar. CI comprueba Rust y los paquetes Windows x64/ARM64; la publicación vuelve a verificar firmas y archivos subidos.

Las pruebas de navegador usan un puente simulado. Empaquetar no demuestra carga física de MX Keys Mini, composición DWM/WebView2 real, interacción con dos monitores ni una actualización gráfica instalada en un PC. Estas limitaciones figuran en las notas de la versión; no se presentan como comprobaciones completadas.
