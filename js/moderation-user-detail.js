import {
    reportReasonLabel,
    reportStatusLabel,
    setBookVisibility,
    resolveAppeal,
} from "./library-reports-api.js";
import {
    staffGetUserDetail,
    staffListUserBooks,
    staffGetUserSafety,
    staffGetUserEngagement,
} from "./staff-users-api.js";

export function escapeHtml(str) {
    return String(str ?? "")
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;");
}

export function formatDate(iso) {
    if (!iso) return "—";
    const n = Number(iso);
    if (!Number.isNaN(n) && n > 1e11) return new Date(n).toLocaleString();
    return new Date(iso).toLocaleString();
}

export function formatRelative(iso) {
    if (!iso) return "—";
    const diff = Date.now() - new Date(iso).getTime();
    if (diff < 60_000) return "just now";
    if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
    if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`;
    return formatDate(iso);
}

function flag(label, kind = "muted") {
    return `<span class="mod-flag ${kind}">${escapeHtml(label)}</span>`;
}

export function deriveAccountStanding(detail, safety = {}) {
    const mod = detail?.moderation_status;
    const counts = detail?.counts || {};
    const pendingReports = Number(counts.pending_reports ?? counts.reports_against_pending ?? 0);
    const openViolations = Number(counts.open_violations ?? 0);
    const pendingAppeals = (safety.appeals || []).filter((a) =>
        ["pending", "reviewing"].includes(a.status)
    ).length;

    if (mod?.account_terminated) {
        return { level: "danger", title: "Account terminated", summary: "This account has been permanently removed from the platform." };
    }
    if (mod?.account_suspended) {
        return { level: "danger", title: "Account suspended", summary: "The user cannot sign in or use Alysum." };
    }
    if (mod?.publishing_revoked) {
        return { level: "danger", title: "Publishing revoked", summary: "They cannot publish new or updated library entries." };
    }
    if (mod?.publishing_suspended_until && new Date(mod.publishing_suspended_until) > new Date()) {
        return {
            level: "warn",
            title: "Publishing suspended",
            summary: `Suspended until ${formatDate(mod.publishing_suspended_until)}.`,
        };
    }
    if (pendingAppeals > 0) {
        return { level: "warn", title: "Appeal pending", summary: `${pendingAppeals} appeal(s) waiting for staff review.` };
    }
    if (openViolations > 0) {
        return { level: "warn", title: "Open violations", summary: `${openViolations} confirmed violation(s) need follow-up.` };
    }
    if (pendingReports > 0) {
        return { level: "warn", title: "Reports pending", summary: `${pendingReports} open report(s) against their books.` };
    }
    if (Number(counts.active_strikes) > 0) {
        return {
            level: "warn",
            title: `${counts.active_strikes} active strike(s)`,
            summary: "Strike tier affects publishing and enforcement actions.",
        };
    }
    return { level: "ok", title: "Good standing", summary: "No active suspensions, strikes, or pending moderation items." };
}

function publishMetaSummary(meta) {
    if (!meta || typeof meta !== "object") return "—";
    const parts = [];
    if (meta.rating) parts.push(`Rating: ${meta.rating}`);
    if (meta.genres?.length) parts.push(`Genres: ${meta.genres.join(", ")}`);
    if (meta.anonymous) parts.push("Anonymous");
    return parts.length ? parts.join(" · ") : "—";
}

function renderBooks(books, userId) {
    if (!books.length) return '<p class="mod-detail-empty">No books.</p>';
    return `
        <div class="mod-table-wrap">
            <table class="mod-table">
                <thead>
                    <tr><th>Title</th><th>Status</th><th>Stats</th><th>Moderation</th><th>Actions</th></tr>
                </thead>
                <tbody>
                    ${books.map((b) => {
                        const vis = b.visibility || (b.is_published ? "public" : "draft");
                        const visClass = vis === "removed" || vis === "hidden" ? "danger" : vis === "draft" ? "muted" : "ok";
                        return `
                            <tr>
                                <td>
                                    <strong>${escapeHtml(b.title || "Untitled")}</strong>
                                    <div class="mod-queue-meta"><code>${escapeHtml(b.id)}</code></div>
                                    <div class="mod-queue-meta">${escapeHtml(publishMetaSummary(b.publish_meta))}</div>
                                </td>
                                <td>
                                    ${b.is_published ? flag("Published", "ok") : flag("Draft", "muted")}
                                    <div class="mod-queue-meta">Updated ${escapeHtml(formatDate(b.updated))}</div>
                                </td>
                                <td>
                                    ${Number(b.words || 0).toLocaleString()} words
                                    <div class="mod-queue-meta">${b.comment_count || 0} comments · ${b.like_count || 0} likes</div>
                                    ${Number(b.report_count) > 0 ? `<div class="mod-queue-meta">${b.report_count} report(s)</div>` : ""}
                                </td>
                                <td>${flag(vis, visClass)}</td>
                                <td>
                                    <div class="mod-actions" style="margin-top:0">
                                        ${b.is_published ? `<a class="mod-btn" href="read.html?book=${encodeURIComponent(b.id)}" target="_blank" rel="noopener">Read</a>` : ""}
                                        <button type="button" class="mod-btn" data-vis="public" data-book="${escapeHtml(b.id)}">Public</button>
                                        <button type="button" class="mod-btn" data-vis="hidden" data-book="${escapeHtml(b.id)}">Hide</button>
                                        <button type="button" class="mod-btn danger" data-vis="removed" data-book="${escapeHtml(b.id)}">Remove</button>
                                    </div>
                                </td>
                            </tr>
                        `;
                    }).join("")}
                </tbody>
            </table>
        </div>
    `;
}

function renderReportsTable(reports, emptyLabel) {
    if (!reports?.length) return `<p class="mod-detail-empty">${escapeHtml(emptyLabel)}</p>`;
    return `
        <div class="mod-table-wrap">
            <table class="mod-table">
                <thead><tr><th>Book</th><th>Reason</th><th>Status</th><th>Priority</th><th>Date</th></tr></thead>
                <tbody>
                    ${reports.map((r) => `
                        <tr class="${r.status === "pending" || r.status === "reviewing" ? "is-pending-row" : ""}">
                            <td><code>${escapeHtml(r.book_id)}</code></td>
                            <td>${escapeHtml(reportReasonLabel(r.reason))}</td>
                            <td>${escapeHtml(reportStatusLabel(r.status))}</td>
                            <td>${escapeHtml(r.priority || "—")}</td>
                            <td>${escapeHtml(formatDate(r.created_at))}</td>
                        </tr>
                    `).join("")}
                </tbody>
            </table>
        </div>
    `;
}

function renderPendingInbox(detail, safety) {
    const counts = detail.counts || {};
    const pendingReports = (safety.reports_as_author || []).filter((r) =>
        ["pending", "reviewing"].includes(r.status)
    );
    const openViolations = (safety.violations || []).filter((v) =>
        ["open", "deadline_missed", "appealed"].includes(v.status)
    );
    const pendingAppeals = (safety.appeals || []).filter((a) =>
        ["pending", "reviewing"].includes(a.status)
    );
    const items = pendingReports.length + openViolations.length + pendingAppeals.length;
    if (!items) {
        return `<p class="mod-detail-empty">No pending moderation items for this user.</p>`;
    }

    let html = '<div class="mod-pending-list">';
    pendingReports.forEach((r) => {
        html += `
            <div class="mod-pending-item">
                <div class="mod-pending-type">Report</div>
                <div class="mod-pending-body">
                    <strong>${escapeHtml(reportReasonLabel(r.reason))}</strong> on <code>${escapeHtml(r.book_id)}</code>
                    <div class="mod-queue-meta">${escapeHtml(reportStatusLabel(r.status))} · ${escapeHtml(formatDate(r.created_at))}</div>
                </div>
                <a class="mod-btn" href="moderation-dashboard.html?view=inbox">Review in inbox →</a>
            </div>
        `;
    });
    openViolations.forEach((v) => {
        html += `
            <div class="mod-pending-item">
                <div class="mod-pending-type warn">Violation</div>
                <div class="mod-pending-body">
                    <strong>${escapeHtml(v.policy_violated)}</strong>
                    <div class="mod-queue-meta">Book <code>${escapeHtml(v.book_id)}</code> · ${escapeHtml(v.status)} · deadline ${escapeHtml(formatDate(v.deadline))}</div>
                </div>
            </div>
        `;
    });
    pendingAppeals.forEach((a) => {
        html += `
            <div class="mod-pending-item" data-appeal-id="${escapeHtml(a.id)}">
                <div class="mod-pending-type warn">Appeal</div>
                <div class="mod-pending-body">
                    <p>${escapeHtml(a.appeal_text || "")}</p>
                    <div class="mod-queue-meta">${escapeHtml(formatDate(a.created_at))}</div>
                </div>
                <div class="mod-actions" style="margin:0">
                    <button type="button" class="mod-btn success" data-appeal-outcome="overturned" data-appeal-id="${escapeHtml(a.id)}">Overturn</button>
                    <button type="button" class="mod-btn" data-appeal-outcome="partial" data-appeal-id="${escapeHtml(a.id)}">Partial</button>
                    <button type="button" class="mod-btn danger" data-appeal-outcome="upheld" data-appeal-id="${escapeHtml(a.id)}">Uphold</button>
                </div>
            </div>
        `;
    });
    html += "</div>";
    return html;
}

function renderStandingCard(standing, mod, counts) {
    return `
        <section class="mod-standing-card is-${standing.level}">
            <div class="mod-standing-main">
                <div class="mod-standing-label">Account standing</div>
                <h2 class="mod-standing-title">${escapeHtml(standing.title)}</h2>
                <p class="mod-standing-summary">${escapeHtml(standing.summary)}</p>
            </div>
            <div class="mod-standing-facts">
                ${mod?.publishing_revoked ? flag("Publishing revoked", "danger") : ""}
                ${mod?.account_suspended ? flag("Suspended", "danger") : ""}
                ${mod?.account_terminated ? flag("Terminated", "danger") : ""}
                ${Number(counts.active_strikes) > 0 ? flag(`${counts.active_strikes} strike(s)`, "warn") : ""}
                ${Number(counts.open_violations) > 0 ? flag(`${counts.open_violations} violation(s)`, "warn") : ""}
                ${Number(counts.reports_against) > 0 ? flag(`${counts.reports_against} total reports`, "muted") : ""}
            </div>
        </section>
    `;
}

function renderUserHtml(userId, detail, books, safety, engagement) {
    const p = detail.profile || {};
    const auth = detail.auth || {};
    const counts = detail.counts || {};
    const mod = detail.moderation_status;
    const standing = deriveAccountStanding(detail, safety);
    const avatar = p.profile_image_url
        ? `<img class="mod-user-avatar" src="${escapeHtml(p.profile_image_url)}" alt="" />`
        : `<div class="mod-user-avatar mod-user-avatar-placeholder">${escapeHtml((p.username || "?")[0]?.toUpperCase())}</div>`;

    return `
        <div class="mod-user-detail" data-user-id="${escapeHtml(userId)}">
            <header class="mod-user-header">
                ${avatar}
                <div class="mod-user-header-copy">
                    <h1 class="mod-user-title">@${escapeHtml(p.username)}</h1>
                    <p class="mod-user-sub">${escapeHtml(p.display_name)} · ${escapeHtml(p.account_type || "—")}</p>
                    <p class="mod-user-sub">${escapeHtml(p.email || auth.auth_email || "No email")} · <code>${escapeHtml(p.id)}</code></p>
                    <p class="mod-user-sub">
                        ${p.is_online || (p.last_seen_at && Date.now() - new Date(p.last_seen_at).getTime() < 300000)
                            ? flag("Online", "ok")
                            : flag(`Last seen ${formatRelative(p.last_seen_at || auth.last_sign_in_at)}`, "muted")}
                        · Joined ${escapeHtml(formatDate(p.created_at))}
                    </p>
                </div>
            </header>

            ${renderStandingCard(standing, mod, counts)}

            <div class="mod-stats mod-stats-compact">
                <div class="mod-stat"><div class="mod-stat-label">Books</div><div class="mod-stat-value">${counts.books || 0}</div></div>
                <div class="mod-stat"><div class="mod-stat-label">Published</div><div class="mod-stat-value">${counts.published_books || 0}</div></div>
                <div class="mod-stat"><div class="mod-stat-label">Words</div><div class="mod-stat-value">${Number(counts.book_words_total ?? p.words ?? 0).toLocaleString()}</div></div>
                <div class="mod-stat"><div class="mod-stat-label">Streak</div><div class="mod-stat-value">${p.streak || 0}</div></div>
                <div class="mod-stat"><div class="mod-stat-label">Pending reports</div><div class="mod-stat-value">${(safety.reports_as_author || []).filter((r) => ["pending","reviewing"].includes(r.status)).length}</div></div>
                <div class="mod-stat"><div class="mod-stat-label">Open violations</div><div class="mod-stat-value">${(safety.violations || []).filter((v) => ["open","deadline_missed","appealed"].includes(v.status)).length}</div></div>
                <div class="mod-stat"><div class="mod-stat-label">Pending appeals</div><div class="mod-stat-value">${(safety.appeals || []).filter((a) => ["pending","reviewing"].includes(a.status)).length}</div></div>
            </div>

            <nav class="mod-subnav" aria-label="User sections">
                <button type="button" class="mod-btn is-active" data-user-tab="pending">Pending</button>
                <button type="button" class="mod-btn" data-user-tab="books">Books</button>
                <button type="button" class="mod-btn" data-user-tab="safety">Safety history</button>
                <button type="button" class="mod-btn" data-user-tab="activity">Activity</button>
                <button type="button" class="mod-btn" data-user-tab="account">Account</button>
            </nav>

            <div class="mod-user-panels">
                <section class="mod-panel" data-user-panel="pending">
                    <h2>Pending &amp; open items</h2>
                    ${renderPendingInbox(detail, safety)}
                </section>
                <section class="mod-panel hidden" data-user-panel="books">
                    <h2>Books (${books.length})</h2>
                    ${renderBooks(books, userId)}
                </section>
                <section class="mod-panel hidden" data-user-panel="safety">
                    <h2>Strikes</h2>
                    ${(safety.strikes || []).length
                        ? (safety.strikes || []).map((s) => `
                            <div class="mod-detail-block">
                                <p><strong>Strike ${s.strike_number}</strong> (${escapeHtml(s.strike_type)})</p>
                                <p class="mod-queue-meta">${escapeHtml(s.reason || "—")} · expires ${escapeHtml(formatDate(s.expires_at))}</p>
                            </div>`).join("")
                        : '<p class="mod-detail-empty">No strikes.</p>'}
                    <h2 style="margin-top:18px">Violations</h2>
                    ${(safety.violations || []).length
                        ? (safety.violations || []).map((v) => `
                            <div class="mod-detail-block">
                                <p><strong>${escapeHtml(v.policy_violated)}</strong> · ${escapeHtml(v.status)}</p>
                                <p class="mod-queue-meta">Book <code>${escapeHtml(v.book_id)}</code> · deadline ${escapeHtml(formatDate(v.deadline))}</p>
                            </div>`).join("")
                        : '<p class="mod-detail-empty">No violations.</p>'}
                    <h2 style="margin-top:18px">All reports against author</h2>
                    ${renderReportsTable(safety.reports_as_author, "No reports.")}
                    <h2 style="margin-top:18px">Reports filed by user</h2>
                    ${renderReportsTable(safety.reports_as_reporter, "No reports filed.")}
                </section>
                <section class="mod-panel hidden" data-user-panel="activity">
                    <h2>Recent comments</h2>
                    ${(engagement.recent_comments || []).length
                        ? (engagement.recent_comments || []).map((c) => `
                            <div class="mod-detail-block">
                                <p class="mod-queue-meta"><code>${escapeHtml(c.book_id)}</code> · ${escapeHtml(formatDate(c.created_at))}</p>
                                <p>${escapeHtml(c.text)}</p>
                            </div>`).join("")
                        : '<p class="mod-detail-empty">No comments.</p>'}
                    <h2 style="margin-top:18px">Beta shares</h2>
                    ${(engagement.beta_shares || []).length
                        ? `<div class="mod-table-wrap"><table class="mod-table"><tbody>
                            ${(engagement.beta_shares || []).map((s) => `
                                <tr><td><code>${escapeHtml(s.book_id)}</code></td><td>${escapeHtml(s.status)}</td><td>${escapeHtml(formatDate(s.created_at))}</td></tr>
                            `).join("")}
                           </tbody></table></div>`
                        : '<p class="mod-detail-empty">No beta shares.</p>'}
                </section>
                <section class="mod-panel hidden" data-user-panel="account">
                    <h2>Account details</h2>
                    <div class="mod-detail-block">
                        <p>Last sign-in: ${escapeHtml(formatDate(auth.last_sign_in_at))}</p>
                        <p>Last seen: ${escapeHtml(formatDate(p.last_seen_at))}</p>
                        <p>Daily word goal: ${Number(p.daily_word_goal || 0).toLocaleString()}</p>
                        <p>Providers: ${escapeHtml((Array.isArray(auth.providers) ? auth.providers : []).join(", ") || "—")}</p>
                        ${detail.reporter_score ? `<p>Reporter weight: <strong>${detail.reporter_score.weight}</strong></p>` : ""}
                    </div>
                </section>
            </div>
        </div>
    `;
}

function wireUserTabs(root) {
    root.querySelectorAll("[data-user-tab]").forEach((btn) => {
        btn.addEventListener("click", () => {
            const tab = btn.dataset.userTab;
            root.querySelectorAll("[data-user-tab]").forEach((b) => b.classList.toggle("is-active", b.dataset.userTab === tab));
            root.querySelectorAll("[data-user-panel]").forEach((p) => {
                p.classList.toggle("hidden", p.dataset.userPanel !== tab);
            });
        });
    });
}

function wireBookActions(root, userId, showStatus, reload) {
    root.querySelectorAll("[data-vis]").forEach((btn) => {
        btn.addEventListener("click", async () => {
            const vis = btn.dataset.vis;
            const bookId = btn.dataset.book;
            const reason = window.prompt(`Reason for setting "${bookId}" visibility to "${vis}":`) || "";
            try {
                await setBookVisibility(bookId, vis, reason);
                showStatus(`Book visibility set to ${vis}.`);
                await reload();
            } catch (err) {
                showStatus(err.message || "Action failed.", "error");
            }
        });
    });
}

function wireAppealActions(root, showStatus, reload) {
    root.querySelectorAll("[data-appeal-outcome]").forEach((btn) => {
        btn.addEventListener("click", async () => {
            const notes = window.prompt("Resolution notes (optional):") || "";
            try {
                await resolveAppeal(btn.dataset.appealId, btn.dataset.appealOutcome, notes);
                showStatus("Appeal resolved.");
                await reload();
            } catch (err) {
                showStatus(err.message || "Action failed.", "error");
            }
        });
    });
}

/**
 * @param {string} userId
 * @param {HTMLElement} container
 * @param {{ showStatus: (msg: string, type?: string) => void }} opts
 */
let userDetailLoadGen = 0;

function asArray(value) {
    return Array.isArray(value) ? value : [];
}

export async function mountUserDetail(userId, container, opts) {
    const { showStatus } = opts;
    const loadGen = ++userDetailLoadGen;
    container.innerHTML = '<p class="mod-detail-empty">Loading user…</p>';

    try {
        const [detail, booksRaw, safetyRaw, engagementRaw] = await Promise.all([
            staffGetUserDetail(userId),
            staffListUserBooks(userId),
            staffGetUserSafety(userId),
            staffGetUserEngagement(userId),
        ]);

        if (loadGen !== userDetailLoadGen) return null;

        const books = asArray(booksRaw);
        const safety = safetyRaw && typeof safetyRaw === "object" ? safetyRaw : {};
        safety.strikes = asArray(safety.strikes);
        safety.violations = asArray(safety.violations);
        safety.reports_as_author = asArray(safety.reports_as_author);
        safety.reports_as_reporter = asArray(safety.reports_as_reporter);
        safety.appeals = asArray(safety.appeals);
        safety.audit_log = asArray(safety.audit_log);

        const engagement = engagementRaw && typeof engagementRaw === "object" ? engagementRaw : {};
        engagement.recent_comments = asArray(engagement.recent_comments);
        engagement.beta_shares = asArray(engagement.beta_shares);
        engagement.blocks_made = asArray(engagement.blocks_made);
        engagement.blocks_received = asArray(engagement.blocks_received);
        engagement.beta_message_reports = asArray(engagement.beta_message_reports);

        container.innerHTML = renderUserHtml(userId, detail, books, safety, engagement);
        const root = container.querySelector(".mod-user-detail");
        if (!root) {
            throw new Error("Could not render user detail.");
        }

        async function reload() {
            return mountUserDetail(userId, container, opts);
        }

        wireUserTabs(root);
        wireBookActions(root, userId, showStatus, reload);
        wireAppealActions(root, showStatus, reload);
        return { detail, books, safety, engagement };
    } catch (err) {
        if (loadGen !== userDetailLoadGen) return null;
        const msg = err?.message || String(err);
        container.innerHTML = `<div class="mod-detail-empty mod-load-error"><h2>Could not load user</h2><p>${escapeHtml(msg)}</p><button type="button" class="mod-btn" data-retry-user>Retry</button></div>`;
        container.querySelector("[data-retry-user]")?.addEventListener("click", () => {
            void mountUserDetail(userId, container, opts);
        });
        showStatus(msg, "error");
        throw err;
    }
}

export function listUserStandingLabel(user) {
    if (user.account_terminated) return { text: "Terminated", kind: "danger" };
    if (user.account_suspended) return { text: "Suspended", kind: "danger" };
    if (Number(user.pending_appeals) > 0) return { text: "Appeal", kind: "warn" };
    if (Number(user.open_violations) > 0) return { text: "Violation", kind: "warn" };
    if (Number(user.pending_reports) > 0) return { text: "Reported", kind: "warn" };
    if (Number(user.active_strikes) > 0) return { text: `${user.active_strikes} strike(s)`, kind: "warn" };
    if (user.publishing_revoked) return { text: "No publish", kind: "warn" };
    return { text: "Clear", kind: "ok" };
}
