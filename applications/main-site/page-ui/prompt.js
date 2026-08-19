/**
 * On-screen prompt (window.prompt is unsupported in Electron).
 */

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
      -webkit-text-fill-color: #fff;
      caret-color: #fff;
      color-scheme: dark;
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

function showDialog(message, defaultValue, options = {}) {
  injectStyles();
  const maxLength = Number(options.maxLength) > 0 ? Number(options.maxLength) : null;
  const confirmLabel = options.confirmLabel || "OK";
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
    const start = String(defaultValue ?? "");
    input.value = maxLength ? start.slice(0, maxLength) : start;
    input.autocomplete = "off";
    if (maxLength) {
      input.maxLength = maxLength;
      input.setAttribute("maxlength", String(maxLength));
    }

    const actions = document.createElement("div");
    actions.className = "alysum-prompt-actions";

    const cancelBtn = document.createElement("button");
    cancelBtn.type = "button";
    cancelBtn.className = "alysum-prompt-btn";
    cancelBtn.textContent = "Cancel";

    const okBtn = document.createElement("button");
    okBtn.type = "button";
    okBtn.className = "alysum-prompt-btn alysum-prompt-btn--primary";
    okBtn.textContent = confirmLabel;

    function finish(value) {
      root.remove();
      document.removeEventListener("keydown", onKey);
      resolve(value);
    }

    function readValue() {
      const raw = input.value;
      return maxLength ? raw.slice(0, maxLength) : raw;
    }

    function onKey(e) {
      if (e.key === "Escape") {
        e.preventDefault();
        finish(null);
      }
      if (e.key === "Enter") {
        e.preventDefault();
        finish(readValue());
      }
    }

    cancelBtn.addEventListener("click", () => finish(null));
    okBtn.addEventListener("click", () => finish(readValue()));
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

function showConfirm(message) {
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

    const actions = document.createElement("div");
    actions.className = "alysum-prompt-actions";

    const cancelBtn = document.createElement("button");
    cancelBtn.type = "button";
    cancelBtn.className = "alysum-prompt-btn";
    cancelBtn.textContent = "Cancel";

    const okBtn = document.createElement("button");
    okBtn.type = "button";
    okBtn.className = "alysum-prompt-btn alysum-prompt-btn--primary";
    okBtn.textContent = "Yes";

    function finish(value) {
      root.remove();
      document.removeEventListener("keydown", onKey);
      resolve(value);
    }

    function onKey(e) {
      if (e.key === "Escape") {
        e.preventDefault();
        finish(false);
      }
      if (e.key === "Enter") {
        e.preventDefault();
        finish(true);
      }
    }

    cancelBtn.addEventListener("click", () => finish(false));
    okBtn.addEventListener("click", () => finish(true));
    root.addEventListener("click", (e) => {
      if (e.target === root) finish(false);
    });

    actions.append(cancelBtn, okBtn);
    box.append(msg, actions);
    root.append(box);
    document.body.append(root);
    document.addEventListener("keydown", onKey);
    okBtn.focus();
  });
}

/**
 * @param {string} message
 * @param {string} [defaultValue]
 * @param {{ maxLength?: number, confirmLabel?: string }} [options]
 * @returns {Promise<string|null>}
 */
export function alysumPrompt(message, defaultValue = "", options = {}) {
  return showDialog(message, defaultValue, options);
}

/**
 * @param {string} message
 * @returns {Promise<boolean>}
 */
export function alysumConfirm(message) {
  return showConfirm(message);
}
