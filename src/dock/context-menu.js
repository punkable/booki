import { icon } from '../icons.js';
import { logMessage } from '../api.js';

/** Shared actions for pins, folder items and the dock background. */
export function menuActions(container, close) {
  return {
    add(iconName, text, action, tone = '') {
      const button = document.createElement('button');
      button.type = 'button';
      button.setAttribute('role', 'menuitem');
      button.tabIndex = -1;
      if (tone) button.classList.add(tone);
      button.innerHTML = icon(iconName);
      const label = document.createElement('span');
      label.textContent = text;
      button.append(label);
      button.addEventListener('click', async () => {
        close();
        try { await action(); } catch (error) { logMessage('error', `menu action: ${error}`); }
      });
      container.append(button);
      return button;
    },
    sep() {
      const separator = document.createElement('div');
      separator.className = 'sep';
      separator.setAttribute('role', 'separator');
      container.append(separator);
    },
  };
}

export function menuItems(menu) {
  return [...menu.querySelectorAll('[role="menuitem"]')].filter((item) => !item.disabled && item.offsetParent !== null);
}

export function moveMenuFocus(event, menu) {
  const items = menuItems(menu);
  if (!items.length || !['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return false;
  event.preventDefault();
  const current = items.indexOf(document.activeElement);
  const index = event.key === 'Home' ? 0 : event.key === 'End' ? items.length - 1 :
    event.key === 'ArrowDown' ? (current + 1) % items.length : (current < 0 ? items.length - 1 : current - 1 + items.length) % items.length;
  items[index].focus();
  return true;
}

export function isTextEditor(target) {
  return !!target?.closest?.('input, textarea, [contenteditable="true"]');
}
