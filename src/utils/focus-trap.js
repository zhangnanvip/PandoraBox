// 焦点陷阱：modal 打开时把焦点移入，Tab/Shift+Tab 在面板内循环，
// ESC 触发 onEscape，关闭时把焦点送回触发元素。
// 见 design/v2-evolution-plan.md §8.2

const FOCUSABLE_SELECTOR = [
  "a[href]",
  "button:not([disabled])",
  "input:not([disabled])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  "[tabindex]:not([tabindex='-1'])"
].join(",");

function focusableWithin(panel) {
  return Array.from(panel.querySelectorAll(FOCUSABLE_SELECTOR)).filter((el) => {
    if (el.hasAttribute("disabled")) return false;
    // 过滤掉视觉上不可见的（display:none 父级）
    if (el.offsetParent === null && el.tagName !== "BODY") return false;
    return true;
  });
}

export function trapFocus(panel, { initialFocus, onEscape } = {}) {
  if (!panel || typeof panel.addEventListener !== "function") {
    return () => {};
  }
  const trigger = document.activeElement;

  requestAnimationFrame(() => {
    const target = initialFocus || focusableWithin(panel)[0] || panel;
    if (target && typeof target.focus === "function") {
      try {
        target.focus({ preventScroll: false });
      } catch {
        target.focus();
      }
    }
  });

  function handleKey(event) {
    if (event.key === "Escape") {
      event.preventDefault();
      onEscape?.();
      return;
    }
    if (event.key !== "Tab") return;
    const items = focusableWithin(panel);
    if (!items.length) {
      event.preventDefault();
      return;
    }
    const first = items[0];
    const last = items[items.length - 1];
    const active = document.activeElement;
    if (event.shiftKey && active === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && active === last) {
      event.preventDefault();
      first.focus();
    }
  }

  panel.addEventListener("keydown", handleKey);

  return function release() {
    panel.removeEventListener("keydown", handleKey);
    if (
      trigger &&
      typeof trigger.focus === "function" &&
      document.body.contains(trigger)
    ) {
      try {
        trigger.focus({ preventScroll: true });
      } catch {
        trigger.focus();
      }
    }
  };
}
