/**
 * Library reporting & moderation API.
 * Requires supabase-library-reports.sql applied in Supabase.
 */

import { supabase } from "../firebase.js";

/** @typedef {'age_rating'|'content_warnings'|'metadata_errors'|'genre'|'policy_violation'|'child_rated_adult_content'} ReportReason */

export const REPORT_REASONS = [
    {
        id: "age_rating",
        label: "Age / content rating",
        description: "The book is incorrectly rated for its age or content level.",
        priority: "normal",
    },
    {
        id: "content_warnings",
        label: "Missing content warnings",
        description: "Required content warnings are missing or incomplete.",
        priority: "normal",
    },
    {
        id: "metadata_errors",
        label: "Metadata errors",
        description: "Tags, categories, or other metadata are incorrect.",
        priority: "low",
    },
    {
        id: "genre",
        label: "Inappropriate genre",
        description: "The book is shelved in an inappropriate genre.",
        priority: "low",
    },
    {
        id: "policy_violation",
        label: "Policy violation",
        description: "Violates Alysum Terms of Service or Community Guidelines.",
        priority: "high",
    },
    {
        id: "child_rated_adult_content",
        label: "Rated for children but has adult content",
        description: "The book is rated General/Teen but contains mature or explicit content.",
        priority: "critical",
    },
];

const PRIORITY_LABELS = {
    lowest: "Lowest",
    low: "Low",
    normal: "Normal",
    high: "High",
    critical: "Critical",
};

const STATUS_LABELS = {
    pending: "Pending review",
    reviewing: "Under review",
    no_violation: "No violation",
    violation_confirmed: "Violation confirmed",
    dismissed: "Dismissed",
};

export function reportReasonLabel(reasonId) {
    return REPORT_REASONS.find((r) => r.id === reasonId)?.label || reasonId;
}

export function priorityLabel(priority) {
    return PRIORITY_LABELS[priority] || priority;
}

export function reportStatusLabel(status) {
    return STATUS_LABELS[status] || status;
}

/**
 * Submit a library report (logged-in users only).
 * @param {string} bookId
 * @param {ReportReason} reason
 * @param {string} [details]
 */
export async function submitLibraryReport(bookId, reason, details = "") {
    const { data, error } = await supabase.rpc("submit_library_report", {
        p_book_id: bookId,
        p_reason: reason,
        p_details: details || "",
    });
    if (error) throw error;
    return data;
}

/** @returns {Promise<boolean>} */
export async function isModerationStaff() {
    const { isModerationStaffReliable } = await import("./moderation-access.js");
    return isModerationStaffReliable();
}

/** @returns {Promise<boolean>} */
export async function isBookReadable(bookId) {
    const { data, error } = await supabase.rpc("library_book_is_readable", {
        p_book_id: bookId,
    });
    if (error) {
        console.warn("library_book_is_readable:", error);
        return false;
    }
    return !!data;
}

export async function listMyReports() {
    const { data, error } = await supabase.rpc("moderation_my_reports");
    if (error) throw error;
    return data || [];
}

export async function listMyViolations() {
    const { data, error } = await supabase.rpc("moderation_my_violations");
    if (error) throw error;
    return data || [];
}

export async function submitAppeal(violationId, appealText) {
    const { data, error } = await supabase.rpc("moderation_submit_appeal", {
        p_violation_id: violationId,
        p_appeal_text: appealText,
    });
    if (error) throw error;
    return data;
}

// --- Staff APIs ---

export async function getDashboardStats() {
    const { data, error } = await supabase.rpc("moderation_dashboard_stats");
    if (error) throw error;
    return data || {};
}

export async function listPendingReports(status = "pending", limit = 50) {
    const { data, error } = await supabase.rpc("moderation_list_reports", {
        p_status: status,
        p_limit: limit,
    });
    if (error) throw error;
    return data || [];
}

export async function reviewReportNoViolation(reportId, notes = "", markFalseReport = false) {
    const { data, error } = await supabase.rpc("moderation_review_report", {
        p_report_id: reportId,
        p_outcome: "no_violation",
        p_notes: notes,
        p_mark_false_report: markFalseReport,
    });
    if (error) throw error;
    return data;
}

export async function dismissReport(reportId, notes = "") {
    const { data, error } = await supabase.rpc("moderation_review_report", {
        p_report_id: reportId,
        p_outcome: "dismissed",
        p_notes: notes,
        p_mark_false_report: false,
    });
    if (error) throw error;
    return data;
}

export async function confirmViolation(reportId, {
    policyViolated,
    correctionRequirements = "",
    deadlineDays = 7,
    isSevere = false,
} = {}) {
    const { data, error } = await supabase.rpc("moderation_confirm_violation", {
        p_report_id: reportId,
        p_policy_violated: policyViolated,
        p_correction_requirements: correctionRequirements,
        p_deadline_days: deadlineDays,
        p_is_severe: isSevere,
    });
    if (error) throw error;
    return data;
}

export async function setBookVisibility(bookId, visibility, reason = "") {
    const { data, error } = await supabase.rpc("moderation_set_book_visibility", {
        p_book_id: bookId,
        p_visibility: visibility,
        p_reason: reason,
    });
    if (error) throw error;
    return data;
}

export async function resolveAppeal(appealId, outcome, notes = "") {
    const { data, error } = await supabase.rpc("moderation_resolve_appeal", {
        p_appeal_id: appealId,
        p_outcome: outcome,
        p_notes: notes,
    });
    if (error) throw error;
    return data;
}

export async function checkViolationDeadlines() {
    const { data, error } = await supabase.rpc("moderation_check_deadlines");
    if (error) throw error;
    return data;
}

export async function fetchBookModeration(bookId) {
    const { data, error } = await supabase
        .from("library_book_moderation")
        .select("*")
        .eq("book_id", bookId)
        .maybeSingle();
    if (error) throw error;
    return data;
}

export async function fetchPendingAppeals() {
    const { data, error } = await supabase
        .from("moderation_appeals")
        .select("*, moderation_violations(*)")
        .in("status", ["pending", "reviewing"])
        .order("created_at", { ascending: true });
    if (error) throw error;
    return data || [];
}

export async function fetchAuditLog(limit = 40) {
    const { data, error } = await supabase
        .from("moderation_audit_log")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(limit);
    if (error) throw error;
    return data || [];
}
