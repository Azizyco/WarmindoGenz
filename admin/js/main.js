import { supabase } from '../../shared/js/supabase.js';
import { showToast } from '../../shared/js/ui.js';
import { checkUserSession, staffLogout } from '../../shared/js/auth.js';

document.addEventListener('DOMContentLoaded', async () => {
    const user = await checkUserSession();
    if (!user) {
        window.location.replace('/admin/login.html');
        return;
    }

    const userEmailEl = document.getElementById('user-email');
    if(userEmailEl) userEmailEl.textContent = user.email;

    const logoutBtn = document.getElementById('logout-btn');
    logoutBtn.addEventListener('click', async () => {
        await staffLogout();
        showToast('Anda telah logout.', 'info');
        window.location.replace('/admin/login.html');
    });

    console.log('Admin dashboard loaded for user:', user.email);
    // TODO: Implement RBAC based on user profile
});
