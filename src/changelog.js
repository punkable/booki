/* Booki — "What's new" window. A friendly, human changelog shown the first time
   you open the app after an update. Newest version first. */

import { closeSelf, dock as dockApi } from "./api.js";
import { applyTheme } from "./theme.js";

// Human-written notes. Keep it warm and concrete — what changed and why you care.
const CHANGELOG = [
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
          "En Ajustes, arrastra una app encima de otra para crear una carpeta, igual que en el dock.",
          "Reordena widgets arrastrándolos, con la misma animación suave de siempre.",
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
        icon: "🗂️",
        title: "Apps y carpetas más listas",
        notes: [
          "Cada app guarda sus archivos recientes: clic derecho para volver a abrirlos.",
          "Punto indicador cuando una app está abierta; clic para traerla al frente.",
          "Doble clic en el fondo del dock abre Ajustes al instante.",
        ],
      },
      {
        icon: "🎨",
        title: "Temas y respaldos",
        notes: [
          "Presets de tema de un clic (acento + claro/oscuro).",
          "Exporta e importa toda tu configuración para llevarla a otro equipo.",
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
  {
    version: "0.3.0",
    date: "28 jun 2026",
    headline: "Un dock nativo de Windows 11 que se aparta cuando estorba.",
    sections: [
      {
        icon: "✨",
        title: "Look y comportamiento",
        notes: [
          "Superficie acrílica con redondez ajustable y un notch fiable para mostrar/ocultar.",
          "Carpetas estilo iOS: arrastra un icono sobre otro para agruparlos.",
        ],
      },
    ],
  },
];

const app = document.documentElement;
applyTheme({ theme: "system" });

const list = document.getElementById("cl-list");
const sub = document.getElementById("cl-sub");
if (CHANGELOG[0]) sub.textContent = `Versión ${CHANGELOG[0].version} · ${CHANGELOG[0].date}`;

CHANGELOG.forEach((entry, idx) => {
  const card = document.createElement("section");
  card.className = "cl-entry" + (idx === 0 ? " latest" : "");

  const head = document.createElement("div");
  head.className = "cl-entry-head";
  head.innerHTML =
    `<span class="cl-ver">v${entry.version}</span>` +
    (idx === 0 ? `<span class="cl-new">Nuevo</span>` : "") +
    `<span class="cl-date">${entry.date}</span>`;
  card.appendChild(head);

  if (entry.headline) {
    const h = document.createElement("p");
    h.className = "cl-headline";
    h.textContent = entry.headline;
    card.appendChild(h);
  }

  for (const sec of entry.sections) {
    const block = document.createElement("div");
    block.className = "cl-section";
    block.innerHTML = `<h3 class="cl-section-title"><span class="cl-ico">${sec.icon}</span>${sec.title}</h3>`;
    const ul = document.createElement("ul");
    ul.className = "cl-notes";
    for (const n of sec.notes) {
      const li = document.createElement("li");
      li.textContent = n;
      ul.appendChild(li);
    }
    block.appendChild(ul);
    card.appendChild(block);
  }
  list.appendChild(card);
});

document.getElementById("cl-close").addEventListener("click", () => closeSelf());
window.addEventListener("keydown", (e) => e.key === "Escape" && closeSelf());
// Keep an unused import referenced (tree-shake friendliness / future use).
void dockApi;
