/** Native conflicts include the current snapshot so the user can resolve them. */
export function parseConfigConflict(error) {
  const message = String(error?.message || error);
  const prefix = 'BOOKI_CONFIG_CONFLICT:';
  if (!message.startsWith(prefix)) return null;
  try {
    const value = JSON.parse(message.slice(prefix.length));
    if (!value.current || !Array.isArray(value.keys) || !value.keys.length) return null;
    if (!value.keys.every((key) => typeof key === 'string' && Object.hasOwn(value.current, key) && key !== 'revision')) return null;
    return value;
  } catch { return null; }
}
