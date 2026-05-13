import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const supabaseUrl = "https://tiqmhozzxhiydjnyuuaw.supabase.co";
const supabaseKey = "sb_publishable_jZvjeBX2jKnVcQMBrZ6K8A_Rn7uVJAg";

export const supabase = createClient(supabaseUrl, supabaseKey);
