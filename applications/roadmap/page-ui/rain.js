const WORD = "lewstar";
const WORD_BACK = "ratswel";

function pickLewstarSpell(rows) {
    const roll = Math.random();
    const letters = roll < 0.01 ? WORD : roll < 0.02 ? WORD_BACK : "";
    if (!letters) return null;
    const maxStart = Math.max(2, rows - letters.length - 2);
    const startAt = Math.min(maxStart, Math.floor(rows * 0.35 + Math.random() * rows * 0.25));
    return { letters, startAt: Math.max(2, startAt) };
}

export function startMatrixRain() {
    const canvas = document.getElementById("rain");
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let w = 0;
    let h = 0;
    let columns = 0;
    let drops = [];
    let spells = [];
    let specialIndex = -1;
    let specialColor = "";
    const chars = "アイウエオカキクケコサシスセソ0123456789ABCDEFｱｲｳｴｵ";

    function resize() {
        w = canvas.width = window.innerWidth;
        h = canvas.height = window.innerHeight;
        const fontSize = 15;
        columns = Math.floor(w / fontSize);
        drops = new Array(columns).fill(0).map(() => Math.random() * -50);
        spells = new Array(columns).fill(null);
        specialIndex = -1;
        specialColor = "";
    }

    window.addEventListener("resize", resize);
    resize();

    function draw() {
        ctx.fillStyle = "rgba(0,0,0,0.08)";
        ctx.fillRect(0, 0, w, h);
        ctx.font = "15px monospace";
        for (let i = 0; i < drops.length; i += 1) {
            const spell = spells[i];
            const row = drops[i];
            const atName = spell
                && row >= spell.startAt
                && row < spell.startAt + spell.letters.length;
            if (atName) {
                ctx.fillStyle = "#B6FFC0";
                ctx.fillText(spell.letters[row - spell.startAt], i * 15, row * 15);
            } else {
                ctx.fillStyle = i === specialIndex ? specialColor : "#3FF35A";
                ctx.fillText(chars[Math.floor(Math.random() * chars.length)], i * 15, row * 15);
            }
            if (row * 15 > h && Math.random() > 0.975) {
                if (specialIndex === i) {
                    specialIndex = -1;
                    specialColor = "";
                }
                drops[i] = 0;
                spells[i] = pickLewstarSpell(Math.floor(h / 15));
                if (specialIndex < 0 && !spells[i]) {
                    const roll = Math.random();
                    if (roll < 0.07) {
                        specialIndex = i;
                        specialColor = "#FF4D4D";
                    } else if (roll < 0.21) {
                        specialIndex = i;
                        specialColor = "#ffffff";
                    }
                }
            }
            drops[i] += 1;
        }
    }

    setInterval(draw, 45);
}
