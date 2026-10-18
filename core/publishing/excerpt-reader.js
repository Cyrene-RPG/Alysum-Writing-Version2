import { supabase } from "../authentication/client.js";
import { createExcerptApi } from "./excerpts.js";
export function fetchSharedExcerpt(token) { return createExcerptApi(supabase, { origin: window.location.origin }).read(token); }
