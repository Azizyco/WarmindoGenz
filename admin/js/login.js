import { supabase } from '../../shared/js/supabase.js';
import { showToast } from '../../shared/js/ui.js';
import { staffLogin } from '../../shared/js/auth.js';

document.addEventListener('DOMContentLoaded', () => {
    const loginForm = document.getElementById('login-form');
    const loginButton = document.getElementById('login-btn');
    const errorMessage = document.getElementById('error-message');

    loginForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        loginButton.disabled = true;
        loginButton.textContent = 'Logging in...';
        errorMessage.textContent = '';

        const email = loginForm.email.value;
        const password = loginForm.password.value;

        const { error } = await staffLogin(email, password);

        if (error) {
            errorMessage.textContent = `Login Gagal: ${error.message}`;
            showToast(`Login Gagal: ${error.message}`, 'error');
            loginButton.disabled = false;
            loginButton.textContent = 'Login';
        } else {
            showToast('Login berhasil! Mengarahkan ke dashboard...', 'success');
            window.location.href = '/admin/';
        }
    });
});
