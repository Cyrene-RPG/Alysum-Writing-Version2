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
import { showModDialog } from "./moderation-dialog.js";

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
        return `<p class="mod-empty mod-empty-inline">No pending items.</p>`;
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

function renderStandingInline(standing) {
    return `<span class="mod-user-standing mod-user-standing-${standing.level}">${escapeHtml(standing.title)}</span>`;
}

function renderUserHtml(userId, detail, books, safety, engagement) {
    const p = detail.profile || {};
    const auth = detail.auth || {};
    const counts = detail.counts || {};
    const mod = detail.moderation_status;
    const standing = deriveAccountStanding(detail, safety);
    const pendingReports = (safety.reports_as_author || []).filter((r) => ["pending", "reviewing"].includes(r.status)).length;
    const openViolations = (safety.violations || []).filter((v) => ["open", "deadline_missed", "appealed"].includes(v.status)).length;
    const pendingAppeals = (safety.appeals || []).filter((a) => ["pending", "reviewing"].includes(a.status)).length;
    const avatar = p.profile_image_url
        ? `<img class="mod-profile-avatar" src="${escapeHtml(p.profile_image_url)}" alt="" />`
        : `<div class="mod-profile-avatar mod-profile-avatar-ph">${escapeHtml((p.username || "?")[0]?.toUpperCase())}</div>`;

    return `
        <div class="mod-user-detail" data-user-id="${escapeHtml(userId)}">
            <header class="mod-profile-header">
                ${avatar}
                <div class="mod-profile-main">
                    <div class="mod-profile-title-row">
                        <h2 class="mod-profile-name">@${escapeHtml(p.username)}</h2>
                        ${renderStandingInline(standing)}
                    </div>
                    <p class="mod-profile-meta">${escapeHtml(p.display_name || "—")} · ${escapeHtml(p.email || auth.auth_email || "No email")}</p>
                    <p class="mod-profile-meta">
                        ${p.is_online || (p.last_seen_at && Date.now() - new Date(p.last_seen_at).getTime() < 300000)
                            ? "Online"
                            : `Last seen ${formatRelative(p.last_seen_at || auth.last_sign_in_at)}`}
                        · Joined ${escapeHtml(formatDate(p.created_at))}
                        · <code>${escapeHtml(p.id)}</code>
                    </p>
                </div>
                <dl class="mod-profile-stats">
                    <div><dt>Books</dt><dd>${counts.books || 0}</dd></div>
                    <div><dt>Published</dt><dd>${counts.published_books || 0}</dd></div>
                    <div><dt>Words</dt><dd>${Number(counts.book_words_total ?? p.words ?? 0).toLocaleString()}</dd></div>
                    <div><dt>Pending</dt><dd>${pendingReports + openViolations + pendingAppeals}</dd></div>
                </dl>
            </header>

            ${standing.summary && standing.level !== "ok" ? `<p class="mod-profile-standing-note">${escapeHtml(standing.summary)}</p>` : ""}

            <nav class="mod-tabs mod-profile-tabs" role="tablist">
                <button type="button" class="mod-tab is-active" data-user-tab="pending" role="tab">Pending</button>
                <button type="button" class="mod-tab" data-user-tab="books" role="tab">Books</button>
                <button type="button" class="mod-tab" data-user-tab="safety" role="tab">Safety</button>
                <button type="button" class="mod-tab" data-user-tab="activity" role="tab">Activity</button>
                <button type="button" class="mod-tab" data-user-tab="account" role="tab">Account</button>
            </nav>

            <div class="mod-profile-body">
                <section class="mod-profile-panel" data-user-panel="pending">
                    ${renderPendingInbox(detail, safety)}
                </section>
                <section class="mod-profile-panel hidden" data-user-panel="books">
                    ${renderBooks(books, userId)}
                </section>
                <section class="mod-profile-panel hidden" data-user-panel="safety">
                    <h3 class="mod-profile-section-title">Strikes</h3>
                    ${(safety.strikes || []).length
                        ? (safety.strikes || []).map((s) => `
                            <div class="mod-profile-item">
                                <strong>Strike ${s.strike_number}</strong> (${escapeHtml(s.strike_type)})
                                <span class="mod-queue-row-sub">${escapeHtml(s.reason || "—")} · expires ${escapeHtml(formatDate(s.expires_at))}</span>
                            </div>`).join("")
                        : '<p class="mod-empty mod-empty-inline">No strikes.</p>'}
                    <h3 class="mod-profile-section-title">Violations</h3>
                    ${(safety.violations || []).length
                        ? (safety.violations || []).map((v) => `
                            <div class="mod-profile-item">
                                <strong>${escapeHtml(v.policy_violated)}</strong> · ${escapeHtml(v.status)}
                                <span class="mod-queue-row-sub">Book <code>${escapeHtml(v.book_id)}</code> · ${escapeHtml(formatDate(v.deadline))}</span>
                            </div>`).join("")
                        : '<p class="mod-empty mod-empty-inline">No violations.</p>'}
                    <h3 class="mod-profile-section-title">Reports against author</h3>
                    ${renderReportsTable(safety.reports_as_author, "No reports.")}
                    <h3 class="mod-profile-section-title">Reports filed by user</h3>
                    ${renderReportsTable(safety.reports_as_reporter, "No reports filed.")}
                </section>
                <section class="mod-profile-panel hidden" data-user-panel="activity">
                    <h3 class="mod-profile-section-title">Recent comments</h3>
                    ${(engagement.recent_comments || []).length
                        ? (engagement.recent_comments || []).map((c) => `
                            <div class="mod-profile-item">
                                <span class="mod-queue-row-sub"><code>${escapeHtml(c.book_id)}</code> · ${escapeHtml(formatDate(c.created_at))}</span>
                                <p>${escapeHtml(c.text)}</p>
                            </div>`).join("")
                        : '<p class="mod-empty mod-empty-inline">No comments.</p>'}
                    <h3 class="mod-profile-section-title">Blocks</h3>
                    ${(engagement.blocks_made || []).length || (engagement.blocks_received || []).length
                        ? `<div class="mod-table-wrap"><table class="mod-table"><thead><tr><th>Type</th><th>User</th><th>Date</th></tr></thead><tbody>
                            ${(engagement.blocks_made || []).map((b) => `<tr><td>Made</td><td><code>${escapeHtml(b.blocked_id || b.user_id || "—")}</code></td><td>${escapeHtml(formatDate(b.created_at))}</td></tr>`).join("")}
                            ${(engagement.blocks_received || []).map((b) => `<tr><td>Received</td><td><code>${escapeHtml(b.blocker_id || b.user_id || "—")}</code></td><td>${escapeHtml(formatDate(b.created_at))}</td></tr>`).join("")}
                           </tbody></table></div>`
                        : '<p class="mod-empty mod-empty-inline">No blocks.</p>'}
                    <h3 class="mod-profile-section-title">Beta activity</h3>
                    ${(engagement.beta_shares || []).length || (engagement.beta_message_reports || []).length
                        ? `<div class="mod-table-wrap"><table class="mod-table"><tbody>
                            ${(engagement.beta_shares || []).map((s) => `<tr><td>Share</td><td><code>${escapeHtml(s.book_id)}</code></td><td>${escapeHtml(s.status)}</td><td>${escapeHtml(formatDate(s.created_at))}</td></tr>`).join("")}
                            ${(engagement.beta_message_reports || []).map((r) => `<tr><td>Report</td><td>${escapeHtml(r.reason || r.report_reason || "—")}</td><td>${escapeHtml(r.status || "—")}</td><td>${escapeHtml(formatDate(r.created_at))}</td></tr>`).join("")}
                           </tbody></table></div>`
                        : '<p class="mod-empty mod-empty-inline">No beta activity.</p>'}
                </section>
                <section class="mod-profile-panel hidden" data-user-panel="account">
                    <dl class="mod-fact-grid">
                        <div><dt>Last sign-in</dt><dd>${escapeHtml(formatDate(auth.last_sign_in_at))}</dd></div>
                        <div><dt>Last seen</dt><dd>${escapeHtml(formatDate(p.last_seen_at))}</dd></div>
                        <div><dt>Word goal</dt><dd>${Number(p.daily_word_goal || 0).toLocaleString()}</dd></div>
                        <div><dt>Providers</dt><dd>${escapeHtml((Array.isArray(auth.providers) ? auth.providers : []).join(", ") || "—")}</dd></div>
                        ${detail.reporter_score ? `<div><dt>Reporter weight</dt><dd>${detail.reporter_score.weight}</dd></div>` : ""}
                        ${mod?.publishing_revoked ? `<div><dt>Publishing</dt><dd>Revoked</dd></div>` : ""}
                        ${mod?.account_suspended ? `<div><dt>Account</dt><dd>Suspended</dd></div>` : ""}
                    </dl>
                    <h3 class="mod-profile-section-title">Audit log</h3>
                    ${(safety.audit_log || []).length
                        ? `<div class="mod-audit-log">${(safety.audit_log || []).map((entry) => `
                            <div class="mod-audit-entry">
                                <div class="mod-audit-head">
                                    <strong>${escapeHtml(entry.action || entry.event_type || "Action")}</strong>
                                    <span class="mod-queue-row-time">${escapeHtml(formatDate(entry.created_at))}</span>
                                </div>
                                ${entry.details || entry.notes ? `<p class="mod-audit-body">${escapeHtml(entry.details || entry.notes)}</p>` : ""}
                            </div>`).join("")}</div>`
                        : '<p class="mod-empty mod-empty-inline">No audit entries.</p>'}
                </section>
            </div>
        </div>
    `;
}

function wireUserTabs(root) {
    root.querySelectorAll("[data-user-tab]").forEach((btn) => {
        btn.addEventListener("click", () => {
            const tab = btn.dataset.userTab;
            root.querySelectorAll("[data-user-tab]").forEach((b) => {
                b.classList.toggle("is-active", b.dataset.userTab === tab);
                b.setAttribute("aria-selected", b.dataset.userTab === tab ? "true" : "false");
            });
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
            const labels = { public: "Restore public", hidden: "Temporarily hide", removed: "Remove from library" };
            const { confirmed, value: reason } = await showModDialog({
                title: labels[vis] || "Change visibility",
                message: `Set visibility for book ${bookId} to ${vis}.`,
                confirmLabel: "Apply",
                variant: vis === "removed" ? "danger" : "default",
                inputLabel: "Reason (optional)",
                inputPlaceholder: "Note for the audit trail…",
            });
            if (!confirmed) return;
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
            const outcome = btn.dataset.appealOutcome;
            const labels = { overturned: "Overturn appeal", partial: "Partial resolution", upheld: "Uphold decision" };
            const { confirmed, value: notes } = await showModDialog({
                title: labels[outcome] + "?",
                message: "The author will be notified of this appeal outcome.",
                confirmLabel: "Resolve appeal",
                variant: outcome === "upheld" ? "danger" : outcome === "overturned" ? "success" : "default",
                inputLabel: "Notes (optional)",
                inputPlaceholder: "Resolution notes for the audit trail…",
            });
            if (!confirmed) return;
            try {
                await resolveAppeal(btn.dataset.appealId, outcome, notes);
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
    container.innerHTML = '<p class="mod-empty">Loading user…</p>';

    try {
        // Detail + safety are required; books/engagement fail soft so one bad RPC
        // cannot blank the whole dossier.
        const [detailResult, booksResult, safetyResult, engagementResult] = await Promise.allSettled([
            staffGetUserDetail(userId),
            staffListUserBooks(userId),
            staffGetUserSafety(userId),
            staffGetUserEngagement(userId),
        ]);

        if (loadGen !== userDetailLoadGen) return null;

        if (detailResult.status !== "fulfilled") {
            throw detailResult.reason || new Error("Could not load user detail.");
        }
        if (safetyResult.status !== "fulfilled") {
            throw safetyResult.reason || new Error("Could not load user safety.");
        }

        const detail = detailResult.value;
        const books = asArray(booksResult.status === "fulfilled" ? booksResult.value : []);
        const safety = safetyResult.value && typeof safetyResult.value === "object" ? safetyResult.value : {};
        safety.strikes = asArray(safety.strikes);
        safety.violations = asArray(safety.violations);
        safety.reports_as_author = asArray(safety.reports_as_author);
        safety.reports_as_reporter = asArray(safety.reports_as_reporter);
        safety.appeals = asArray(safety.appeals);
        safety.audit_log = asArray(safety.audit_log);

        const engagementRaw = engagementResult.status === "fulfilled" ? engagementResult.value : {};
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
