/**
 * Staff user browser API.
 * Requires supabase-staff-users.sql applied in Supabase.
 */

import { supabase } from "../firebase.js";

export async function staffUsersOverviewStats() {
    const { data, error } = await supabase.rpc("staff_users_overview_stats");
    if (error) throw error;
    return data || {};
}

/**
 * @param {string} [query]
 * @param {number} [limit]
 * @param {number} [offset]
 * @param {{ onlineOnly?: boolean, activeToday?: boolean }} [filters]
 */
export async function staffSearchUsers(query = "", limit = 50, offset = 0, filters = {}) {
    const { data, error } = await supabase.rpc("staff_search_users", {
        p_limit: limit,
        p_offset: offset,
        p_query: query || "",
        p_online_only: !!filters.onlineOnly,
        p_active_today: !!filters.activeToday,
    });
    if (error) throw error;
    return data || { total: 0, users: [], limit, offset };
}

export async function staffListOnlineUsers(limit = 30) {
    const { data, error } = await supabase.rpc("staff_list_online_users", {
        p_limit: limit,
    });
    if (error) throw error;
    return data || [];
}

/** @param {string} userId */
export async function staffGetUserDetail(userId) {
    const { data, error } = await supabase.rpc("staff_get_user_detail", {
        p_user_id: userId,
    });
    if (error) throw error;
    return data;
}

/** @param {string} userId */
export async function staffListUserBooks(userId) {
    const { data, error } = await supabase.rpc("staff_list_user_books", {
        p_user_id: userId,
    });
    if (error) throw error;
    return data || [];
}

/** @param {string} userId */
export async function staffGetUserSafety(userId) {
    const { data, error } = await supabase.rpc("staff_get_user_safety", {
        p_user_id: userId,
    });
    if (error) throw error;
    return data || {};
}

/** @param {string} userId */
export async function staffGetUserEngagement(userId) {
    const { data, error } = await supabase.rpc("staff_get_user_engagement", {
        p_user_id: userId,
    });
    if (error) throw error;
    return data || {};
}
