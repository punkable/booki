/* Booki — "What's new" notes. Human-written; newest version first. Shown inside
   the Settings window (a modal) the first time you open the app after updating. */

export const CHANGELOG = [
  {
    version: "0.37.0",
    date: "5 jul 2026",
    headline: "El dock ya no se esconde mientras lo usas, y «Añadir a Booki» llega al Explorador.",
    sections: [
      {
        icon: "🖱️",
        title: "Ocultar sin sustos",
        notes: [
          "Regla nueva: el dock JAMÁS se esconde mientras el cursor está encima o tienes algo a medias (arrastre, grupo o menú abierto). Se esconde solo cuando lo dejas.",
          "El retraso de ocultado ahora es una gracia después de salir, nunca una cuenta atrás mientras lo usas.",
          "«Al salir» ya no arranca escondido: el dock aparece y se guarda visiblemente si no lo tocas, para que se entienda cómo funciona.",
        ],
      },
      {
        icon: "🖥️",
        title: "Clic derecho en Windows",
        notes: [
          "Nuevo menú «Booki» en el clic derecho del Explorador: añade cualquier archivo o carpeta al dock, o mándalo directo a uno de tus grupos.",
          "Funciona aunque Booki esté cerrado (lo abre y ancla el elemento). Se puede desactivar en Ajustes → General.",
        ],
      },
      {
        icon: "🧭",
        title: "Ajustes, todo en su sitio",
        notes: [
          "General ahora reúne: iniciar con Windows, siempre visible, actualizaciones, atajos de teclado, idioma y copia de seguridad. La pestaña Atajos se integró ahí.",
        ],
      },
    ],
  },
  {
    version: "0.36.0",
    date: "5 jul 2026",
    headline: "Menos parpadeo, dock más fluido, y grupos mucho más cómodos.",
    sections: [
      {
        icon: "✨",
        title: "Adiós al parpadeo",
        notes: [
          "Corregido el parpadeo del dock: ya no se reprocesaba a sí mismo al reordenar, quitar o agrupar (se ignoraba su propio eco de configuración).",
          "El dock ya no se agranda/achica constantemente: absorbe los pequeños cambios de ancho de los widgets en su colchón en vez de redimensionar la ventana.",
        ],
      },
      {
        icon: "🧩",
        title: "Grupos más cómodos",
        notes: [
          "En cuadros: arrastra un elemento de un grupo a otro para moverlo, fuera para sacarlo, o clic derecho para «sacar» o «eliminar» (se quitó la ×).",
          "Agrupar en el dock es más fácil y rápido: diana más grande y menos espera.",
        ],
      },
      {
        icon: "🖱️",
        title: "Comportamiento",
        notes: [
          "Con el modo «clic», el dock ya no aparece solo al pasar el cursor.",
          "Puedes ajustar el tiempo que tarda en ocultarse tras dejar de usarlo (también en modo inteligente).",
        ],
      },
      {
        icon: "🎯",
        title: "Notch y Ajustes",
        notes: [
          "El glow del notch ya no se recorta (su ventana tiene margen y la sombra está acotada).",
          "El recuadro del menú lateral vuelve a estar bien alineado; «General» es la primera pestaña; hay un correo de contacto.",
        ],
      },
    ],
  },
  {
    version: "0.35.0",
    date: "5 jul 2026",
    headline: "Grupos con arrastrar y soltar, Ajustes más ordenados y direcciones completas.",
    sections: [
      {
        icon: "🟦",
        title: "Grupos en cuadros, arrastrables",
        notes: [
          "En la vista de cuadros, un grupo se abre y sus elementos son cuadros que arrastras: reordénalos, sácalos arrastrándolos fuera del grupo, o añade más — sin tantos botones.",
        ],
      },
      {
        icon: "🧭",
        title: "Ajustes más claros",
        notes: [
          "Nueva pestaña «General»: el idioma (ya no vive en Apariencia), las actualizaciones y la copia de seguridad, todo junto.",
          "El aviso de «Actualización disponible» ahora te lleva directo a General.",
        ],
      },
      {
        icon: "🔑",
        title: "Direcciones completas",
        notes: [
          "Las direcciones de Bitcoin y Solana se muestran completas: tócalas para seleccionarlas y copiarlas a mano, o usa el botón de copiar.",
        ],
      },
      {
        icon: "✂️",
        title: "Menos recortes",
        notes: [
          "El notch ya no se ve «cortado»: su sombra se ajusta a su ventana en vez de derramarse y quedar recortada.",
        ],
      },
    ],
  },
  {
    version: "0.34.0",
    date: "5 jul 2026",
    headline: "Nunca más una pantalla en blanco: skeletons mientras algo carga.",
    sections: [
      {
        icon: "💀",
        title: "Skeletons al cargar",
        notes: [
          "El dock aparece al instante con placeholders que brillan mientras se extraen los iconos, en vez de quedarse en blanco.",
          "Al abrir una carpeta, las celdas salen ya con su nombre y un skeleton, y los iconos se cargan en paralelo (antes iban de uno en uno).",
          "Ajustes muestra un esqueleto de su diseño mientras carga tu configuración.",
        ],
      },
      {
        icon: "⚡",
        title: "Se siente más rápido",
        notes: [
          "La barra ya no espera a que TODOS los iconos estén listos para dibujarse; se ve enseguida y cada icono entra cuando está.",
        ],
      },
    ],
  },
  {
    version: "0.33.0",
    date: "5 jul 2026",
    headline: "Agrupa también los widgets, y «grupo» es «grupo» (no «carpeta»).",
    sections: [
      {
        icon: "🧩",
        title: "Grupos de widgets",
        notes: [
          "Ahora puedes agrupar los widgets de uso del PC (CPU, RAM, disco…) arrastrando uno sobre otro, para no llenar la barra.",
          "El widget se ve en vivo solo cuando abres el grupo; en la barra el grupo es un icono más.",
        ],
      },
      {
        icon: "🏷️",
        title: "Grupo vs. carpeta",
        notes: [
          "Los conjuntos que tú creas se llaman «grupo»; «carpeta» queda para las carpetas reales de Windows. Se aclararon los textos («Editar grupo», «Añadir al grupo», «Sacar del grupo»…).",
        ],
      },
      {
        icon: "🧹",
        title: "Repaso general",
        notes: [
          "Revisión para evitar glitches y parpadeos, incluido dejar de sondear un grupo de widgets en cuanto lo cierras.",
        ],
      },
    ],
  },
  {
    version: "0.32.0",
    date: "5 jul 2026",
    headline: "Sin puntitos raros en la barra, la papelera se ancla bien y una guía al empezar.",
    sections: [
      {
        icon: "✨",
        title: "Detalles de la barra",
        notes: [
          "Se acabaron los «…» (tres puntos) que a veces se quedaban en un widget: ahora los valores se pintan al instante al cargar o reordenar.",
        ],
      },
      {
        icon: "🗑️",
        title: "Anclar la Papelera",
        notes: [
          "Si arrastras la Papelera de reciclaje del escritorio al dock, ahora aparece el tile de papelera de Booki (con su contador y su «vaciar»), en vez de una carpeta rota.",
        ],
      },
      {
        icon: "👋",
        title: "Por dónde empezar",
        notes: [
          "Ajustes muestra una breve introducción la primera vez, con un acceso directo para anclar tus apps.",
        ],
      },
    ],
  },
  {
    version: "0.31.0",
    date: "5 jul 2026",
    headline: "Menos rarezas: sin .png en el escritorio, enlaces sin falsas alarmas y mejores iconos.",
    sections: [
      {
        icon: "🗑️",
        title: "Sacar cosas de una carpeta",
        notes: [
          "Ya no se guarda un .png en el escritorio al arrastrar algo fuera de una carpeta.",
          "Ahora puedes arrastrar un elemento fuera del grupo para desanclarlo (con su animación), igual que desde el dock. La × sigue devolviéndolo al dock.",
        ],
      },
      {
        icon: "🔗",
        title: "Enlaces web",
        notes: [
          "Los enlaces anclados (YouTube y demás) ya no aparecen como «no encontrado»: son páginas, no archivos.",
          "Iconos más nítidos y específicos para algunos sitios (por ejemplo, el sobre de Gmail en vez del icono genérico de Google).",
        ],
      },
      {
        icon: "🖼️",
        title: "Iconos de programas",
        notes: [
          "Mejor extracción del icono de algunos programas (como Discord): si el acceso directo apunta a un lanzador sin icono, se usa el del propio acceso directo en vez de dejar el hueco.",
        ],
      },
    ],
  },
  {
    version: "0.30.0",
    date: "4 jul 2026",
    headline: "Mueve el dock viéndolo, y organiza tus apps a tu manera.",
    sections: [
      {
        icon: "🧲",
        title: "Mover el dock ahora se ve",
        notes: [
          "Arrastra el fondo del dock y aparecen los cuatro puntos de anclaje: el que tienes más cerca se ilumina y una vista previa te muestra dónde va a quedar, en vez de saltar de golpe.",
          "Los anclajes son más flexibles: basta con acercarte a un borde, ya no hay que apuntar exacto.",
        ],
      },
      {
        icon: "📐",
        title: "El dock va en línea con el notch",
        notes: [
          "Si el notch está a la izquierda o la derecha, el dock aparece alineado con él y no centrado.",
        ],
      },
      {
        icon: "🗂️",
        title: "Tus apps, como quieras verlas",
        notes: [
          "Nueva vista en cuadros en Ajustes → Elementos: ves las apps y los grupos de un vistazo, abres un grupo para ver lo que tiene, y sacas o añades cosas fácil.",
          "Arrastra una app encima de otra para agruparlas, también en la vista de cuadros.",
          "Botón «Borrar todo» con confirmación para empezar de cero.",
        ],
      },
    ],
  },
  {
    version: "0.29.0",
    date: "4 jul 2026",
    headline: "Invisible en las capturas de pantalla, y varios detalles más claros.",
    sections: [
      {
        icon: "🕵️",
        title: "No aparece al compartir pantalla",
        notes: [
          "El dock y el notch ya no se ven en Discord, OBS, Teams ni la herramienta de recortes, y no salen en la lista de ventanas para compartir.",
        ],
      },
      {
        icon: "🧩",
        title: "Arrastrar sin agrupar por error",
        notes: [
          "Al reordenar, ahora hay que apuntar al centro justo (y sostener) para agrupar; en cualquier otro sitio solo reordena.",
        ],
      },
      {
        icon: "🔤",
        title: "Más claro",
        notes: [
          "Modos de ocultar renombrados: Nunca · Inteligente · Al salir (del dock).",
          "«Carpeta nueva» ahora se llama «Grupo nuevo».",
          "Al anclar un enlace puedes ponerle un nombre; y si no se encuentra su icono, se ancla igual sin avisar.",
        ],
      },
      {
        icon: "🩹",
        title: "Menos recortes",
        notes: [
          "Los menús y las carpetas se recolocan en cuanto la ventana termina de crecer, para que no se corten.",
        ],
      },
    ],
  },
  {
    version: "0.28.0",
    date: "4 jul 2026",
    headline: "El dock ya no se rompe con muchos elementos, notas que se guardan y varios arreglos.",
    sections: [
      {
        icon: "📏",
        title: "Muchos elementos, sin romperse",
        notes: [
          "El dock nunca crece más allá de la pantalla: los iconos se achican para caber y, si hay demasiados, la barra se desplaza (con la rueda o acercando el cursor a los extremos) para llegar a los de los lados.",
        ],
      },
      {
        icon: "🗒️",
        title: "Notas que funcionan",
        notes: [
          "Haz clic en el widget de notas para escribir; se guarda solo al terminar.",
        ],
      },
      {
        icon: "🧲",
        title: "Mover y ocultar más intuitivo",
        notes: [
          "Arrastra el fondo del dock hacia otro borde para moverlo ahí; hacia su propio borde para esconderlo.",
          "Al abrir otra ventana, el dock ahora sí se aparta (aunque lo hubieras abierto desde el notch).",
        ],
      },
      {
        icon: "🩹",
        title: "Arreglos",
        notes: [
          "Quitar algo directamente del dock ahora también lo quita de la lista en Ajustes.",
          "Los widgets que ya tienes anclados dejan de ofrecerse para añadir (no más CPU repetido).",
        ],
      },
    ],
  },
  {
    version: "0.27.0",
    date: "4 jul 2026",
    headline: "Arreglos importantes: nada de Bookis duplicados, y vaciar la papelera ya no congela.",
    sections: [
      {
        icon: "1️⃣",
        title: "Una sola instancia",
        notes: [
          "Si Booki ya está abierto, volver a lanzarlo (o el inicio con Windows) trae al frente el dock existente en vez de abrir otro duplicado.",
        ],
      },
      {
        icon: "🚀",
        title: "Inicio con Windows más fiable",
        notes: [
          "Si tienes activado «Iniciar con Windows», Booki re-asegura la entrada en cada arranque, así no deja de funcionar tras mover o reinstalar la app.",
          "Recuerda: para que el dock esté siempre visible en el escritorio, elige «Nunca» en Ocultar automáticamente (Comportamiento).",
        ],
      },
      {
        icon: "🗑️",
        title: "Papelera sin congelones",
        notes: [
          "Vaciar la papelera (y borrar arrastrando) ya no bloquea el dock mientras Windows trabaja — se hace en segundo plano.",
          "El contador de la papelera tampoco frena la barra al actualizarse.",
        ],
      },
      {
        icon: "✨",
        title: "Detalle visual",
        notes: [
          "Los bordes del notch cuando el dock está a la izquierda o derecha se ven más limpios.",
        ],
      },
    ],
  },
  {
    version: "0.26.0",
    date: "4 jul 2026",
    headline: "Más fluida — pensada para pantallas de 120/144Hz y más.",
    sections: [
      {
        icon: "⚡",
        title: "Fluidez a alto refresco",
        notes: [
          "El agrandado de iconos ahora sigue el cursor 1:1 en cada frame, sin el retraso que tenía antes: se siente instantáneo y aprovecha 120/144Hz.",
          "Arrastrar iconos (y mover el notch) se sincroniza con el refresco de la pantalla, sin tirones.",
          "Los iconos se preparan en la GPU al pasar el cursor, para un movimiento sin repintados.",
        ],
      },
    ],
  },
  {
    version: "0.25.0",
    date: "4 jul 2026",
    headline: "Más reforzado y auto-recuperable — y arreglado el arrastrar-para-quitar.",
    sections: [
      {
        icon: "🩹",
        title: "Arrastrar fuera para quitar (arreglado)",
        notes: [
          "Sacar un icono de la barra para quitarlo ahora funciona de verdad con el ratón (antes el gesto no llegaba a activarse).",
        ],
      },
      {
        icon: "🛡️",
        title: "A prueba de sustos",
        notes: [
          "Si el archivo de ajustes se dañara, Booki se recupera solo desde una copia de seguridad en vez de perder tus pines.",
          "Cualquier fallo grave queda anotado en un pequeño registro (crash.log) para poder diagnosticarlo.",
          "El dock reintenta arrancar una vez si algo falla al inicio.",
        ],
      },
      {
        icon: "🧰",
        title: "Más fácil de depurar",
        notes: [
          "Nuevo botón en Ayuda y FAQ para abrir la carpeta de datos (ajustes, copias y registros) de un clic.",
          "Los registros ya no crecen sin límite.",
        ],
      },
    ],
  },
  {
    version: "0.24.0",
    date: "4 jul 2026",
    headline: "Nueva sección de Ayuda y transparencia, más un arreglo y una optimización.",
    sections: [
      {
        icon: "❓",
        title: "Ayuda y FAQ",
        notes: [
          "Nueva pestaña en Ajustes con respuestas claras: qué hace Booki, tu privacidad, dónde se guardan tus datos, por qué Windows avisa al instalar y cómo funcionan las actualizaciones.",
          "Incluye enlaces al código, a reportar problemas y a la licencia.",
        ],
      },
      {
        icon: "🛡️",
        title: "Más robusto",
        notes: [
          "Booki ya no se cierra si por algún motivo falta su icono de bandeja al arrancar.",
          "La lista de apps sugeridas se recuerda al cambiar de pestaña, en vez de re-escanear el menú Inicio cada vez.",
        ],
      },
    ],
  },
  {
    version: "0.23.0",
    date: "4 jul 2026",
    headline: "Actualizaciones más fiables y un poquito menos de trabajo de fondo.",
    sections: [
      {
        icon: "⬆️",
        title: "Actualizaciones más fiables",
        notes: [
          "Ahora la actualización automática entrega siempre el instalador que coincide con cómo instalaste Booki, evitando instalaciones duplicadas.",
          "El aviso de nueva versión ya no compite con el arranque: se comprueba unos segundos después de abrir.",
        ],
      },
      {
        icon: "🪶",
        title: "Menos trabajo de fondo",
        notes: [
          "Booki solo vigila si una ventana lo tapa cuando usas el ocultado inteligente; en los demás modos se ahorra ese trabajo.",
        ],
      },
    ],
  },
  {
    version: "0.22.0",
    date: "4 jul 2026",
    headline: "Pequeños arreglos y un poco menos de trabajo en segundo plano.",
    sections: [
      {
        icon: "💬",
        title: "Tooltips que no se cortan",
        notes: [
          "El nombre al pasar el cursor vuelve al estilo del sistema cuando no cabría dentro de la barra (por ejemplo en el dock vertical o con nombres largos), así nunca se ve recortado.",
        ],
      },
      {
        icon: "🎵",
        title: "Carátula al día",
        notes: [
          "Al cambiar a una canción sin carátula ya no se queda la imagen de la anterior.",
        ],
      },
      {
        icon: "🪶",
        title: "Más liviano",
        notes: [
          "Menos trabajo al leer el uso de disco (ya no se re-explora el disco en cada actualización).",
          "Si solo tienes widgets anclados, Booki deja de recorrer todas las ventanas del sistema sin necesidad.",
        ],
      },
    ],
  },
  {
    version: "0.21.0",
    date: "4 jul 2026",
    headline: "Papelera con contador, recientes al alcance y una pasada a fondo de arreglos.",
    sections: [
      {
        icon: "🗑️",
        title: "Papelera más útil",
        notes: [
          "El icono de la papelera ahora muestra cuántos elementos tiene, y puedes vaciarla (con confirmación) desde su clic derecho.",
        ],
      },
      {
        icon: "🕘",
        title: "Recientes a un clic",
        notes: [
          "Clic derecho en una app anclada muestra tus archivos abiertos recientemente para volver a ellos al instante.",
        ],
      },
      {
        icon: "🎯",
        title: "Ir a la ventana abierta",
        notes: [
          "Nueva opción en Comportamiento: al hacer clic en una app que ya está abierta, Booki puede traer su ventana al frente en vez de abrir otra (desactivado por defecto).",
        ],
      },
      {
        icon: "🩹",
        title: "Arreglos y afinado",
        notes: [
          "El dock se recoloca solo al cambiar de resolución, escala o monitor.",
          "Menos consumo en reposo: al esconderse, ya no quedan temporizadores despiertos.",
          "Los iconos que no cargaban a la primera ahora se reintentan en vez de quedarse en blanco.",
          "Separadores con degradado, punto de app en ejecución con brillo del acento y tooltips con el estilo de Booki.",
        ],
      },
    ],
  },
  {
    version: "0.20.0",
    date: "4 jul 2026",
    headline: "Más carácter capibara, y una pasada a fondo de pulido y accesibilidad.",
    sections: [
      {
        icon: "🦫",
        title: "El capibara asoma",
        notes: [
          "Cuando el dock está vacío, ahora te saluda el capibara de Booki para invitarte a anclar tus apps.",
          "También aparece en los estados vacíos de Ajustes, en las novedades y en Acerca de.",
        ],
      },
      {
        icon: "♿",
        title: "Más accesible",
        notes: [
          "Anillos de foco visibles al navegar con el teclado y etiquetas para lectores de pantalla en los controles.",
          "Se respeta a fondo la preferencia de «reducir movimiento» del sistema en todas las animaciones.",
        ],
      },
      {
        icon: "🪶",
        title: "Más ligero y fino",
        notes: [
          "Cada idioma se carga solo cuando lo usas, así el arranque es más rápido.",
          "El agrandado de iconos al pasar el cursor va más suave y consume menos.",
          "Pequeños arreglos: manejo de errores más claro y detalles visuales en el modo oscuro.",
        ],
      },
    ],
  },
  {
    version: "0.19.0",
    date: "3 jul 2026",
    headline: "El notch se controla como quieras, y Booki habla más idiomas.",
    sections: [
      {
        icon: "👆",
        title: "Notch a tu gusto",
        notes: [
          "Nueva opción en Comportamiento: el dock vuelve solo al hacer clic en el notch (por defecto) o también al pasar el cursor.",
          "El área táctil del notch es más pequeña, así ya no tapa cosas detrás de él.",
        ],
      },
      {
        icon: "🌍",
        title: "Más idiomas",
        notes: [
          "Nuevos idiomas: portugués, francés y alemán, además de español e inglés.",
          "El idioma del sistema ahora se detecta mejor (y usa inglés como respaldo en vez de español).",
        ],
      },
      {
        icon: "🩹",
        title: "Detalle",
        notes: [
          "La sombra del dock ya no se recorta en el borde de la ventana.",
        ],
      },
    ],
  },
  {
    version: "0.18.0",
    date: "3 jul 2026",
    headline: "Una tanda de pulido: todo más suave, más fino y más ligero.",
    sections: [
      {
        icon: "🌊",
        title: "Más suave",
        notes: [
          "La carátula se funde al cambiar de canción, los porcentajes (CPU/RAM/volumen) suben con un conteo animado, y anclar o quitar un icono se ve con una animación limpia.",
          "Las pestañas de Ajustes entran con una transición sutil; los iconos se elevan un poquito al pasar el cursor.",
        ],
      },
      {
        icon: "🎯",
        title: "Detalles útiles",
        notes: [
          "Clic central en un icono abre su ubicación en el Explorador; doble clic en un widget salta a su editor.",
          "Ajustes recuerda la última pestaña que estabas viendo.",
          "El puntito de 'app abierta' late suavemente y la sombra del dock se proyecta hacia el lado correcto según el borde.",
        ],
      },
      {
        icon: "🪶",
        title: "Más ligero y limpio",
        notes: [
          "Un solo temporizador para los widgets que se detiene del todo cuando el dock está oculto — menos consumo de batería.",
          "Limpieza interna de código y estilos sin uso.",
        ],
      },
    ],
  },
  {
    version: "0.17.0",
    date: "3 jul 2026",
    headline: "El dock vertical ahora es fino de verdad y el reproductor se siente premium.",
    sections: [
      {
        icon: "📏",
        title: "Dock vertical más fino",
        notes: [
          "En los laterales, el ancho de la barra ahora coincide con el alto que tiene en horizontal: una columna esbelta, no un panel ancho.",
          "Los botones del reproductor ya no se ven apretados: en vertical aparecen al pasar el cursor, en una columna cómoda con animación suave.",
        ],
      },
      {
        icon: "🧲",
        title: "Notch y borde",
        notes: [
          "Confirmado: con el dock abajo o arriba, anclar el notch a la izquierda o derecha mueve el dock a ese lado también.",
        ],
      },
    ],
  },
  {
    version: "0.16.0",
    date: "3 jul 2026",
    headline: "El notch lleva el dock consigo, el reproductor se adapta y la barra ya no salta.",
    sections: [
      {
        icon: "🧲",
        title: "Notch y dock, siempre juntos",
        notes: [
          "Ahora el notch y el dock viven en el mismo borde: al mover el notch (arrastrándolo o desde el control de posición), el dock lo acompaña.",
          "Al cambiar la posición en Ajustes, el dock aparece un momento en su nuevo sitio para que veas el cambio en vivo (antes solo se movía el notch).",
        ],
      },
      {
        icon: "🎚️",
        title: "Widgets y reproductor verticales",
        notes: [
          "Con el dock en un lateral, todas las tarjetas se ordenan en columnas del mismo ancho: la barra queda pareja.",
          "El reproductor muestra carátula, título desplazándose y los botones anterior/pausa/siguiente en su propia fila, sin comprimirse.",
          "Arreglado: la barra ya no cambia de tamaño ni salta cuando llega el título de una canción o cambia un porcentaje.",
        ],
      },
      {
        icon: "🪶",
        title: "Más ligero y accesible",
        notes: [
          "Modo compacto opcional (densidad más apretada para pantallas pequeñas).",
          "Un solo temporizador para todos los widgets: menos consumo y mejor batería.",
          "Etiquetas de los widgets más legibles en tema oscuro.",
        ],
      },
    ],
  },
  {
    version: "0.15.0",
    date: "3 jul 2026",
    headline: "El notch ya no se va al lado equivocado, y el dock vertical se ve parejo.",
    sections: [
      {
        icon: "🎯",
        title: "Posición arreglada",
        notes: [
          "Corregido: al elegir un borde, el dock y el notch a veces se seguían yendo abajo. Ahora el notch acompaña al dock donde lo pongas.",
          "Todo lo de posición vive en un solo control visual: eliges el borde del dock y colocas el notch en la misma mini-pantalla.",
          "Al cambiar de borde, la barra hace una transición suave en vez de saltar de golpe.",
        ],
      },
      {
        icon: "📊",
        title: "Dock vertical y widgets",
        notes: [
          "En los laterales, todas las tarjetas (reloj, CPU, volumen, música…) se compactan en columna del mismo ancho: la barra queda pareja y estrecha.",
          "Nuevo widget de volumen: rueda para subir/bajar, clic para silenciar.",
          "El menú de clic derecho ahora muestra los widgets como una cuadrícula de emojis, mucho más compacta.",
        ],
      },
      {
        icon: "✨",
        title: "Perfiles y detalles",
        notes: [
          "Guarda configuraciones completas como perfiles y cámbialos con un clic; el activo se marca con ✓.",
          "Empuja el cursor contra el borde de la pantalla para sacar el dock oculto (además de la pestañita).",
          "Los iconos rebotan al abrir una app, y la app pesa un poco menos.",
        ],
      },
    ],
  },
  {
    version: "0.14.0",
    date: "2 jul 2026",
    headline: "Todo lo espacial en un solo control, perfiles y un dock más vivo.",
    sections: [
      {
        icon: "🗺️",
        title: "Posición unificada",
        notes: [
          "El borde del dock, la posición del notch y la vista previa ahora son UN solo control en Comportamiento: haz clic en un borde y el dock se muda; toca una pestañita y el notch se coloca ahí.",
          "Con el dock oculto, empuja el cursor contra su borde y sale solo — sin buscar el notch (se puede apagar).",
        ],
      },
      {
        icon: "🎛️",
        title: "Perfiles y volumen",
        notes: [
          "Perfiles del dock: guarda tu configuración completa con un nombre (p. ej. Trabajo / Gaming) y cambia con un clic desde el menú del dock o Ajustes.",
          "Nuevo widget de volumen: rueda del ratón para subir o bajar, clic para silenciar.",
        ],
      },
      {
        icon: "✨",
        title: "Más vivo, más fino",
        notes: [
          "Los iconos rebotan suavemente al lanzar una app, en la dirección del borde.",
          "El aviso de actualización queda centrado sobre la barra, y Booki revisa si hay versión nueva cada pocas horas, no solo al arrancar.",
        ],
      },
    ],
  },
  {
    version: "0.13.0",
    date: "2 jul 2026",
    headline: "Actualizar ya no es a ciegas, y el reproductor se adapta al dock vertical.",
    sections: [
      {
        icon: "🎵",
        title: "Reproductor más fino",
        notes: [
          "Con el dock en un lateral, la tarjeta de música se vuelve vertical: carátula arriba y el título desfilando debajo — ya no estira toda la barra.",
          "Los títulos largos se desplazan suavemente en bucle en vez de cortarse.",
          "Botones de anterior, pausa y siguiente rediseñados: iconos nítidos que cambian según si suena algo.",
        ],
      },
      {
        icon: "⬇️",
        title: "Actualizaciones con cara",
        notes: [
          "Al instalar una actualización ahora se ve cada paso: descarga con porcentaje y un aviso de «instalando, Booki se reabrirá solo» antes de cerrarse.",
          "El botón de novedades del dock abre directo Acerca de con la actualización lista para instalar.",
          "Arreglado: el botón de exportar la configuración no hacía nada.",
        ],
      },
      {
        icon: "📌",
        title: "Notch y bordes, más coherentes",
        notes: [
          "Al cambiar el estilo o la posición del notch en Ajustes, aparece unos segundos para que veas cómo queda.",
          "El dock ya no se esconde hacia abajo cuando está anclado en un costado: la animación y los avisos van al borde correcto.",
          "Mover el dock de borde (arrastrando el notch o tocándolo) vuelve a unir notch y dock en el mismo lado.",
        ],
      },
    ],
  },
  {
    version: "0.12.0",
    date: "2 jul 2026",
    headline: "Más personalidad, más seguro de usar, y el dock ya no recorta nada.",
    sections: [
      {
        icon: "😊",
        title: "Emojis con vida",
        notes: [
          "Los widgets, consejos y avisos estrenan emojis 3D al estilo premium (reloj, cerebro, batería…), incluidos en la app — sin depender de internet.",
          "Los logos de Bitcoin y Solana en las donaciones ahora son los oficiales.",
        ],
      },
      {
        icon: "🛟",
        title: "Sin sustos",
        notes: [
          "«Restablecer» ya no vive al lado de «Salir»: ahora está al final de Acerca de y pide confirmación con un segundo clic.",
          "La sombra del dock y los iconos ampliados ya no se recortan en el borde de la ventana.",
        ],
      },
      {
        icon: "🧭",
        title: "Mejor ordenado",
        notes: [
          "El estilo del notch se elige en Apariencia (es visual); su posición sigue en Comportamiento.",
          "Los botones de acento «Sistema» y «Fondo» ahora se entienden: llevan su nombre.",
          "Si el notch vive en un lateral o arriba, al hacer clic el dock aparece en ese mismo borde (en vertical si toca).",
        ],
      },
    ],
  },
  {
    version: "0.11.0",
    date: "2 jul 2026",
    headline: "El notch se viste como quieras, y todo es más claro desde el primer minuto.",
    sections: [
      {
        icon: "💎",
        title: "Notch a tu gusto",
        notes: [
          "Cinco acabados: Isla, Liquid glass, Mica, Acrylic y estilo Windows — elígelo con miniaturas en Ajustes.",
          "Ahora puede vivir en cualquier borde de la pantalla: toca su sitio en el dibujito (12 posiciones).",
          "Sus curvas ya no se separan en pantallas con escalado (125%, 150%).",
        ],
      },
      {
        icon: "🧭",
        title: "Más claro desde el inicio",
        notes: [
          "Los consejos de bienvenida ya se ven completos, sin texto roto.",
          "Con el dock vacío aparece un botón «+» que abre Ajustes con consejos y sugerencias.",
          "Ajustes reorganizado en secciones (Tema, Iconos, Notch, Sistema…) y el menú lateral ya no duplica el color al cambiar de pestaña.",
        ],
      },
      {
        icon: "🧳",
        title: "Tu configuración viaja bien",
        notes: [
          "Si importas tu configuración en otro PC y un programa vive en otra ruta, Ajustes lo marca con «No encontrado» y te deja reasignar su ubicación en dos clics.",
        ],
      },
      {
        icon: "⌨️",
        title: "Detalles",
        notes: [
          "El modificador de los atajos 1…9 ahora se compone con fichas (Ctrl, Alt, Shift, Win) en la combinación que quieras.",
          "Iconos del dock a 36px por defecto, y el widget de música pasa a llamarse «Media» (es cualquier reproducción).",
          "Nueva sección «Proyecto libre» en Acerca de — Booki es open source hecho con cariño; si quieres apoyar, hay direcciones de donación.",
        ],
      },
    ],
  },
  {
    version: "0.10.0",
    date: "2 jul 2026",
    headline: "Atajos de teclado, mover archivos a carpetas y un arrastre que se siente de verdad.",
    sections: [
      {
        icon: "⌨️",
        title: "Atajos por posición",
        notes: [
          "Alt+1 abre el primer elemento del dock, Alt+2 el segundo… hasta el 9.",
          "Puedes cambiar la tecla (Alt, Ctrl+Alt o Alt+Shift) o apagarlos en Ajustes → Atajos.",
        ],
      },
      {
        icon: "📂",
        title: "Suelta archivos en carpetas",
        notes: [
          "Arrastra un archivo sobre una carpeta del dock y, tras confirmar, se mueve dentro (con Ctrl+Z para deshacer).",
          "Si la sueltas sobre una carpeta de apps, se ancla dentro de ella.",
        ],
      },
      {
        icon: "✋",
        title: "Arrastre de verdad",
        notes: [
          "Al mover un icono del dock ahora lo ves viajar contigo, con los demás haciéndole sitio.",
          "Arrástralo fuera del dock y suéltalo para desanclarlo — desaparece con un plof.",
        ],
      },
    ],
  },
  {
    version: "0.9.1",
    date: "2 jul 2026",
    headline: "Elegir dónde va el notch ahora es tan fácil como tocar una mini pantalla.",
    sections: [
      {
        icon: "🖱️",
        title: "Notch a un clic",
        notes: [
          "La posición del notch se elige ahora en un dibujito de tu pantalla: toca la pestañita izquierda, central o derecha y listo — se acabó adivinar qué significa «inicio» o «final».",
          "El dibujito sigue al borde donde tengas el dock (abajo, arriba o a los lados).",
        ],
      },
      {
        icon: "🧹",
        title: "Pulido",
        notes: [
          "Los consejos de bienvenida ya no pueden aparecer con el dock escondido.",
          "El menú «Más opciones» de Ajustes se cierra al hacer clic fuera.",
        ],
      },
    ],
  },
  {
    version: "0.9.0",
    date: "2 jul 2026",
    headline: "La música toma el control, y el dock obedece cuando lo escondes.",
    sections: [
      {
        icon: "🎵",
        title: "Música completa",
        notes: [
          "Pasa el cursor por la tarjeta de música y aparecen los controles: anterior, pausa/reproducir y siguiente.",
          "La carátula ahora también llega desde el navegador (YouTube incluido).",
        ],
      },
      {
        icon: "🤚",
        title: "Esconder es esconder",
        notes: [
          "Si arrastras el dock hacia el borde para esconderlo, se queda escondido: solo vuelve con el notch o al cambiar de app.",
          "Abrir una carpeta ya no muestra ese medio segundo de panel recortado.",
        ],
      },
      {
        icon: "🧰",
        title: "Ajustes más limpios",
        notes: [
          "Las opciones de añadir (carpeta, separador, papelera…) ahora viven en un menú «Más opciones» junto a «Añadir app».",
          "El logotipo real de Booki, con su letra original, aparece en Ajustes.",
        ],
      },
    ],
  },
  {
    version: "0.8.3",
    date: "2 jul 2026",
    headline: "El dock ya no se corta al crecer, y un repaso de seguridad a fondo.",
    sections: [
      {
        icon: "📐",
        title: "Ancho siempre correcto",
        notes: [
          "Añadir widgets (como la música) o más elementos ya no corta la barra: la ventana se ajusta sola cuando el contenido cambia de tamaño.",
          "Los títulos de canciones largos se recortan con puntos suspensivos en vez de estirar la tarjeta.",
        ],
      },
      {
        icon: "🔒",
        title: "Más seguro",
        notes: [
          "Blindaje interno: los nombres de archivo raros ya no pueden interferir con el dock, y abrir apps y enlaces usa la vía más segura de Windows.",
          "Recordatorio: Booki funciona sin conexión, sin telemetría y guarda todo localmente.",
        ],
      },
      {
        icon: "🛠️",
        title: "Arreglos",
        notes: [
          "El botón «Ver novedades» de Acerca de vuelve a verse y funcionar bien.",
        ],
      },
    ],
  },
  {
    version: "0.8.2",
    date: "2 jul 2026",
    headline: "Todo más fluido: menos parpadeos, fotos con miniatura y sugerencias ordenadas.",
    sections: [
      {
        icon: "⚡",
        title: "Más fluido",
        notes: [
          "El menú del clic derecho y los avisos aparecen ya colocados, sin saltos ni parpadeos.",
          "Los iconos del dock cargan todos a la vez, sin ir apareciendo uno a uno.",
          "Mover un ajuste ya no hace parpadear la barra: solo se redibuja lo que cambió.",
        ],
      },
      {
        icon: "🖼️",
        title: "Fotos con su miniatura",
        notes: [
          "Si anclas una imagen al dock, su icono es la propia foto — también en la lista de Ajustes.",
        ],
      },
      {
        icon: "🗂️",
        title: "Sugerencias mejor ordenadas",
        notes: [
          "Los grupos de programas salen contraídos, con su contador; ábrelos con un clic.",
          "Las apps sueltas se juntan en un solo grupo y todo va en orden alfabético.",
        ],
      },
    ],
  },
  {
    version: "0.8.1",
    date: "2 jul 2026",
    headline: "Pulido general: nada se corta, y el notch estrena su mejor look.",
    sections: [
      {
        icon: "🧼",
        title: "Sin recortes",
        notes: [
          "El menú del clic derecho y los avisos del dock (confirmar borrado, consejos de bienvenida) ahora aparecen junto a la barra, completos y sin tapar tus iconos.",
          "La ventana de Ajustes se adapta a cualquier tamaño: en ventanas estrechas los controles bajan debajo de su etiqueta en vez de cortarse.",
        ],
      },
      {
        icon: "💎",
        title: "Notch estilo iPhone",
        notes: [
          "Más fino, de vidrio oscuro con brillo, y con las curvas de unión a la barra de tareas — como el notch clásico del iPhone, pero boca arriba.",
          "Al pasar el cursor se enciende un halo con tu color de acento.",
        ],
      },
      {
        icon: "⚙️",
        title: "Actualizaciones más agradables",
        notes: [
          "Al actualizar desde la app ahora ves una barra de progreso del instalador en vez de una espera a ciegas.",
        ],
      },
    ],
  },
  {
    version: "0.8.0",
    date: "2 jul 2026",
    headline: "Ya puedes arrastrar cosas a la papelera, y la música llega al dock.",
    sections: [
      {
        icon: "🗑️",
        title: "Papelera",
        notes: [
          "Arrastra archivos, accesos o carpetas a la papelera del dock y confirma para borrarlos. Ahora funciona siempre.",
          "El dock se queda abierto mientras arrastras algo, para que llegues sin prisa.",
        ],
      },
      {
        icon: "🎵",
        title: "Música en el dock",
        notes: [
          "Nueva tarjeta de música con la carátula, el título y el artista de lo que está sonando.",
          "Un clic en la tarjeta pausa o reanuda.",
        ],
      },
      {
        icon: "🧞",
        title: "Se esconde con estilo",
        notes: [
          "Al ocultarse, el dock se desliza hacia el notch con un efecto tipo genio.",
          "Nuevo gesto: mantén pulsado el fondo del dock y arrástralo hacia el borde para esconderlo.",
        ],
      },
      {
        icon: "🎨",
        title: "Tema y color",
        notes: [
          "Tema «Auto»: claro de día, oscuro de noche.",
          "Toma el color de acento directamente de tu fondo de pantalla con un clic.",
        ],
      },
      {
        icon: "🔎",
        title: "Más fácil de usar",
        notes: [
          "Busca cualquier ajuste desde el menú lateral y salta directo a él.",
          "Al abrir Booki por primera vez, tres consejos rápidos te enseñan lo esencial.",
          "El notch estrena un look más fino y elegante.",
        ],
      },
    ],
  },
  {
    version: "0.7.1",
    date: "2 jul 2026",
    headline: "Se acabó la ventana blanca, y las carpetas estrenan interior.",
    sections: [
      {
        icon: "🛠️",
        title: "Arreglado a fondo",
        notes: [
          "Abrir Ajustes o las novedades ya no puede congelar la app (era un bloqueo interno al crear la ventana; eliminado de raíz).",
          "El notch ya no se dibuja por encima de la barra de tareas: queda pegado a ella, como una pestañita.",
          "Ahora puedes arrastrar archivos a la papelera aunque el dock esté escondido: acerca el arrastre al notch y el dock aparece solo.",
        ],
      },
      {
        icon: "🗂️",
        title: "Carpetas renovadas por dentro",
        notes: [
          "Cabecera clara con icono, nombre editable y botón de cerrar.",
          "Se quitó el botón de desagrupar que confundía (sigue en el clic derecho).",
          "Celdas más grandes y limpias; sacar un elemento aparece solo al pasar el cursor.",
        ],
      },
      {
        icon: "🛡️",
        title: "Papelera más honesta",
        notes: [
          "El aviso siempre aclara que todo va a la Papelera de reciclaje (recuperable).",
          "Si Windows Defender bloquea un borrado, Booki te lo explica y te dice cómo permitirlo — es una falsa alarma, no un virus.",
        ],
      },
      {
        icon: "✨",
        title: "Ajustes más intuitivos",
        notes: [
          "Iconos en el menú lateral y botón «Ver novedades» en Acerca de.",
        ],
      },
    ],
  },
  {
    version: "0.7.0",
    date: "1 jul 2026",
    headline: "Llega la papelera al dock: arrastra, confirma y fuera.",
    sections: [
      {
        icon: "🗑️",
        title: "Papelera en el dock",
        notes: [
          "Añádela desde Ajustes → Elementos y arrastra archivos, accesos o carpetas encima para borrarlos.",
          "Booki siempre pregunta antes; todo va a la Papelera de reciclaje (nada se borra para siempre).",
          "El icono se tiñe cuando la papelera tiene cosas; clic la abre y con clic derecho puedes vaciarla.",
        ],
      },
      {
        icon: "✨",
        title: "Pulido",
        notes: [
          "Pequeños retoques visuales y de interacción por todo el dock.",
        ],
      },
    ],
  },
  {
    version: "0.6.1",
    date: "1 jul 2026",
    headline: "Adiós a la ventana blanca, y el notch por fin se siente parte de la barra de tareas.",
    sections: [
      {
        icon: "🛠️",
        title: "Arreglado de verdad",
        notes: [
          "Abrir las novedades ya no deja Ajustes en blanco ni cuelga la app.",
          "«Iniciar con Windows» ahora sí inicia con Windows: se escribe directo en el arranque del sistema y el interruptor refleja el estado real.",
          "El notch ya no se recorta al crecer cuando pasas el cursor.",
        ],
      },
      {
        icon: "📌",
        title: "Notch integrado",
        notes: [
          "En modo sutil, el notch asoma desde detrás de la barra de tareas como una pestañita, con las esquinas hacia afuera redondeadas — como si fuera parte de la barra.",
        ],
      },
    ],
  },
  {
    version: "0.6.0",
    date: "29 jun 2026",
    headline: "Booki se aparta solo cuando juegas o ves una peli, y el notch ya no estorba.",
    sections: [
      {
        icon: "🎬",
        title: "Consciente de pantalla completa",
        notes: [
          "Detecta juegos, películas y presentaciones a pantalla completa y se oculta del todo (sin tapar subtítulos ni el juego).",
          "Te avisa con una pastilla discreta y reaparece al salir.",
        ],
      },
      {
        icon: "📍",
        title: "Notch a tu medida",
        notes: [
          "Elige su posición (centro/izquierda/derecha) para que no tape un chat o los subtítulos.",
          "Estilo 'sutil' que asoma como una pestañita desde el borde.",
        ],
      },
      {
        icon: "✨",
        title: "Detalles",
        notes: [
          "Los iconos de una carpeta entran escalonados al abrirla; pequeñas mejoras de movimiento.",
        ],
      },
    ],
  },
  {
    version: "0.5.2",
    date: "29 jun 2026",
    headline: "Las novedades ahora viven dentro de Ajustes (adiós a la ventana que se rompía).",
    sections: [
      {
        icon: "🛠️",
        title: "Arreglado",
        notes: [
          "La ventana de Novedades ya no se queda en blanco ni cuelga la app: ahora se muestra dentro de Ajustes.",
          "Abrir una app o un enlace ya no hace parpadear una ventana negra de consola.",
          "El dock ya no se rompe al abrir una carpeta.",
        ],
      },
      {
        icon: "🗂️",
        title: "Editar carpetas, renovado",
        notes: [
          "Botones con iconos claros y carpetas con su propio icono.",
          "Arrastra los elementos dentro de una carpeta para reordenarlos.",
          "Añade, saca o quita programas de una carpeta con un clic.",
        ],
      },
    ],
  },
  {
    version: "0.5.0",
    date: "29 jun 2026",
    headline: "Widgets con personalidad, carpetas más vivas y arrastrar y soltar de verdad.",
    sections: [
      {
        icon: "🎴",
        title: "Arrastrar y soltar por todos lados",
        notes: [
          "Suelta un archivo o imagen encima de un icono del dock para abrirlo con esa app.",
          "En Ajustes, arrastra una app encima de otra para crear una carpeta.",
          "Reordena widgets arrastrándolos.",
        ],
      },
      {
        icon: "🧩",
        title: "Más widgets",
        notes: [
          "Batería (con aviso de carga) y notas rápidas que se quedan a mano.",
          "Pasa la rueda del ratón por encima de un widget para cambiar su estilo al vuelo.",
        ],
      },
      {
        icon: "🎨",
        title: "Temas y respaldos",
        notes: [
          "Presets de tema de un clic (acento + claro/oscuro).",
          "Exporta e importa toda tu configuración.",
        ],
      },
    ],
  },
  {
    version: "0.4.0",
    date: "28 jun 2026",
    headline: "Tarjetas de widgets al estilo macOS y un instalador más bonito.",
    sections: [
      {
        icon: "📊",
        title: "Widgets del sistema",
        notes: ["Reloj, CPU, memoria, disco, red y tiempo activo como tarjetas en vivo dentro del dock."],
      },
      {
        icon: "🌐",
        title: "Sitios web anclados",
        notes: ["Pega un enlace y se ancla con su favicon como icono."],
      },
    ],
  },
];
