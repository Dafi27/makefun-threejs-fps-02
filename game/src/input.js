// input.js — keyboard, mouse and pointer lock. Keeps the raw device state;
// the player controller reads it each fixed step.
export function createInput(canvas) {
  const input = {
    keys: new Set(),
    mouseDX: 0, mouseDY: 0,
    firing: false,
    locked: false,
    onLockChange: null,
    onKey: null,       // (code, down) — UI shortcuts (buy, reload, ...)
    onClick: null,     // primary click while unlocked (to claim lock / dismiss)
  };
  addEventListener('keydown', (e) => {
    if (e.repeat) return;
    input.keys.add(e.code);
    if (input.onKey) input.onKey(e.code, true);
    if (['Space', 'Tab'].includes(e.code)) e.preventDefault();
  });
  addEventListener('keyup', (e) => {
    input.keys.delete(e.code);
    if (input.onKey) input.onKey(e.code, false);
  });
  addEventListener('blur', () => { input.keys.clear(); input.firing = false; });
  document.addEventListener('mousemove', (e) => {
    if (input.locked) { input.mouseDX += e.movementX; input.mouseDY += e.movementY; }
  });
  document.addEventListener('pointerlockchange', () => {
    input.locked = document.pointerLockElement === canvas;
    if (input.onLockChange) input.onLockChange(input.locked);
  });
  canvas.addEventListener('mousedown', (e) => {
    if (e.button === 0) {
      if (input.locked) input.firing = true;
      else if (input.onClick) input.onClick();
    }
  });
  addEventListener('mouseup', (e) => { if (e.button === 0) input.firing = false; });
  input.requestLock = () => { try { canvas.requestPointerLock(); } catch (e) { /* headless */ } };
  input.releaseLock = () => { if (document.pointerLockElement) document.exitPointerLock(); };
  input.consumeMouse = () => {
    const dx = input.mouseDX, dy = input.mouseDY;
    input.mouseDX = 0; input.mouseDY = 0;
    return { dx, dy };
  };
  return input;
}
