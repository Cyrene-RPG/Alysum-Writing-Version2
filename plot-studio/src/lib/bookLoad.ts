import type { Act, Scene } from "../types";
import { createId } from "../types";

export interface AlysumBookPayload {
  title: string;
  sections: {
    front?: Array<{ id?: string; title?: string; content?: string }>;
    body?: Array<{ id?: string; title?: string; content?: string }>;
    back?: Array<{ id?: string; title?: string; content?: string }>;
  };
}

export function readBookIdFromUrl(): string {
  return new URLSearchParams(window.location.search).get("book")?.trim() || "";
}

/** @param {import("@supabase/supabase-js").SupabaseClient} supabase */
export async function fetchAlysumBook(
  supabase: import("@supabase/supabase-js").SupabaseClient,
  uid: string,
  bookId: string
): Promise<AlysumBookPayload | null> {
  if (!uid || !bookId) return null;
  const { data, error } = await supabase
    .from("books")
    .select("title, sections")
    .eq("id", bookId)
    .eq("user_id", uid)
    .maybeSingle();
  if (error || !data) return null;
  return {
    title: typeof data.title === "string" ? data.title : "Untitled Book",
    sections: (data.sections as AlysumBookPayload["sections"]) || {},
  };
}

export function flattenBookChapters(sections: AlysumBookPayload["sections"]) {
  const out: Array<{ section: string; id: string; title: string }> = [];
  const labels: Record<string, string> = { front: "Front", body: "Body", back: "Back" };
  for (const sec of ["front", "body", "back"] as const) {
    const arr = Array.isArray(sections[sec]) ? sections[sec]! : [];
    arr.forEach((ch, i) => {
      const id = typeof ch?.id === "string" ? ch.id : `${sec}_${i}`;
      const title =
        typeof ch?.title === "string" && ch.title.trim()
          ? ch.title.trim()
          : sec === "body"
            ? `Chapter ${i + 1}`
            : `Section ${i + 1}`;
      out.push({ section: sec, id, title: `${labels[sec]}: ${title}` });
    });
  }
  return out;
}

export function scenesFromBookChapters(chapters: ReturnType<typeof flattenBookChapters>, acts: Act[]): Scene[] {
  const actIds = [...acts].sort((a, b) => a.order - b.order).map(a => a.id);
  if (!actIds.length) return [];
  return chapters.map((ch, i) => {
    const actId = actIds[Math.min(actIds.length - 1, Math.floor((i / Math.max(chapters.length, 1)) * actIds.length))]!;
    return {
      id: createId("scene"),
      actId,
      order: i * 10,
      title: ch.title,
      povCharacter: "",
      location: "",
      goal: "",
      conflict: "",
      outcome: "",
      emotionalShift: "",
      plotlineId: "pl-a",
      beatTag: ch.section === "body" && i === 0 ? "opening" : "",
      notes: `Imported from Alysum chapter (${ch.section}). Fill goal, conflict, and outcome for Plot Doctor analysis.`,
    };
  });
}
