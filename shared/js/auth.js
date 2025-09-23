import { supabase } from './supabase.js';

/**
 * Handles staff login.
 * @param {string} email
 * @param {string} password
 * @returns {Promise<{ data: any, error: any }>}
 */
export async function staffLogin(email, password) {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    return { data, error };
}

/**
 * Handles staff logout.
 * @returns {Promise<{ error: any }>}
 */
export async function staffLogout() {
    const { error } = await supabase.auth.signOut();
    return { error };
}

/**
 * Checks for an active user session.
 * @returns {Promise<import('@supabase/supabase-js').User | null>}
 */
export async function checkUserSession() {
    const { data } = await supabase.auth.getSession();
    return data.session ? data.session.user : null;
}

/**
 * Gets the current anonymous session or creates one if it doesn't exist.
 * @returns {Promise<{ data: any, error: any }>}
 */
export async function getOrCreateAnonSession() {
    let { data, error } = await supabase.auth.getSession();

    if (error) {
        return { data: null, error };
    }

    if (data.session) {
        return { data, error: null };
    }

    // If no session, sign in anonymously
    return await supabase.auth.signInAnonymously();
}
