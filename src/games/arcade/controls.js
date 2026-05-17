export function joystickMarkup(label = "移动") {
  return `
    <div class="arcade-joystick" aria-label="${label}" role="application">
      <span class="arcade-joystick-ring"></span>
      <span class="arcade-joystick-stick"></span>
    </div>
  `;
}

export function bindVirtualJoystick(root, controls, options = {}) {
  const base = root.querySelector(options.selector || ".arcade-joystick");
  if (!base) return () => {};
  const stick = base.querySelector(".arcade-joystick-stick");
  const threshold = options.threshold ?? 0.28;
  const radius = options.radius || 42;
  let activePointer = null;

  function setVector(x, y) {
    const length = Math.hypot(x, y);
    const limited = length > 1 ? 1 / length : 1;
    const vx = x * limited;
    const vy = y * limited;
    controls.axisX = Math.abs(vx) >= threshold ? vx : 0;
    controls.axisY = Math.abs(vy) >= threshold ? vy : 0;
    controls.left = controls.axisX < 0;
    controls.right = controls.axisX > 0;
    controls.up = controls.axisY < 0;
    controls.down = controls.axisY > 0;
    stick.style.transform = `translate(${vx * radius}px, ${vy * radius}px)`;
    if (options.onDirection) {
      const absX = Math.abs(vx);
      const absY = Math.abs(vy);
      if (Math.max(absX, absY) >= threshold) {
        options.onDirection(absX > absY ? (vx > 0 ? "right" : "left") : (vy > 0 ? "down" : "up"));
      }
    }
  }

  function reset() {
    activePointer = null;
    controls.axisX = 0;
    controls.axisY = 0;
    controls.left = false;
    controls.right = false;
    controls.up = false;
    controls.down = false;
    stick.style.transform = "translate(0, 0)";
  }

  function updateFromEvent(event) {
    const rect = base.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    setVector((event.clientX - cx) / radius, (event.clientY - cy) / radius);
  }

  const onPointerDown = (event) => {
    event.preventDefault();
    activePointer = event.pointerId;
    base.setPointerCapture?.(event.pointerId);
    updateFromEvent(event);
  };
  const onPointerMove = (event) => {
    if (activePointer !== event.pointerId) return;
    event.preventDefault();
    updateFromEvent(event);
  };
  const onPointerUp = (event) => {
    if (activePointer !== event.pointerId) return;
    base.releasePointerCapture?.(event.pointerId);
    reset();
  };

  base.addEventListener("pointerdown", onPointerDown);
  base.addEventListener("pointermove", onPointerMove);
  base.addEventListener("pointerup", onPointerUp);
  base.addEventListener("pointercancel", onPointerUp);
  base.addEventListener("lostpointercapture", reset);

  return () => {
    base.removeEventListener("pointerdown", onPointerDown);
    base.removeEventListener("pointermove", onPointerMove);
    base.removeEventListener("pointerup", onPointerUp);
    base.removeEventListener("pointercancel", onPointerUp);
    base.removeEventListener("lostpointercapture", reset);
  };
}

export function bindHold(root, selector, onChange) {
  const button = root.querySelector(selector);
  if (!button) return () => {};
  const down = (event) => {
    event.preventDefault();
    onChange(true);
  };
  const up = () => onChange(false);
  button.addEventListener("pointerdown", down);
  button.addEventListener("pointerup", up);
  button.addEventListener("pointerleave", up);
  button.addEventListener("pointercancel", up);
  return () => {
    button.removeEventListener("pointerdown", down);
    button.removeEventListener("pointerup", up);
    button.removeEventListener("pointerleave", up);
    button.removeEventListener("pointercancel", up);
  };
}

export const DIRECTION_KEY_MAP = {
  ArrowUp: "up",
  KeyW: "up",
  ArrowDown: "down",
  KeyS: "down",
  ArrowLeft: "left",
  KeyA: "left",
  ArrowRight: "right",
  KeyD: "right"
};

export const HORIZONTAL_KEY_MAP = {
  ArrowLeft: "left",
  KeyA: "left",
  ArrowRight: "right",
  KeyD: "right"
};

export function bindDigitalKeys(controls, keyMap = DIRECTION_KEY_MAP, options = {}) {
  const target = options.target || window;
  const preventDefault = options.preventDefault !== false;

  function setControl(event, pressed) {
    const control = keyMap[event.code];
    if (!control) return;
    if (preventDefault) event.preventDefault();
    controls[control] = pressed;
    options.onChange?.(control, pressed, event);
  }

  const onKeyDown = (event) => setControl(event, true);
  const onKeyUp = (event) => setControl(event, false);
  target.addEventListener("keydown", onKeyDown);
  target.addEventListener("keyup", onKeyUp);

  return () => {
    target.removeEventListener("keydown", onKeyDown);
    target.removeEventListener("keyup", onKeyUp);
  };
}

export function bindActionKeys(keyMap, onAction, options = {}) {
  const target = options.target || window;
  const preventDefault = options.preventDefault !== false;

  const onKeyDown = (event) => {
    const action = keyMap[event.code];
    if (!action || (options.ignoreRepeat && event.repeat)) return;
    if (preventDefault) event.preventDefault();
    onAction(action, event);
  };

  target.addEventListener("keydown", onKeyDown);
  return () => target.removeEventListener("keydown", onKeyDown);
}

export function bindSwipeDirection(element, onDirection, options = {}) {
  if (!element) return () => {};
  const threshold = options.threshold || 24;
  let pointerStart = null;

  const onPointerDown = (event) => {
    if (options.preventDefault) event.preventDefault();
    pointerStart = { x: event.clientX, y: event.clientY };
  };
  const onPointerUp = (event) => {
    if (!pointerStart) return;
    const dir = directionFromSwipe(event.clientX - pointerStart.x, event.clientY - pointerStart.y, threshold);
    if (dir) onDirection(dir, event);
    pointerStart = null;
  };
  const onPointerCancel = () => {
    pointerStart = null;
  };

  element.addEventListener("pointerdown", onPointerDown);
  element.addEventListener("pointerup", onPointerUp);
  element.addEventListener("pointercancel", onPointerCancel);

  return () => {
    element.removeEventListener("pointerdown", onPointerDown);
    element.removeEventListener("pointerup", onPointerUp);
    element.removeEventListener("pointercancel", onPointerCancel);
  };
}

export function directionFromSwipe(dx, dy, threshold = 24) {
  if (Math.hypot(dx, dy) < threshold) return "";
  return Math.abs(dx) > Math.abs(dy)
    ? (dx > 0 ? "right" : "left")
    : (dy > 0 ? "down" : "up");
}
