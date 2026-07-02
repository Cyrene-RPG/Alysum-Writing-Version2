/**
 * Moderation staff access checks + shared setup / denied UI.
 */

import { supabase } from "../firebase.js";

const SQL_EDITOR = "https://supabase.com/dashboard/project/jrfxgpkpbacajhcwimgz/sql/new";

/** Strip stray punctuation from pasted/copied user IDs. */
function normalizeUuid(uid) {
    const match = String(uid || "").match(
        /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i
    );
    return match ? match[0].toLowerCase() : String(uid || "").trim();
}

const BOOTSTRAP_SQL = (uid) => {
    const id = normalizeUuid(uid);
    return `INSERT INTO public.moderation_staff (user_id, role, created_by)
VALUES (
  '${id}',
  'admin',
  '${id}'
)
ON CONFLICT (user_id) DO UPDATE SET role = EXCLUDED.role;`;
};

/**
 * @returns {Promise<{
 *   staff: boolean,
 *   user: import('@supabase/supabase-js').User | null,
 *   rpcOk: boolean,
 *   tableOk: boolean,
 *   tableRow: boolean,
 *   rpcError: string,
 *   tableError: string,
 * }>}
 */
export async function getModerationAccessStatus() {
    const { data: authData } = await supabase.auth.getUser();
    const user = authData?.user || null;

    if (!user) {
        return {
            staff: false,
            user: null,
            rpcOk: false,
            tableOk: false,
            tableRow: false,
            rpcError: "",
            tableError: "",
        };
    }

    let rpcStaff = false;
    let rpcOk = false;
    let rpcError = "";

    const { data: rpcData, error: rpcErr } = await supabase.rpc("is_moderation_staff");
    if (!rpcErr) {
        rpcOk = true;
        rpcStaff = !!rpcData;
    } else {
        rpcError = rpcErr.message || String(rpcErr);
    }

    let tableRow = false;
    let tableOk = false;
    let tableError = "";

    const { data: row, error: tableErr } = await supabase
        .from("moderation_staff")
        .select("user_id, role")
        .eq("user_id", user.id)
        .maybeSingle();

    if (!tableErr) {
        tableOk = true;
        tableRow = !!row;
    } else {
        tableError = tableErr.message || String(tableErr);
    }

    let staffUsersOk = false;
    let staffUsersError = "";
    const { error: staffUsersErr } = await supabase.rpc("staff_users_overview_stats");
    if (!staffUsersErr) {
        staffUsersOk = true;
    } else {
        staffUsersError = staffUsersErr.message || String(staffUsersErr);
        const msg = staffUsersError.toLowerCase();
        if (msg.includes("moderation staff only") || msg.includes("permission denied")) {
            staffUsersOk = true;
        }
    }

    return {
        staff: rpcStaff || tableRow,
        user,
        rpcOk,
        tableOk,
        tableRow,
        staffUsersOk,
        rpcError,
        tableError,
        staffUsersError,
    };
}

export async function isModerationStaffReliable() {
    const status = await getModerationAccessStatus();
    return status.staff;
}

function escapeHtml(str) {
    return String(str || "")
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;");
}

function migrationHint(status) {
    if (!status.tableOk && (status.tableError || "").includes("does not exist")) {
        return "Run <strong>supabase-library-reports.sql</strong> in Supabase SQL Editor first.";
    }
    if (status.tableOk && !status.tableRow) {
        return "Migrations look applied, but your account is not in <code>moderation_staff</code> yet. Run the bootstrap SQL below.";
    }
    if (!status.rpcOk && status.tableRow) {
        return "Your staff row exists. If tools still fail, run <strong>supabase-staff-users.sql</strong> and refresh.";
    }
    if (!status.rpcOk) {
        return "The <code>is_moderation_staff()</code> function is missing. Run <strong>supabase-library-reports.sql</strong>.";
    }
    return "Confirm all three SQL steps below, then click Check again.";
}

/**
 * @param {{ returnPath: string }} opts
 */
export async function bootModerationPage(opts) {
    const deniedEl = document.getElementById("modDenied");
    const contentEl = document.getElementById("modContent");

    const status = await getModerationAccessStatus();

    if (!status.user) {
        window.location.href = "login.html?next=" + encodeURIComponent(opts.returnPath);
        return null;
    }

    if (!status.staff) {
        deniedEl?.classList.remove("hidden");
        contentEl?.classList.add("hidden");

        const email = status.user.email || "";
        const uid = status.user.id;

        const hintEl = document.getElementById("modDeniedHint");
        if (hintEl) {
            hintEl.innerHTML = email
                ? `Signed in as <strong>${escapeHtml(email)}</strong>. ${migrationHint(status)}`
                : migrationHint(status);
        }

        const uidEl = document.getElementById("modDeniedUid");
        if (uidEl) uidEl.textContent = uid;

        const sqlEl = document.getElementById("modDeniedSql");
        if (sqlEl) sqlEl.textContent = BOOTSTRAP_SQL(uid);

        const step1 = document.getElementById("modStepReports");
        const step2 = document.getElementById("modStepStaffUsers");
        const step3 = document.getElementById("modStepBootstrap");
        if (step1) step1.classList.toggle("is-done", status.tableOk);
        if (step2) step2.classList.toggle("is-done", status.staffUsersOk);
        if (step3) step3.classList.toggle("is-done", status.tableRow);

        document.getElementById("modCopyBootstrapBtn")?.addEventListener("click", async () => {
            const sql = BOOTSTRAP_SQL(uid);
            try {
                await navigator.clipboard.writeText(sql);
                const btn = document.getElementById("modCopyBootstrapBtn");
                if (btn) {
                    const prev = btn.textContent;
                    btn.textContent = "Copied!";
                    setTimeout(() => { btn.textContent = prev; }, 2000);
                }
            } catch {
                /* fallback: sql is visible in pre */
            }
        });
        document.getElementById("modOpenSqlBtn")?.setAttribute("href", SQL_EDITOR);
        document.getElementById("modRecheckBtn")?.addEventListener("click", () => {
            window.location.reload();
        });

        return null;
    }

    deniedEl?.classList.add("hidden");
    contentEl?.classList.remove("hidden");

    return status;
}
