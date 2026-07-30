/**
 * Staff feature usage analytics API.
 * Requires supabase-feature-usage.sql applied in Supabase.
 */

import { supabase } from "../firebase.js";

/**
 * @param {number} [days]
 */
export async function staffFeatureUsageStats(days = 14) {
    const { data, error } = await supabase.rpc("staff_feature_usage_stats", {
        p_days: days,
    });
    if (error) throw error;
    return data || {};
}

/**
 * @param {string} userId
 * @param {number} [days]
 */
export async function staffFeatureUsageForUser(userId, days = 14) {
    const { data, error } = await supabase.rpc("staff_feature_usage_for_user", {
        p_user_id: userId,
        p_days: days,
    });
    if (error) throw error;
    return data || {};
}
