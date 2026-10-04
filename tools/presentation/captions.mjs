import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
export function writeCaptions(out, locale) {
const descriptions = locale === 'es' ? ['Booki. Tu Windows. Tu espacio.', 'Apps, carpetas y widgets. Ancla tus accesos y conserva los originales.', 'Temporizador, tareas, calendario y clima opcional.', 'Encuentra apps instaladas y sugerencias según tu uso local.', 'Vista previa del dock y escenarios de comportamiento.', 'Vista previa de Booki 0.70. Código abierto. Sin cuentas. Configuración local.'] : ['Booki. Your Windows. Your workspace.', 'Apps, folders and widgets. Pin your shortcuts and keep originals.', 'Timers, tasks, calendar and optional city weather.', 'Find installed apps and suggestions from local usage.', 'Dock previews and behavior scenarios.', 'Booki 0.70 preview. Open source. No accounts. Local settings.'];
const timestamp = (seconds) => `00:00:${String(seconds).padStart(2, '0')}.000`;
writeFileSync(resolve(out, `booki-070-preview-${locale}.vtt`), 'WEBVTT\n\n' + descriptions.map((text, i) => `${timestamp(i * 5)} --> ${timestamp((i + 1) * 5)}\n${text}\n`).join('\n'));
}
