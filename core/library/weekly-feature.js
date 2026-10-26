// Deterministic weekly selection among eligible published catalog entries.
export function weeklyFeatureKey(date = new Date()) {
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7));
  return d.toISOString().slice(0, 10);
}
function hash(text) {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) { h ^= text.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}
export function selectWeeklyFeature(books, date = new Date()) {
  const eligible = (books || []).filter(b => b?.id && b?.chapters > 0).slice().sort((a,b) => String(a.id).localeCompare(String(b.id)));
  if (!eligible.length) return null;
  const week = weeklyFeatureKey(date);
  return eligible.reduce((best, book) => {
    const score = hash(week + ':' + book.id);
    return !best || score > best.score ? {book, score} : best;
  }, null).book;
}
