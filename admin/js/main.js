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
    
    // Load dashboard stats
    loadDashboardStats();
    
    // Setup tour modal
    setupTourModal();
});

// ==================== DASHBOARD STATS ====================

async function loadDashboardStats() {
    const today = new Date().toISOString().split('T')[0];
    
    try {
        // Orders today
        const { data: ordersToday, error: e1 } = await supabase
            .from('orders')
            .select('id, total_amount', { count: 'exact' })
            .gte('created_at', today + 'T00:00:00')
            .lte('created_at', today + 'T23:59:59');
        
        if (!e1 && ordersToday) {
            document.getElementById('stat-orders-today').textContent = ordersToday.length;
            
            // Revenue today
            const revenue = ordersToday.reduce((sum, o) => sum + (o.total_amount || 0), 0);
            document.getElementById('stat-revenue-today').textContent = formatCurrency(revenue);
        }
    } catch (err) {
        console.warn('Error loading orders stats:', err);
    }
    
    try {
        // Total menus
        const { count: menuCount } = await supabase
            .from('menus')
            .select('*', { count: 'exact', head: true });
        
        document.getElementById('stat-menu-count').textContent = menuCount || 0;
    } catch (err) {
        console.warn('Error loading menu count:', err);
    }
    
    try {
        // Available tables
        const { data: tables } = await supabase
            .from('tables')
            .select('status')
            .eq('status', 'empty');
        
        document.getElementById('stat-tables-available').textContent = tables?.length || 0;
    } catch (err) {
        console.warn('Error loading tables stats:', err);
    }
}

function formatCurrency(amount) {
    return 'Rp ' + (amount || 0).toLocaleString('id-ID', { minimumFractionDigits: 0 });
}

// ==================== TOUR MODAL ====================

function setupTourModal() {
    const modal = document.getElementById('tour-modal');
    const startBtn = document.getElementById('start-tour-btn');
    const closeBtn = document.getElementById('tour-close');
    const prevBtn = document.getElementById('tour-prev');
    const nextBtn = document.getElementById('tour-next');
    const stepIndicator = document.getElementById('tour-step-indicator');
    
    let currentStep = 0;
    const totalSteps = 6;
    
    function showStep(step) {
        // Hide all steps
        document.querySelectorAll('.tour-step').forEach(el => el.style.display = 'none');
        
        // Show current step
        const stepEl = document.querySelector(`.tour-step[data-step="${step}"]`);
        if (stepEl) stepEl.style.display = 'block';
        
        // Update indicator
        stepIndicator.textContent = `${step + 1} / ${totalSteps}`;
        
        // Update buttons
        prevBtn.style.display = step === 0 ? 'none' : 'inline-block';
        nextBtn.textContent = step === totalSteps - 1 ? 'Selesai' : 'Selanjutnya →';
        
        currentStep = step;
    }
    
    function openTour() {
        modal.classList.add('active');
        document.body.classList.add('modal-open');
        showStep(0);
    }
    
    function closeTour() {
        modal.classList.remove('active');
        document.body.classList.remove('modal-open');
    }
    
    startBtn?.addEventListener('click', openTour);
    closeBtn?.addEventListener('click', closeTour);
    
    prevBtn?.addEventListener('click', () => {
        if (currentStep > 0) showStep(currentStep - 1);
    });
    
    nextBtn?.addEventListener('click', () => {
        if (currentStep < totalSteps - 1) {
            showStep(currentStep + 1);
        } else {
            closeTour();
        }
    });
    
    // Close on outside click
    modal?.addEventListener('click', (e) => {
        if (e.target === modal) closeTour();
    });
    
    // Check if first visit (optional: auto-show tour)
    const hasSeenTour = localStorage.getItem('warmindoGenZTourSeen');
    if (!hasSeenTour) {
        setTimeout(() => {
            openTour();
            localStorage.setItem('warmindoGenZTourSeen', 'true');
        }, 1000);
    }
}
