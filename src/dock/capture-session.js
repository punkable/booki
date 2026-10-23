/* Preserve the current scene while Windows' capture UI owns focus. */
import { dock, onCaptureSession } from "../api.js";
import { S } from "./state.js";

export function captureHeld() { return !!S.cfg?.captureVisible && S.captureActive; }
let capturePoll = null;
let checking = false;
let intentUntil = 0;
let generation = 0;
function setCapture(active) {
  if (!active && S.cfg?.captureVisible && performance.now() < intentUntil) return;
  generation++;
  const held = !!S.cfg?.captureVisible && !!active;
  const ended = S.captureActive && !held;
  S.captureActive = held;
  document.body.classList.toggle("capture-held", held);
  if (held) clearTimeout(S.hideTimer);
  if (held && !capturePoll) capturePoll = setInterval(async () => {
    if (checking) return;
    checking = true;
    const request = generation;
    try { const active = await dock.captureSessionActive(); if (request === generation && !active) setCapture(false); }
    catch (_) { if (request === generation) setCapture(false); }
    finally { checking = false; }
  }, 350);
  if (!held) { clearInterval(capturePoll); capturePoll = null; }
  if (ended) window.dispatchEvent(new Event("booki:capture-ended"));
}
onCaptureSession(setCapture).catch(() => {});

/** Focus/leave arrive just before the OS watcher sees the capture overlay. */
export function dismissAfterCaptureCheck(action) {
  if (!S.cfg?.captureVisible) { action(); return; }
  setTimeout(async () => {
    if (captureHeld()) return;
    const request = generation;
    let active = false;
    try { active = await dock.captureSessionActive(); } catch (_) { /* ordinary blur */ }
    if (request !== generation || captureHeld()) return;
    if (active) setCapture(true);
    else action();
  }, 180);
}

window.addEventListener("keydown", (event) => {
  if (!S.cfg?.captureVisible || event.repeat) return;
  if (event.key === "PrintScreen" || (event.metaKey && event.shiftKey && event.key.toLowerCase() === "s")) {
    intentUntil = performance.now() + 1400;
    setCapture(true);
    // Windows may consume the shortcut without opening Recortes.
    setTimeout(async () => {
      const request = generation;
      try { const active = await dock.captureSessionActive(); if (request === generation) setCapture(active); }
      catch (_) { if (request === generation) setCapture(false); }
    }, 1500);
  }
});
