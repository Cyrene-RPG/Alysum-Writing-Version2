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
import { listBooks, getBook, getStoryBibleRows, setStoryBibleRows } from "./local-studio-store.js?v=2";
import {
  normalizeBibleFact,
  generateBibleFactId,
} from "./story-bible-facts-api.js?v=1";

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
  const { facts } = getStoryBibleRows();
  setStoryBibleRows(characters, places, facts);
  return id;
}

export async function deleteBibleCharacter(_supabase, _uid, bookId, characterId) {
  const { characters, places, facts } = getStoryBibleRows();
  setStoryBibleRows(
    characters.filter((r) => !(r.book_id === bookId && r.id === characterId)),
    places,
    facts.filter((r) => !(r.book_id === bookId && r.character_id === characterId))
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
  const { facts } = getStoryBibleRows();
  setStoryBibleRows(characters, places, facts);
  return id;
}

export async function deleteBiblePlace(_supabase, _uid, bookId, placeId) {
  const { characters, places, facts } = getStoryBibleRows();
  setStoryBibleRows(
    characters,
    places.filter((r) => !(r.book_id === bookId && r.id === placeId)),
    facts
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
  const chapters = await loadBookChaptersPlainForScan(_supabase, _uid, bookId);
  return chapters.map((ch) => ch.plainText).filter(Boolean).join("\n\n");
}

export async function loadBookChaptersPlainForScan(_supabase, _uid, bookId) {
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
      out.push({
        section: sec,
        id,
        title: rawTitle,
        label: `${sectionLabel[sec] || sec}: ${rawTitle}`,
        plainText: stripHtmlForBibleScan(ch?.content || ""),
      });
    });
  }
  return out;
}

export async function listBibleFacts(_supabase, _uid, bookId) {
  const { facts } = getStoryBibleRows();
  const list = facts
    .filter((r) => r.book_id === bookId)
    .map((r) =>
      normalizeBibleFact(
        {
          book_id: bookId,
          character_id: r.character_id,
          category: r.category,
          value: r.value,
          source_chapter: r.source_chapter,
          source_paragraph: r.source_paragraph,
          source_text: r.source_text,
          date_added: r.date_added,
          updated: r.updated,
        },
        r.id
      )
    );
  list.sort((a, b) => String(b.date_added).localeCompare(String(a.date_added)));
  return list;
}

export async function saveBibleFact(_supabase, _uid, bookId, fact) {
  const id = fact.id || generateBibleFactId();
  const row = normalizeBibleFact({ ...fact, book_id: bookId }, id);
  const { characters, places, facts } = getStoryBibleRows();
  const ix = facts.findIndex((r) => r.book_id === bookId && r.id === id);
  const stored = {
    book_id: bookId,
    id: row.id,
    character_id: row.character_id,
    category: row.category,
    value: row.value,
    source_chapter: row.source_chapter,
    source_paragraph: row.source_paragraph,
    source_text: row.source_text,
    date_added: row.date_added,
    updated: Date.now(),
  };
  if (ix >= 0) facts[ix] = stored;
  else facts.push(stored);
  setStoryBibleRows(characters, places, facts);
  return id;
}

export async function deleteBibleFact(_supabase, _uid, bookId, factId) {
  const { characters, places, facts } = getStoryBibleRows();
  setStoryBibleRows(
    characters,
    places,
    facts.filter((r) => !(r.book_id === bookId && r.id === factId))
  );
}

export async function deleteBibleFactsForCharacter(_supabase, _uid, bookId, characterId) {
  const { characters, places, facts } = getStoryBibleRows();
  setStoryBibleRows(
    characters,
    places,
    facts.filter((r) => !(r.book_id === bookId && r.character_id === characterId))
  );
}

export async function countBibleFacts(_supabase, _uid, bookId) {
  return getStoryBibleRows().facts.filter((r) => r.book_id === bookId).length;
}
