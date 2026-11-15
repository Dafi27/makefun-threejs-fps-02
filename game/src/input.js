// Keyboard, mouse and pointer lock. The simulation reads only `state`;
// the browser events are translated here, so the sim never touches the DOM.
export function createInput(element, onLockChange) {
  const keys = new Set();
  let lookX = 0;
  let lookY = 0;
  let firing = false;
  let locked = false;
  let lockFailed = false;

  // Keys pressed since the last read, for one-shot actions (buy menu, use).
  const pressed = new Set();

  function onKeyDown(event) {
    if (event.repeat) return;
    keys.add(event.code);
    pressed.add(event.code);
    if (event.code === 'Space') event.preventDefault();
  }

  function onKeyUp(event) {
    keys.delete(event.code);
  }

  function onMouseMove(event) {
    if (!locked) return;
    lookX += event.movementX || 0;
    lookY += event.movementY || 0;
  }

  function onMouseDown(event) {
    if (event.button === 0) firing = true;
  }

  function onMouseUp(event) {
    if (event.button === 0) firing = false;
  }

  function onLock() {
    locked = document.pointerLockElement === element;
    lockFailed = false;
    onLockChange(locked);
  }

  function onLockError() {
    lockFailed = true;
    onLockChange(false);
  }

  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup', onKeyUp);
  window.addEventListener('mousemove', onMouseMove);
  window.addEventListener('mousedown', onMouseDown);
  window.addEventListener('mouseup', onMouseUp);
  document.addEventListener('pointerlockchange', onLock);
  document.addEventListener('pointerlockerror', onLockError);

  return {
    state: { keys, pressed, get firing() { return firing; } },
    // Pointer lock is unavailable in some headless captures; arrow keys
    // still turn the player, so the game stays playable without a mouse.
    get locked() { return locked; },
    get lockFailed() { return lockFailed; },
    requestLock() {
      if (locked) return;
      try {
        const result = element.requestPointerLock();
        if (result && typeof result.catch === 'function') result.catch(() => {});
      } catch {
        lockFailed = true;
      }
    },
    releaseLock() {
      if (document.pointerLockElement) document.exitPointerLock();
    },
    takeLook() {
      const out = { x: lookX, y: lookY };
      lookX = 0;
      lookY = 0;
      return out;
    },
    // One-shot key presses: read and clear at the end of each frame.
    takePressed() {
      const out = pressed;
      pressed.clear();
      return out;
    },
  };
}
