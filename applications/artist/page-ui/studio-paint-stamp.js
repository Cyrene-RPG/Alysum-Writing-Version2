import { context2d, tipHash } from "/applications/artist/page-ui/studio-paint-utils.js";

/** Tip cache + stamp/smudge helpers for the painter. */
export function createStampKit(api) {
    const {
        tips,
        tipOrder,
        TIP_CACHE_LIMIT,
        MAX_STAMP,
        scratch,
        noise,
        ensureBuffer,
        layerCanvas,
        getStroke,
        getDoc,
    } = api;

function tip(shape, diameter, hardness) {
    const d = Math.max(2, Math.ceil(Math.max(2, diameter) / 2) * 2);
    const hard = Math.round(Math.max(0, Math.min(1, hardness)) * 20) / 20;
    const key = `${shape}:${d}:${hard}`;
    let canvas = tips.get(key);
    if (canvas) {
        const at = tipOrder.indexOf(key);
        if (at >= 0) {
            tipOrder.splice(at, 1);
            tipOrder.push(key);
        }
        return canvas;
    }
    canvas = document.createElement("canvas");
    canvas.width = d;
    canvas.height = d;
    const ctx = context2d(canvas);
    const r = d / 2;
    if (shape === "spray") {
        const dots = 18 + Math.floor(d * 0.9);
        for (let i = 0; i < dots; i += 1) {
            const a = tipHash(i + 1) * Math.PI * 2;
            const dist = Math.sqrt(tipHash(i + 17)) * r * 0.96;
            const s = Math.max(0.8, d * (0.018 + tipHash(i + 9) * 0.04));
            const g = ctx.createRadialGradient(
                r + Math.cos(a) * dist,
                r + Math.sin(a) * dist,
                0,
                r + Math.cos(a) * dist,
                r + Math.sin(a) * dist,
                s,
            );
            g.addColorStop(0, `rgba(255,255,255,${0.35 + tipHash(i + 5) * 0.65})`);
            g.addColorStop(1, "rgba(255,255,255,0)");
            ctx.fillStyle = g;
            ctx.beginPath();
            ctx.arc(r + Math.cos(a) * dist, r + Math.sin(a) * dist, s, 0, Math.PI * 2);
            ctx.fill();
        }
    } else if (shape === "flat") {
        const halfW = r * 0.92;
        const halfH = Math.max(1.2, r * (0.18 + (1 - hard) * 0.08));
        const edge = Math.max(0.8, halfH * (1.1 - hard * 0.7));
        const g = ctx.createLinearGradient(r, r - halfH - edge, r, r + halfH + edge);
        g.addColorStop(0, "rgba(255,255,255,0)");
        g.addColorStop(Math.min(0.45, edge / (halfH * 2 + edge * 2)), "rgba(255,255,255,1)");
        g.addColorStop(Math.max(0.55, 1 - edge / (halfH * 2 + edge * 2)), "rgba(255,255,255,1)");
        g.addColorStop(1, "rgba(255,255,255,0)");
        ctx.fillStyle = g;
        ctx.beginPath();
        const rr = Math.min(halfH, halfW * 0.35);
        ctx.moveTo(r - halfW + rr, r - halfH);
        ctx.lineTo(r + halfW - rr, r - halfH);
        ctx.quadraticCurveTo(r + halfW, r - halfH, r + halfW, r - halfH + rr);
        ctx.lineTo(r + halfW, r + halfH - rr);
        ctx.quadraticCurveTo(r + halfW, r + halfH, r + halfW - rr, r + halfH);
        ctx.lineTo(r - halfW + rr, r + halfH);
        ctx.quadraticCurveTo(r - halfW, r + halfH, r - halfW, r + halfH - rr);
        ctx.lineTo(r - halfW, r - halfH + rr);
        ctx.quadraticCurveTo(r - halfW, r - halfH, r - halfW + rr, r - halfH);
        ctx.closePath();
        ctx.fill();
    } else if (shape === "pencil" || shape === "charcoal") {
        const soft = shape === "charcoal" ? Math.min(hard, 0.42) : Math.max(0.2, hard * 0.9);
        const ry = shape === "pencil" ? r * 0.58 : r * 0.86;
        const g = ctx.createRadialGradient(r, r, Math.max(0, soft * Math.min(r, ry) * 0.55), r, r, Math.max(r, ry));
        g.addColorStop(0, "rgba(255,255,255,1)");
        g.addColorStop(0.55, "rgba(255,255,255,0.82)");
        g.addColorStop(1, "rgba(255,255,255,0)");
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.ellipse(r, r, r * 0.98, ry, -0.35, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalCompositeOperation = "destination-in";
        const nx = Math.floor(tipHash(3) * (noise.width - d));
        const ny = Math.floor(tipHash(7) * (noise.height - d));
        ctx.globalAlpha = shape === "pencil" ? 0.85 : 0.92;
        ctx.drawImage(noise, nx, ny, d, d, 0, 0, d, d);
        ctx.globalAlpha = 1;
        ctx.globalCompositeOperation = "destination-out";
        const marks = shape === "pencil" ? 9 : 14;
        for (let i = 0; i < marks; i += 1) {
            ctx.strokeStyle = `rgba(0,0,0,${0.12 + tipHash(i + 3) * (shape === "pencil" ? 0.28 : 0.4)})`;
            ctx.lineWidth = shape === "pencil" ? 0.55 + tipHash(i + 21) * 0.7 : 1 + tipHash(i + 21) * 1.4;
            ctx.beginPath();
            const y = r * 0.18 + tipHash(i + 11) * r * 1.5;
            ctx.moveTo(r * 0.08, y);
            ctx.lineTo(r * 1.9, y + (tipHash(i + 13) - 0.5) * r * 0.35);
            ctx.stroke();
        }
        ctx.globalCompositeOperation = "source-over";
    } else {
        // Round / airbrush: hard core with smooth Procreate-like falloff.
        const inner = hard >= 0.98 ? r * 0.92 : Math.max(0, r * Math.pow(hard, 0.72) * 0.94);
        const g = ctx.createRadialGradient(r, r, inner, r, r, r);
        g.addColorStop(0, "rgba(255,255,255,1)");
        if (hard < 0.98) {
            g.addColorStop(0.62, `rgba(255,255,255,${0.55 + hard * 0.35})`);
            g.addColorStop(0.86, `rgba(255,255,255,${0.12 + hard * 0.2})`);
        }
        g.addColorStop(1, "rgba(255,255,255,0)");
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(r, r, r, 0, Math.PI * 2);
        ctx.fill();
    }
    tips.set(key, canvas);
    tipOrder.push(key);
    while (tipOrder.length > TIP_CACHE_LIMIT) {
        const old = tipOrder.shift();
        tips.delete(old);
    }
    return canvas;
}

function stamp(target, brush, x, y, radius, color, alpha, angle) {
    const d = Math.max(2, Math.min(MAX_STAMP, Math.ceil(radius * 2)));
    ensureBuffer(scratch, d, d, true);
    const ctx = context2d(scratch);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = "source-over";
    ctx.clearRect(0, 0, d, d);
    ctx.save();
    ctx.translate(d / 2, d / 2);
    ctx.rotate(angle || 0);
    const source = tip(brush.shape, d, brush.hardness);
    ctx.drawImage(source, -d / 2, -d / 2, d, d);
    ctx.restore();
    if (brush.grain > 0 && brush.shape !== "pencil" && brush.shape !== "charcoal") {
        ctx.globalCompositeOperation = "destination-in";
        const nx = Math.abs(Math.floor(x * 5)) % noise.width;
        const ny = Math.abs(Math.floor(y * 5)) % noise.height;
        ctx.globalAlpha = Math.min(1, 0.35 + brush.grain * 0.65);
        ctx.drawImage(noise, nx, ny, Math.min(d, noise.width), Math.min(d, noise.height), 0, 0, d, d);
        ctx.globalAlpha = 1;
    }
    ctx.globalCompositeOperation = "source-in";
    ctx.fillStyle = color;
    ctx.fillRect(0, 0, d, d);
    target.save();
    target.globalAlpha = alpha;
    target.drawImage(scratch, 0, 0, d, d, x - radius, y - radius, radius * 2, radius * 2);
    target.restore();
}

function brushSwatch(brush, color = "#f2f2f7") {
    const size = 80;
    const canvas = document.createElement("canvas");
    canvas.width = size;
    canvas.height = size;
    const ctx = context2d(canvas);
    ctx.clearRect(0, 0, size, size);
    stamp(ctx, brush, size / 2, size / 2, size * 0.34, color, 1, brush.angleFollow ? -0.55 : 0);
    if (brush.scatter > 0.2) {
        stamp(ctx, brush, size * 0.32, size * 0.38, size * 0.16, color, 0.55, 0.2);
        stamp(ctx, brush, size * 0.68, size * 0.62, size * 0.18, color, 0.45, -0.3);
    }
    return canvas.toDataURL("image/png");
}

function smudge(x0, y0, x1, y1, radius, strength) {
    const canvas = layerCanvas(getDoc().activeLayerId);
    const r = Math.max(1, Math.ceil(radius));
    const d = Math.min(MAX_STAMP, r * 2);
    const sx = Math.floor(x0 - r);
    const sy = Math.floor(y0 - r);
    ensureBuffer(scratch, d, d, true);
    const sample = context2d(scratch);
    sample.setTransform(1, 0, 0, 1, 0, 0);
    sample.globalAlpha = 1;
    sample.globalCompositeOperation = "source-over";
    sample.clearRect(0, 0, d, d);
    sample.drawImage(canvas, sx, sy, d, d, 0, 0, d, d);
    sample.globalCompositeOperation = "destination-in";
    sample.drawImage(tip("round", d, Math.max(0.05, getStroke()?.brush?.hardness ?? 0.2)), 0, 0, d, d);
    sample.globalCompositeOperation = "source-over";
    const ctx = context2d(canvas);
    ctx.save();
    ctx.globalAlpha = strength;
    ctx.drawImage(scratch, 0, 0, d, d, x1 - r, y1 - r, d, d);
    ctx.restore();
}

    return { tip, stamp, brushSwatch, smudge };
}
