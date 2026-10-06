/** A folder session owns history independently of the pin and listing requests. */
export function createFolderNavigation(root) {
  let current = { ...root };
  const history = [];
  return {
    get current() { return current; },
    get canGoBack() { return history.length > 0; },
    enter(entry) {
      if (!entry?.path || entry.path === current.path) return current;
      history.push(current); current = { ...entry }; return current;
    },
    back() { if (history.length) current = history.pop(); return current; },
  };
}
