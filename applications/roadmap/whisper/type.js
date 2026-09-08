const LINES = [
    " the signal is already inside",
    " do not check the last sector",
    " someone answered in your name",
    " the log remembers a day that did not happen",
    " pid 0 is still listening",
    " you were compiled from something else",
    " the door was open before you knocked",
    " ignore the handshake that knows you",
    " root is a guest tonight",
    " the checksum came back as a name",
];

const TYPE_MS = 55;
const WIPE_MS = 22;
const HOLD_MS = 600;
const WAIT_MIN = 30_000;
const WAIT_MAX = 120_000;

function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

function pickLine(last) {
    let line = LINES[Math.floor(Math.random() * LINES.length)];
    if (LINES.length > 1) {
        while (line === last) {
            line = LINES[Math.floor(Math.random() * LINES.length)];
        }
    }
    return line;
}

function waitMs() {
    return WAIT_MIN + Math.floor(Math.random() * (WAIT_MAX - WAIT_MIN + 1));
}

export async function startWhisper() {
    const el = document.getElementById("whisperLine");
    if (!el) return;
    let last = "";
    while (true) {
        const line = pickLine(last);
        last = line;
        for (let i = 1; i <= line.length; i += 1) {
            el.textContent = line.slice(0, i);
            await sleep(TYPE_MS);
        }
        await sleep(HOLD_MS);
        for (let i = line.length - 1; i >= 0; i -= 1) {
            el.textContent = line.slice(0, i);
            await sleep(WIPE_MS);
        }
        el.textContent = "";
        await sleep(waitMs());
    }
}
