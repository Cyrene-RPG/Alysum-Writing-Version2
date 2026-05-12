/**
 * Cloud-saved character profile worksheets (writer resources).
 * Path: users/{uid}/characterProfileSheets/{sheetId}
 */

import {
    collection,
    deleteDoc,
    doc,
    onSnapshot,
    orderBy,
    query,
    setDoc
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

export const CHARACTER_PROFILE_SHEETS = "characterProfileSheets";

/** @type {readonly string[]} */
export const CHARACTER_PROFILE_FIELD_KEYS = [
    "cpName",
    "cpAliases",
    "cpRole",
    "cpVoice",
    "cpPersonality",
    "cpGoal",
    "cpFear",
    "cpSecret",
    "cpStrength",
    "cpFlaw",
    "cpWound",
    "cpAge",
    "cpHeight",
    "cpEyes",
    "cpHair",
    "cpSkin",
    "cpBuild",
    "cpDistinctive",
    "cpRelationships",
    "cpArc",
    "cpTags",
    "cpContinuity",
    "cpExtraNotes"
];

function safeString(value, fallback = "") {
    return typeof value === "string" ? value : fallback;
}

export function emptyProfileFields() {
    return Object.fromEntries(CHARACTER_PROFILE_FIELD_KEYS.map(k => [k, ""]));
}

/**
 * @param {unknown} raw
 */
export function normalizeProfileFields(raw) {
    const out = emptyProfileFields();
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) return out;
    for (const k of CHARACTER_PROFILE_FIELD_KEYS) {
        const v = raw[k];
        out[k] = typeof v === "string" ? v : "";
    }
    return out;
}

export function generateCharacterProfileSheetId() {
    return "cps_" + Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
}

/**
 * @param {object} raw
 * @param {string} id
 */
export function normalizeCharacterProfileSheet(raw, id) {
    const r = raw && typeof raw === "object" ? raw : {};
    const fields = normalizeProfileFields(r.fields);
    const nameGuess = (fields.cpName || "").trim();
    const displayName = safeString(r.displayName, "").trim() || nameGuess || "Untitled";
    const now = Date.now();
    return {
        id,
        schemaVersion: typeof r.schemaVersion === "number" ? r.schemaVersion : 1,
        displayName,
        fields,
        createdAt: typeof r.createdAt === "number" && Number.isFinite(r.createdAt) ? r.createdAt : now,
        updatedAt: typeof r.updatedAt === "number" && Number.isFinite(r.updatedAt) ? r.updatedAt : now
    };
}

/**
 * @param {import("firebase/firestore").Firestore} db
 * @param {string} uid
 * @param {ReturnType<typeof normalizeCharacterProfileSheet>} sheet
 */
export function characterProfileSheetToFirestore(sheet) {
    const now = Date.now();
    const fields = normalizeProfileFields(sheet.fields);
    const displayName = (sheet.displayName || "").trim() || (fields.cpName || "").trim() || "Untitled";
    return {
        schemaVersion: 1,
        displayName,
        fields,
        createdAt: typeof sheet.createdAt === "number" && Number.isFinite(sheet.createdAt) ? sheet.createdAt : now,
        updatedAt: now
    };
}

/**
 * @param {import("firebase/firestore").Firestore} db
 * @param {string} uid
 * @param {(sheets: ReturnType<typeof normalizeCharacterProfileSheet>[]) => void} onUpdate
 * @param {(err: unknown) => void} [onError]
 * @returns {() => void} unsubscribe
 */
export function subscribeCharacterProfileSheets(db, uid, onUpdate, onError) {
    const col = collection(db, "users", uid, CHARACTER_PROFILE_SHEETS);
    const q = query(col, orderBy("updatedAt", "desc"));
    return onSnapshot(
        q,
        snap => {
            const list = snap.docs.map(d => normalizeCharacterProfileSheet(d.data(), d.id));
            onUpdate(list);
        },
        err => {
            console.error(err);
            if (typeof onError === "function") onError(err);
        }
    );
}

/**
 * @param {import("firebase/firestore").Firestore} db
 * @param {string} uid
 * @param {ReturnType<typeof normalizeCharacterProfileSheet>} sheet
 */
export async function saveCharacterProfileSheet(db, uid, sheet) {
    const id = sheet.id || generateCharacterProfileSheetId();
    const ref = doc(db, "users", uid, CHARACTER_PROFILE_SHEETS, id);
    const payload = characterProfileSheetToFirestore({ ...sheet, id });
    await setDoc(ref, payload, { merge: true });
    return id;
}

/**
 * @param {import("firebase/firestore").Firestore} db
 * @param {string} uid
 * @param {string} sheetId
 */
export async function deleteCharacterProfileSheet(db, uid, sheetId) {
    await deleteDoc(doc(db, "users", uid, CHARACTER_PROFILE_SHEETS, sheetId));
}
