/* Windows 11 tooltips for every element with a `title`, in this window.

   The native tooltip is a flat system box that appears late; this one is the
   WinUI ToolTip: rounded, with the flyout shadow, shown after ~400 ms on
   hover or at once on keyboard focus, placed above or below so it never
   sits under the pointer. The title moves to data-tip while shown so the
   system tooltip does not also appear; an icon-only control keeps its
   accessible name. The dock's tiles have their own tooltip and are skipped. */
const DELAY = 400;
let tip = null, owner = null, timer = 0;

function element() {
  if (tip?.isConnected) return tip;
  tip = document.createElement("div");
  tip.className = "fluent-tip"; tip.setAttribute("role", "tooltip"); tip.id = "fluent-tip";
  document.body.append(tip);
  return tip;
}
function adopt(el) {
  const text = el.getAttribute("title");
  if (text) {
    el.dataset.tip = text;
    el.removeAttribute("title");
    if (!el.getAttribute("aria-label") && !el.textContent.trim()) el.setAttribute("aria-label", text);
  }
  return el.dataset.tip || "";
}
function show(el) {
  const text = el.dataset.tip;
  if (!text || !el.isConnected) return;
  const box = element();
  box.textContent = text;
  box.classList.remove("show");
  const r = el.getBoundingClientRect(), w = box.offsetWidth, h = box.offsetHeight, gap = 8;
  const below = r.bottom + gap + h <= innerHeight - 4;
  box.style.left = `${Math.max(4, Math.min(innerWidth - w - 4, r.left + r.width / 2 - w / 2))}px`;
  box.style.top = `${below ? r.bottom + gap : Math.max(4, r.top - gap - h)}px`;
  box.dataset.side = below ? "below" : "above";
  requestAnimationFrame(() => box.classList.add("show"));
  el.setAttribute("aria-describedby", box.id);
}
function hide() {
  clearTimeout(timer); timer = 0;
  if (owner) owner.removeAttribute("aria-describedby");
  owner = null;
  tip?.classList.remove("show");
}
function target(node) {
  const el = node instanceof Element ? node.closest("[title], [data-tip]") : null;
  if (!el || el.closest("#dock .tile, .fluent-tip")) return null;
  return el;
}

export function enableFluentTooltips() {
  document.addEventListener("pointerover", (event) => {
    const el = target(event.target);
    if (el === owner) return;
    hide();
    if (!el || !adopt(el)) return;
    owner = el;
    timer = setTimeout(() => show(el), DELAY);
  }, true);
  document.addEventListener("pointerout", (event) => {
    if (owner && !owner.contains(event.relatedTarget)) hide();
  }, true);
  document.addEventListener("focusin", (event) => {
    const el = target(event.target);
    // Keyboard focus only, and never on a field whose list is opening.
    if (!el || !el.matches(":focus-visible") || el instanceof HTMLSelectElement || !adopt(el)) return;
    hide(); owner = el; show(el);
  }, true);
  document.addEventListener("focusout", hide, true);
  for (const type of ["pointerdown", "keydown", "wheel", "scroll"]) document.addEventListener(type, hide, { capture: true, passive: true });
  window.addEventListener("blur", hide);
}
