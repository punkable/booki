/* A small staged editor. Pickers expand only on demand; Cancel never writes. */
import { icon } from "../icons.js";
import { t } from "../i18n.js";
import { groupAppearance } from "../group-style.js";
import { ACCENT_PALETTE, paletteEntry } from "../palette.js";
import { ICON_LIBRARY, libGlyphSVG } from "../icon-library.js";

export function buildGroupCustomizer(item, { save, close, measure }) {
  const original = { name: item.name || t("group.new"), ...groupAppearance(item) };
  const draft = { ...original };
  const form = document.createElement("form"); form.className = "group-customizer-form"; form.tabIndex = -1;
  const head = document.createElement("div"); head.className = "customizer-head";
  const title = document.createElement("strong"); title.textContent = t("refine.customizeGroup");
  const cancel = document.createElement("button"); cancel.type = "button"; cancel.innerHTML = icon("x"); cancel.setAttribute("aria-label", t("stack.close")); cancel.addEventListener("click", close);
  head.append(title, cancel); form.append(head);
  const nameLabel = document.createElement("label"); nameLabel.className = "customizer-name"; nameLabel.textContent = t("refine.name");
  const name = document.createElement("input"); name.type = "text"; name.maxLength = 80; name.value = original.name; name.dataset.menuFocus = ""; nameLabel.append(name); form.append(nameLabel);
  let expanded = null, busy = false;
  const collapse = () => {
    if (!expanded) return false;
    const { panel, trigger } = expanded; panel.hidden = true; trigger.setAttribute("aria-expanded", "false"); expanded = null; trigger.focus(); measure(); return true;
  };
  form.dismissPicker = () => busy || collapse();
  const picker = (key, label, entries, columns) => {
    const trigger = document.createElement("button"); trigger.type = "button"; trigger.className = "customizer-choice"; trigger.setAttribute("aria-label", label); trigger.setAttribute("aria-expanded", "false"); trigger.setAttribute("aria-controls", `group-picker-${key}`);
    const preview = document.createElement("i"), caption = document.createElement("span"), value = document.createElement("small"), chevron = document.createElement("span"); caption.textContent = label; chevron.textContent = "⌄"; chevron.setAttribute("aria-hidden", "true"); trigger.append(preview, caption, value, chevron);
    const panel = document.createElement("div"); panel.id = `group-picker-${key}`; panel.className = `customizer-picker customizer-${key}`; panel.hidden = true; panel.setAttribute("role", "group"); panel.setAttribute("aria-label", label);
    const paint = () => {
      value.textContent = key === "color" ? paletteEntry(draft.color)?.name || (draft.color ? draft.color : t("group.auto")) : draft.glyph ? t("refine.selectedIcon") : t("group.auto");
      trigger.setAttribute("aria-description", value.textContent); trigger.title = `${label}: ${value.textContent}`;
      preview.className = key === "color" ? "customizer-color-dot" : "customizer-icon";
      if (key === "color") preview.style.background = draft.color || "var(--accent)";
      else preview.innerHTML = draft.glyph ? libGlyphSVG(draft.glyph) : icon("grid");
      for (const button of panel.children) { const selected = button.dataset.value === draft[key]; button.setAttribute("aria-pressed", String(selected)); button.tabIndex = selected ? 0 : -1; }
      if (![...panel.children].some((b) => b.tabIndex === 0)) panel.firstElementChild.tabIndex = 0;
    };
    for (const entry of entries) {
      const button = document.createElement("button"); button.type = "button"; button.dataset.value = entry.value; button.title = entry.label; button.setAttribute("aria-label", entry.label);
      if (key === "color" && entry.value) { button.style.setProperty("--sw", entry.value); button.className = "customizer-swatch"; }
      else button.innerHTML = key === "glyph" && entry.value ? libGlyphSVG(entry.value) : icon("grid");
      button.addEventListener("click", () => { draft[key] = entry.value; paint(); collapse(); }); panel.append(button);
    }
    panel.addEventListener("keydown", (event) => {
      const delta = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -columns, ArrowDown: columns }[event.key];
      if (delta == null && !["Home", "End"].includes(event.key)) return;
      event.preventDefault(); event.stopPropagation();
      const buttons = [...panel.children], at = buttons.indexOf(document.activeElement);
      const next = event.key === "Home" ? 0 : event.key === "End" ? buttons.length - 1 : Math.max(0, Math.min(buttons.length - 1, at + delta));
      buttons.forEach((button, index) => { button.tabIndex = index === next ? 0 : -1; }); buttons[next].focus();
    });
    trigger.addEventListener("click", () => { if (expanded?.trigger === trigger) { collapse(); return; } collapse(); panel.hidden = false; trigger.setAttribute("aria-expanded", "true"); expanded = { panel, trigger }; measure(); panel.querySelector('[tabindex="0"]')?.focus(); });
    form.append(trigger, panel); paint();
  };
  picker("glyph", t("group.icon"), [{ value: "", label: t("group.auto") }, ...ICON_LIBRARY.map((value) => ({ value, label: value }))], 6);
  picker("color", t("group.color"), [{ value: "", label: t("group.auto") }, ...ACCENT_PALETTE.map(({ hex, name, code }) => ({ value: hex, label: code ? `${name} · ${code}` : name }))], 7);
  const error = document.createElement("p"); error.className = "customizer-error"; error.setAttribute("role", "alert"); error.hidden = true;
  const footer = document.createElement("div"); footer.className = "customizer-footer";
  const discard = document.createElement("button"); discard.type = "button"; discard.textContent = t("trash.cancel"); discard.addEventListener("click", close);
  const apply = document.createElement("button"); apply.type = "submit"; apply.textContent = t("prof.apply"); apply.className = "customizer-apply"; footer.append(discard, apply); form.append(error, footer);
  form.addEventListener("submit", async (event) => {
    event.preventDefault(); if (busy) return;
    busy = true; error.hidden = true; draft.name = name.value.trim() || original.name;
    form.querySelectorAll("input, button").forEach((el) => { el.disabled = true; });
    form.focus({ preventScroll: true });
    try { if (!(await save(draft, original))) throw new Error("save failed"); if (form.isConnected) close(); }
    catch (_) { error.textContent = t("status.saveError"); error.hidden = false; }
    finally { busy = false; if (form.isConnected) { form.querySelectorAll("input, button").forEach((el) => { el.disabled = false; }); measure(); } }
  });
  return form;
}
