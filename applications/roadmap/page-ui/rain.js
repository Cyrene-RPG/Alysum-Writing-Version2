export function startMatrixRain() {
    const canvas = document.getElementById("rain");
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let w = 0;
    let h = 0;
    let columns = 0;
    let drops = [];
    const chars = "アイウエオカキクケコサシスセソ0123456789ABCDEFｱｲｳｴｵ";

    function resize() {
        w = canvas.width = window.innerWidth;
        h = canvas.height = window.innerHeight;
        const fontSize = 15;
        columns = Math.floor(w / fontSize);
        drops = new Array(columns).fill(0).map(() => Math.random() * -50);
    }

    window.addEventListener("resize", resize);
    resize();

    function draw() {
        ctx.fillStyle = "rgba(0,0,0,0.08)";
        ctx.fillRect(0, 0, w, h);
        ctx.fillStyle = "#3FF35A";
        ctx.font = "15px monospace";
        for (let i = 0; i < drops.length; i += 1) {
            const text = chars[Math.floor(Math.random() * chars.length)];
            ctx.fillText(text, i * 15, drops[i] * 15);
            if (drops[i] * 15 > h && Math.random() > 0.975) {
                drops[i] = 0;
            }
            drops[i] += 1;
        }
    }

    setInterval(draw, 45);
}
