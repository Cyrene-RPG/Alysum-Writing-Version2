const GLYPHS = [
    "ᔑ", "ʖ", "ᓵ", "↸", "ᒷ", "⎓", "⊣", "⍑", "╎", "⋮",
    "ꖌ", "ꖎ", "ᒲ", "リ", "𝙹", "¡", "ᑑ", "∷", "ᓭ", "ℸ",
    "⚍", "⍊", "‖", "⨅",
];
const LENGTH = 22;
const TICK_MS = 180;

function rollLine() {
    let line = "";
    for (let i = 0; i < LENGTH; i += 1) {
        line += GLYPHS[Math.floor(Math.random() * GLYPHS.length)];
    }
    return line;
}

export function startEnchantScramble() {
    const el = document.getElementById("enchantLine");
    if (!el) return;
    const paint = () => { el.textContent = rollLine(); };
    paint();
    setInterval(paint, TICK_MS);
}
