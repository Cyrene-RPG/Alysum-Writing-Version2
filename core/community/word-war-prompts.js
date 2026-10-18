/**
 * The prompt collection hosts pick from. No DOM.
 *
 * Prompts live in the word_war_prompts table (supabase-word-wars-race.sql):
 * add a row there to add a prompt, set is_active to false to retire one. Each
 * prompt is { id, text }; the id doubles as its number (#31 stays #31).
 */
import { supabase } from "../authentication/client.js";

let loading = null;

/** Active prompts in collection order. Loaded once per page. */
export function listPrompts() {
    if (!loading) {
        loading = (async () => {
            const { data, error } = await supabase
                .from("word_war_prompts")
                .select("id, body")
                .eq("is_active", true)
                .order("id", { ascending: true });
            if (error) throw new Error(error.message || "Could not load the prompts.");
            return (Array.isArray(data) ? data : [])
                .map((row) => ({ id: Number(row.id), text: String(row.body || "").trim() }))
                .filter((p) => p.text);
        })();
        loading.catch(() => { loading = null; });
    }
    return loading;
}

/** A prompt from the list, different from `currentText` when possible. */
export function randomPrompt(prompts, currentText = null) {
    const pool = prompts.length > 1 ? prompts.filter((p) => p.text !== currentText) : prompts;
    return pool[Math.floor(Math.random() * pool.length)] || null;
}

export function findPrompt(prompts, text) {
    return prompts.find((p) => p.text === text) || null;
}
