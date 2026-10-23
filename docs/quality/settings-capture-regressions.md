# Ajustes, capturas y accesos a widgets

Correcciones posteriores a 0.95.0, agrupadas para la próxima actualización.

- «Puntos de partida» pasa a «Estilos predefinidos», plegado inicialmente.
  Windows, Compacto y Con aumento describen lo que aplican. No cambian la forma
  ni la activación del notch.
- Un conflicto real conserva el borrador afectado y permite guardar los demás
  ajustes. Se elimina cuando la lectura actual ya contiene la selección o vuelve
  al valor original. Un guardado propio confirmado actualiza la base de las
  ediciones que llegaron mientras estaba pendiente. El estado de guardado ocupa
  su lugar en el documento y no se superpone al aviso.
- Menús, paneles y opciones nativas Lista/Pequeño/Mediano/Grande usan tinta,
  fondo y esquema de controles adecuados al tinte del panel, incluido vidrio
  claro con tema oscuro. Alto contraste conserva los colores de Windows.
- El modo clic no abre una tarjeta al pasar el cursor ni acepta señales de
  revelado por hover o borde. El teclado conserva acceso a la tarjeta multimedia.
  Las respuestas antiguas de configuración no sustituyen una selección nueva.
- Los ajustes del widget usan su identificador, también dentro de grupos y
  cuando Ajustes ya está abierto. Distinguen dos copias del mismo widget.
- Con capturas activadas, Recortes conserva paneles, ampliación y tooltip al
  tomar el foco. El detector solo consulta el ejecutable en primer plano y emite
  un booleano; no lee imágenes, cuentas ni contenido capturado. Al salir se
  restablece el ocultamiento habitual. Se mantiene la política existente de
  inclusión/exclusión en grabaciones.

## Comprobación que requiere Windows

Las pruebas de navegador simulan el puente nativo. Las pruebas Rust de Linux no
validan las llamadas Win32 ni el comportamiento de Recortes. Antes de dar por
verificada la corrección en una instalación real:

1. Activar capturas, abrir un grupo o menú y usar Impr Pant y Win+Mayús+S.
   Repetir con una app ampliada y su tooltip visible; capturar y cancelar.
2. Confirmar que al terminar/cancelar desaparece la retención temporal y que
   cambiar a otra app cierra los paneles y permite ocultar el dock.
3. Desactivar capturas y comprobar que Windows vuelve a excluir Booki.
4. Probar Lista/Pequeño/Mediano/Grande y Personalizar con tinte blanco/oscuro,
   tema opuesto y alto contraste de Windows.
5. Elegir clic en el notch, acercar el cursor y empujarlo contra el borde.
   Debe esperar al clic. Cambiar a hover y comprobar el revelado correspondiente.

Estas comprobaciones físicas siguen pendientes; no equivalen a CI ni a una
captura del navegador de desarrollo.
