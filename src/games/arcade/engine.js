const RESTART_EVENT = "pandora:restart-game";

export function bindShellRestart(root, context, restart) {
  if (context?.shell?.onRestart) {
    return context.shell.onRestart(() => restart());
  }

  const listener = (event) => {
    event.preventDefault();
    restart();
  };
  root.addEventListener(RESTART_EVENT, listener);
  return () => root.removeEventListener(RESTART_EVENT, listener);
}

export function createArcadeLoop({ context, update, draw, save, maxDelta = 0.033, saveEvery = 1 }) {
  let raf = 0;
  let last = performance.now();
  let saveTimer = 0;
  let disposed = false;

  function frame(now) {
    if (disposed) return;
    if (context?.isPaused?.()) {
      last = now;
      draw?.();
      raf = requestAnimationFrame(frame);
      return;
    }

    const dt = Math.min(maxDelta, (now - last) / 1000);
    last = now;
    update?.(dt);
    draw?.();
    saveTimer += dt;
    if (save && saveTimer >= saveEvery) {
      saveTimer = 0;
      save();
    }
    raf = requestAnimationFrame(frame);
  }

  return {
    start() {
      if (raf) cancelAnimationFrame(raf);
      disposed = false;
      last = performance.now();
      raf = requestAnimationFrame(frame);
    },
    stop() {
      disposed = true;
      if (raf) cancelAnimationFrame(raf);
      raf = 0;
    },
    resetClock() {
      saveTimer = 0;
      last = performance.now();
    }
  };
}
