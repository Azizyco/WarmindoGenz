import { supabase } from '../../shared/js/supabase.js';
import { showToast } from '../../shared/js/ui.js';

// Utility: robust error logging wrapper
function logSupabaseError(context, error) {
    console.error(`[Settings:${context}]`, error);
    if (error?.message) {
        showToast(`${context}: ${error.message}`, 'error');
    }
}

let currentUser = null;
let allRoles = [];

// Initialize page safely regardless of DOMContentLoaded timing
async function initSettingsPage() {
    await checkAuth();
    initializeTabs();
    await loadPaymentSettings();
    await loadTables();
    await loadUsers();
    await loadRoles();
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initSettingsPage);
} else {
    // DOM already loaded
    initSettingsPage();
}

// Check authentication
async function checkAuth() {
    const { data: { user } } = await supabase.auth.getUser();
    
    if (!user) {
        window.location.href = '/admin/login.html';
        return;
    }

    currentUser = user;

    // Load profile with role
    const { data: profile } = await supabase
        .from('profiles')
        .select('*, roles(*)')
        .eq('id', user.id)
        .single();

    if (profile) {
        const emailEl = document.getElementById('user-email');
        if (emailEl) emailEl.textContent = user.email;
        const roleEl = document.getElementById('user-role');
        if (roleEl) roleEl.textContent = profile.roles?.name || 'Unknown';
        
        // Check if admin
        if (profile.role_id !== 1) {
            showToast('Akses ditolak. Hanya admin yang dapat mengakses halaman ini.', 'error');
            setTimeout(() => {
                window.location.href = '/admin/';
            }, 2000);
        }
    }
}

// Logout
document.getElementById('logout-btn')?.addEventListener('click', async () => {
    await supabase.auth.signOut();
    window.location.href = '/admin/login.html';
});

// Tab Navigation
function initializeTabs() {
    const tabBtns = document.querySelectorAll('.tab-btn');
    const tabContents = document.querySelectorAll('.tab-content');

    tabBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            const tabId = btn.dataset.tab;

            // Remove active class from all
            tabBtns.forEach(b => b.classList.remove('active'));
            tabContents.forEach(c => c.classList.remove('active'));

            // Add active class to selected
            btn.classList.add('active');
            document.getElementById(`${tabId}-tab`).classList.add('active');
        });
    });
}

// ==================== PAYMENT SETTINGS ====================

async function loadPaymentSettings() {
    try {
        const { data, error } = await supabase
            .from('settings')
            .select('*')
            .in('key', ['payment.ewallet', 'payment.qris', 'payment.transfer']);

        if (error) throw error;

        data.forEach(setting => {
            const value = typeof setting.value === 'string' 
                ? JSON.parse(setting.value) 
                : setting.value;

            if (setting.key === 'payment.ewallet') {
                renderEwalletData(value);
            } else if (setting.key === 'payment.qris') {
                renderQrisData(value);
            } else if (setting.key === 'payment.transfer') {
                renderTransferData(value);
            }
        });
    } catch (error) {
        console.error('Error loading payment settings:', error);
        showToast('Gagal memuat pengaturan pembayaran', 'error');
    }
}

function renderEwalletData(data) {
    const container = document.getElementById('ewallet-data');
    container.innerHTML = `
        <div class="payment-info">
            <div class="payment-info-row">
                <span class="payment-info-label">Provider</span>
                <span class="payment-info-value">${data.provider || '-'}</span>
            </div>
            <div class="payment-info-row">
                <span class="payment-info-label">Nama Akun</span>
                <span class="payment-info-value">${data.name || '-'}</span>
            </div>
            <div class="payment-info-row">
                <span class="payment-info-label">Nomor</span>
                <span class="payment-info-value">${data.number || '-'}</span>
            </div>
        </div>
    `;
}

function renderQrisData(data) {
    const container = document.getElementById('qris-data');
    const imagePath = data.image_path || '';
    const imageUrl = imagePath ? `${supabase.storage.from('payment-images').getPublicUrl(imagePath).data.publicUrl}` : '';
    
    container.innerHTML = `
        <div class="payment-info">
            <div class="payment-info-row">
                <span class="payment-info-label">Caption</span>
                <span class="payment-info-value">${data.caption || '-'}</span>
            </div>
            ${imageUrl ? `
                <div class="payment-qr-preview">
                    <img src="${imageUrl}" alt="QRIS Code">
                </div>
            ` : ''}
        </div>
    `;
}

function renderTransferData(data) {
    const container = document.getElementById('transfer-data');
    container.innerHTML = `
        <div class="payment-info">
            <div class="payment-info-row">
                <span class="payment-info-label">Bank</span>
                <span class="payment-info-value">${data.bank_name || '-'}</span>
            </div>
            <div class="payment-info-row">
                <span class="payment-info-label">Nama Akun</span>
                <span class="payment-info-value">${data.account_name || '-'}</span>
            </div>
            <div class="payment-info-row">
                <span class="payment-info-label">Nomor Rekening</span>
                <span class="payment-info-value">${data.account_no || '-'}</span>
            </div>
        </div>
    `;
}

// Edit Payment
window.editPayment = async function(key) {
    try {
        const { data, error } = await supabase
            .from('settings')
            .select('*')
            .eq('key', key)
            .single();

        if (error) throw error;

        const value = typeof data.value === 'string' 
            ? JSON.parse(data.value) 
            : data.value;

        document.getElementById('payment-key').value = key;
        
        let title = '';
        let fields = '';

        if (key === 'payment.ewallet') {
            title = 'Edit E-Wallet';
            fields = `
                <div class="form-group">
                    <label>Provider *</label>
                    <input type="text" id="payment-provider" value="${value.provider || ''}" required>
                </div>
                <div class="form-group">
                    <label>Nama Akun *</label>
                    <input type="text" id="payment-name" value="${value.name || ''}" required>
                </div>
                <div class="form-group">
                    <label>Nomor *</label>
                    <input type="text" id="payment-number" value="${value.number || ''}" required>
                </div>
            `;
        } else if (key === 'payment.qris') {
            title = 'Edit QRIS';
            fields = `
                <div class="form-group">
                    <label>Caption *</label>
                    <input type="text" id="payment-caption" value="${value.caption || ''}" required>
                </div>
                <div class="form-group">
                    <label>Path Gambar QRIS *</label>
                    <input type="text" id="payment-image-path" value="${value.image_path || ''}" required>
                    <small class="text-muted">Contoh: qris/merchant_qr.png</small>
                </div>
            `;
        } else if (key === 'payment.transfer') {
            title = 'Edit Transfer Bank';
            fields = `
                <div class="form-group">
                    <label>Nama Bank *</label>
                    <input type="text" id="payment-bank" value="${value.bank_name || ''}" required>
                </div>
                <div class="form-group">
                    <label>Nama Akun *</label>
                    <input type="text" id="payment-account-name" value="${value.account_name || ''}" required>
                </div>
                <div class="form-group">
                    <label>Nomor Rekening *</label>
                    <input type="text" id="payment-account-no" value="${value.account_no || ''}" required>
                </div>
            `;
        }

        document.getElementById('payment-modal-title').textContent = title;
        document.getElementById('payment-fields').innerHTML = fields;
        document.getElementById('payment-modal').classList.add('active');
    } catch (error) {
        console.error('Error loading payment data:', error);
        showToast('Gagal memuat data pembayaran', 'error');
    }
}

window.closePaymentModal = function() {
    document.getElementById('payment-modal').classList.remove('active');
    document.getElementById('payment-form').reset();
}

// Submit Payment Form
document.getElementById('payment-form').addEventListener('submit', async (e) => {
    e.preventDefault();

    const key = document.getElementById('payment-key').value;
    let newValue = {};

    if (key === 'payment.ewallet') {
        newValue = {
            provider: document.getElementById('payment-provider').value,
            name: document.getElementById('payment-name').value,
            number: document.getElementById('payment-number').value
        };
    } else if (key === 'payment.qris') {
        newValue = {
            caption: document.getElementById('payment-caption').value,
            image_path: document.getElementById('payment-image-path').value
        };
    } else if (key === 'payment.transfer') {
        newValue = {
            bank_name: document.getElementById('payment-bank').value,
            account_name: document.getElementById('payment-account-name').value,
            account_no: document.getElementById('payment-account-no').value
        };
    }

    try {
        const { error } = await supabase
            .from('settings')
            .update({ 
                value: newValue,
                updated_at: new Date().toISOString(),
                updated_by: currentUser.id
            })
            .eq('key', key);

        if (error) throw error;

        showToast('Pengaturan pembayaran berhasil diperbarui', 'success');
        closePaymentModal();
        await loadPaymentSettings();
    } catch (error) {
        console.error('Error updating payment:', error);
        showToast('Gagal memperbarui pengaturan pembayaran', 'error');
    }
});

// ==================== TABLES MANAGEMENT ====================

async function loadTables() {
    const tbody = document.getElementById('tables-list');
    if (!tbody) return;
    // Show skeleton/loading state
    tbody.innerHTML = '<tr><td colspan="6" class="text-center">Memuat data meja...</td></tr>';
    try {
        const { data, error } = await supabase
            .from('tables')
            .select('*')
            .order('label', { ascending: true });

        if (error) throw error;

        if (!data || data.length === 0) {
            tbody.innerHTML = '<tr><td colspan="6" class="text-center">Belum ada data meja</td></tr>';
            return;
        }

        tbody.innerHTML = data.map(table => {
            const updatedAt = table.updated_at ? new Date(table.updated_at).toLocaleString('id-ID') : '-';
            return `
            <tr>
                <td><strong>${table.label}</strong></td>
                <td>${table.capacity} orang</td>
                <td><span class="status-badge ${table.status}">${getStatusLabel(table.status)}</span></td>
                <td>${table.note || '-'}</td>
                <td style="font-size:0.75rem;color:var(--muted);">${updatedAt}</td>
                <td>
                    <div class="action-buttons">
                        <button class="btn-icon" onclick="editTable(${table.id})" title="Edit">
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
                                <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
                            </svg>
                        </button>
                        <button class="btn-icon delete" onclick="deleteTable(${table.id})" title="Hapus">
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <polyline points="3 6 5 6 21 6"/>
                                <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
                            </svg>
                        </button>
                    </div>
                </td>
            </tr>`;
        }).join('');
    } catch (error) {
        logSupabaseError('Memuat Meja', error);
        tbody.innerHTML = '<tr><td colspan="6" class="text-center">Gagal memuat data meja</td></tr>';
    }
}

function getStatusLabel(status) {
    const labels = {
        empty: 'Kosong',
        occupied: 'Terisi',
        reserved: 'Direservasi',
        maintenance: 'Maintenance'
    };
    return labels[status] || status;
}

window.openTableModal = function() {
    document.getElementById('table-modal-title').textContent = 'Tambah Meja';
    document.getElementById('table-form').reset();
    document.getElementById('table-id').value = '';
    document.getElementById('table-status').value = 'empty';
    document.getElementById('table-modal').classList.add('active');
}

window.editTable = async function(id) {
    try {
        const { data, error } = await supabase
            .from('tables')
            .select('*')
            .eq('id', id)
            .single();

        if (error) throw error;

        document.getElementById('table-modal-title').textContent = 'Edit Meja';
        document.getElementById('table-id').value = data.id;
        document.getElementById('table-label').value = data.label;
        document.getElementById('table-capacity').value = data.capacity;
        document.getElementById('table-status').value = data.status;
        document.getElementById('table-note').value = data.note || '';
        document.getElementById('table-modal').classList.add('active');
    } catch (error) {
        console.error('Error loading table:', error);
        showToast('Gagal memuat data meja', 'error');
    }
}

window.deleteTable = async function(id) {
    if (!confirm('Yakin ingin menghapus meja ini?')) return;

    try {
        const { error } = await supabase
            .from('tables')
            .delete()
            .eq('id', id);

        if (error) throw error;

        showToast('Meja berhasil dihapus', 'success');
        await loadTables();
    } catch (error) {
        console.error('Error deleting table:', error);
        showToast('Gagal menghapus meja', 'error');
    }
}

window.closeTableModal = function() {
    document.getElementById('table-modal').classList.remove('active');
    document.getElementById('table-form').reset();
}

// Submit Table Form
document.getElementById('table-form').addEventListener('submit', async (e) => {
    e.preventDefault();

    const id = document.getElementById('table-id').value;
    const tableData = {
        label: document.getElementById('table-label').value,
        capacity: parseInt(document.getElementById('table-capacity').value),
        status: document.getElementById('table-status').value,
        note: document.getElementById('table-note').value || null,
        updated_at: new Date().toISOString(),
        updated_by: currentUser.id
    };

    try {
        let error;
        
        if (id) {
            // Update
            ({ error } = await supabase
                .from('tables')
                .update(tableData)
                .eq('id', id));
        } else {
            // Insert
            ({ error } = await supabase
                .from('tables')
                .insert([tableData]));
        }

        if (error) throw error;

        showToast(`Meja berhasil ${id ? 'diperbarui' : 'ditambahkan'}`, 'success');
        closeTableModal();
        await loadTables();
    } catch (error) {
        console.error('Error saving table:', error);
        showToast('Gagal menyimpan data meja', 'error');
    }
});

// ==================== USERS MANAGEMENT ====================

async function loadRoles() {
    try {
        const { data, error } = await supabase
            .from('roles')
            .select('*')
            .order('id', { ascending: true });

        if (error) throw error;

        allRoles = data || [];

        // Populate role select
        const roleSelect = document.getElementById('user-role');
        roleSelect.innerHTML = '<option value="">Pilih Role</option>' + 
            allRoles.map(role => `<option value="${role.id}">${role.name} - ${role.description}</option>`).join('');

        // Render roles reference list
        const rolesList = document.getElementById('roles-list');
        if (rolesList) {
            rolesList.innerHTML = allRoles.map(r => `
                <li>
                    <span class="role-badge ${r.key}">${r.name}</span>
                    <span class="role-desc">${r.description}</span>
                </li>
            `).join('');
        }
    } catch (error) {
        console.error('Error loading roles:', error);
        const rolesList = document.getElementById('roles-list');
        if (rolesList) rolesList.innerHTML = '<li class="text-muted">Gagal memuat daftar role</li>';
    }
}

async function loadUsers() {
    try {
        const { data, error } = await supabase
            .from('profiles')
            .select('*, roles(*)')
            .order('created_at', { ascending: false });

        if (error) throw error;

        const tbody = document.getElementById('users-list');
        
        if (!data || data.length === 0) {
            tbody.innerHTML = '<tr><td colspan="4" class="text-center">Belum ada data pengguna</td></tr>';
            return;
        }

        tbody.innerHTML = data.map(user => `
            <tr>
                <td><strong>${user.full_name || 'Tanpa Nama'}</strong></td>
                <td>
                    <span class="role-badge ${user.roles?.key || ''}">${user.roles?.name || 'Unknown'}</span>
                </td>
                <td>${new Date(user.created_at).toLocaleDateString('id-ID')}</td>
                <td>
                    <div class="action-buttons">
                        <button class="btn-icon" onclick="editUser('${user.id}')" title="Edit">
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
                                <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
                            </svg>
                        </button>
                        <button class="btn-icon delete" onclick="deleteUser('${user.id}')" title="Hapus" ${user.id === currentUser.id ? 'disabled' : ''}>
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <polyline points="3 6 5 6 21 6"/>
                                <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
                            </svg>
                        </button>
                    </div>
                </td>
            </tr>
        `).join('');
    } catch (error) {
        console.error('Error loading users:', error);
        showToast('Gagal memuat data pengguna', 'error');
    }
}

window.editUser = async function(id) {
    try {
        const { data, error } = await supabase
            .from('profiles')
            .select('*')
            .eq('id', id)
            .single();

        if (error) throw error;

        document.getElementById('user-modal-title').textContent = 'Edit Pengguna';
        document.getElementById('user-id').value = data.id;
        document.getElementById('user-fullname').value = data.full_name || '';
        document.getElementById('user-role').value = data.role_id;
        document.getElementById('user-modal').classList.add('active');
    } catch (error) {
        console.error('Error loading user:', error);
        showToast('Gagal memuat data pengguna', 'error');
    }
}

window.deleteUser = async function(id) {
    if (id === currentUser.id) {
        showToast('Tidak dapat menghapus akun sendiri', 'error');
        return;
    }

    if (!confirm('Yakin ingin menghapus pengguna ini? Aksi ini tidak dapat dibatalkan.')) return;

    try {
        // Delete profile first
        const { error: profileError } = await supabase
            .from('profiles')
            .delete()
            .eq('id', id);

        if (profileError) throw profileError;

        // Note: You might need to call a server-side function to delete the auth user
        // as Supabase doesn't allow deleting auth users from client side

        showToast('Pengguna berhasil dihapus', 'success');
        await loadUsers();
    } catch (error) {
        console.error('Error deleting user:', error);
        showToast('Gagal menghapus pengguna', 'error');
    }
}

window.closeUserModal = function() {
    document.getElementById('user-modal').classList.remove('active');
    document.getElementById('user-form').reset();
}

// Submit User Form
document.getElementById('user-form').addEventListener('submit', async (e) => {
    e.preventDefault();

    const id = document.getElementById('user-id').value;
    const userData = {
        full_name: document.getElementById('user-fullname').value,
        role_id: parseInt(document.getElementById('user-role').value)
    };

    try {
        const { error } = await supabase
            .from('profiles')
            .update(userData)
            .eq('id', id);

        if (error) throw error;

        showToast('Pengguna berhasil diperbarui', 'success');
        closeUserModal();
        await loadUsers();
    } catch (error) {
        console.error('Error updating user:', error);
        showToast('Gagal memperbarui pengguna', 'error');
    }
});

// Close modal when clicking outside
window.addEventListener('click', (e) => {
    if (e.target.classList.contains('modal')) {
        e.target.classList.remove('active');
    }
});
