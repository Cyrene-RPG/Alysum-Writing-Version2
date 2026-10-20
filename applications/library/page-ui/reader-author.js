import { mountReaderTips } from "./reader-tips.js";
import { fetchReaderAuthorCard } from "@alysum/library/author-card.js?v=4";
import { setFollowing } from "@alysum/library/author-follow.js?v=1";
import { authorInitial } from "@alysum/library/author-profile.js?v=3";

function escapeHtml(str) {
    return String(str ?? "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;");
}

function fallbackCard(work) {
    return {
        ownerId: String(work?.ownerUserId || "").trim(),
        username: "",
        displayName: work?.author || "Author",
        profileImageUrl: "",
        bio: "",
        fictionCount: 1,
        followers: 0,
        following: false,
        level: 0,
        xpRatio: 0,
        hasXp: false,
    };
}

function titleName(card, work) {
    const display = String(card.displayName || "").trim();
    const username = String(card.username || "").trim();
    const listing = String(work?.author || "").trim();
    const source = display && display.toLowerCase() !== username.toLowerCase()
        ? display
        : (listing || display || "Author");
    return source.split(/\s+/)[0] || "Author";
}

function metric(value, label, id = "") {
    return `<li${id ? ` id="${id}"` : ""}><span class="reader-author-num">${escapeHtml(String(value ?? 0))}</span><span class="reader-author-cap">${escapeHtml(label)}</span></li>`;
}

export async function mountReaderAuthor(root, { work, supabase, session, onLayout }) {
    const viewerId = session?.mode === "cloud" ? String(session.user?.id || "").trim() : "";
    let card = fallbackCard(work);
    let followError = "";
    root.innerHTML = `<div class="reader-author-skel" aria-hidden="true"></div>`;
    try {
        const live = await fetchReaderAuthorCard(supabase, {
            ownerUserId: work?.ownerUserId,
            viewerId,
        });
        if (live) card = live;
        else if (work?.author) card = { ...card, displayName: work.author };
    } catch (error) {
        followError = error?.message || "Could not load follow status. Please try again.";
    }

    const name = titleName(card, work);
    const mine = viewerId && card.ownerId && viewerId === card.ownerId;
    const img = card.profileImageUrl
        ? `<img src="${escapeHtml(card.profileImageUrl)}" alt="" />`
        : "";
    const follow = mine || !card.ownerId
        ? ""
        : `<button type="button" class="reader-follow${card.following ? " is-on" : ""}" id="readerFollowBtn">${followError ? "Retry follow status" : card.following ? "Following" : "Follow"}</button>`;
    const bio = card.bio
        ? `<p class="reader-author-bio" id="readerAuthorBio">${escapeHtml(card.bio)}</p>`
        : `<p class="reader-author-bio is-empty">This author has not written a bio yet.</p>`;
    const bar = card.hasXp
        ? `<div class="reader-author-xp" aria-hidden="true"><span style="width:${Math.round((card.xpRatio || 0) * 100)}%"></span></div>`
        : "";

    root.innerHTML = `
        <p class="reader-end-kicker">About the author</p>
        <div class="reader-author">
            <div class="reader-author-portrait${card.profileImageUrl ? "" : " has-initial"}" aria-hidden="true">
                ${img}
                <span>${escapeHtml(authorInitial(name))}</span>
            </div>
            <div class="reader-author-copy">
                <div class="reader-author-top">
                    <h2>${escapeHtml(name)}</h2>
                    ${follow}
                </div>
                ${bio}
                <button type="button" class="reader-author-more" id="readerAuthorMore" hidden>More</button>
                ${bar}
                <p class="reader-author-note" id="readerFollowHint" role="status"${followError ? "" : " hidden"}>${escapeHtml(followError)}</p>
            </div>
            <ul class="reader-author-metrics">
                ${metric(card.fictionCount, card.fictionCount === 1 ? "Fiction" : "Fictions")}
                ${metric(followError ? "—" : card.followers, card.followers === 1 ? "Follower" : "Followers", "reader-follower-metric")}
                ${metric(card.level || 0, "Level")}
            </ul>
        </div>`;

    mountReaderTips(root,{supportLinks:card.supportLinks,isOwner:mine,onLayout});

    const bioEl = root.querySelector("#readerAuthorBio");
    const more = root.querySelector("#readerAuthorMore");
    if (bioEl && more && bioEl.scrollHeight > bioEl.clientHeight + 4) {
        more.hidden = false;
        more.addEventListener("click", () => {
            bioEl.classList.add("is-open");
            more.hidden = true;
        });
    }

    const followBtn = root.querySelector("#readerFollowBtn");
    followBtn?.addEventListener("mouseenter", () => {
        if (!followError && card.following) followBtn.textContent = "Unfollow";
    });
    followBtn?.addEventListener("mouseleave", () => {
        if (!followError && card.following) followBtn.textContent = "Following";
    });
    followBtn?.addEventListener("click", async () => {
        const hintEl = root.querySelector("#readerFollowHint");
        if (!viewerId) {
            if (hintEl) {
                hintEl.hidden = false;
                hintEl.textContent = "Sign in to follow this author.";
            }
            return;
        }
        const btn = root.querySelector("#readerFollowBtn");
        if (btn) btn.disabled = true;
        if (hintEl) hintEl.hidden = true;
        if (followError) {
            await mountReaderAuthor(root, { work, supabase, session, onLayout });
            return;
        }
        try {
            const next = await setFollowing(supabase, {
                authorId: card.ownerId,
                viewerId,
                follow: !card.following,
            });
            card.following = next.following;
            card.followers = next.count;
            if (btn) {
                btn.classList.toggle("is-on", card.following);
                btn.textContent = card.following ? "Following" : "Follow";
                btn.disabled = false;
            }
            const followerMetric = root.querySelector("#reader-follower-metric");
            if (followerMetric) {
                followerMetric.querySelector(".reader-author-num").textContent = String(card.followers);
                followerMetric.querySelector(".reader-author-cap").textContent = card.followers === 1 ? "Follower" : "Followers";
            }
        } catch (error) {
            followError = error?.message || "Could not confirm follow status. Please try again.";
            if (hintEl) {
                hintEl.hidden = false;
                hintEl.textContent = followError;
            }
            if (btn) {
                btn.textContent = "Retry follow status";
                btn.disabled = false;
            }
        }
    });
}

