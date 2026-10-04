/* Signed Tauri downloads with explicit, quiet installation when the user is ready. */
import { createUpdateController } from './update-controller.js';
import { isTauri, invoke, logMessage } from './api.js';
export const updates = createUpdateController({
  check: async () => { if (!isTauri) return null; const { check } = await import('@tauri-apps/plugin-updater'); return check({ timeout: 20000 }); },
  acquire: () => invoke('acquire_update_lock'),
  release: () => invoke('release_update_lock'),
  backup: () => invoke('prepare_update'),
});
export async function checkForUpdate(onError) {
  try { return await updates.check(); }
  catch (error) { logMessage('warn', `update check failed: ${error}`); onError?.(error); return null; }
}
