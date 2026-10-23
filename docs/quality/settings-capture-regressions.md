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

## Revisión general adicional

- Un fallo de la vista previa posterior al guardado no produce un rechazo sin
  tratar ni marca como perdidas preferencias que ya están guardadas.
- La recuperación explícita de una configuración limpia elimina los conflictos,
  errores de cierre y callbacks pendientes de la configuración anterior.
- Las consultas de captura descartan respuestas anteriores a una señal nueva;
  una respuesta tardía no puede cerrar un panel recién retenido.
- Un fallo de guardado de densidad de grupo no revierte una selección posterior
  mientras la lectura de configuración está temporalmente indisponible.
- Los avisos diferidos vuelven a comprobar el enfoque y No molestar al llegar su
  turno. Consultan el estado actual de Windows antes de mostrar un aviso normal.
- La entrega de avisos retenidos funciona sin widget Enfoque y con el dock
  oculto: solo hay una consulta periódica mientras queden avisos pendientes.
  Una lectura fallida conserva el último estado conocido de No molestar.

Estos casos tienen pruebas de regresión con el puente nativo simulado en
`tests/general-audit.test.mjs`. La interacción real con No molestar de Windows
requiere comprobación en una instalación real, igual que Recortes.

La carga diferida de traducciones respeta la selección más reciente: cambiar de idioma rápidamente no permite que una descarga anterior sobrescriba el idioma elegido. Dos pruebas cubren las selecciones síncronas y asíncronas.

## Segunda revisión general

- El dock distingue un guardado confirmado de un fallo posterior del canal de
  eventos. Un error al avisar a otras ventanas no muestra «no guardado» ni ofrece
  reintentar una copia antigua sobre cambios posteriores.
- Si una descarga termina mientras su cancelación sigue pendiente, conserva el
  archivo terminado, retira «Cancelando» e ignora el error tardío de cancelar un
  proceso que ya salió. Un aviso de finalización rechazado no bloquea la cola.
- Los botones de avisos del notch evitan ejecutar dos veces la misma acción
  mientras está pendiente, y permiten reintentar cuando la acción falla.
- La instalación de un complemento espera a guardar la aceptación de sus
  términos. Si falla el guardado, muestra un error y permite volver a intentar.
- Las notas guardan el texto nuevo aunque su autoguardado haya coincidido con
  una escritura anterior fallida; no queda esperando a otra pulsación.

Las pruebas de cola y acciones son unitarias. Los casos de guardado e instalación
usan el puente simulado del navegador: no descargan ni instalan complementos
reales y no modifican datos personales.
