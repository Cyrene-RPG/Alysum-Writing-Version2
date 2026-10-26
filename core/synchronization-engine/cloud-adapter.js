import { prepareDraftPromotion } from "../writing-engine/promote-draft.js";
/**
 * Cloud manuscript drafts on public.books. Owner-only via RLS.
 * Live Alysum uses `created` / `updated` (epoch ms), matching writer-dashboard.
 * Newer migrations may use created_at / updated_at — read both, write live columns.
 */
import { ensureChapterIds } from "../writing-engine/manuscript.js";

function newCloudBookId() {
    if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
        return crypto.randomUUID();
    }
    return `${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
}

function blankSections() {
    return { front: [], body: [], back: [] };
}

function readSections(raw) {
    let sections = raw;
    if (typeof sections === "string") {
        try {
            sections = JSON.parse(sections);
        } catch {
            sections = null;
        }
    }
    if (sections && typeof sections === "object" && !Array.isArray(sections)) {
        return ensureChapterIds(sections);
    }
    return blankSections();
}

function rowTime(row, keys) {
    if (!row || typeof row !== "object") return Date.now();
    for (const key of keys) {
        const value = row[key];
        if (typeof value === "number" && Number.isFinite(value) && value > 0) return value;
        if (typeof value === "string" && value.trim()) {
            const ms = new Date(value).getTime();
            if (Number.isFinite(ms) && ms > 0) return ms;
        }
    }
    return Date.now();
}

export function fromCloudRow(row) {
    if (!row || typeof row !== "object") return null;
    const meta = row.publish_meta && typeof row.publish_meta === "object" && !Array.isArray(row.publish_meta)
        ? row.publish_meta
        : {};
    const published = Array.isArray(row.published_chapter_ids) ? row.published_chapter_ids : [];
    return {
        id: String(row.id || ""),
        user_id: String(row.user_id || row.userId || ""),
        title: String(row.title || "Untitled Book").trim() || "Untitled Book",
        words: Number(row.words) || 0,
        sections: readSections(row.sections),
        media_format: String(row.media_format || row.mediaFormat || "novel"),
        publish_meta: meta,
        published_chapter_ids: published,
        draft_parent_id: row.draft_parent_id || null,
        draft_label: row.draft_label || null,
        is_published: Boolean(row.is_published ?? row.isPublished),
        created: rowTime(row, ["created", "created_at", "createdAt"]),
        updated: rowTime(row, ["updated", "updated_at", "updatedAt"]),
        _cloudUpdated: row.updated ?? null,
    };
}

function toCloudInsert(payload, userId) {
    const seed = payload && typeof payload === "object" ? payload : {};
    const sections = readSections(seed.sections);
    const now = Date.now();
    return {
        id: seed.id || newCloudBookId(),
        user_id: userId,
        title: String(seed.title || "Untitled Book").trim() || "Untitled Book",
        sections,
        words: Number(seed.words) || 0,
        media_format: String(seed.media_format || seed.mediaFormat || "novel"),
        created: Number(seed.created) || now,
        updated: Number(seed.updated) || now,
        ...(seed.draft_parent_id ? { draft_parent_id: String(seed.draft_parent_id), draft_label: String(seed.draft_label || 'New draft') } : {}),
    };
}

function toCloudPatch(patch) {
    const src = patch && typeof patch === "object" ? patch : {};
    const out = { updated: Date.now() };
    if (src.title != null) out.title = String(src.title).trim() || "Untitled Book";
    if (src.sections != null) out.sections = readSections(src.sections);
    if (src.words != null) out.words = Number(src.words) || 0;
    if (src.media_format != null || src.mediaFormat != null) {
        out.media_format = String(src.media_format || src.mediaFormat || "novel");
    }
    if (src.publish_meta != null || src.publishMeta != null) {
        const meta = src.publish_meta || src.publishMeta;
        out.publish_meta = meta && typeof meta === "object" && !Array.isArray(meta) ? meta : {};
    }
    if (src.published_chapter_ids != null || src.publishedChapterIds != null) {
        const ids = src.published_chapter_ids || src.publishedChapterIds;
        out.published_chapter_ids = Array.isArray(ids) ? ids : [];
    }
    if (src.is_published != null || src.isPublished != null) {
        out.is_published = Boolean(src.is_published ?? src.isPublished);
    }
    return out;
}

export async function listBooks(supabase, userId) {
    if(!String(userId || "").trim())return [];
    const {data,error}=await supabase.rpc("list_editable_books");
    if(error)throw error;
    return (data || []).map(fromCloudRow).filter(book=>book?.id);
}

export async function getBook(supabase, userId, id) {
    const { data, error } = await supabase
        .from("books")
        .select("*")
        .eq("id", id)
        .maybeSingle();
    if (error) throw error;
    return fromCloudRow(data);
}

export async function insertBook(supabase, userId, payload) {
    const row = toCloudInsert(payload, userId);
    const { data, error } = await supabase.from("books").insert(row).select("*").single();
    if (error) throw error;
    return fromCloudRow(data);
}

export async function updateBook(supabase, userId, id, patch, { expectedUpdated } = {}) {
    if (expectedUpdated == null || !Number.isFinite(Number(expectedUpdated))) {
        throw Object.assign(new Error("This edit has no confirmed cloud version. Download a backup and import it as a recovered book before reviewing the cloud copy."), { code: "BOOK_CONFLICT" });
    }
    const changes = toCloudPatch(patch);
    changes.updated = Math.max(Date.now(), Number(expectedUpdated) + 1);
    const { data, error } = await supabase.from("books").update(changes)
        .eq("id", id).eq("updated", expectedUpdated).select("*").single();
    if (error?.code === "PGRST116" || (!error && !data)) {
        throw Object.assign(new Error("This book changed in another tab or device, or your access changed. Your edits were not overwritten. Download a backup before reviewing the other copy."), { code: "BOOK_CONFLICT" });
    }
    if (error) throw error;
    return fromCloudRow(data);
}

export async function deleteBook(supabase, userId, id) {
    const { data, error } = await supabase
        .from("books")
        .delete()
        .eq("id", id)
        .eq("user_id", userId)
        .select("id");
    if (error) throw error;
    if (!data?.length) throw new Error("Could not delete this book.");
}

/** Names and grouping only: opening a draft menu must not download manuscripts. */
export async function listDraftSummaries(supabase, userId, rootId) {
    if (!String(userId || '').trim() || !String(rootId || '').trim()) return [];
    const columns = 'id,title,draft_parent_id,draft_label,created';
    const query = () => supabase.from('books').select(columns).eq('user_id', userId);
    const [original, revisions] = await Promise.all([
        query().eq('id', rootId),
        query().eq('draft_parent_id', rootId),
    ]);
    if (original.error) throw original.error;
    if (revisions.error) throw revisions.error;
    return [...(original.data || []), ...(revisions.data || [])];
}

/** Persist a backup first; compare-and-set the main record to avoid overwriting concurrent edits. */
export async function promoteDraft(supabase, userId, draftId) {
    const source=await getBook(supabase,userId,draftId);
    if(!source?.draft_parent_id)throw new Error('This is already the main draft.');
    const main=await getBook(supabase,userId,source.draft_parent_id);
    if(!main||String(source.user_id)!==String(userId)||String(main.user_id)!==String(userId))throw new Error('Only the book owner can change its main draft.');
    const plan=prepareDraftPromotion(source,main);
    const backup=await insertBook(supabase,userId,plan.backup);
    if(!backup?.id)throw new Error('The previous main could not be backed up. Promotion stopped.');
    const patch={...toCloudPatch(plan.patch),updated:plan.patch.updated};
    const {data,error}=await supabase.from('books').update(patch).eq('id',main.id).eq('user_id',userId).eq('updated',main.updated).select('*').maybeSingle();
    if(error)throw new Error('Could not confirm the main-draft update. Your source revision and previous-main backup are saved. Reopen the main draft before retrying.');
    if(!data)throw new Error('The main draft changed while preparing this update. A backup was saved; reopen the main draft and try again.');
    return {main:fromCloudRow(data),backup};
}

