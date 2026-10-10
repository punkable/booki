# Capturas de referencia

Cada acabado del dock (Vidrio, Vidrio oscuro, Mica y Sólido) y cada página de Ajustes,
en tema claro y oscuro. Salen del frontend compilado con el puente falso de las pruebas,
datos de ejemplo y el reloj fijo a las 9:41.

Para regenerarlas:

```bash
npm run build
npm run capture:reference
```

Antes de publicar una versión, compara las nuevas con estas (por ejemplo con el diff de
imágenes de GitHub en el PR) y actualízalas en el mismo cambio que modifica la interfaz.

Límite: el navegador no dibuja el desenfoque nativo ni Mica, que pone Windows. Por eso
Mica y Sólido se ven iguales aquí y Vidrio muestra solo la versión de la página. Esos
acabados se revisan en un Windows 11 real.
