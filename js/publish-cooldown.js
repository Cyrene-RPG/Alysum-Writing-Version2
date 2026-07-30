/**
 * Publish cooldown checks — 7-day account age, 30-day gap between new library listings.
 * Requires supabase-publish-cooldown.sql applied in Supabase.
 */

import { supabase } from "../firebase.js";

/** @typedef {{
 *   allowed: boolean,
 *   isNewListing: boolean,
 *   accountCooldown: { active: boolean, eligibleAt?: string, daysRemaining: number },
 *   bookIntervalCooldown: { active: boolean, eligibleAt?: string | null, daysRemaining: number },
 *   approvedBypass: boolean,
 *   pendingRequest: { id: string, status: string, createdAt?: string, staffNote?: string } | null,
 * }} PublishEligibility
 */

/**
 * @param {string} bookId
 * @returns {Promise<PublishEligibility | null>}
 */
export async function getPublishEligibility(bookId) {
    const { data, error } = await supabase.rpc("get_publish_eligibility", {
        p_book_id: bookId,
    });
    if (error) {
        if (/function.*does not exist/i.test(error.message || "")) {
            return null;
        }
        throw error;
    }
    const raw = data && typeof data === "object" ? data : {};
    return {
        allowed: !!raw.allowed,
        isNewListing: !!raw.isNewListing,
        accountCooldown: {
            active: !!raw.accountCooldown?.active,
            eligibleAt: raw.accountCooldown?.eligibleAt || undefined,
            daysRemaining: Number(raw.accountCooldown?.daysRemaining || 0),
        },
        bookIntervalCooldown: {
            active: !!raw.bookIntervalCooldown?.active,
            eligibleAt: raw.bookIntervalCooldown?.eligibleAt ?? null,
            daysRemaining: Number(raw.bookIntervalCooldown?.daysRemaining || 0),
        },
        approvedBypass: !!raw.approvedBypass,
        pendingRequest: raw.pendingRequest || null,
    };
}

/**
 * @param {string} bookId
 * @param {string} message
 * @returns {Promise<string>} request id
 */
export async function submitPublishApprovalRequest(bookId, message = "") {
    const { data, error } = await supabase.rpc("submit_publish_approval_request", {
        p_book_id: bookId,
        p_message: message,
    });
    if (error) throw error;
    return String(data || "");
}

/**
 * @param {PublishEligibility | null} eligibility
 * @returns {string}
 */
export function formatPublishBlockMessage(eligibility) {
    if (!eligibility || eligibility.allowed) return "";

    if (eligibility.accountCooldown.active) {
        const days = Math.max(1, Math.ceil(eligibility.accountCooldown.daysRemaining));
        const when = eligibility.accountCooldown.eligibleAt
            ? new Date(eligibility.accountCooldown.eligibleAt).toLocaleString(undefined, {
                  dateStyle: "medium",
                  timeStyle: "short",
              })
            : "";
        return `New accounts must wait 7 days before publishing. You can publish${when ? ` on ${when}` : ` in about ${days} day${days === 1 ? "" : "s"}`}.`;
    }

    if (eligibility.bookIntervalCooldown.active) {
        const days = Math.max(1, Math.ceil(eligibility.bookIntervalCooldown.daysRemaining));
        const when = eligibility.bookIntervalCooldown.eligibleAt
            ? new Date(eligibility.bookIntervalCooldown.eligibleAt).toLocaleString(undefined, {
                  dateStyle: "medium",
                  timeStyle: "short",
              })
            : "";
        if (eligibility.pendingRequest) {
            return `You published another book recently. A staff review of your approval request is pending.${when ? ` Otherwise you can publish again on ${when}.` : ""}`;
        }
        if (eligibility.approvedBypass) {
            return "";
        }
        return `You can publish one new book every 30 days. ${when ? `You can publish again on ${when}.` : `Try again in about ${days} day${days === 1 ? "" : "s"}.`} Submit an approval request below if you need to publish sooner.`;
    }

    return "Publishing is temporarily unavailable for this account.";
}

/**
 * @param {PublishEligibility | null} eligibility
 * @returns {boolean}
 */
export function canSubmitPublishApproval(eligibility) {
    if (!eligibility || eligibility.allowed) return false;
    if (eligibility.accountCooldown.active) return false;
    if (!eligibility.bookIntervalCooldown.active) return false;
    if (eligibility.approvedBypass || eligibility.pendingRequest) return false;
    return eligibility.isNewListing;
}

/**
 * @param {string} status
 * @returns {Promise<Array<Record<string, unknown>>>}
 */
export async function moderationListPublishApprovals(status = "pending") {
    const { data, error } = await supabase.rpc("moderation_list_publish_approvals", {
        p_status: status,
    });
    if (error) throw error;
    return Array.isArray(data) ? data : [];
}

/**
 * @param {string} requestId
 * @param {boolean} approve
 * @param {string} staffNote
 */
export async function moderationReviewPublishApproval(requestId, approve, staffNote = "") {
    const { error } = await supabase.rpc("moderation_review_publish_approval", {
        p_request_id: requestId,
        p_approve: approve,
        p_staff_note: staffNote,
    });
    if (error) throw error;
}
