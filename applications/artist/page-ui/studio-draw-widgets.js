import { hsvToRgb, rgbToHex } from "@alysum/artist/studio.js";

export const ICONS = {
    wrench: `<svg viewBox="0 0 24 24"><path d="M14.7 6.3a4.5 4.5 0 0 0-6.2 6.2L4 17l3 3 4.5-4.5a4.5 4.5 0 0 0 6.2-6.2L15 12l-3-3 2.7-2.7z"/></svg>`,
    wand: `<svg viewBox="0 0 24 24"><path d="M4 20 16 8M14 6l4-4 4 4-4 4M3 21l2-2"/></svg>`,
    lasso: `<svg viewBox="0 0 24 24"><path d="M8 7c0-3 8-3 8 1 0 5-9 4-9 9 0 3 6 3 7-1"/></svg>`,
    move: `<svg viewBox="0 0 24 24"><path d="M12 3v18M3 12h18M12 3l-3 3M12 3l3 3M12 21l-3-3M12 21l3-3M3 12l3-3M3 12l3 3M21 12l-3-3M21 12l-3 3"/></svg>`,
    brush: `<svg viewBox="0 0 24 24"><path d="M14 4l6 6-8 8H6v-6L14 4zM4 20h6"/></svg>`,
    smudge: `<svg viewBox="0 0 24 24"><path d="M8 14c0-4 2-8 4-10 1 3 2 5 2 8 2-2 3-5 3-7 2 3 3 6 3 9a6 6 0 0 1-12 0z"/></svg>`,
    eraser: `<svg viewBox="0 0 24 24"><path d="M4 16l8-8 6 6-6 6H8L4 16zM9 20h11"/></svg>`,
    fill: `<svg viewBox="0 0 24 24"><path d="M6 14l8-8 4 4-8 8H6v-4zM4 20h16M14 6l2-2 2 2"/></svg>`,
    dropper: `<svg viewBox="0 0 24 24"><path d="M12 3l3 3-8 8H4v-3l8-8zM3 21h7"/></svg>`,
    shapes: `<svg viewBox="0 0 24 24"><path d="M5 5h8v8H5zM14 10l5 9H9l5-9z"/></svg>`,
    layers: `<svg viewBox="0 0 24 24"><path d="M12 3l9 5-9 5-9-5 9-5zM3 12l9 5 9-5M3 17l9 5 9-5"/></svg>`,
    undo: `<svg viewBox="0 0 24 24"><path d="M8 8H4v4M4 12a8 8 0 1 0 2.3-5.7L4 8"/></svg>`,
    redo: `<svg viewBox="0 0 24 24"><path d="M16 8h4v4M20 12a8 8 0 1 1-2.3-5.7L20 8"/></svg>`,
    fit: `<svg viewBox="0 0 24 24"><path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/></svg>`,
};

export function railButton(id, icon, label) {
    const kind = ["paint", "smudge", "erase", "select", "transform", "shape", "fill", "pick"].includes(id) ? "data-tool" : "data-panel";
    return `<button type="button" class="draw-tool" ${kind}="${id}" aria-label="${label}">${ICONS[icon]}</button>`;
}

export function textButton(label, onClick) {
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = label;
    button.addEventListener("click", onClick);
    return button;
}

export function slider(label, min, max, value, onInput, step = 1) {
    const wrap = document.createElement("label");
    wrap.className = "draw-field";
    wrap.append(document.createTextNode(label));
    const input = document.createElement("input");
    input.type = "range";
    input.min = String(min);
    input.max = String(max);
    input.step = String(step);
    input.value = String(value);
    input.addEventListener("input", () => onInput(Number(input.value)));
    wrap.append(input);
    return wrap;
}

export function harmony(h) {
    return [0, 180, 30, -30, 120, 240].map((offset) => {
        const rgb = hsvToRgb(h + offset, 0.85, 1);
        return rgbToHex(rgb.r, rgb.g, rgb.b);
    });
}

export function drawDisc(canvas, hsv) {
    const ctx = canvas.getContext("2d");
    ctx.clearRect(0, 0, 220, 220);
    for (let angle = 0; angle < 360; angle += 2) {
        ctx.beginPath();
        ctx.strokeStyle = `hsl(${angle} 100% 50%)`;
        ctx.lineWidth = 18;
        ctx.arc(110, 110, 92, (angle - 2) * Math.PI / 180, (angle + 2) * Math.PI / 180);
        ctx.stroke();
    }
    const pure = hsvToRgb(hsv.h, 1, 1);
    const horizontal = ctx.createLinearGradient(48, 0, 172, 0);
    horizontal.addColorStop(0, "#ffffff");
    horizontal.addColorStop(1, rgbToHex(pure.r, pure.g, pure.b));
    ctx.fillStyle = horizontal;
    ctx.fillRect(48, 48, 124, 124);
    const vertical = ctx.createLinearGradient(0, 48, 0, 172);
    vertical.addColorStop(0, "rgba(0,0,0,0)");
    vertical.addColorStop(1, "#000000");
    ctx.fillStyle = vertical;
    ctx.fillRect(48, 48, 124, 124);
    const hueAngle = hsv.h * Math.PI / 180;
    ctx.fillStyle = "#fff";
    ctx.beginPath();
    ctx.arc(110 + Math.cos(hueAngle) * 92, 110 + Math.sin(hueAngle) * 92, 6, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = rgbToHex(hsvToRgb(hsv.h, hsv.s, hsv.v).r, hsvToRgb(hsv.h, hsv.s, hsv.v).g, hsvToRgb(hsv.h, hsv.s, hsv.v).b);
    ctx.strokeStyle = "#fff";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(48 + hsv.s * 124, 48 + (1 - hsv.v) * 124, 6, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
}
