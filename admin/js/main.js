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
  if (logoutBtn) {
    logoutBtn.addEventListener('click', async () => {
      await staffLogout();
      showToast('Anda telah logout.', 'info');
      window.location.replace('/admin/login.html');
    });
  }

  const statusBanner = {
    connection: document.getElementById('connection-status'),
    role: document.getElementById('user-role'),
  };
    
    // Menampilkan role pengguna
// Menampilkan role pengguna (tahan banting, tanpa join dulu)
async function getUserRole() {
  try {
    // Ambil baris profil tanpa join supaya tidak error 400
    const { data: profile, error: e1 } = await supabase
      .from('profiles')
      .select('*')                 // aman: tidak sebut kolom yang mungkin tak ada
      .eq('id', user.id)
      .maybeSingle();

    let role = null;

    if (profile) {
      // beberapa kemungkinan penamaan kolom role di profil
      role = profile.role ?? profile.role_key ?? profile.roles_key ?? null;

      // kalau pakai id role, lookup ke tabel roles (tanpa join)
      const roleId = profile.role_id ?? profile.roles_id ?? null;
      if (!role && roleId) {
        const { data: r, error: er } = await supabase
          .from('roles')
          .select('key')
          .eq('id', roleId)
          .maybeSingle();
        if (!er) role = r?.key ?? role;
      }
    }

    // fallback opsional: staff_profiles (abaikan kalau 404)
    if (!role) {
      try {
        const { data: staff } = await supabase
          .from('staff_profiles')
          .select('role')
          .eq('user_id', user.id)
          .maybeSingle();
        role = staff?.role ?? role;
      } catch { /* tabelnya memang tidak ada, lewati */ }
    }

    // fallback terakhir: metadata dari auth
    if (!role) {
      role =
        user?.user_metadata?.role ??
        user?.app_metadata?.role ??
        (Array.isArray(user?.app_metadata?.roles) ? user.app_metadata.roles[0] : null) ??
        'Tidak Diketahui';
    }

    if (statusBanner.role) statusBanner.role.textContent = role;
  } catch (err) {
    console.error('Error fetching user role:', err);
    if (statusBanner.role) statusBanner.role.textContent = 'Error';
  }
}

    
    getUserRole();
    
  // Memeriksa status koneksi (aman meski elemen tidak ada di halaman)
  function updateConnectionStatus() {
    const connEl = statusBanner.connection || document.getElementById('connection-status');
    if (!connEl) return; // jika halaman tidak punya indikator koneksi, jangan apa-apa

    if (navigator.onLine) {
      connEl.classList.remove('status-offline');
      connEl.classList.add('status-online');
      connEl.title = 'Online';
    } else {
      connEl.classList.remove('status-online');
      connEl.classList.add('status-offline');
      connEl.title = 'Offline';
    }
  }
    
    // Menjalankan pemeriksaan koneksi saat halaman dimuat
    updateConnectionStatus();
    
    // Menambahkan event listener untuk perubahan status koneksi
    window.addEventListener('online', updateConnectionStatus);
    window.addEventListener('offline', updateConnectionStatus);
    
    console.log('Admin dashboard loaded for user:', user.email);
    // TODO: Implement RBAC based on user profile
});
