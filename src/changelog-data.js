/* Booki — "What's new" notes. Human-written; newest version first. Shown inside
   the Settings window (a modal) the first time you open the app after updating. */

export const CHANGELOG = [
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
