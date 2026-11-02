import { betaReadCopyrightNotice } from "/applications/editor/page-ui/beta-read-snapshot.js";

/** Reader-side mandatory acknowledgment; do not fetch chapters until accepted. */
export function mountBetaReadGate({ host, betaReadId, authorUsername, onAccept }) {
    const notice = betaReadCopyrightNotice(authorUsername);
    const key = `alysum-beta-ack:${betaReadId}`;
    const wrap = document.createElement("section");
    wrap.className = "beta-read-gate";
    const title = document.createElement("h1");
    title.textContent = notice.heading;
    const subtitle = document.createElement("h2");
    subtitle.textContent = notice.subheading;
    const introduction = document.createElement("p");
    introduction.textContent = notice.introduction;
    const lead = document.createElement("p");
    lead.textContent = "Without the author's explicit permission, you may not:";
    const list = document.createElement("ul");
    for (const rule of notice.restrictions) {
        const item = document.createElement("li");
        item.textContent = rule;
        list.append(item);
    }
    const closing = document.createElement("p");
    closing.textContent = notice.closing;
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = notice.acknowledgeLabel;
    wrap.append(title, subtitle, introduction, lead, list, closing, button);
    host.replaceChildren(wrap);
    const proceed = () => { wrap.remove(); onAccept(); };
    button.addEventListener("click", () => {
        proceed();
    });
}
