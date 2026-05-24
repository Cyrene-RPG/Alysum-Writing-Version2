/**
 * Text prompt for Electron desktop (window.prompt is unsupported there).
 */
import { isAlysumDesktop } from "./desktop-auth.js?v=1";

let styleInjected = false;

function injectStyles() {
  if (styleInjected) return;
  styleInjected = true;
  const el = document.createElement("style");
  el.textContent = `
    .alysum-prompt-root {
      position: fixed;
      inset: 0;
      z-index: 100000;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 20px;
      background: rgba(2, 8, 20, 0.72);
      backdrop-filter: blur(6px);
    }
    .alysum-prompt-box {
      width: min(100%, 400px);
      padding: 22px 22px 18px;
      border-radius: 14px;
      border: 1px solid rgba(255, 255, 255, 0.12);
      background: linear-gradient(165deg, #1a2744 0%, #111827 100%);
      color: #f1f5f9;
      box-shadow: 0 24px 60px rgba(0, 0, 0, 0.45);
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    }
    .alysum-prompt-msg {
      margin: 0 0 14px;
      font-size: 15px;
      line-height: 1.45;
      font-weight: 600;
    }
    .alysum-prompt-input {
      width: 100%;
      box-sizing: border-box;
      padding: 11px 12px;
      border-radius: 10px;
      border: 1px solid rgba(255, 255, 255, 0.14);
      background: rgba(0, 0, 0, 0.28);
      color: #fff;
      font-size: 15px;
      outline: none;
    }
    .alysum-prompt-input:focus {
      border-color: rgba(124, 58, 237, 0.65);
      box-shadow: 0 0 0 3px rgba(124, 58, 237, 0.22);
    }
    .alysum-prompt-actions {
      display: flex;
      justify-content: flex-end;
      gap: 10px;
      margin-top: 16px;
    }
    .alysum-prompt-btn {
      padding: 9px 16px;
      border-radius: 10px;
      border: 1px solid rgba(255, 255, 255, 0.14);
      background: rgba(255, 255, 255, 0.06);
      color: #e2e8f0;
      font-size: 14px;
      font-weight: 700;
      cursor: pointer;
    }
    .alysum-prompt-btn:hover { background: rgba(255, 255, 255, 0.1); }
    .alysum-prompt-btn--primary {
      border-color: transparent;
      background: linear-gradient(135deg, #6d28d9, #7c3aed);
      color: #fff;
    }
    .alysum-prompt-btn--primary:hover { filter: brightness(1.06); }
  `;
  document.head.appendChild(el);
}

function showDialog(message, defaultValue) {
  injectStyles();
  return new Promise((resolve) => {
    const root = document.createElement("div");
    root.className = "alysum-prompt-root";
    root.setAttribute("role", "dialog");
    root.setAttribute("aria-modal", "true");

    const box = document.createElement("div");
    box.className = "alysum-prompt-box";

    const msg = document.createElement("p");
    msg.className = "alysum-prompt-msg";
    msg.textContent = message;

    const input = document.createElement("input");
    input.type = "text";
    input.className = "alysum-prompt-input";
    input.value = defaultValue ?? "";
    input.autocomplete = "off";

    const actions = document.createElement("div");
    actions.className = "alysum-prompt-actions";

    const cancelBtn = document.createElement("button");
    cancelBtn.type = "button";
    cancelBtn.className = "alysum-prompt-btn";
    cancelBtn.textContent = "Cancel";

    const okBtn = document.createElement("button");
    okBtn.type = "button";
    okBtn.className = "alysum-prompt-btn alysum-prompt-btn--primary";
    okBtn.textContent = "OK";

    function finish(value) {
      root.remove();
      document.removeEventListener("keydown", onKey);
      resolve(value);
    }

    function onKey(e) {
      if (e.key === "Escape") finish(null);
      if (e.key === "Enter") finish(input.value);
    }

    cancelBtn.addEventListener("click", () => finish(null));
    okBtn.addEventListener("click", () => finish(input.value));
    root.addEventListener("click", (e) => {
      if (e.target === root) finish(null);
    });

    actions.append(cancelBtn, okBtn);
    box.append(msg, input, actions);
    root.append(box);
    document.body.append(root);
    document.addEventListener("keydown", onKey);
    input.focus();
    input.select();
  });
}

/**
 * @param {string} message
 * @param {string} [defaultValue]
 * @returns {Promise<string|null>}
 */
export function alysumPrompt(message, defaultValue = "") {
  if (!isAlysumDesktop()) {
    try {
      const value = window.prompt(message, defaultValue);
      return Promise.resolve(value);
    } catch {
      /* Electron or restricted context */
    }
  }
  return showDialog(message, defaultValue);
}
