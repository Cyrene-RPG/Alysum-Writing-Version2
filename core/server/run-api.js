/**
 * One-shot local runner for /api/*.js handlers.
 * stdin: { headers, body }  stdout: { status, body }
 */
const path = require("path");

const handler = require(path.resolve(process.argv[2]));

function readStdin() {
    return new Promise((resolve) => {
        const chunks = [];
        process.stdin.on("data", (chunk) => chunks.push(chunk));
        process.stdin.on("end", () => resolve(Buffer.concat(chunks)));
    });
}

(async () => {
    const raw = await readStdin();
    const msg = JSON.parse(raw.toString("utf8") || "{}");
    const req = {
        method: "POST",
        headers: msg.headers || {},
        body: msg.body,
    };
    let sent = false;
    const res = {
        statusCode: 200,
        setHeader() {},
        end(data) {
            if (sent) return;
            sent = true;
            process.stdout.write(
                JSON.stringify({
                    status: this.statusCode,
                    body: data == null ? "" : String(data),
                })
            );
        },
    };
    await handler(req, res);
    if (!sent) {
        process.stdout.write(JSON.stringify({ status: res.statusCode, body: "" }));
    }
})().catch((err) => {
    process.stdout.write(
        JSON.stringify({
            status: 500,
            body: JSON.stringify({ error: err.message || "API handler failed." }),
        })
    );
    process.exitCode = 1;
});
