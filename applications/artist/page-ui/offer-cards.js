import { offerActionLabel } from "@alysum/artist/offers.js";

function statusLabel(status) {
    return status === "pending" ? "On hold" : "Available";
}

export function paintOfferCard(listing) {
    const card = document.createElement("article");
    card.className = "artist-offer";
    if (listing.imageUrl) {
        const img = document.createElement("img");
        img.src = listing.imageUrl;
        img.alt = listing.title;
        img.loading = "lazy";
        img.referrerPolicy = "no-referrer";
        card.append(img);
    }
    const badge = document.createElement("span");
    badge.className = "artist-badge";
    badge.textContent = listing.status === "pending" ? "On hold" : offerActionLabel(listing.type);
    const title = document.createElement("h2");
    if (listing.href) {
        const link = document.createElement("a");
        link.href = listing.href;
        link.textContent = listing.title;
        title.append(link);
    } else {
        title.textContent = listing.title;
    }
    const meta = document.createElement("p");
    const bits = [];
    if (listing.priceLabel) bits.push(listing.priceLabel);
    bits.push(statusLabel(listing.status));
    meta.textContent = bits.join(" · ");
    card.append(badge, title, meta);
    if (listing.summary) {
        const summary = document.createElement("p");
        summary.className = "artist-prose";
        summary.textContent = listing.summary;
        card.append(summary);
    }
    if (listing.status === "available" && listing.checkoutUrl) {
        const action = document.createElement("a");
        action.className = "artist-primary";
        action.href = listing.checkoutUrl;
        action.target = "_blank";
        action.rel = "noopener noreferrer";
        action.referrerPolicy = "no-referrer";
        action.textContent = offerActionLabel(listing.type);
        card.append(action);
    } else if (listing.status === "available") {
        const note = document.createElement("p");
        note.className = "artist-status";
        note.textContent = "No payment link yet.";
        card.append(note);
    }
    return card;
}

export function paintOfferGrid(container, listings) {
    container.replaceChildren();
    for (const listing of listings) container.append(paintOfferCard(listing));
}
