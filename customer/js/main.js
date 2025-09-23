import { supabase } from '../../shared/js/supabase.js';
import { getOrCreateAnonSession } from '../../shared/js/auth.js';

document.addEventListener('DOMContentLoaded', async () => {
    // Ensure user has an anonymous session when they land on the customer site
    const { data, error } = await getOrCreateAnonSession();

    if (error) {
        console.error("Error ensuring anonymous session:", error);
    } else {
        console.log("Anonymous session is active for user:", data.session.user.id);
    }
});
