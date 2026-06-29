/* Booki — "What's new" notes. Human-written; newest version first. Shown inside
   the Settings window (a modal) the first time you open the app after updating. */

export const CHANGELOG = [
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
