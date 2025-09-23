// This is a large file, it's structured by feature tabs for readability.
import { supabase } from '../../shared/js/supabase.js';
import { showToast } from '../../shared/js/ui.js';
import { validateForm } from '../../shared/js/validation.js';

document.addEventListener('DOMContentLoaded', () => {
    // --- STATE ---
    let currentUserRole = null;
    let canWrite = false;
    let onHandDataCache = [];
    
    // Ingredients Tab State
    let ingredientsCurrentPage = 1;
    const INGREDIENTS_ROWS_PER_PAGE = 10;
    let ingredientsTotalRows = 0;


    // --- DOM ELEMENTS ---
    const tabLinks = document.querySelectorAll('.tab-link');
    const tabContents = document.querySelectorAll('.tab-content');
    const statusBanner = {
        connection: document.getElementById('connection-status'),
        role: document.getElementById('user-role'),
    };

    // --- INITIALIZATION ---
    const initializeApp = async () => {
        await checkUserRole();
        setupTabEventListeners();
        setupAllFeatureEventListeners();
        handleTabSwitch(document.querySelector('.tab-link.active').dataset.tab);
        
        supabase.realtime.connect();
        supabase.realtime.channel('db-changes').on('postgres_changes', { event: '*', schema: 'public' }, payload => {
            console.log('Change received!', payload)
            statusBanner.connection.classList.remove('status-offline');
            statusBanner.connection.classList.add('status-online');
            statusBanner.connection.title = 'Terhubung';
            const activeTab = document.querySelector('.tab-link.active')?.dataset.tab;
            if (activeTab) handleTabSwitch(activeTab, true);
        }).subscribe()

        window.addEventListener('offline', () => {
            statusBanner.connection.classList.remove('status-online');
            statusBanner.connection.classList.add('status-offline');
            statusBanner.connection.title = 'Koneksi Terputus';
        });
    };

    const checkUserRole = async () => {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) {
            window.location.href = '/login.html';
            return;
        }

        const { data: profile, error } = await supabase
            .from('profiles')
            .select('roles(key)')
            .eq('id', user.id)
            .single();

        if (error || !profile) {
            console.error('Error fetching user profile:', error);
            currentUserRole = 'unknown';
        } else {
            currentUserRole = profile.roles.key;
        }

        canWrite = ['admin', 'manager'].includes(currentUserRole);
        statusBanner.role.textContent = currentUserRole;
        toggleEditability();
    };

    const toggleEditability = () => {
        document.querySelectorAll('.write-access').forEach(el => {
            el.disabled = !canWrite;
            if (!canWrite) el.title = 'Akses read-only';
            else el.title = '';
        });
    };

    // --- TAB HANDLING ---
    const setupTabEventListeners = () => {
        tabLinks.forEach(link => {
            link.addEventListener('click', () => {
                const tabName = link.dataset.tab;
                tabLinks.forEach(l => l.classList.remove('active'));
                tabContents.forEach(c => c.classList.remove('active'));
                link.classList.add('active');
                document.getElementById(`${tabName}-tab`).classList.add('active');
                handleTabSwitch(tabName);
            });
        });
    };
    
    const setupAllFeatureEventListeners = () => {
        setupOnHandEventListeners();
        setupIngredientsEventListeners();
    };

    const handleTabSwitch = (tabName, isRefresh = false) => {
        if (!isRefresh) console.log(`Switching to ${tabName} tab.`);
        switch (tabName) {
            case 'on-hand':
                loadOnHandData();
                break;
            case 'ingredients':
                loadIngredientsData();
                break;
            case 'suppliers':
                showToast('Suppliers tab is under construction.', 'info');
                break;
            case 'bom-menu':
                showToast('BOM (Menu) tab is under construction.', 'info');
                break;
            case 'bom-option':
                showToast('BOM (Option) tab is under construction.', 'info');
                break;
            case 'ledger':
                showToast('Ledger tab is under construction.', 'info');
                break;
        }
    };

    // --- UTILITY FUNCTIONS ---
    const debounce = (func, delay = 300) => {
        let timeout;
        return (...args) => {
            clearTimeout(timeout);
            timeout = setTimeout(() => {
                func.apply(this, args);
            }, delay);
        };
    };

    const formatCurrency = (value) => new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', minimumFractionDigits: 0 }).format(value);
    const formatNumber = (value) => new Intl.NumberFormat('id-ID').format(value);
    const formatDate = (dateString) => dateString ? new Date(dateString).toLocaleString('id-ID', { dateStyle: 'medium', timeStyle: 'short' }) : '-';

    const exportToCSV = (data, filename) => {
        if (data.length === 0) {
            showToast('Tidak ada data untuk diekspor', 'warning');
            return;
        }
        const headers = Object.keys(data[0]);
        const csvRows = [
            headers.join(','),
            ...data.map(row =>
                headers.map(header => JSON.stringify(row[header])).join(',')
            )
        ];
        const blob = new Blob([csvRows.join('\n')], { type: 'text/csv' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.setAttribute('hidden', '');
        a.setAttribute('href', url);
        a.setAttribute('download', `${filename}.csv`);
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
    };

    // --- FEATURE: ON-HAND ---
    const onHandSearchInput = document.getElementById('on-hand-search');
    const onHandSortSelect = document.getElementById('on-hand-sort');
    const onHandTableBody = document.getElementById('on-hand-table-body');
    const lowStockBanner = document.getElementById('low-stock-banner');
    const exportOnHandBtn = document.getElementById('export-on-hand-csv');

    const renderOnHandTable = (data) => {
        if (!data || data.length === 0) {
            onHandTableBody.innerHTML = '<tr><td colspan="6" class="text-center">Tidak ada data stok.</td></tr>';
            lowStockBanner.style.display = 'none';
            return;
        }
        let hasLowStock = false;
        const rows = data.map(item => {
            const isLow = item.qty_on_hand < item.min_stock;
            if (isLow) hasLowStock = true;
            const stockValue = (item.qty_on_hand || 0) * (item.cost_per_unit || 0);
            return `
                <tr class="${isLow ? 'row-warning' : ''}">
                    <td>${item.name}</td>
                    <td>
                        ${formatNumber(item.qty_on_hand)}
                        ${isLow ? '<span class="badge badge-low-stock">LOW</span>' : ''}
                    </td>
                    <td>${item.unit}</td>
                    <td>${formatNumber(item.min_stock)}</td>
                    <td>${formatCurrency(item.cost_per_unit)}</td>
                    <td>${formatCurrency(stockValue)}</td>
                </tr>
            `;
        }).join('');
        onHandTableBody.innerHTML = rows;
        lowStockBanner.style.display = hasLowStock ? 'block' : 'none';
    };

    const loadOnHandData = async () => {
        onHandTableBody.innerHTML = '<tr><td colspan="6" class="text-center">Memuat...</td></tr>';
        const searchTerm = onHandSearchInput.value.trim();
        const [sortColumn, sortDirection] = onHandSortSelect.value.split('_');
        try {
            let query = supabase.from('vw_ingredient_on_hand').select('*');
            if (searchTerm) query = query.ilike('name', `%${searchTerm}%`);
            const orderOptions = { ascending: sortDirection === 'asc' };
            query = query.order(sortColumn === 'qty' ? 'qty_on_hand' : 'name', orderOptions);
            const { data, error } = await query;
            if (error) throw error;
            onHandDataCache = data;
            renderOnHandTable(data);
        } catch (error) {
            console.error('Error loading on-hand data:', error);
            showToast(`Error memuat data: ${error.message}`, 'error');
            onHandTableBody.innerHTML = '<tr><td colspan="6" class="text-center">Gagal memuat data.</td></tr>';
        }
    };

    const setupOnHandEventListeners = () => {
        onHandSearchInput.addEventListener('input', debounce(loadOnHandData, 300));
        onHandSortSelect.addEventListener('change', loadOnHandData);
        exportOnHandBtn.addEventListener('click', () => {
            if (onHandDataCache.length === 0) {
                showToast('Tidak ada data untuk diekspor.', 'warning');
                return;
            }
            const dataToExport = onHandDataCache.map(item => ({
                nama_bahan: item.name,
                qty_on_hand: item.qty_on_hand,
                unit: item.unit,
                min_stock: item.min_stock,
                cost_per_unit: item.cost_per_unit,
                stock_value: (item.qty_on_hand || 0) * (item.cost_per_unit || 0)
            }));
            exportToCSV(dataToExport, 'stok_on_hand_warmindogenz.csv');
        });
    };
    
    // --- FEATURE: INGREDIENTS ---
    const ingredientsSearchInput = document.getElementById('ingredients-search');
    const addIngredientBtn = document.getElementById('add-ingredient-btn');
    const ingredientsTableBody = document.getElementById('ingredients-table-body');
    const ingredientsPagination = document.getElementById('ingredients-pagination');
    const ingredientModal = document.getElementById('ingredient-modal');
    const ingredientModalTitle = document.getElementById('ingredient-modal-title');
    const ingredientForm = document.getElementById('ingredient-form');
    const ingredientIdInput = document.getElementById('ingredient-id');

    const renderIngredientsTable = (data) => {
        if (!data || data.length === 0) {
            ingredientsTableBody.innerHTML = '<tr><td colspan="6" class="text-center">Tidak ada bahan ditemukan.</td></tr>';
            return;
        }
        ingredientsTableBody.innerHTML = data.map(item => `
            <tr>
                <td>${item.name}</td>
                <td>${item.unit}</td>
                <td>${item.sku || '-'}</td>
                <td>${formatNumber(item.min_stock)}</td>
                <td>${formatCurrency(item.cost_per_unit)}</td>
                <td>
                    <div class="action-buttons">
                        <button class="btn btn-sm btn-secondary edit-ingredient-btn write-access" data-id="${item.id}">Edit</button>
                        <button class="btn btn-sm btn-danger delete-ingredient-btn write-access" data-id="${item.id}" data-name="${item.name}">Hapus</button>
                    </div>
                </td>
            </tr>
        `).join('');
        toggleEditability(); // Re-apply disabled state after render
    };

    const renderIngredientsPagination = () => {
        const totalPages = Math.ceil(ingredientsTotalRows / INGREDIENTS_ROWS_PER_PAGE);
        if (totalPages <= 1) {
            ingredientsPagination.innerHTML = '';
            return;
        }
        let paginationHTML = `
            <button class="btn" id="prev-page" ${ingredientsCurrentPage === 1 ? 'disabled' : ''}>&laquo; Prev</button>
            <span>Halaman ${ingredientsCurrentPage} dari ${totalPages}</span>
            <button class="btn" id="next-page" ${ingredientsCurrentPage === totalPages ? 'disabled' : ''}>Next &raquo;</button>
        `;
        ingredientsPagination.innerHTML = paginationHTML;

        document.getElementById('prev-page')?.addEventListener('click', () => {
            if (ingredientsCurrentPage > 1) {
                ingredientsCurrentPage--;
                loadIngredientsData();
            }
        });
        document.getElementById('next-page')?.addEventListener('click', () => {
            if (ingredientsCurrentPage < totalPages) {
                ingredientsCurrentPage++;
                loadIngredientsData();
            }
        });
    };

    const loadIngredientsData = async () => {
        ingredientsTableBody.innerHTML = '<tr><td colspan="6" class="text-center">Memuat...</td></tr>';
        const searchTerm = ingredientsSearchInput.value.trim();
        const from = (ingredientsCurrentPage - 1) * INGREDIENTS_ROWS_PER_PAGE;
        const to = from + INGREDIENTS_ROWS_PER_PAGE - 1;

        try {
            let query = supabase.from('ingredients').select('*', { count: 'exact' });
            if (searchTerm) query = query.ilike('name', `%${searchTerm}%`);
            
            const { data, error, count } = await query
                .order('name', { ascending: true })
                .range(from, to);

            if (error) throw error;

            ingredientsTotalRows = count;
            renderIngredientsTable(data);
            renderIngredientsPagination();
        } catch (error) {
            console.error('Error loading ingredients:', error);
            showToast(`Error memuat bahan: ${error.message}`, 'error');
            ingredientsTableBody.innerHTML = '<tr><td colspan="6" class="text-center">Gagal memuat data.</td></tr>';
        }
    };

    const openIngredientModal = (ingredient = null) => {
        ingredientForm.reset();
        document.querySelectorAll('.error-message').forEach(el => el.textContent = '');
        if (ingredient) {
            ingredientModalTitle.textContent = 'Edit Bahan';
            ingredientIdInput.value = ingredient.id;
            document.getElementById('ingredient-name').value = ingredient.name;
            document.getElementById('ingredient-unit').value = ingredient.unit;
            document.getElementById('ingredient-sku').value = ingredient.sku || '';
            document.getElementById('ingredient-min-stock').value = ingredient.min_stock;
            document.getElementById('ingredient-cost').value = ingredient.cost_per_unit;
        } else {
            ingredientModalTitle.textContent = 'Tambah Bahan Baru';
            ingredientIdInput.value = '';
        }
        ingredientModal.style.display = 'flex';
    };

    const closeIngredientModal = () => {
        ingredientModal.style.display = 'none';
    };

    const handleIngredientFormSubmit = async (e) => {
        e.preventDefault();
        if (!validateForm(ingredientForm)) return;

        const formData = new FormData(ingredientForm);
        const id = formData.get('ingredient-id');
        const ingredientData = {
            name: formData.get('ingredient-name'),
            unit: formData.get('ingredient-unit'),
            sku: formData.get('ingredient-sku') || null,
            min_stock: parseFloat(formData.get('ingredient-min-stock')),
            cost_per_unit: parseFloat(formData.get('ingredient-cost')),
        };

        try {
            const { error } = id 
                ? await supabase.from('ingredients').update(ingredientData).eq('id', id)
                : await supabase.from('ingredients').insert([ingredientData]);
            
            if (error) throw error;

            showToast(`Bahan berhasil ${id ? 'diperbarui' : 'ditambahkan'}.`, 'success');
            closeIngredientModal();
            loadIngredientsData();
        } catch (error) {
            console.error('Error saving ingredient:', error);
            showToast(`Gagal menyimpan bahan: ${error.message}`, 'error');
        }
    };

    const handleDeleteIngredient = async (id, name) => {
        if (!confirm(`Apakah Anda yakin ingin menghapus bahan "${name}"? Aksi ini tidak dapat dibatalkan.`)) return;

        try {
            const { error } = await supabase.from('ingredients').delete().eq('id', id);
            if (error) throw error;
            showToast(`Bahan "${name}" berhasil dihapus.`, 'success');
            loadIngredientsData();
        } catch (error) {
            console.error('Error deleting ingredient:', error);
            showToast(`Gagal menghapus bahan: ${error.message}`, 'error');
        }
    };

    const setupIngredientsEventListeners = () => {
        addIngredientBtn.addEventListener('click', () => openIngredientModal());
        ingredientsSearchInput.addEventListener('input', debounce(() => {
            ingredientsCurrentPage = 1;
            loadIngredientsData();
        }, 300));

        ingredientModal.addEventListener('click', (e) => {
            if (e.target === ingredientModal || e.target.classList.contains('close-button') || e.target.classList.contains('cancel-btn')) {
                closeIngredientModal();
            }
        });
        ingredientForm.addEventListener('submit', handleIngredientFormSubmit);

        ingredientsTableBody.addEventListener('click', async (e) => {
            const editBtn = e.target.closest('.edit-ingredient-btn');
            const deleteBtn = e.target.closest('.delete-ingredient-btn');

            if (editBtn) {
                const id = editBtn.dataset.id;
                const { data, error } = await supabase.from('ingredients').select('*').eq('id', id).single();
                if (error) {
                    showToast('Gagal mengambil data bahan.', 'error');
                    console.error(error);
                } else {
                    openIngredientModal(data);
                }
            }

            if (deleteBtn) {
                handleDeleteIngredient(deleteBtn.dataset.id, deleteBtn.dataset.name);
            }
        });
    };

    // --- START THE APP ---
    initializeApp();
});
