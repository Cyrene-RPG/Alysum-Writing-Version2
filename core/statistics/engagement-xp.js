/**
 * Comment / review engagement XP. Clock starts at created_at of the post.
 * Client must not decide amounts — RPCs import this.
 */

import { AWARDS, xpAmount } from "./awards.js";

function toMs(value) {
    if (value instanceof Date) return value.getTime();
    if (typeof value === "number" && Number.isFinite(value)) return value;
    const n = Date.parse(value);
    return Number.isFinite(n) ? n : NaN;
}

export function hoursBetween(createdAt, now = Date.now()) {
    const a = toMs(createdAt);
    const b = typeof now === "number" ? now : toMs(now);
    if (!Number.isFinite(a) || !Number.isFinite(b)) return Infinity;
    return (b - a) / (60 * 60 * 1000);
}

export function daysBetween(createdAt, now = Date.now()) {
    return hoursBetween(createdAt, now) / 24;
}

export function commentCreateXp(paidCreatesToday) {
    const cap = Math.max(0, Math.floor(Number(AWARDS.chapter_comment_daily_cap) || 0));
    const paid = Math.max(0, Math.floor(Number(paidCreatesToday) || 0));
    if (paid >= cap) return 0;
    return xpAmount("chapter_comment");
}

export function amountForCommentUpvote(commentCreatedAt, now = Date.now()) {
    const windowH = Number(AWARDS.comment_upvote_window_hours) || 0;
    if (hoursBetween(commentCreatedAt, now) >= windowH) return 0;
    return xpAmount("comment_upvote");
}

export function amountForReviewUpvote(reviewCreatedAt, payingCount, now = Date.now()) {
    const maxPaying = Math.max(0, Math.floor(Number(AWARDS.review_upvote_max_paying) || 0));
    const paid = Math.max(0, Math.floor(Number(payingCount) || 0));
    if (paid >= maxPaying) return 0;
    const fullDays = Number(AWARDS.review_upvote_full_days) || 0;
    if (daysBetween(reviewCreatedAt, now) < fullDays) return xpAmount("review_upvote_full");
    return xpAmount("review_upvote_aged");
}

export function utcDayKey(date = new Date()) {
    const d = date instanceof Date ? date : new Date(date);
    if (Number.isNaN(d.getTime())) return "";
    return d.toISOString().slice(0, 10);
}
