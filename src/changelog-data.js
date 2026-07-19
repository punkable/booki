/* Booki — "What's new" notes. Human-written; newest version first. Shown inside
   the Settings window (a modal) the first time you open the app after updating. */

export const CHANGELOG = [
  {
    version: "0.57.1",
    date: "19 jul 2026",
    headline: "Grupos del dock más claros: abrir, fusionar, indicadores y confirmación al quitar.",
    sections: [
      {
        icon: "undo",
        title: "Grupos que se entienden",
        notes: [
          "Abrir desde el menú contextual siempre revela el grupo (no lo cierra si ya estaba abierto).",
          "Cambiar de grupo con un clic; renombrar con Enter/Esc; sacar un hijo al dock sin borrarlo.",
          "Indicador de apps en ejecución también en grupos y en el flyout; confirmación al quitar un grupo con contenido.",
        ],
      },
      {
        icon: "performance",
        title: "Misma lógica en dock, Ajustes y backend",
        notes: [
          "Helpers compartidos para fusionar/normalizar grupos; carpetas se anclan como folder (no como app).",
          "Ajustes puede crear un grupo vacío y rellenarlo; el dock disuelve grupos de 0–1 hijos al guardar.",
          "Notch y vista previa de Apariencia usan el mismo material que el dock.",
        ],
      },
    ],
  },
  {
    version: "0.57.0",
    date: "19 jul 2026",
    headline: "Superficie unificada dock+notch, materiales Windows y Apariencia más clara.",
    sections: [
      {
        icon: "undo",
        title: "Un material para dock y notch",
        notes: [
          "Mica, Acrylic, Tintado y Sólido aplican al dock y al notch a la vez — misma pieza, distinta forma.",
          "Corregido el tamaño del notch: el slider 70%–150% ya escala la pastilla de verdad.",
          "Apariencia compacta: tema + acentos pequeños, sin tarjetas de presets redundantes.",
        ],
      },
      {
        icon: "performance",
        title: "Motion y detalle",
        notes: [
          "Entradas más naturales (sin scale desde cero), ease-out más crisp y feedback al pulsar.",
          "Guardado inmediato al cambiar notch/superficie para que la vista previa no use config vieja.",
        ],
      },
    ],
  },
  {
    version: "0.56.1",
    date: "19 jul 2026",
    headline: "Ajustes reordenados, tamaño del notch, limpieza técnica (release artifacts).",
    sections: [
      {
        icon: "undo",
        title: "Ajustes más claros",
        notes: [
          "Apariencia: tema, dock look, y aspecto del notch (estilo, tamaño, peek).",
          "Comportamiento: dock (posición, ocultar), notch (revelar, siempre visible), multi-notch e interacción (magnify, etiquetas).",
          "Nuevo control: tamaño del notch del 70% al 150%.",
        ],
      },
      {
        icon: "performance",
        title: "Código más sano",
        notes: [
          "Metadata de widgets compartida; check:icons en CI; Fluent en chunk aparte.",
          "Drag de Apps con RAF y guardado al soltar; acciones de flyout/clipboard visibles con focus.",
        ],
      },
    ],
  },
  {
    version: "0.55.1",
    date: "18 jul 2026",
    headline: "Limpieza premium: glifos, rendimiento del magnify y menos ruido.",
    sections: [
      {
        icon: "performance",
        title: "Magnify más ligero",
        notes: [
          "El MutationObserver de hit-rects ignora transform/z-index durante mag-live, así el hover no dispara layout/IPC por frame.",
          "Se eliminaron emitConfigChanged duplicados tras persist() y polls redundantes en boot/reload.",
        ],
      },
      {
        icon: "undo",
        title: "Glifos y sistema de iconos",
        notes: [
          "Nuevos iconos: sol, luna, reloj, alerta, zap; warn en iconos desconocidos.",
          "Botones ×, avisos de pin faltante, tema claro/oscuro y portapapeles privado usan el set de iconos (lock/eye-off).",
          "Emojis con onerror seguro; donaciones usan assets/brand en vez de SVG inline duplicado.",
        ],
      },
      {
        icon: "search",
        title: "Basura retirada",
        notes: [
          "Eliminado el workflow WinUI 3 que apuntaba a código ya borrado.",
          "Docs WINUI3 actualizadas; alias de búsqueda de backup corregido.",
        ],
      },
    ],
  },
  {
    version: "0.55.0",
    date: "18 jul 2026",
    headline: "Dock premium tipo Cool Dock: ola de magnificación, cristal más limpio y presets de estilo.",
    sections: [
      {
        icon: "performance",
        title: "Magnificación con ola",
        notes: [
          "Los iconos ya no solo crecen: se empujan a lo largo de la barra para hacer sitio, con lift y z-index como en el dock de macOS.",
          "Los widgets responden al hover con un lift suave propio, sin romper el layout de las tarjetas.",
        ],
      },
      {
        icon: "undo",
        title: "Cristal y flyouts más premium",
        notes: [
          "El dock gana un sheen de estante, profundidad de contacto en iconos y un material un poco más saturado.",
          "Las carpetas/flyouts abren desde el icono que los disparó, con blur-to-sharp y stagger más corto.",
        ],
      },
      {
        icon: "search",
        title: "Usabilidad y presets",
        notes: [
          "Nuevo preset Apariencia -> Estilo del dock: Cristal premium, Clásico y Compacto.",
          "Corregido 'Mostrar nombres al pasar el cursor' (las etiquetas estilizadas vuelven a verse).",
          "En modo overflow la rueda siempre desplaza el dock; Alt+rueda conserva los gestos de widgets.",
          "Hover del notch ahora sincroniza el estado del frontend (soft-reveal) sin robar el foco.",
          "Arrastrar el notch en bordes laterales usa el tamaño real de la ventana, no 184x26 fijo.",
        ],
      },
    ],
  },
  {
    version: "0.54.3",
    date: "13 jul 2026",
    headline: "Notch siempre al frente, transición fluida y watcher más ligero.",
    sections: [
      {
        icon: "performance",
        title: "El notch no se pierde entre ventanas",
        notes: [
          "El notch se re-asegura como topmost cada vez que aparece y cada pocos segundos mientras está visible.",
          "Tanto en modo inteligente como en multinotch, la pestaña/punto prevalece sobre otras ventanas abiertas.",
        ],
      },
      {
        icon: "undo",
        title: "Transformación notch ↔ punto más fluida",
        notes: [
          "La pastilla ahora muta de ancho a círculo con una transición orgánica tipo agua (overshoot sutil, sin parpadeos).",
          "Se redujo el trabajo del watcher de multinotch: solo consulta el ejecutable de la ventana activa cuando el foco cambia o se recarga la config.",
        ],
      },
      {
        icon: "search",
        title: "Sugerencias más claras",
        notes: [
          "Añadida una pista en Multi-notch que explica que las sugerencias son presets, no apps detectadas automáticamente.",
          "Traducciones completas en inglés, español, francés, alemán y portugués.",
        ],
      },
    ],
  },
  {
    version: "0.54.2",
    date: "13 jul 2026",
    headline: "Multi-notch inteligente: el notch muta a un punto en apps de productividad.",
    sections: [
      {
        icon: "performance",
        title: "Notch que se adapta a la app activa",
        notes: [
          "Nueva opcion en Comportamiento -> Notch: Multi-notch inteligente.",
          "En apps de productividad (navegadores, editores, diseno, codigo) el notch se convierte en un punto discreto.",
          "En apps normales o juegos el notch conserva su forma habitual.",
          "El backend detecta la app en primer plano y notifica al notch cada 300 ms.",
        ],
      },
      {
        icon: "search",
        title: "Lista y sugerencias de apps",
        notes: [
          "Puedes añadir o quitar manualmente los ejecutables que activan el modo punto.",
          "Sugerencias por categoria: navegadores, diseno, edicion, desarrollo y productividad.",
          "Opcion para que Booki sugiera automaticamente apps de productividad conocidas.",
        ],
      },
    ],
  },
  {
    version: "0.54.1",
    date: "13 jul 2026",
    headline: "Dock siempre visible: control de 'flotar por encima' y re-assert de topmost.",
    sections: [
      {
        icon: "performance",
        title: "No pierdas el dock detras de otras apps",
        notes: [
          "Ajustes -> Comportamiento ahora expone 'Flotar por encima de otras ventanas' (alwaysOnTop).",
          "El backend re-asserta el estado topmost del dock cada pocos segundos para que apps que crean ventanas topmost no lo tapen.",
          "Si el dock se esconde, revisa Comportamiento -> Ocultar automaticamente: 'Nunca' lo mantiene siempre visible.",
        ],
      },
    ],
  },
  {
    version: "0.54.0",
    date: "13 jul 2026",
    headline: "Integracion con Fluent UI, Apps ancladas mas inteligentes y ajustes mejor ordenados.",
    sections: [
      {
        icon: "performance",
        title: "Fluent UI en Ajustes",
        notes: [
          "Los toggles, sliders, botones y dropdowns ahora usan componentes reales de @fluentui/react-components.",
          "FluentProvider sincroniza el color de acento y el modo claro/oscuro con el tema de Booki.",
          "Las tarjetas de ajustes usan Fluent Card manteniendo la elevacion y estilo de Booki.",
        ],
      },
      {
        icon: "undo",
        title: "Apps ancladas mas inteligentes",
        notes: [
          "El menu superior de Apps ancladas se adapta a ventanas pequenas sin romper ni desbordarse.",
          "Las acciones principales y secundarias se colapsan con logica responsive: Add app primero, el resto agrupado.",
          "El menu 'Mas' ahora usa Fluent Menu con posicionamiento automatico y atajos de teclado nativos.",
        ],
      },
      {
        icon: "search",
        title: "Ajustes mas claros",
        notes: [
          "La pestana General ahora agrupa idioma con Sistema, reduciendo el numero de secciones.",
          "Se simplifico la jerarquia para que cualquier usuario encuentre las opciones sin sobrecarga.",
        ],
      },
    ],
  },
  {
    version: "0.53.0",
    date: "13 jul 2026",
    headline: "Clicks confiables, transicion dock-notch mas fluida y look mas nativo de Windows.",
    sections: [
      {
        icon: "performance",
        title: "Clicks que si responden",
        notes: [
          "Durante el revelado del dock la ventana se mantiene completamente interactiva por 500 ms, evitando que el watcher de cursor la vuelva click-through antes de que los hit rects esten actualizados.",
          "Esto arregla los casos en los que hacias clic en el dock o un icono y no pasaba nada.",
        ],
      },
      {
        icon: "undo",
        title: "Transicion dock ↔ notch",
        notes: [
          "El notch ahora entra con una animacion de escala cada vez que aparece, como si el dock se colapsara en la pestana y esta se expandiera.",
          "La animacion respeta prefers-reduced-motion.",
        ],
      },
      {
        icon: "search",
        title: "Look mas WinUI / Windows 11",
        notes: [
          "El dock recupera su sombra exterior direccional (antes solo tenia variables sin usar).",
          "Las tarjetas de Ajustes tienen elevacion con sombra en dos niveles y hover sutil.",
          "Botones primarios tienen relieve, sombra y estado activo con escala.",
          "Toggles estan mas alineados con el estilo de Windows 11: borde, sombra interior y thumb con relieve.",
          "Tiles del dock tienen hover mas suave con tinte de acento y feedback al clic.",
          "La busqueda de Ajustes resalta con anillo de foco al estilo Fluent.",
        ],
      },
    ],
  },
  {
    version: "0.52.0",
    date: "13 jul 2026",
    headline: "Revision completa: iconos del changelog, animacion de inicio y robustez del dock.",
    sections: [
      {
        icon: "search",
        title: "Changelog legible",
        notes: [
          "Los iconos del changelog ahora se renderizan correctamente tanto los SVG de Fluent como los emojis de versiones anteriores.",
          "Ya no aparecen codigos raros ni el icono de informacion generico en todas las entradas.",
        ],
      },
      {
        icon: "undo",
        title: "Dock mas robusto",
        notes: [
          "Al editar una nota, el guardado espera a completarse antes de cerrar el editor: no se pierde texto si el dock se oculta rapido.",
          "Mover el dock a otro borde ahora persiste la configuracion inmediatamente.",
          "La animacion de inicio solo se ejecuta una vez; cambiar de borde despues ya no la repite.",
        ],
      },
      {
        icon: "performance",
        title: "Menos bloqueos y referencias seguras",
        notes: [
          "Los comandos de listar carpetas y descargar favicons son ahora asincronos en el backend, asi no congelan el hilo principal.",
          "El cambio de idioma carga el diccionario antes de aplicarlo, evitando textos en blanco.",
          "Las referencias a widgets ya no usan indices como respaldo, previniendo cambios en el widget equivocado.",
        ],
      },
    ],
  },
  {
    version: "0.50.4",
    date: "12 jul 2026",
    headline: "Dock mas estable, menus completos y Apps ancladas mas compactas.",
    sections: [
      {
        icon: "performance",
        title: "Comportamiento predecible",
        notes: [
          "Las revelaciones automaticas ya no roban el foco de la ventana en la que estas trabajando.",
          "La opcion Flotar por encima vuelve a respetar su estado en lugar de permanecer forzada.",
        ],
      },
      {
        icon: "undo",
        title: "Menus sin recortes",
        notes: [
          "Los menus del dock disponen de mas espacio y se limitan correctamente en ambos ejes.",
          "Mas opciones se monta fuera de las secciones de Ajustes y elige automaticamente si debe abrir arriba o abajo.",
        ],
      },
      {
        icon: "search",
        title: "Apps ancladas ordenadas",
        notes: [
          "La barra de acciones, las filas y la cuadricula ocupan menos alto sin perder controles.",
          "La distribucion responsive mantiene las acciones principales en una linea incluso a 320 px.",
        ],
      },
    ],
  },
  {
    version: "0.50.3",
    date: "12 jul 2026",
    headline: "Booki se siente mas cercano a Windows y se adapta mejor a ventanas estrechas.",
    sections: [
      {
        icon: "search",
        title: "Ajustes mas nativos",
        notes: [
          "La ventana de ajustes usa una jerarquia tipo NavigationView, con contenido mas estable y menos capas decorativas.",
          "La bienvenida y los controles conservan una lectura comoda incluso a 320 px de ancho.",
        ],
      },
      {
        icon: "performance",
        title: "Fluent y movimiento",
        notes: [
          "Las novedades usan iconos SVG oficiales de Fluent System Icons en lugar de codigos Unicode visibles.",
          "La navegacion responde en 180 ms y evita desplazamientos decorativos en acciones frecuentes.",
        ],
      },
      {
        icon: "undo",
        title: "Instalacion Windows",
        notes: [
          "La publicacion incluye el instalador normal NSIS y un paquete MSI para entornos administrados.",
          "El instalador comprueba WebView2, bloquea retrocesos de version y la publicacion valida sus archivos antes de cerrar el release.",
        ],
      },
    ],
  },
  {
    version: "0.50.2",
    date: "10 jul 2026",
    headline: "Ajustes mas claros, mejor recuperacion y menos trabajo en segundo plano.",
    sections: [
      {
        icon: "search",
        title: "Busqueda y guardado",
        notes: [
          "La busqueda de ajustes anuncia correctamente sus resultados y conserva el foco al navegar con teclado.",
          "Ahora puedes ver cuando los cambios se estan guardando, cuando ya quedaron guardados y si ocurrio un error.",
          "La lista de apps instaladas se puede actualizar sin cerrar Settings.",
        ],
      },
      {
        icon: "undo",
        title: "Edicion mas segura",
        notes: [
          "Quitar un elemento del dock muestra una accion breve para deshacerlo.",
          "Los menus de acciones y el undo respetan los limites de la ventana y el modo de transparencia reducida.",
        ],
      },
      {
        icon: "performance",
        title: "Menos trabajo en reposo",
        notes: [
          "El reporte de hitboxes se repara por cambios reales y usa una comprobacion de seguridad mas espaciada.",
          "El portapapeles solo se consulta cuando la funcion esta activa y el cursor usa una cadencia mas ligera fuera del dock.",
        ],
      },
    ],
  },
  {
    version: "0.50.1",
    date: "9 jul 2026",
    headline: "Dock y ajustes mas claros, rapidos y comodos.",
    sections: [
      {
        icon: "search",
        title: "Ajustes faciles de encontrar",
        notes: [
          "La busqueda entiende terminos relacionados, ordena los resultados por relevancia y se puede recorrer con el teclado.",
          "Los resultados, submenus y menus de acciones se mantienen dentro de la ventana y se desplazan cuando hace falta.",
        ],
      },
      {
        icon: "performance",
        title: "Dock mas directo",
        notes: [
          "Abrir una app ya no espera un rebote: la accion sale inmediatamente.",
          "Los indicadores de apps activas y avisos permanecen visibles sin llamar la atencion de forma continua.",
        ],
      },
      {
        icon: "performance",
        title: "Movimiento con proposito",
        notes: [
          "Anclar o quitar elementos usa una transicion breve y estable; el notch termina su cambio de borde con mayor rapidez.",
          "Los ajustes no se animan al cambiar de seccion, para que el uso con mouse y teclado se sienta inmediato.",
        ],
      },
    ],
  },
  {
    version: "0.50.0",
    date: "9 jul 2026",
    headline: "Gran pulido de diseño: movimiento más fluido, más accesibilidad y detalles al estilo Apple.",
    sections: [
      {
        icon: "\u{2728}",
        title: "Movimiento más fluido",
        notes: [
          "El dock oculto ahora aparece al instante y desacelera al llegar, en vez de arrancar lento.",
          "Menús, toasts y paneles entran con una curva limpia; el rebote queda solo para momentos físicos como soltar archivos en la papelera.",
          "El texto largo de widgets hace una pausa legible en cada vuelta del marquee, y las barras de progreso avanzan de forma constante.",
        ],
      },
      {
        icon: "\u{267F}",
        title: "Accesibilidad",
        notes: [
          "Si Windows pide reducir transparencia, todas las superficies de vidrio se vuelven sólidas; con contraste alto, ganan bordes definidos.",
          "Con movimiento reducido, los textos largos se recortan con puntos suspensivos en vez de quedar cortados.",
          "Los diálogos de Ajustes atrapan el foco del teclado: Tab ya no se escapa detrás de la ventana.",
        ],
      },
      {
        icon: "\u{1F9ED}",
        title: "Más intuitivo",
        notes: [
          "El menú contextual crece desde el punto donde hiciste clic, y las confirmaciones del dock se anclan a la barra sin salirse de la pantalla.",
          "Borrar un perfil guardado ahora pide un segundo clic de confirmación.",
          "Los toasts y burbujas se despiden por el mismo camino por el que entraron.",
        ],
      },
      {
        icon: "\u{1F3A8}",
        title: "Detalles visuales",
        notes: [
          "Un solo rojo para acciones peligrosas, contadores más legibles sobre el acento y texto secundario con mejor contraste sobre el vidrio.",
          "Los títulos de Ajustes usan tracking tipográfico apropiado y la escala de texto respeta el tamaño configurado en tu sistema.",
          "El pill del notch respira menos: crece suave al pasar el mouse sin parpadeos ni saltos.",
        ],
      },
    ],
  },
  {
    version: "0.49.11",
    date: "8 jul 2026",
    headline: "Menús del dock más nativos, marquee más calmado y texto español pulido.",
    sections: [
      {
        icon: "\u{1F5B1}\uFE0F",
        title: "Click derecho más claro",
        notes: [
          "El menú contextual del dock ahora tiene encabezado, secciones entendibles, iconos discretos y acciones peligrosas separadas.",
          "Los widgets, separadores, apps, carpetas y perfiles muestran solo acciones que tienen sentido para cada caso.",
        ],
      },
      {
        icon: "\u{1F3B5}",
        title: "Media sin marquee acelerado",
        notes: [
          "Los títulos largos de música y video usan una velocidad estable según su longitud, sin carreras visuales al refrescarse.",
        ],
      },
      {
        icon: "\u{1F524}",
        title: "Tipografía y español",
        notes: [
          "Dock, menús, widgets y Ajustes refuerzan Segoe UI Variable para sentirse más integrados en Windows.",
          "Corrige textos visibles con ñ, acentos y traducciones faltantes en el menú para los cinco idiomas.",
        ],
      },
    ],
  },
  {
    version: "0.49.10",
    date: "8 jul 2026",
    headline: "Menús más claros y tipografía más consistente.",
    sections: [
      {
        icon: "\u{1F5B1}\uFE0F",
        title: "Menús contextuales más entendibles",
        notes: [
          "Acciones, recientes, carpetas, widgets y opciones peligrosas ahora usan iconos y colores con jerarquía clara.",
          "Los menús de Ajustes y de grupos se alinean mejor y evitan salirse del borde de la ventana.",
        ],
      },
      {
        icon: "\u{1F524}",
        title: "Escala tipográfica",
        notes: [
          "Se normalizan tamaños y pesos en menús, Ajustes, cards de widgets y listas de apps para que la UI se sienta menos fragmentada.",
        ],
      },
    ],
  },
  {
    version: "0.49.9",
    date: "8 jul 2026",
    headline: "Smart-hide más silencioso para apps con ventanas flotantes.",
    sections: [
      {
        icon: "\u{1F3AF}",
        title: "El dock vuelve solo cuando lo pides",
        notes: [
          "En modo Clic, Booki ya no aparece automáticamente cuando una ventana deja un hueco sobre el área del dock.",
          "Al salir de pantalla completa, si el dock ya estaba escondido, vuelve al notch y espera tu clic.",
        ],
      },
      {
        icon: "\u{1F9E0}",
        title: "Mejor para Photoshop y apps creativas",
        notes: [
          "El algoritmo evita confundir paneles flotantes, diálogos o cambios de foco con una intención de abrir el dock.",
        ],
      },
    ],
  },
  {
    version: "0.49.8",
    date: "8 jul 2026",
    headline: "Notch más fiable, dock más limpio y reveal reforzado.",
    sections: [
      {
        icon: "\u{1F9ED}",
        title: "El notch siempre trae el dock",
        notes: [
          "Al pulsar el notch, Booki recoloca el dock, lo relifta con Tauri y lo deja clicable aunque estés usando otra app.",
          "Smart hide usa el rect real del dock para evitar apariciones raras al cambiar entre ventanas.",
        ],
      },
      {
        icon: "\u{1FA9F}",
        title: "Mica sin sombras grandes",
        notes: [
          "Reduce el stage transparente y elimina sombras exteriores del dock/notch para evitar cortes visuales y zonas invisibles que intercepten clicks.",
          "La pastilla de actualización ahora se posiciona junto al dock en vez de quedar perdida en medio del stage.",
        ],
      },
      {
        icon: "\u{2699}\uFE0F",
        title: "Ajustes más claros",
        notes: [
          "Quita de Ajustes la opción confusa de flotar por encima: Booki lo gestiona internamente para que el notch sea fiable.",
        ],
      },
    ],
  },
  {
    version: "0.49.6",
    date: "8 jul 2026",
    headline: "Ajustes con más jerarquía, dock responsive y controles más claros.",
    sections: [
      {
        icon: "\u{1FA9F}",
        title: "Ajustes más modernos",
        notes: [
          "Rediseña Ajustes con secciones más claras, jerarquía visual y una apariencia alineada con Mica/Windows.",
          "Temas rápidos, color de acento y Apps ancladas ahora explican mejor qué puedes cambiar sin depender de iconos crípticos.",
        ],
      },
      {
        icon: "\u{1F9ED}",
        title: "Responsive revisado",
        notes: [
          "Revisa Settings, dock, notch, modales y menús en ventanas estrechas para evitar overflow horizontal y cortes visuales.",
          "La pastilla de actualización se mantiene cerca del dock y dentro del viewport.",
        ],
      },
      {
        icon: "\u{2728}",
        title: "Microinteracciones útiles",
        notes: [
          "Agranda controles de arrastre, cierre y acciones rápidas para que sean más fáciles de usar.",
          "Pulsa, hover y foco tienen respuestas más suaves sin recargar la interfaz.",
        ],
      },
    ],
  },
  {
    version: "0.49.5",
    date: "7 jul 2026",
    headline: "Ajustes más intuitivos, texto limpio y editor de widgets robusto.",
    sections: [
      {
        icon: "\u{1F9F9}",
        title: "Sin símbolos raros",
        notes: [
          "Corrige iconos del changelog que podían aparecer como caracteres rotos en vez de emoji.",
          "Agrega una comprobación de texto para detectar mojibake antes de compilar o publicar otra beta.",
        ],
      },
      {
        icon: "\u{1F6E0}\uFE0F",
        title: "Ajustes más cómodos",
        notes: [
          "El editor de widgets bloquea el scroll de fondo, mantiene su propio scroll interno y ya no se cierra por clicks accidentales fuera.",
          "La configuración del portapapeles vive dentro del editor del widget Portapapeles, no como un panel mezclado debajo de toda la galería.",
          "Corrige el toggle de flotar por encima para aplicarlo al dock real y explica que el auto-ocultado se controla desde Comportamiento.",
        ],
      },
      {
        icon: "\u{1F9F0}",
        title: "Limpieza de producción",
        notes: [
          "Quita ruido decorativo de consola y deja el dock más limpio para depurar problemas reales.",
          "La build y los workflows ahora revisan el texto visible antes de crear instaladores.",
        ],
      },
    ],
  },
  {
    version: "0.49.4",
    date: "7 jul 2026",
    headline: "Portapapeles más claro, widgets ajustables y UI adaptable.",
    sections: [
      {
        icon: "🛡️",
        title: "Portapapeles entendido de un vistazo",
        notes: [
          "El flyout ahora explica cómo usarlo: clic para copiar, estrella para conservar y escudo para mantener solo en la sesión.",
          "Añade búsqueda, vista compacta, favoritos que no caducan y entradas privadas que no se guardan en disco.",
          "La memoria entre reinicios se guarda protegida por Windows para tu usuario cuando está activada.",
        ],
      },
      {
        icon: "🎥",
        title: "Capturas y grabaciones",
        notes: [
          "Nuevo ajuste en General para decidir si Booki aparece o no en screenshots, grabaciones y pantalla compartida compatibles.",
        ],
      },
      {
        icon: "\u{1F9E9}",
        title: "Galería de widgets",
        notes: [
          "Ajustes ahora presenta los widgets como un catálogo visual: ves qué está anclado, qué hace cada widget y puedes abrir sus ajustes.",
          "El widget Media estrena una opción propia para subir o bajar el volumen con la rueda del mouse solo cuando el cursor está encima.",
          "Los widgets dentro de grupos también pueden abrir su editor desde Ajustes.",
        ],
      },
      {
        icon: "\u{1FA9F}",
        title: "Responsive y más suave",
        notes: [
          "Ajustes se adapta mejor a ventanas estrechas con navegación horizontal y controles que no se salen del contenedor.",
          "Los flyouts del dock limitan su alto y ancho al viewport, y el portapapeles evita renders viejos cuando buscas rápido.",
        ],
      },
    ],
  },
  {
    version: "0.49.3",
    date: "7 jul 2026",
    headline: "Memoria configurable para el portapapeles y limpieza automática.",
    sections: [
      {
        icon: "📋",
        title: "Portapapeles con retención",
        notes: [
          "Ajustes ahora permite decidir si el historial del portapapeles se recuerda entre reinicios.",
          "Booki limpia entradas antiguas por días y limita la cantidad total para que muchas copias no saturen el widget.",
          "La persistencia en disco queda apagada por defecto por privacidad; el historial de la sesión sigue funcionando igual.",
        ],
      },
    ],
  },
  {
    version: "0.49.2",
    date: "7 jul 2026",
    headline: "Portapapeles más estable: marquee controlado aunque copies mucho contenido.",
    sections: [
      {
        icon: "📋",
        title: "Marquee del portapapeles corregido",
        notes: [
          "La vista previa del portapapeles ya no reenvuelve texto duplicado al recalcular el layout, evitando que la animación se acelere o se vuelva errática.",
          "Cuando copias textos enormes o muchos elementos seguidos, el dock muestra una vista previa corta y estable; el historial completo sigue disponible al abrir el widget.",
        ],
      },
    ],
  },
  {
    version: "0.49.1",
    date: "7 jul 2026",
    headline: "Dock sin hitbox invisible, smart-hide más estable y toast del notch sin recorte.",
    sections: [
      {
        icon: "🎯",
        title: "Hitbox precisa",
        notes: [
          "La ventana transparente del dock sigue dejando espacio para sombras y paneles, pero los clics solo pertenecen al dock, tiles transformados y popovers visibles.",
          "Un clic apenas fuera del dock vuelve a llegar a la app que está detrás, sin romper menús, flyouts ni ventanas contextuales de Booki.",
        ],
      },
      {
        icon: "🪟",
        title: "Smart-hide más tranquilo",
        notes: [
          "Al cambiar entre ventanas, Booki espera más tiempo antes de reaparecer por escritorio despejado, evitando flashes por huecos momentáneos del sistema.",
        ],
      },
      {
        icon: "💬",
        title: "Toast del notch completo",
        notes: [
          "El aviso de pantalla completa ahora calcula su ancho según el mensaje y ya no corta el texto “Booki se ocultó”.",
        ],
      },
      {
        icon: "✨",
        title: "Ajustes más claros",
        notes: [
          "Los títulos de sección en Ajustes ahora tienen icono, acento visual y mejor separación para escanear opciones sin hacer la interfaz pesada.",
        ],
      },
    ],
  },
  {
    version: "0.49.0",
    date: "7 jul 2026",
    headline: "Dock alineado: widgets compactos, portapapeles controlado y captura principal corregida.",
    sections: [
      {
        icon: "📐",
        title: "Dock horizontal alineado",
        notes: [
          "Notas y Portapapeles ya no se levantan ni descuadran el dock: ahora comparten el mismo eje visual que apps, reloj, CPU, grupos y papelera.",
        ],
      },
      {
        icon: "📋",
        title: "Portapapeles bajo control",
        notes: [
          "La tarjeta de Portapapeles tiene un ancho máximo fijo: los textos largos ya no estiran el dock y se desplazan dentro de la tarjeta cuando hace falta.",
          "La misma protección se aplica a las vistas previas de Nota, evitando saltos o crecimiento inesperado.",
        ],
      },
      {
        icon: "🖼️",
        title: "README actualizado",
        notes: [
          "La captura principal del README ahora enseña el dock corregido y alineado. Los GIFs y el resto de la galería se mantienen como estaban.",
        ],
      },
      {
        icon: "🧭",
        title: "Preview más fiel",
        notes: [
          "El preview del navegador arranca sin onboarding y usa el notch flotante por defecto, para revisar el dock sin overlays ni estados engañosos.",
        ],
      },
    ],
  },
  {
    version: "0.48.0",
    date: "6 jul 2026",
    headline: "Widgets con look de Windows 11: anillos animados y tarjetas con vista previa.",
    sections: [
      {
        icon: "🟠",
        title: "Anillos animados",
        notes: [
          "CPU, RAM, disco, batería y volumen ahora se ven como un anillo de progreso animado y a color, en vez de una simple barra — cada uno con su propio color (y la batería se pone roja si queda poca y no está cargando).",
        ],
      },
      {
        icon: "🗒️",
        title: "Tarjetas con vista previa",
        notes: [
          "Los widgets de Nota y Portapapeles ahora son tarjetas con un icono a color y una vista previa real de su contenido (el estilo de los widgets de Windows), no solo un número.",
        ],
      },
      {
        icon: "📐",
        title: "Fix: dock vertical",
        notes: [
          "En el borde izquierdo o derecho, las tarjetas de Nota y Portapapeles se veían enormes y con el texto cortado por ambos lados — ahora se ven compactas y alineadas, igual que el resto de widgets.",
        ],
      },
      {
        icon: "🛠️",
        title: "Otros fixes",
        notes: [
          "El menú del clic derecho sobre un pin a veces fallaba silenciosamente al buscar sus archivos recientes — arreglado.",
          "El aviso de “Booki se ocultó” (pensado para juegos/películas a pantalla completa) a veces aparecía solo por cambiar de ventana con Alt+Tab o la vista de tareas — ya no confunde eso con pantalla completa real.",
        ],
      },
    ],
  },
  {
    version: "0.47.0",
    date: "6 jul 2026",
    headline: "Nuevo widget de portapapeles, ajustes más ordenados, y varios fixes del notch.",
    sections: [
      {
        icon: "📋",
        title: "Widget de portapapeles",
        notes: [
          "Booki ahora recuerda lo que copias. Ancla el nuevo widget \u201cPortapapeles\u201d y verás cuántos elementos tiene guardados; haz clic para abrir el historial.",
          "Desde ahí: clic en cualquier entrada para volver a copiarla, edítala antes de copiarla, elimina las que no necesites o vacía todo el historial de una vez.",
        ],
      },
      {
        icon: "🛠️",
        title: "Fixes del notch",
        notes: [
          "El margen invisible alrededor del notch (para el crecimiento al pasar el cursor) a veces se comportaba como si abriera el dock solo — ahora solo la pastilla visible responde a los clics.",
          "El dock y el notch ahora se autocorrigen si cambia el espacio disponible en pantalla (por ejemplo, al activar \u201cOcultar automáticamente la barra de tareas\u201d de Windows), sin esperar a que abras Ajustes.",
        ],
      },
      {
        icon: "🗂️",
        title: "Ajustes más claros",
        notes: [
          "Apariencia y Comportamiento separan ahora \u201cNotch\u201d de \u201cDock\u201d en secciones propias, con su título — más fácil de escanear.",
          "El idioma del sistema, si no es de los que soportamos, cae en inglés (verificado).",
        ],
      },
      {
        icon: "🖼️",
        title: "Detalles visuales",
        notes: [
          "Arreglado: el número de ventanas abiertas de una app a veces se veía detrás del icono en vez de encima.",
        ],
      },
    ],
  },
  {
    version: "0.46.0",
    date: "6 jul 2026",
    headline: "Revisión completa del sistema: idiomas al 100% y verificación de todo.",
    sections: [
      {
        icon: "🌐",
        title: "Idiomas completos",
        notes: [
          "En francés, alemán y portugués faltaban textos (el control de distancia al borde, pistas de grupos…) y se veían claves crudas — los 5 idiomas quedaron completos y con verificación automática de paridad.",
          "El widget de reloj muestra la fecha en TU idioma (antes salía en español para portugués, francés y alemán).",
        ],
      },
      {
        icon: "✅",
        title: "Todo verificado",
        notes: [
          "Auditoría cruzada de todo el sistema: cada comando que usa la interfaz existe en el backend, cada icono existe, el buscador de Ajustes no apunta a nada roto, y el análisis estático del backend (clippy) está limpio.",
        ],
      },
    ],
  },
  {
    version: "0.45.0",
    date: "6 jul 2026",
    headline: "Pasada de mantenimiento: más robusto en los bordes raros.",
    sections: [
      {
        icon: "🔍",
        title: "Auditoría general",
        notes: [
          "Arrastrar un icono o un elemento de un grupo ya no puede perder el gesto a mitad de camino (la ventana se mantiene interactiva durante todo el arrastre).",
          "Con el dock alineado a un lado (no centrado), una barra muy llena ya no puede desbordar la pantalla.",
          "Las miniaturas con transparencia se ven con bordes limpios (corrección de alfa premultiplicado).",
          "Los archivos de red inaccesibles ya no pueden colgar los recientes ni las miniaturas.",
        ],
      },
    ],
  },
  {
    version: "0.44.0",
    date: "6 jul 2026",
    headline: "Arreglado de raíz: «al salir» vuelve a abrir, y el dock vertical deja de perderse.",
    sections: [
      {
        icon: "🛠️",
        title: "El notch vuelve a funcionar",
        notes: [
          "Con «Ocultar al salir», el clic en el notch no abría el dock: la señal llegaba pero un guard interno del modo clic la descartaba. Ahora una invocación explícita SIEMPRE abre el dock, sea cual sea el modo.",
          "Al abrirlo desde el notch, el dock queda fijado hasta que lo visitas y sales (o pasan unos segundos sin usarlo) — y vuelve a esconderse solo, como corresponde.",
        ],
      },
      {
        icon: "🧭",
        title: "Vertical estable",
        notes: [
          "El dock ya no se vuelve fantasma ni se pierde: el cambio a «clic a través» de la ventana ahora usa el mecanismo oficial del sistema, que refresca la ventana correctamente (antes podía dejar de pintarse).",
          "Al revelarse, la ventana queda clicable al instante.",
          "El panel de grupos y carpetas se ancla a la posición real de la barra: ya no se montaba encima de la primera fila de iconos (pasaba en todos los bordes, peor en vertical).",
        ],
      },
    ],
  },
  {
    version: "0.43.0",
    date: "6 jul 2026",
    headline: "El menú del clic derecho ahora es inteligente y nunca se corta.",
    sections: [
      {
        icon: "🧠",
        title: "Menú contextual con criterio",
        notes: [
          "Los \u201cRecientes\u201d de una app ahora son SOLO suyos: filtramos los archivos recientes de Windows por la app que los abre, así Word muestra tus documentos y no cosas que no tienen nada que ver. Si no hay nada relevante, la sección no aparece.",
          "El menú se adapta a lo que tocas: las carpetas ganan \u201cAbrir en el Explorador\u201d y los widgets ya no muestran opciones que no les aplican.",
        ],
      },
      {
        icon: "📐",
        title: "Sin cortes en vertical",
        notes: [
          "El menú contextual queda siempre completo dentro de la pantalla, también con el dock a la izquierda o a la derecha; si es muy largo, hace scroll en vez de cortarse.",
        ],
      },
    ],
  },
  {
    version: "0.42.0",
    date: "6 jul 2026",
    headline: "Las carpetas ancladas se vuelven de verdad útiles: miniaturas, arrastrar afuera y acciones rápidas.",
    sections: [
      {
        icon: "🖼️",
        title: "Miniaturas reales",
        notes: [
          "Las fotos y los vídeos dentro de una carpeta anclada muestran su miniatura real (la misma del Explorador), no un icono genérico. Con caché, así que la segunda vez es instantáneo.",
        ],
      },
      {
        icon: "🖐️",
        title: "Arrastra archivos hacia afuera",
        notes: [
          "Toma un archivo del panel de una carpeta y arrástralo al escritorio, al Explorador o a cualquier otra app — un arrastre nativo de Windows, como si viniera del propio Explorador.",
        ],
      },
      {
        icon: "⚡",
        title: "Acciones al pasar el cursor",
        notes: [
          "Cada archivo del panel muestra al pasar el cursor tres accesos: copiar su ruta, mostrarlo seleccionado en el Explorador y “Abrir con…”.",
          "Por dentro: dependencias actualizadas y avisos de seguridad de GitHub resueltos.",
        ],
      },
    ],
  },
  {
    version: "0.41.0",
    date: "6 jul 2026",
    headline: "Adiós al parpadeo: el dock ya no se mueve ni un píxel al abrir cosas.",
    sections: [
      {
        icon: "🎯",
        title: "Estabilidad visual total",
        notes: [
          "Rediseñamos cómo vive el dock en pantalla: su ventana ahora es un escenario fijo que NUNCA cambia de tamaño al abrir grupos, menús o paneles. Antes, cada apertura redimensionaba la ventana y eso producía el salto/parpadeo que se veía siempre.",
          "Abrir y cerrar grupos ahora es instantáneo y suave — es puro contenido moviéndose dentro de la ventana, sin que Windows tenga que tocar nada.",
        ],
      },
      {
        icon: "🖱️",
        title: "Clics más limpios que nunca",
        notes: [
          "La zona invisible alrededor de la barra ya no roba clics: si haces clic justo al lado del dock, el clic llega a la app de atrás, como debe ser.",
        ],
      },
    ],
  },
  {
    version: "0.40.0",
    date: "5 jul 2026",
    headline: "Las carpetas grandes abren al instante, y con acceso directo al Explorador.",
    sections: [
      {
        icon: "⚡",
        title: "Carpetas sin espera",
        notes: [
          "Al abrir una carpeta anclada (como Descargas), el panel aparece AL INSTANTE con celdas de carga y se rellena en cuanto llega el contenido — ya no se queda pensando con carpetas llenas.",
          "Si la carpeta tiene más elementos de los que caben en el panel, una fila te lo dice y te lleva al Explorador para verlo todo.",
        ],
      },
      {
        icon: "📂",
        title: "Abrir en el Explorador",
        notes: [
          "Las carpetas ancladas ahora tienen un botón en la cabecera del panel para abrir la carpeta directamente en el Explorador de Windows.",
        ],
      },
    ],
  },
  {
    version: "0.39.0",
    date: "5 jul 2026",
    headline: "Busca y ancla en segundos, y el dock te abre un hueco al arrastrar.",
    sections: [
      {
        icon: "\ud83d\udd0d",
        title: "Buscador en Ajustes",
        notes: [
          "En Apps ancladas: escribe y encuentra al instante cualquier app instalada, con su lupa, filtrado en vivo y bot\u00f3n de limpiar.",
          "Tus carpetas importantes (Escritorio, Documentos, Descargas, Im\u00e1genes, V\u00eddeos, M\u00fasica) aparecen como chips: un clic y quedan ancladas. Tambi\u00e9n responden a la b\u00fasqueda.",
        ],
      },
      {
        icon: "\ud83e\uddf2",
        title: "Anclar sin errores",
        notes: [
          "Al arrastrar algo desde el Explorador, el dock abre un HUECO donde va a caer \u2014 ves exactamente d\u00f3nde se ancla y ya no se mete en un grupo por accidente.",
          "Para mandarlo a un grupo, apunta al centro del grupo: se ilumina el grupo y el hueco desaparece. Dos intenciones, dos se\u00f1ales claras.",
        ],
      },
    ],
  },
  {
    version: "0.38.0",
    date: "5 jul 2026",
    headline: "Adi\u00f3s al parpadeo, el dock ya no salta solo, y eliges su distancia al borde.",
    sections: [
      {
        icon: "\u2728",
        title: "Parpadeo, atacado de ra\u00edz",
        notes: [
          "La ventana del dock ahora se redimensiona y reposiciona en UNA sola operaci\u00f3n del sistema (antes eran dos: se ve\u00eda un frame intermedio \u2014 el blink \u2014 cada vez que abr\u00edas o cerrabas un grupo o men\u00fa).",
        ],
      },
      {
        icon: "\ud83d\udc7b",
        title: "Ya no aparece solo",
        notes: [
          "Al cambiar de ventana o mover cosas hab\u00eda huecos de un instante sobre el sitio del dock y \u00e9l aprovechaba para salir. Ahora solo reaparece cuando el escritorio lleva un momento despejado de verdad.",
        ],
      },
      {
        icon: "\ud83d\udccf",
        title: "Distancia al borde",
        notes: [
          "Nuevo control en Comportamiento: elige qu\u00e9 tan pegado va el dock al borde de la pantalla (y a la barra de tareas). En modo compacto ya puedes bajarlo bien cerquita.",
        ],
      },
    ],
  },
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
