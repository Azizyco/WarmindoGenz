// This is a large file, it's structured by feature tabs for readability.
import { supabase } from '../../shared/js/supabase.js';
import { showToast } from '../../shared/js/ui.js';
import { validateForm } from '../../shared/js/validation.js';

document.addEventListener('DOMContentLoaded', () => {
    // --- STATE ---
    let currentUserRole = null;
    let canWrite = false;
    let onHandDataCache = [];
    let allIngredientsCache = [];
    let allSuppliersCache = [];
    let allMenusCache = [];
    let allOptionsCache = [];
    
    // Pagination States
    let ingredientsCurrentPage = 1;
    const INGREDIENTS_ROWS_PER_PAGE = 10;
    let ingredientsTotalRows = 0;

    let suppliersCurrentPage = 1;
    const SUPPLIERS_ROWS_PER_PAGE = 10;
    let suppliersTotalRows = 0;

    let ledgerCurrentPage = 1;
    const LEDGER_ROWS_PER_PAGE = 15;
    let ledgerTotalRows = 0;

    // --- DOM ELEMENTS ---
    const tabLinks = document.querySelectorAll('.tab-link');
    const tabContents = document.querySelectorAll('.tab-content');
    const statusBanner = {
        connection: document.getElementById('connection-status'),
        role: document.getElementById('user-role'),
    };

    // Suppliers Tab Elements
    const suppliersSearchInput = document.getElementById('suppliers-search');
    const addSupplierBtn = document.getElementById('add-supplier-btn');
    const suppliersTableBody = document.getElementById('suppliers-table-body');
    const suppliersPagination = document.getElementById('suppliers-pagination');
    const supplierModal = document.getElementById('supplier-modal');
    const supplierModalTitle = document.getElementById('supplier-modal-title');
    const supplierForm = document.getElementById('supplier-form');
    const supplierIdInput = document.getElementById('supplier-id');
    const supplierNameInput = document.getElementById('supplier-name');
    const supplierContactInput = document.getElementById('supplier-contact');
    const supplierNoteInput = document.getElementById('supplier-note');

    // BOM Menu Tab Elements
    const bomMenuSelect = document.getElementById('bom-menu-select');
    const addBomMenuItemBtn = document.getElementById('add-bom-menu-item-btn');
    const bomMenuTitle = document.getElementById('bom-menu-title');
    const bomMenuTableBody = document.getElementById('bom-menu-table-body');

    // BOM Option Tab Elements
    const bomOptionSelect = document.getElementById('bom-option-select');
    const addBomOptionItemBtn = document.getElementById('add-bom-option-item-btn');
    const bomOptionTitle = document.getElementById('bom-option-title');
    const bomOptionTableBody = document.getElementById('bom-option-table-body');

    // BOM Shared Modal Elements
    const bomItemModal = document.getElementById('bom-item-modal');
    const bomItemForm = document.getElementById('bom-item-form');
    const bomEntityIdInput = document.getElementById('bom-entity-id');
    const bomEntityTypeInput = document.getElementById('bom-entity-type');
    const bomIngredientSelect = document.getElementById('bom-ingredient');
    const bomQtyInput = document.getElementById('bom-qty');
    const bomUnitInput = document.getElementById('bom-unit');

    // Ledger Tab Elements
    const ledgerDateFrom = document.getElementById('ledger-date-from');
    const ledgerDateTo = document.getElementById('ledger-date-to');
    const ledgerIngredientFilter = document.getElementById('ledger-ingredient-filter');
    const ledgerMovementFilter = document.getElementById('ledger-movement-filter');
    const ledgerFilterBtn = document.getElementById('ledger-filter-btn');
    const addLedgerEntryBtn = document.getElementById('add-ledger-entry-btn');
    const exportLedgerCsvBtn = document.getElementById('export-ledger-csv');
    const ledgerTableBody = document.getElementById('ledger-table-body');
    const ledgerPagination = document.getElementById('ledger-pagination');

    // Ledger Modal Elements
    const ledgerEntryModal = document.getElementById('ledger-entry-modal');
    const ledgerEntryForm = document.getElementById('ledger-entry-form');
    const ledgerIdInput = document.getElementById('ledger-id');
    const ledgerMovementSelect = document.getElementById('ledger-movement');
    const ledgerIngredientSelect = document.getElementById('ledger-ingredient');
    const ledgerQtyInput = document.getElementById('ledger-qty');
    const ledgerUnitInput = document.getElementById('ledger-unit');
    const ledgerSupplierGroup = document.getElementById('ledger-supplier-group');
    const ledgerSupplierSelect = document.getElementById('ledger-supplier');

    // --- INITIALIZATION ---
    const initializeApp = async () => {
        await checkUserRole();
        await loadInitialCaches();
        setupTabEventListeners();
        setupAllFeatureEventListeners();
        handleTabSwitch(document.querySelector('.tab-link.active').dataset.tab);
        
        supabase.realtime.connect();
        const channel = supabase.channel('db-changes');
        channel.on('postgres_changes', { event: '*', schema: 'public' }, payload => {
            console.log('Change received!', payload);
            statusBanner.connection.classList.remove('status-offline');
            statusBanner.connection.classList.add('status-online');
            statusBanner.connection.title = 'Terhubung';
            const activeTab = document.querySelector('.tab-link.active')?.dataset.tab;
            if (activeTab) handleTabSwitch(activeTab, true); // Refresh active tab
        }).subscribe();

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
        const { data: profile, error } = await supabase.from('profiles').select('roles(key)').eq('id', user.id).single();
        currentUserRole = error || !profile ? 'unknown' : profile.roles.key;
        canWrite = ['admin', 'manager'].includes(currentUserRole);
        statusBanner.role.textContent = currentUserRole;
        toggleEditability();
    };

    const loadInitialCaches = async () => {
        const [ingredients, suppliers, menus, options] = await Promise.all([
            supabase.from('ingredients').select('*').order('name'),
            supabase.from('suppliers').select('*').order('name'),
            supabase.from('menus').select('id, name').order('name'),
            supabase.from('options').select('id, name').order('name') 
            
        ]);
        allIngredientsCache = ingredients.data || [];
        allSuppliersCache = suppliers.data || [];
        allMenusCache = menus.data || [];
        allOptionsCache = options.data || [];
    };

    const toggleEditability = () => {
        document.querySelectorAll('.write-access').forEach(el => {
            el.disabled = !canWrite;
            el.title = canWrite ? '' : 'Akses read-only';
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
        setupSuppliersEventListeners();
        setupBomEventListeners();
        setupLedgerEventListeners();
    };

    const handleTabSwitch = (tabName, isRefresh = false) => {
        if (!isRefresh) console.log(`Switching to ${tabName} tab.`);
        switch (tabName) {
            case 'on-hand': loadOnHandData(); break;
            case 'ingredients': loadIngredientsData(); break;
            case 'suppliers': loadSuppliersData(); break;
            case 'bom-menu': initBomMenuTab(); break;
            case 'bom-option': initBomOptionTab(); break;
            case 'ledger': initLedgerTab(); break;
        }
    };

    // --- UTILITY FUNCTIONS ---
    const debounce = (func, delay = 300) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => func.apply(this, a), delay); }; };
    const formatCurrency = (v) => new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', minimumFractionDigits: 0 }).format(v);
    const formatNumber = (v) => new Intl.NumberFormat('id-ID').format(v);
    const formatDate = (d) => d ? new Date(d).toLocaleString('id-ID', { dateStyle: 'medium', timeStyle: 'short' }) : '-';
    const populateSelectWithOptions = (selectEl, options, placeholder, valueKey = 'id', textKey = 'name') => {
        selectEl.innerHTML = `<option value="">${placeholder}</option>`;
        options.forEach(opt => {
            const option = document.createElement('option');
            option.value = opt[valueKey];
            option.textContent = opt[textKey];
            selectEl.appendChild(option);
        });
    };
    const exportToCSV = (data, filename) => {
        if (data.length === 0) return showToast('Tidak ada data untuk diekspor', 'warning');
        const headers = Object.keys(data[0]);
        const csv = [headers.join(','), ...data.map(r => headers.map(h => JSON.stringify(r[h])).join(','))].join('\n');
        const blob = new Blob([csv], { type: 'text/csv' });
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = `${filename}.csv`;
        a.click();
        URL.revokeObjectURL(a.href);
    };

    // --- FEATURE: ON-HAND (Existing code) ---
    const onHandSearchInput = document.getElementById('on-hand-search');
    const onHandSortSelect = document.getElementById('on-hand-sort');
    const onHandTableBody = document.getElementById('on-hand-table-body');
    const lowStockBanner = document.getElementById('low-stock-banner');
    const exportOnHandBtn = document.getElementById('export-on-hand-csv');
    const renderOnHandTable = (data) => {
        if (!data || data.length === 0) { onHandTableBody.innerHTML = '<tr><td colspan="6" class="text-center">Tidak ada data stok.</td></tr>'; lowStockBanner.style.display = 'none'; return; }
        let hasLowStock = false;
        onHandTableBody.innerHTML = data.map(item => {
            const isLow = item.qty_on_hand < item.min_stock; if (isLow) hasLowStock = true;
            const stockValue = (item.qty_on_hand || 0) * (item.cost_per_unit || 0);
            return `<tr class="${isLow ? 'row-warning' : ''}"><td>${item.name}</td><td>${formatNumber(item.qty_on_hand)}${isLow ? '<span class="badge badge-low-stock">LOW</span>' : ''}</td><td>${item.unit}</td><td>${formatNumber(item.min_stock)}</td><td>${formatCurrency(item.cost_per_unit)}</td><td>${formatCurrency(stockValue)}</td></tr>`;
        }).join('');
        lowStockBanner.style.display = hasLowStock ? 'block' : 'none';
    };
    const loadOnHandData = async () => {
        onHandTableBody.innerHTML = '<tr><td colspan="6" class="text-center">Memuat...</td></tr>';
        const searchTerm = onHandSearchInput.value.trim(); const [sortColumn, sortDirection] = onHandSortSelect.value.split('_');
        try {
            let query = supabase.from('vw_ingredient_on_hand').select('*');
            if (searchTerm) query = query.ilike('name', `%${searchTerm}%`);
            query = query.order(sortColumn === 'qty' ? 'qty_on_hand' : 'name', { ascending: sortDirection === 'asc' });
            const { data, error } = await query; if (error) throw error;
            onHandDataCache = data; renderOnHandTable(data);
        } catch (error) { console.error('Error loading on-hand data:', error); showToast(`Error memuat data: ${error.message}`, 'error'); onHandTableBody.innerHTML = '<tr><td colspan="6" class="text-center">Gagal memuat data.</td></tr>'; }
    };
    const setupOnHandEventListeners = () => {
        onHandSearchInput.addEventListener('input', debounce(loadOnHandData, 300));
        onHandSortSelect.addEventListener('change', loadOnHandData);
        exportOnHandBtn.addEventListener('click', () => {
            if (onHandDataCache.length === 0) return showToast('Tidak ada data untuk diekspor.', 'warning');
            const dataToExport = onHandDataCache.map(item => ({ nama_bahan: item.name, qty_on_hand: item.qty_on_hand, unit: item.unit, min_stock: item.min_stock, cost_per_unit: item.cost_per_unit, stock_value: (item.qty_on_hand || 0) * (item.cost_per_unit || 0) }));
            exportToCSV(dataToExport, 'stok_on_hand.csv');
        });
    };

    // --- FEATURE: INGREDIENTS (Existing code) ---
    const ingredientsSearchInput = document.getElementById('ingredients-search');
    const addIngredientBtn = document.getElementById('add-ingredient-btn');
    const ingredientsTableBody = document.getElementById('ingredients-table-body');
    const ingredientsPagination = document.getElementById('ingredients-pagination');
    const ingredientModal = document.getElementById('ingredient-modal');
    const ingredientModalTitle = document.getElementById('ingredient-modal-title');
    const ingredientForm = document.getElementById('ingredient-form');
    const ingredientIdInput = document.getElementById('ingredient-id');
    const renderIngredientsTable = (data) => {
        if (!data || data.length === 0) { ingredientsTableBody.innerHTML = '<tr><td colspan="6" class="text-center">Tidak ada bahan ditemukan.</td></tr>'; return; }
        ingredientsTableBody.innerHTML = data.map(item => `<tr><td>${item.name}</td><td>${item.unit}</td><td>${item.sku || '-'}</td><td>${formatNumber(item.min_stock)}</td><td>${formatCurrency(item.cost_per_unit)}</td><td><div class="action-buttons"><button class="btn btn-sm btn-secondary edit-ingredient-btn write-access" data-id="${item.id}">Edit</button><button class="btn btn-sm btn-danger delete-ingredient-btn write-access" data-id="${item.id}" data-name="${item.name}">Hapus</button></div></td></tr>`).join('');
        toggleEditability();
    };
    const renderIngredientsPagination = () => {
        const totalPages = Math.ceil(ingredientsTotalRows / INGREDIENTS_ROWS_PER_PAGE); if (totalPages <= 1) { ingredientsPagination.innerHTML = ''; return; }
        ingredientsPagination.innerHTML = `<button class="btn" id="prev-page" ${ingredientsCurrentPage === 1 ? 'disabled' : ''}>&laquo; Prev</button><span>Halaman ${ingredientsCurrentPage} dari ${totalPages}</span><button class="btn" id="next-page" ${ingredientsCurrentPage === totalPages ? 'disabled' : ''}>Next &raquo;</button>`;
        document.getElementById('prev-page')?.addEventListener('click', () => { if (ingredientsCurrentPage > 1) { ingredientsCurrentPage--; loadIngredientsData(); } });
        document.getElementById('next-page')?.addEventListener('click', () => { if (ingredientsCurrentPage < totalPages) { ingredientsCurrentPage++; loadIngredientsData(); } });
    };
    const loadIngredientsData = async () => {
        ingredientsTableBody.innerHTML = '<tr><td colspan="6" class="text-center">Memuat...</td></tr>';
        const searchTerm = ingredientsSearchInput.value.trim(); const from = (ingredientsCurrentPage - 1) * INGREDIENTS_ROWS_PER_PAGE; const to = from + INGREDIENTS_ROWS_PER_PAGE - 1;
        try {
            let query = supabase.from('ingredients').select('*', { count: 'exact' });
            if (searchTerm) query = query.ilike('name', `%${searchTerm}%`);
            const { data, error, count } = await query.order('name', { ascending: true }).range(from, to); if (error) throw error;
            ingredientsTotalRows = count; renderIngredientsTable(data); renderIngredientsPagination();
        } catch (error) { console.error('Error loading ingredients:', error); showToast(`Error memuat bahan: ${error.message}`, 'error'); ingredientsTableBody.innerHTML = '<tr><td colspan="6" class="text-center">Gagal memuat data.</td></tr>'; }
    };
    const openIngredientModal = (ingredient = null) => {
        ingredientForm.reset(); document.querySelectorAll('.error-message').forEach(el => el.textContent = '');
        if (ingredient) {
            ingredientModalTitle.textContent = 'Edit Bahan'; ingredientIdInput.value = ingredient.id;
            document.getElementById('ingredient-name').value = ingredient.name; document.getElementById('ingredient-unit').value = ingredient.unit;
            document.getElementById('ingredient-sku').value = ingredient.sku || ''; document.getElementById('ingredient-min-stock').value = ingredient.min_stock;
            document.getElementById('ingredient-cost').value = ingredient.cost_per_unit;
        } else { ingredientModalTitle.textContent = 'Tambah Bahan Baru'; ingredientIdInput.value = ''; }
        ingredientModal.style.display = 'flex';
    };
    const closeIngredientModal = () => { ingredientModal.style.display = 'none'; };
    const handleIngredientFormSubmit = async (e) => {
        e.preventDefault(); if (!validateForm(ingredientForm)) return;
        const formData = new FormData(ingredientForm); const id = formData.get('ingredient-id');
        const ingredientData = { name: formData.get('ingredient-name'), unit: formData.get('ingredient-unit'), sku: formData.get('ingredient-sku') || null, min_stock: parseFloat(formData.get('ingredient-min-stock')), cost_per_unit: parseFloat(formData.get('ingredient-cost')), };
        try {
            const { error } = id ? await supabase.from('ingredients').update(ingredientData).eq('id', id) : await supabase.from('ingredients').insert([ingredientData]);
            if (error) throw error; showToast(`Bahan berhasil ${id ? 'diperbarui' : 'ditambahkan'}.`, 'success');
            closeIngredientModal(); await loadInitialCaches(); loadIngredientsData();
        } catch (error) { console.error('Error saving ingredient:', error); showToast(`Gagal menyimpan bahan: ${error.message}`, 'error'); }
    };
    const handleDeleteIngredient = async (id, name) => {
        if (!confirm(`Apakah Anda yakin ingin menghapus bahan "${name}"?`)) return;
        try {
            const { error } = await supabase.from('ingredients').delete().eq('id', id); if (error) throw error;
            showToast(`Bahan "${name}" berhasil dihapus.`, 'success'); await loadInitialCaches(); loadIngredientsData();
        } catch (error) { console.error('Error deleting ingredient:', error); showToast(`Gagal menghapus bahan: ${error.message}`, 'error'); }
    };
    const setupIngredientsEventListeners = () => {
        addIngredientBtn.addEventListener('click', () => openIngredientModal());
        ingredientsSearchInput.addEventListener('input', debounce(() => { ingredientsCurrentPage = 1; loadIngredientsData(); }, 300));
        ingredientModal.addEventListener('click', (e) => { if (e.target === ingredientModal || e.target.classList.contains('close-button') || e.target.classList.contains('cancel-btn')) closeIngredientModal(); });
        ingredientForm.addEventListener('submit', handleIngredientFormSubmit);
        ingredientsTableBody.addEventListener('click', async (e) => {
            const editBtn = e.target.closest('.edit-ingredient-btn'); const deleteBtn = e.target.closest('.delete-ingredient-btn');
            if (editBtn) { const { data } = await supabase.from('ingredients').select('*').eq('id', editBtn.dataset.id).single(); if (data) openIngredientModal(data); }
            if (deleteBtn) handleDeleteIngredient(deleteBtn.dataset.id, deleteBtn.dataset.name);
        });
    };

    // --- FEATURE: SUPPLIERS (Existing code) ---
    const renderSuppliersTable = (data) => {
        if (!data || data.length === 0) { suppliersTableBody.innerHTML = '<tr><td colspan="5" class="text-center">Tidak ada supplier ditemukan.</td></tr>'; return; }
        suppliersTableBody.innerHTML = data.map(item => `<tr><td>${item.name}</td><td>${item.contact || '-'}</td><td>${item.note || '-'}</td><td>${formatDate(item.created_at)}</td><td><div class="action-buttons"><button class="btn btn-sm btn-secondary edit-supplier-btn write-access" data-id="${item.id}">Edit</button><button class="btn btn-sm btn-danger delete-supplier-btn write-access" data-id="${item.id}" data-name="${item.name}">Hapus</button></div></td></tr>`).join('');
        toggleEditability();
    };
    const renderSuppliersPagination = () => {
        const totalPages = Math.ceil(suppliersTotalRows / SUPPLIERS_ROWS_PER_PAGE); if (totalPages <= 1) { suppliersPagination.innerHTML = ''; return; }
        suppliersPagination.innerHTML = `<button class="btn" id="suppliers-prev-page" ${suppliersCurrentPage === 1 ? 'disabled' : ''}>&laquo; Prev</button><span>Halaman ${suppliersCurrentPage} dari ${totalPages}</span><button class="btn" id="suppliers-next-page" ${suppliersCurrentPage === totalPages ? 'disabled' : ''}>Next &raquo;</button>`;
        document.getElementById('suppliers-prev-page')?.addEventListener('click', () => { if (suppliersCurrentPage > 1) { suppliersCurrentPage--; loadSuppliersData(); } });
        document.getElementById('suppliers-next-page')?.addEventListener('click', () => { if (suppliersCurrentPage < totalPages) { suppliersCurrentPage++; loadSuppliersData(); } });
    };
    const loadSuppliersData = async () => {
        suppliersTableBody.innerHTML = '<tr><td colspan="5" class="text-center">Memuat...</td></tr>';
        const searchTerm = suppliersSearchInput.value.trim(); const from = (suppliersCurrentPage - 1) * SUPPLIERS_ROWS_PER_PAGE; const to = from + SUPPLIERS_ROWS_PER_PAGE - 1;
        try {
            let query = supabase.from('suppliers').select('*', { count: 'exact' });
            if (searchTerm) query = query.ilike('name', `%${searchTerm}%`);
            const { data, error, count } = await query.order('name', { ascending: true }).range(from, to); if (error) throw error;
            suppliersTotalRows = count; renderSuppliersTable(data); renderSuppliersPagination();
        } catch (error) { console.error('Error loading suppliers:', error); showToast(`Error memuat supplier: ${error.message}`, 'error'); suppliersTableBody.innerHTML = '<tr><td colspan="5" class="text-center">Gagal memuat data.</td></tr>'; }
    };
    const openSupplierModal = (supplier = null) => {
        supplierForm.reset(); document.querySelectorAll('#supplier-modal .error-message').forEach(el => el.textContent = '');
        if (supplier) {
            supplierModalTitle.textContent = 'Edit Supplier'; supplierIdInput.value = supplier.id;
            supplierNameInput.value = supplier.name; supplierContactInput.value = supplier.contact || ''; supplierNoteInput.value = supplier.note || '';
        } else { supplierModalTitle.textContent = 'Tambah Supplier Baru'; supplierIdInput.value = ''; }
        supplierModal.style.display = 'flex';
    };
    const closeSupplierModal = () => { supplierModal.style.display = 'none'; };
    const handleSupplierFormSubmit = async (e) => {
        e.preventDefault(); if (!validateForm(supplierForm)) return;
        const formData = new FormData(supplierForm); const id = formData.get('supplier-id');
        const supplierData = { name: formData.get('supplier-name'), contact: formData.get('supplier-contact') || null, note: formData.get('supplier-note') || null, };
        try {
            const { error } = id ? await supabase.from('suppliers').update(supplierData).eq('id', id) : await supabase.from('suppliers').insert([supplierData]);
            if (error) throw error; showToast(`Supplier berhasil ${id ? 'diperbarui' : 'ditambahkan'}.`, 'success');
            closeSupplierModal(); await loadInitialCaches(); loadSuppliersData();
        } catch (error) { console.error('Error saving supplier:', error); showToast(`Gagal menyimpan supplier: ${error.message}`, 'error'); }
    };
    const handleDeleteSupplier = async (id, name) => {
        if (!confirm(`Apakah Anda yakin ingin menghapus supplier "${name}"?`)) return;
        try {
            const { error } = await supabase.from('suppliers').delete().eq('id', id); if (error) throw error;
            showToast(`Supplier "${name}" berhasil dihapus.`, 'success'); await loadInitialCaches(); loadSuppliersData();
        } catch (error) { console.error('Error deleting supplier:', error); showToast(`Gagal menghapus supplier: ${error.message}`, 'error'); }
    };
    const setupSuppliersEventListeners = () => {
        addSupplierBtn.addEventListener('click', () => openSupplierModal());
        suppliersSearchInput.addEventListener('input', debounce(() => { suppliersCurrentPage = 1; loadSuppliersData(); }, 300));
        supplierModal.addEventListener('click', (e) => { if (e.target === supplierModal || e.target.classList.contains('close-button') || e.target.classList.contains('cancel-btn')) closeSupplierModal(); });
        supplierForm.addEventListener('submit', handleSupplierFormSubmit);
        suppliersTableBody.addEventListener('click', async (e) => {
            const editBtn = e.target.closest('.edit-supplier-btn'); const deleteBtn = e.target.closest('.delete-supplier-btn');
            if (editBtn) { const { data } = await supabase.from('suppliers').select('*').eq('id', editBtn.dataset.id).single(); if (data) openSupplierModal(data); }
            if (deleteBtn) handleDeleteSupplier(deleteBtn.dataset.id, deleteBtn.dataset.name);
        });
    };

    // --- FEATURE: BOM (MENU & OPTION) ---
    const initBomMenuTab = () => {
        populateSelectWithOptions(bomMenuSelect, allMenusCache, '--- Pilih Menu ---');
        bomMenuTitle.textContent = 'Pilih menu untuk melihat resep';
        bomMenuTableBody.innerHTML = '';
        addBomMenuItemBtn.disabled = true;
    };
    const initBomOptionTab = () => {
        populateSelectWithOptions(bomOptionSelect, allOptionsCache, '--- Pilih Opsi ---');
        bomOptionTitle.textContent = 'Pilih opsi untuk melihat resep';
        bomOptionTableBody.innerHTML = '';
        addBomOptionItemBtn.disabled = true;
    };
    const renderBomTable = (tableBody, data) => {
        if (!data || data.length === 0) {
            tableBody.innerHTML = '<tr><td colspan="4" class="text-center">Belum ada resep untuk item ini.</td></tr>';
            return;
        }
        tableBody.innerHTML = data.map(item => `
            <tr>
                <td>${item.ingredients.name}</td>
                <td>${formatNumber(item.qty)}</td>
                <td>${item.ingredients.unit}</td>
                <td>
              <button class="btn btn-sm btn-danger delete-bom-item-btn write-access"
              data-ingredient-id="${item.ingredient_id}"
              data-name="${item.ingredients.name}">Hapus</button>
                </td>
            </tr>
        `).join('');
        toggleEditability();
    };
    const loadBomForMenu = async (menuId) => {
        bomMenuTableBody.innerHTML = '<tr><td colspan="4" class="text-center">Memuat...</td></tr>';
        const { data, error } = await supabase
        .from('recipes_bom')
        .select('ingredient_id, qty:qty_per_menu, ingredients(name, unit)')
        .eq('menu_id', menuId);
        if (error) {
            showToast('Gagal memuat resep menu.', 'error');
            console.error(error);
            bomMenuTableBody.innerHTML = '<tr><td colspan="4" class="text-center">Gagal memuat.</td></tr>';
        } else {
            renderBomTable(bomMenuTableBody, data);
        }
    };
    const loadBomForOption = async (optionId) => {
        bomOptionTableBody.innerHTML = '<tr><td colspan="4" class="text-center">Memuat...</td></tr>';
        const { data, error } = await supabase
        .from('option_bom')
        .select('ingredient_id, qty, ingredients(name, unit)')
        .eq('option_id', optionId);
        if (error) {
            showToast('Gagal memuat resep opsi.', 'error');
            console.error(error);
            bomOptionTableBody.innerHTML = '<tr><td colspan="4" class="text-center">Gagal memuat.</td></tr>';
        } else {
            renderBomTable(bomOptionTableBody, data);
        }
    };
    const openBomItemModal = (entityId, entityType) => {
        bomItemForm.reset();
        populateSelectWithOptions(bomIngredientSelect, allIngredientsCache, '--- Pilih Bahan ---');
        bomEntityIdInput.value = entityId;
        bomEntityTypeInput.value = entityType;
        bomUnitInput.value = '';
        bomItemModal.style.display = 'flex';
    };
    const closeBomItemModal = () => bomItemModal.style.display = 'none';
    const handleBomFormSubmit = async (e) => {
        e.preventDefault();
        if (!validateForm(bomItemForm)) return;
        const entityId = bomEntityIdInput.value;
        const entityType = bomEntityTypeInput.value;
        const ingredientId = bomIngredientSelect.value;
        const qty = parseFloat(bomQtyInput.value);
        const tableName   = entityType === 'menu' ? 'recipes_bom' : 'option_bom';
        const idColumn    = entityType === 'menu' ? 'menu_id'     : 'option_id';
        const qtyColumn   = entityType === 'menu' ? 'qty_per_menu': 'qty';
        const payload = { [idColumn]: entityId, ingredient_id: ingredientId, [qtyColumn]: qty };
        const { error } = await supabase.from(tableName).insert([payload]);
        if (error) {
            showToast(`Gagal menyimpan resep: ${error.message}`, 'error');
            console.error(error);
        } else {
            showToast('Bahan resep berhasil ditambahkan.', 'success');
            closeBomItemModal();
            if (entityType === 'menu') loadBomForMenu(entityId);
            else loadBomForOption(entityId);
        }
    };
    const handleDeleteBomItem = async (ingredientId, type, name) => {
    if (!confirm(`Yakin ingin menghapus bahan "${name}" dari resep ini?`)) return;

    const tableName = type === 'menu' ? 'recipes_bom' : 'option_bom';
    const idColumn  = type === 'menu' ? 'menu_id'     : 'option_id';
    const entityId  = type === 'menu' ? bomMenuSelect.value : bomOptionSelect.value;

    const { error } = await supabase
        .from(tableName)
        .delete()
        .match({ [idColumn]: entityId, ingredient_id: ingredientId });

    if (error) {
        showToast('Gagal menghapus bahan resep.', 'error');
    } else {
        showToast('Bahan resep berhasil dihapus.', 'success');
        if (type === 'menu') loadBomForMenu(bomMenuSelect.value);
        else loadBomForOption(bomOptionSelect.value);
    }
    };

    const setupBomEventListeners = () => {
        bomMenuSelect.addEventListener('change', (e) => {
            const menuId = e.target.value;
            if (menuId) {
                const selected = allMenusCache.find(m => m.id == menuId);
                bomMenuTitle.textContent = `Resep untuk: ${selected.name}`;
                addBomMenuItemBtn.disabled = false;
                loadBomForMenu(menuId);
            } else {
                initBomMenuTab();
            }
        });
        bomOptionSelect.addEventListener('change', (e) => {
            const optionId = e.target.value;
            if (optionId) {
                const selected = allOptionsCache.find(o => o.id == optionId);
                bomOptionTitle.textContent = `Resep untuk: ${selected.name}`;
                addBomOptionItemBtn.disabled = false;
                loadBomForOption(optionId);
            } else {
                initBomOptionTab();
            }
        });
        addBomMenuItemBtn.addEventListener('click', () => openBomItemModal(bomMenuSelect.value, 'menu'));
        addBomOptionItemBtn.addEventListener('click', () => openBomItemModal(bomOptionSelect.value, 'option'));
        bomItemModal.addEventListener('click', (e) => { if (e.target === bomItemModal || e.target.classList.contains('close-button') || e.target.classList.contains('cancel-btn')) closeBomItemModal(); });
        bomItemForm.addEventListener('submit', handleBomFormSubmit);
        bomIngredientSelect.addEventListener('change', (e) => {
            const selected = allIngredientsCache.find(i => i.id == e.target.value);
            bomUnitInput.value = selected ? selected.unit : '';
        });
        bomMenuTableBody.addEventListener('click', (e) => {
        const btn = e.target.closest('.delete-bom-item-btn');
        if (btn) handleDeleteBomItem(btn.dataset.ingredientId, 'menu', btn.dataset.name);
        });
        bomOptionTableBody.addEventListener('click', (e) => {
        const btn = e.target.closest('.delete-bom-item-btn');
        if (btn) handleDeleteBomItem(btn.dataset.ingredientId, 'option', btn.dataset.name);
        });
    };

    // --- FEATURE: LEDGER ---
    const initLedgerTab = () => {
        populateSelectWithOptions(ledgerIngredientFilter, allIngredientsCache, 'Semua Bahan');
        populateSelectWithOptions(ledgerIngredientSelect, allIngredientsCache, '--- Pilih Bahan ---');
        populateSelectWithOptions(ledgerSupplierSelect, allSuppliersCache, '--- Pilih Supplier ---');
        loadLedgerData();
    };
const renderLedgerTable = (data) => {
  if (!data || data.length === 0) {
    ledgerTableBody.innerHTML = '<tr><td colspan="9" class="text-center">Tidak ada pergerakan stok ditemukan.</td></tr>';
    return;
  }

  ledgerTableBody.innerHTML = data.map(item => {
    const movement = (item.movement_type ?? item.action ?? '').toString();
    const movementLabel = movement ? movement.replace('_', ' ') : '-';
    const byDisplay = '-';

    return `
      <tr>
        <td>${formatDate(item.created_at)}</td>
        <td><span class="badge-movement badge-${movement}">${movementLabel}</span></td>
        <td>${item.ingredients.name}</td>
        <td class="${item.qty > 0 ? 'text-success' : 'text-danger'}">${formatNumber(item.qty)}</td>
        <td>${item.ingredients.unit}</td>
        <td>${item.suppliers?.name || '-'}</td>
        <td>${item.note || '-'}</td>
        <td>${byDisplay}</td>
        <td>
          <button class="btn btn-sm btn-danger delete-ledger-btn write-access" data-id="${item.id}">Hapus</button>
        </td>
      </tr>
    `;
  }).join('');

  toggleEditability();
};

    const renderLedgerPagination = () => {
        const totalPages = Math.ceil(ledgerTotalRows / LEDGER_ROWS_PER_PAGE); if (totalPages <= 1) { ledgerPagination.innerHTML = ''; return; }
        ledgerPagination.innerHTML = `<button class="btn" id="ledger-prev-page" ${ledgerCurrentPage === 1 ? 'disabled' : ''}>&laquo; Prev</button><span>Halaman ${ledgerCurrentPage} dari ${totalPages}</span><button class="btn" id="ledger-next-page" ${ledgerCurrentPage === totalPages ? 'disabled' : ''}>Next &raquo;</button>`;
        document.getElementById('ledger-prev-page')?.addEventListener('click', () => { if (ledgerCurrentPage > 1) { ledgerCurrentPage--; loadLedgerData(); } });
        document.getElementById('ledger-next-page')?.addEventListener('click', () => { if (ledgerCurrentPage < totalPages) { ledgerCurrentPage++; loadLedgerData(); } });
    };
    
const loadLedgerData = async () => {
  ledgerTableBody.innerHTML = '<tr><td colspan="9" class="text-center">Memuat...</td></tr>';
  const from = (ledgerCurrentPage - 1) * LEDGER_ROWS_PER_PAGE;
  const to   = from + LEDGER_ROWS_PER_PAGE - 1;

  try {
    let query = supabase
      .from('stock_ledger')
      .select(`
        id,
        created_at,
        ingredient_id,
        qty,
        ref_supplier,
        note,
        ingredients(name, unit),
        suppliers:suppliers!stock_ledger_ref_supplier_fkey ( name )
      `, { count: 'exact' });

    if (ledgerDateFrom.value)         query = query.gte('created_at', new Date(ledgerDateFrom.value).toISOString());
    if (ledgerDateTo.value)           query = query.lte('created_at', new Date(ledgerDateTo.value).toISOString());
    if (ledgerIngredientFilter.value) query = query.eq('ingredient_id', ledgerIngredientFilter.value);
    // movement_type DI-CLIENT (karena di DB namanya kemungkinan 'action')
    const { data, error, count } = await query
      .order('created_at', { ascending: false })
      .range(from, to);

    if (error) throw error;

    let rows = data || [];
    if (ledgerMovementFilter.value) {
      const wanted = ledgerMovementFilter.value;
      rows = rows.filter(r => (r.movement_type ?? r.action ?? '') === wanted);
    }

    ledgerTotalRows = count || 0;
    renderLedgerTable(rows);
    renderLedgerPagination();

  } catch (error) {
    console.error('Error loading ledger:', error);
    showToast(`Error memuat ledger: ${error.message}`, 'error');
    ledgerTableBody.innerHTML = '<tr><td colspan="9" class="text-center">Gagal memuat data.</td></tr>';
  }
};


    const openLedgerModal = () => {
        ledgerEntryForm.reset();
        ledgerIdInput.value = '';
        ledgerSupplierGroup.style.display = 'block';
        ledgerEntryModal.style.display = 'flex';
    };
    const closeLedgerModal = () => ledgerEntryModal.style.display = 'none';
    const handleLedgerFormSubmit = async (e) => {
        e.preventDefault();
        if (!validateForm(ledgerEntryForm)) return;
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return showToast('Sesi tidak valid, silakan login ulang.', 'error');

        const movement = ledgerMovementSelect.value;
        let qty = parseFloat(ledgerQtyInput.value);
        if (['waste', 'return'].includes(movement) && qty > 0) {
            qty = -qty; // Ensure negative value for deductions
        }

        const entry = {
        action: movement,                                  // ← ganti dari movement_type
        ingredient_id: ledgerIngredientSelect.value,
        qty: qty,
        ref_supplier: ledgerSupplierSelect.value || null,  // ← ganti dari supplier_id
        note: document.getElementById('ledger-note').value || null,

        };



        const { error } = await supabase.from('stock_ledger').insert([entry]);
        if (error) {
            showToast(`Gagal mencatat stok: ${error.message}`, 'error');
        } else {
            showToast('Pergerakan stok berhasil dicatat.', 'success');
            closeLedgerModal();
            loadLedgerData();
        }
    };
    const handleDeleteLedgerEntry = async (id) => {
        if (!confirm('Yakin ingin menghapus entri ledger ini? Aksi ini akan mempengaruhi stok on-hand.')) return;
        const { error } = await supabase.from('stock_ledger').delete().eq('id', id);
        if (error) {
            showToast('Gagal menghapus entri.', 'error');
        } else {
            showToast('Entri ledger berhasil dihapus.', 'success');
            loadLedgerData();
        }
    };
    const setupLedgerEventListeners = () => {
        ledgerFilterBtn.addEventListener('click', () => {
            ledgerCurrentPage = 1;
            loadLedgerData();
        });
        addLedgerEntryBtn.addEventListener('click', openLedgerModal);
        ledgerEntryModal.addEventListener('click', (e) => { if (e.target === ledgerEntryModal || e.target.classList.contains('close-button') || e.target.classList.contains('cancel-btn')) closeLedgerModal(); });
        ledgerEntryForm.addEventListener('submit', handleLedgerFormSubmit);
        ledgerIngredientSelect.addEventListener('change', (e) => {
            const selected = allIngredientsCache.find(i => i.id == e.target.value);
            ledgerUnitInput.value = selected ? selected.unit : '';
        });
        ledgerMovementSelect.addEventListener('change', (e) => {
            ledgerSupplierGroup.style.display = e.target.value === 'purchase' ? 'block' : 'none';
        });
        ledgerTableBody.addEventListener('click', (e) => {
            const deleteBtn = e.target.closest('.delete-ledger-btn');
            if (deleteBtn) handleDeleteLedgerEntry(deleteBtn.dataset.id);
        });
exportLedgerCsvBtn.addEventListener('click', async () => {
  showToast('Mempersiapkan data ekspor...', 'info');
  try {
    let query = supabase
      .from('stock_ledger')
      .select(`
        created_at,
        ingredient_id,
        qty,
        ref_supplier,
        note,
        ingredients(name, unit),
        suppliers:suppliers!stock_ledger_ref_supplier_fkey ( name )
      `);

    if (ledgerDateFrom.value)         query = query.gte('created_at', new Date(ledgerDateFrom.value).toISOString());
    if (ledgerDateTo.value)           query = query.lte('created_at', new Date(ledgerDateTo.value).toISOString());
    if (ledgerIngredientFilter.value) query = query.eq('ingredient_id', ledgerIngredientFilter.value);
    // movement_type DI-CLIENT

    const { data, error } = await query.order('created_at', { ascending: false });
    if (error) throw error;

    let rows = data || [];
    if (ledgerMovementFilter.value) {
      const wanted = ledgerMovementFilter.value;
      rows = rows.filter(r => (r.movement_type ?? r.action ?? '') === wanted);
    }

    const dataToExport = rows.map(item => ({
      waktu: formatDate(item.created_at),
      pergerakan: (item.movement_type ?? item.action ?? ''),
      bahan: item.ingredients.name,
      qty: item.qty,
      unit: item.ingredients.unit,
      supplier: item.suppliers?.name || '',
      catatan: item.note || '',
      oleh: ''
    }));

    exportToCSV(dataToExport, 'ledger_stok.csv');
  } catch (error) {
    showToast('Gagal mengekspor data.', 'error');
    console.error(error);
  }
});

    };

    // --- START THE APP ---
    initializeApp();
});
