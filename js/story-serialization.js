/**
 * Story serialization status and chapter progress labels (e.g. 3/18, 3/?, 5 chapters).
 */

export const SERIALIZATION_COMPLETE = "complete";
export const SERIALIZATION_IN_PROGRESS = "in_progress";

export function normalizeSerializationStatus(value) {
    const raw = String(value ?? "").trim().toLowerCase();
    if (raw === SERIALIZATION_IN_PROGRESS || raw === "ongoing") return SERIALIZATION_IN_PROGRESS;
    return SERIALIZATION_COMPLETE;
}

export function isSerializationComplete(status) {
    return normalizeSerializationStatus(status) === SERIALIZATION_COMPLETE;
}

export function serializationStatusLabel(status) {
    return isSerializationComplete(status) ? "Complete" : "In progress";
}

export function normalizePlannedChapterCount(value) {
    if (typeof value === "number" && Number.isFinite(value) && value > 0) {
        return Math.floor(value);
    }
    if (typeof value === "string" && value.trim()) {
        const parsed = parseInt(value.trim(), 10);
        if (Number.isFinite(parsed) && parsed > 0) return parsed;
    }
    return null;
}

function publishedIdsFromData(data) {
    if (Array.isArray(data.publishedChapterIds)) {
        return data.publishedChapterIds.filter((id) => typeof id === "string" && id.trim());
    }
    if (Array.isArray(data.published_chapter_ids)) {
        return data.published_chapter_ids.filter((id) => typeof id === "string" && id.trim());
    }
    return null;
}

/**
 * @param {Record<string, unknown>} [data] library.data or publish_meta-shaped object
 */
export function serializationFromBookData(data) {
    const source = data && typeof data === "object" ? data : {};
    const meta = source.publishMeta && typeof source.publishMeta === "object"
        ? source.publishMeta
        : source.publish_meta && typeof source.publish_meta === "object"
            ? source.publish_meta
            : null;

    const statusRaw = source.serializationStatus
        ?? source.serialization_status
        ?? meta?.serializationStatus
        ?? meta?.serialization_status;

    let status = normalizeSerializationStatus(statusRaw);
    const hasExplicitStatus = Boolean(String(statusRaw ?? "").trim());

    const chapters = Array.isArray(source.chapters) ? source.chapters : [];
    const chapterCount = typeof source.chapterCount === "number" && source.chapterCount > 0
        ? source.chapterCount
        : chapters.length;

    const publishedIds = publishedIdsFromData(source);
    let publishedCount;
    if (publishedIds && publishedIds.length) {
        publishedCount = publishedIds.length;
    } else if (chapters.length) {
        publishedCount = chapters.length;
    } else {
        publishedCount = chapterCount;
    }

    publishedCount = Math.max(0, publishedCount);

    if (!hasExplicitStatus && publishedCount < chapterCount) {
        status = SERIALIZATION_IN_PROGRESS;
    }

    const plannedChapterCount = normalizePlannedChapterCount(
        source.plannedChapterCount ?? source.planned_chapter_count ?? meta?.plannedChapterCount ?? meta?.planned_chapter_count
    );

    return {
        status,
        plannedChapterCount,
        chapterCount,
        publishedCount,
    };
}

function resolvePlannedTotal({ status, plannedChapterCount, chapterCount, publishedCount }) {
    if (isSerializationComplete(status)) return null;
    if (plannedChapterCount) return plannedChapterCount;
    if (chapterCount > publishedCount) return chapterCount;
    return null;
}

/**
 * @param {{
 *   publishedCount: number,
 *   plannedChapterCount?: number|null,
 *   chapterCount?: number,
 *   serializationStatus?: string,
 *   comic?: boolean,
 * }} opts
 */
export function formatChapterProgress(opts) {
    const {
        publishedCount,
        plannedChapterCount,
        chapterCount = 0,
        serializationStatus,
        comic = false,
    } = opts;

    const published = Math.max(0, Math.floor(Number(publishedCount) || 0));
    const status = normalizeSerializationStatus(serializationStatus);
    const unit = comic ? "page" : "chapter";
    const unitPlural = comic ? "pages" : "chapters";

    if (isSerializationComplete(status)) {
        const total = published || chapterCount || 0;
        return `${total} ${total === 1 ? unit : unitPlural}`;
    }

    const planned = resolvePlannedTotal({
        status,
        plannedChapterCount,
        chapterCount,
        publishedCount: published,
    });

    if (planned != null) {
        return `${published}/${planned} ${unitPlural}`;
    }

    return `${published}/? ${unitPlural}`;
}

/**
 * Short position line for the reader chapter header.
 */
export function formatChapterPositionMeta(opts) {
    const {
        currentIndex = 0,
        publishedCount = 0,
        plannedChapterCount,
        chapterCount = 0,
        serializationStatus,
        comic = false,
        words,
    } = opts;

    const unit = comic ? "Page" : "Chapter";
    const current = currentIndex + 1;
    const available = Math.max(1, Math.floor(Number(publishedCount) || current));
    const status = normalizeSerializationStatus(serializationStatus);
    const wordSuffix = comic || words == null ? "" : ` • ${formatCount(words)} words`;

    if (isSerializationComplete(status)) {
        return `${unit} ${current} of ${available}${wordSuffix}`;
    }

    const planned = resolvePlannedTotal({
        status,
        plannedChapterCount,
        chapterCount,
        publishedCount: available,
    });

    if (planned != null) {
        return `${unit} ${current} of ${available} available (${planned} planned)${wordSuffix}`;
    }

    return `${unit} ${current} of ${available} available${wordSuffix}`;
}

function formatCount(value) {
    const n = Number(value);
    if (!Number.isFinite(n)) return "0";
    return n.toLocaleString();
}

/**
 * @param {{ chapterTitle?: string, scheduledAt?: string }} release
 */
export function formatNextChapterReleaseNote(release) {
    if (!release?.scheduledAt) return "";
    const when = new Date(release.scheduledAt);
    if (!Number.isFinite(when.getTime())) return "";

    const title = String(release.chapterTitle || "Next chapter").trim() || "Next chapter";
    const formatted = when.toLocaleString(undefined, {
        weekday: "long",
        month: "short",
        day: "numeric",
        hour: "numeric",
        minute: "2-digit",
    });

    return `Next chapter: “${title}” — releases ${formatted}`;
}
