import { dock, logMessage } from './api.js';
import { t, curLang } from './i18n.js';
let cached = null;
let language = null;
let pending = null;
/** Native popup stays outside the tiny notch's WebView, without resizing it. */
export async function showBookiMenu(event) {
  event.preventDefault(); event.stopPropagation();
  try {
    if (!pending) pending = (async () => {
      const { Menu } = await import('@tauri-apps/api/menu');
      const lang = curLang();
      if (!cached || language !== lang) {
        await cached?.close();
        cached = await Menu.new({ items: [
          { id: 'booki-show', text: t('m.open'), action: () => dock.revealDock() },
          { id: 'booki-settings', text: t('m.settings'), action: () => dock.openSettingsTab('dock') },
          { id: 'booki-library', text: t('workspace.library'), action: () => dock.openSettingsTab('apps') },
        ] });
        language = lang;
      }
      await cached.popup();
    })().finally(() => { pending = null; });
    await pending;
  } catch (error) { logMessage('warn', `Booki menu: ${error}`); }
}
