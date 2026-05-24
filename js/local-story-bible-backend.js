/**
 * Story Bible persistence for local Studio guest (no Supabase).
 */
import {
  normalizeBibleCharacter,
  normalizeBiblePlace,
  generateBibleCharacterId,
  generateBiblePlaceId,
  bibleCharacterToFirestore,
  biblePlaceToFirestore,
} from "./story-bible-api.js?v=6";
import { stripHtmlForBibleScan } from "./story-bible-scan.js?v=6";
import { listBooks, getBook, getStoryBibleRows, setStoryBibleRows } from "./local-studio-store.js?v=1";

export async function listBibleCharacters(_supabase, _uid, bookId) {
  const { characters } = getStoryBibleRows();
  const list = characters
    .filter((r) => r.book_id === bookId)
    .map((r) => normalizeBibleCharacter(r.body || {}, r.id));
  list.sort((a, b) => (a.sortKey || "").localeCompare(b.sortKey || "", undefined, { sensitivity: "base" }));
  return list;
}

export async function saveBibleCharacter(_supabase, _uid, bookId, character) {
  const id = character.id || generateBibleCharacterId();
  const payload = bibleCharacterToFirestore({ ...character, id });
  const { characters, places } = getStoryBibleRows();
  const ix = characters.findIndex((r) => r.book_id === bookId && r.id === id);
  const row = { book_id: bookId, id, body: payload };
  if (ix >= 0) characters[ix] = row;
  else characters.push(row);
  setStoryBibleRows(characters, places);
  return id;
}

export async function deleteBibleCharacter(_supabase, _uid, bookId, characterId) {
  const { characters, places } = getStoryBibleRows();
  setStoryBibleRows(
    characters.filter((r) => !(r.book_id === bookId && r.id === characterId)),
    places
  );
}

export async function listBiblePlaces(_supabase, _uid, bookId) {
  const { places } = getStoryBibleRows();
  const list = places
    .filter((r) => r.book_id === bookId)
    .map((r) => normalizeBiblePlace(r.body || {}, r.id));
  list.sort((a, b) => (a.sortKey || "").localeCompare(b.sortKey || "", undefined, { sensitivity: "base" }));
  return list;
}

export async function saveBiblePlace(_supabase, _uid, bookId, place) {
  const id = place.id || generateBiblePlaceId();
  const payload = biblePlaceToFirestore({ ...place, id });
  const { characters, places } = getStoryBibleRows();
  const ix = places.findIndex((r) => r.book_id === bookId && r.id === id);
  const row = { book_id: bookId, id, body: payload };
  if (ix >= 0) places[ix] = row;
  else places.push(row);
  setStoryBibleRows(characters, places);
  return id;
}

export async function deleteBiblePlace(_supabase, _uid, bookId, placeId) {
  const { characters, places } = getStoryBibleRows();
  setStoryBibleRows(
    characters,
    places.filter((r) => !(r.book_id === bookId && r.id === placeId))
  );
}

export async function countBiblePlaces(_supabase, _uid, bookId) {
  return getStoryBibleRows().places.filter((r) => r.book_id === bookId).length;
}

export async function countBibleCharacters(_supabase, _uid, bookId) {
  return getStoryBibleRows().characters.filter((r) => r.book_id === bookId).length;
}

export async function listUserBooksWithBibleCounts(_supabase, _uid) {
  const books = listBooks();
  const { characters, places } = getStoryBibleRows();
  const charCount = new Map();
  const placeCount = new Map();
  characters.forEach((r) => charCount.set(r.book_id, (charCount.get(r.book_id) || 0) + 1));
  places.forEach((r) => placeCount.set(r.book_id, (placeCount.get(r.book_id) || 0) + 1));
  return books.map((d) => ({
    bookId: d.id,
    title: typeof d.title === "string" && d.title.trim() ? d.title.trim() : "Untitled Book",
    updated: typeof d.updated === "number" ? d.updated : 0,
    characterCount: charCount.get(d.id) || 0,
    placeCount: placeCount.get(d.id) || 0,
  }));
}

export async function loadBookChapterOptions(_supabase, _uid, bookId) {
  const data = getBook(bookId);
  if (!data?.sections) return [];
  const sections = data.sections || {};
  const out = [];
  const sectionLabel = { front: "Front matter", body: "Body", back: "Back matter" };
  for (const sec of ["front", "body", "back"]) {
    const arr = Array.isArray(sections[sec]) ? sections[sec] : [];
    arr.forEach((ch, i) => {
      const id = typeof ch?.id === "string" ? ch.id : "";
      const rawTitle =
        typeof ch?.title === "string" && ch.title.trim()
          ? ch.title.trim()
          : sec === "body"
            ? `Chapter ${i + 1}`
            : `Untitled ${i + 1}`;
      out.push({ section: sec, id, title: rawTitle, label: `${sectionLabel[sec] || sec}: ${rawTitle}` });
    });
  }
  return out;
}

export async function getBookTitle(_supabase, _uid, bookId) {
  const data = getBook(bookId);
  const t = data?.title;
  return typeof t === "string" && t.trim() ? t.trim() : "Untitled Book";
}

export async function loadBookPlainTextForScan(_supabase, _uid, bookId) {
  const data = getBook(bookId);
  if (!data?.sections) return "";
  const sections = data.sections || {};
  const parts = [];
  for (const sec of ["front", "body", "back"]) {
    const arr = Array.isArray(sections[sec]) ? sections[sec] : [];
    for (const ch of arr) {
      parts.push(stripHtmlForBibleScan(ch?.content || ""));
    }
  }
  return parts.join("\n\n");
}
