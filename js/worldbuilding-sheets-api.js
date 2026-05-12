/**
 * Cloud worldbuilding worksheets (multi-sheet, like character profile).
 * Path: users/{uid}/worldbuildingSheets/{sheetId}
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

export const WORLDBUILDING_SHEETS = "worldbuildingSheets";

function safeString(value, fallback = "") {
    return typeof value === "string" ? value : fallback;
}

function deepClone(obj) {
    try {
        return JSON.parse(JSON.stringify(obj));
    } catch {
        return {};
    }
}

export function generateWorldbuildingSheetId() {
    return "wbw_" + Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
}

/**
 * @param {object} raw
 * @param {string} id
 */
export function normalizeWorldbuildingSheetDoc(raw, id) {
    const r = raw && typeof raw === "object" ? raw : {};
    const answers = r.answers && typeof r.answers === "object" ? deepClone(r.answers) : {};
    const now = Date.now();
    return {
        id,
        schemaVersion: typeof r.schemaVersion === "number" ? r.schemaVersion : 2,
        displayName: safeString(r.displayName, "").trim() || "Untitled world",
        answers,
        createdAt: typeof r.createdAt === "number" && Number.isFinite(r.createdAt) ? r.createdAt : now,
        updated: typeof r.updated === "number" && Number.isFinite(r.updated) ? r.updated : now
    };
}

/**
 * @param {import("firebase/firestore").Firestore} db
 * @param {string} uid
 * @param {(sheets: ReturnType<typeof normalizeWorldbuildingSheetDoc>[]) => void} onUpdate
 * @param {(err: unknown) => void} [onError]
 * @returns {() => void} unsubscribe
 */
export function subscribeWorldbuildingSheets(db, uid, onUpdate, onError) {
    const col = collection(db, "users", uid, WORLDBUILDING_SHEETS);
    const q = query(col, orderBy("updated", "desc"));
    return onSnapshot(
        q,
        snap => {
            const list = snap.docs.map(d => normalizeWorldbuildingSheetDoc(d.data(), d.id));
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
 * @param {{ id: string, displayName: string, answers: object, createdAt?: number }} sheet
 */
export async function saveWorldbuildingSheet(db, uid, sheet) {
    const id = sheet.id || generateWorldbuildingSheetId();
    const ref = doc(db, "users", uid, WORLDBUILDING_SHEETS, id);
    const now = Date.now();
    const createdAt =
        typeof sheet.createdAt === "number" && Number.isFinite(sheet.createdAt) ? sheet.createdAt : now;
    const displayName = safeString(sheet.displayName, "").trim() || "Untitled world";
    const answers = sheet.answers && typeof sheet.answers === "object" ? deepClone(sheet.answers) : {};
    await setDoc(
        ref,
        {
            schemaVersion: 2,
            displayName,
            answers,
            createdAt,
            updated: now,
            updatedAt: now
        },
        { merge: true }
    );
    return id;
}

/**
 * @param {import("firebase/firestore").Firestore} db
 * @param {string} uid
 * @param {string} sheetId
 */
export async function deleteWorldbuildingSheet(db, uid, sheetId) {
    await deleteDoc(doc(db, "users", uid, WORLDBUILDING_SHEETS, sheetId));
}
