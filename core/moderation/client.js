import {createClient} from 'https://esm.sh/@supabase/supabase-js@2';
import {MOD_SUPABASE_URL,MOD_PUBLISHABLE_KEY} from './config.js';
export const moderationClient=createClient(MOD_SUPABASE_URL,MOD_PUBLISHABLE_KEY,{auth:{storageKey:'alysum-moderation-auth',storage:sessionStorage,persistSession:true,autoRefreshToken:true,detectSessionInUrl:true,flowType:'pkce'}});
