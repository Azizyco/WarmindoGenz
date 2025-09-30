import { supabase } from '../../shared/js/supabase.js';
import { showToast } from '../../shared/js/ui.js';

document.addEventListener('DOMContentLoaded', () => {
    const modal = document.getElementById('menu-item-modal');
    const addItemBtn = document.getElementById('add-item-btn');
    const addItemLink = document.getElementById('add-item-link');
    const closeModalBtn = document.getElementById('close-modal-btn');
    const cancelBtn = document.getElementById('cancel-btn');
    const menuItemForm = document.getElementById('menu-item-form');
    const modalTitle = document.getElementById('modal-title');
    const tableBody = document.getElementById('menu-table-body');
    const loadingIndicator = document.getElementById('loading-indicator');
    const emptyState = document.getElementById('empty-state');
    const categoryFilter = document.getElementById('category-filter');
    const itemCategorySelect = document.getElementById('item-category');
    const searchInput = document.getElementById('search-menu');
    const imageFileInput = document.getElementById('item-image-file');
    const imagePreview = document.getElementById('image-preview');
    const saveBtn = document.getElementById('save-btn');

    let categories = [];
    const placeholderImage = 'https://via.placeholder.com/150';

    // Helper untuk mendapatkan path file dari URL Supabase Storage
    const getPathFromUrl = (url) => {
        if (!url) return null;
        try {
            const urlObject = new URL(url);
            const pathSegments = urlObject.pathname.split('/');
            // Cari nama bucket dalam path
            const bucketIndex = pathSegments.indexOf('menu-photos');
            if (bucketIndex === -1 || bucketIndex + 1 >= pathSegments.length) {
                console.warn('Tidak dapat menentukan path file dari URL:', url);
                return null;
            }
            // Path adalah semua segmen setelah nama bucket
            return pathSegments.slice(bucketIndex + 1).join('/');
        } catch (error) {
            console.error('URL tidak valid untuk ekstraksi path:', url, error);
            return null;
        }
    };

    const openModal = (item = null) => {
        menuItemForm.reset();
        imagePreview.src = placeholderImage;
        if (item) {
            modalTitle.textContent = 'Edit Item Menu';
            document.getElementById('item-id').value = item.id;
            document.getElementById('item-name').value = item.name;
            document.getElementById('item-category').value = item.category_id;
            document.getElementById('item-price').value = item.price;
            // ADD: populate labels & allergen
            document.getElementById('item-labels').value   = (item?.labels   || []).join(', ');
            document.getElementById('item-allergen').value = (item?.allergen || []).join(', ');

            document.getElementById('item-description').value = item.description || '';
            document.getElementById('item-current-photo-url').value = item.photo_url || '';
            imagePreview.src = item.photo_url || placeholderImage;
            document.getElementById('item-is-available').checked = item.is_available;
        } else {
            modalTitle.textContent = 'Tambah Item Menu Baru';
            document.getElementById('item-id').value = '';
            document.getElementById('item-current-photo-url').value = '';
        }
        modal.style.display = 'flex';
        document.body.classList.add('modal-open');  // kunci body
        modal.scrollTop = 0;    
    };

    const closeModal = () => {
        modal.style.display = 'none';
        document.body.classList.remove('modal-open');
    };

    const fetchCategories = async () => {
        const { data, error } = await supabase.from('menu_categories').select('*').order('name');
        if (error) {
            showToast('Gagal memuat kategori', 'error');
            console.error(error);
            return;
        }
        categories = data;
        
        categoryFilter.innerHTML = '<option value="all">Semua Kategori</option>';
        itemCategorySelect.innerHTML = '<option value="" disabled selected>Pilih kategori</option>';

        categories.forEach(cat => {
            categoryFilter.innerHTML += `<option value="${cat.id}">${cat.name}</option>`;
            itemCategorySelect.innerHTML += `<option value="${cat.id}">${cat.name}</option>`;
        });
    };
// ADD: helpers for tags
    const toArray = (str) => (str || '')
    .split(',')
    .map(s => s.trim())
    .filter(Boolean);

    const escapeHtml = (s='') => s
    .replaceAll('&','&amp;')
    .replaceAll('<','&lt;')
    .replaceAll('>','&gt;')
    .replaceAll('"','&quot;')
    .replaceAll("'",'&#39;');

    const renderChips = (arr = []) => {
    if (!arr || !arr.length) return '<span class="muted">-</span>';
    return `<div class="chips">` + arr.map(x => `<span class="chip">${escapeHtml(x)}</span>`).join('') + `</div>`;
    };

    const fetchMenuItems = async () => {
        loadingIndicator.style.display = 'block';
        emptyState.style.display = 'none';
        tableBody.innerHTML = '';

        let query = supabase.from('menus').select('*, menu_categories(name)').order('name');

        const searchTerm = searchInput.value.trim();
        if (searchTerm) {
            query = query.ilike('name', `%${searchTerm}%`);
        }

        const categoryId = categoryFilter.value;
        if (categoryId !== 'all') {
            query = query.eq('category_id', categoryId);
        }

        const { data, error } = await query;

        loadingIndicator.style.display = 'none';

        if (error) {
            showToast('Gagal memuat item menu', 'error');
            console.error(error);
            emptyState.style.display = 'block';
            emptyState.querySelector('h3').textContent = 'Terjadi Kesalahan';
            emptyState.querySelector('p').textContent = 'Tidak dapat memuat data menu saat ini.';
            return;
        }

        if (data.length === 0) {
            emptyState.style.display = 'block';
        } else {
            renderMenuItems(data);
        }
    };

    const renderMenuItems = (items) => {
        tableBody.innerHTML = '';
        items.forEach(item => {
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td class="item-info">
                    <img src="${item.photo_url || 'https://via.placeholder.com/100'}" alt="${item.name}" class="item-thumbnail">
                    <div>
                        <span class="item-name">${item.name}</span>
                        <span class="item-description">${item.description ? (item.description.length > 40 ? item.description.substring(0, 40) + '...' : item.description) : ''}</span>
                    </div>
                </td>
                <td>${item.menu_categories ? item.menu_categories.name : 'Tanpa Kategori'}</td>
                <td>Rp ${Number(item.price).toLocaleString('id-ID')}</td>
                <td>${renderChips(item.labels)}</td>
                <td>${renderChips(item.allergen)}</td>
                <td>
                    <span class="status-badge ${item.is_available ? 'status-available' : 'status-unavailable'}">
                        ${item.is_available ? 'Tersedia' : 'Habis'}
                    </span>
                </td>
                <td class="action-buttons">
                    <button class="btn-icon edit-btn" data-id="${item.id}"><svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg></button>
                    <button class="btn-icon delete-btn" data-id="${item.id}"><svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path><line x1="10" y1="11" x2="10" y2="17"></line><line x1="14" y1="11" x2="14" y2="17"></line></svg></button>
                </td>
            `;
            tableBody.appendChild(tr);
        });
    };

    menuItemForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    saveBtn.disabled = true;
    saveBtn.textContent = 'Menyimpan...';

    try {
        const formData = new FormData(menuItemForm);
        const id = formData.get('id');

        // Parse array dari input teks "dipisah koma"
        const labelsArr   = toArray(formData.get('labels'));
        const allergenArr = toArray(formData.get('allergen'));

        // Nilai dasar
        const name        = (formData.get('name') || '').trim();
        const category_id = formData.get('category_id');
        const price       = Number(formData.get('price') || 0);
        const description = (formData.get('description') || '').trim() || null;
        const is_available = document.getElementById('item-is-available').checked;

        // Validasi minimal
        if (!name) {
        showToast('Nama item wajib diisi', 'error');
        return;
        }
        if (!category_id) {
        showToast('Kategori wajib dipilih', 'error');
        return;
        }
        if (!Number.isFinite(price) || price < 0) {
        showToast('Harga tidak valid', 'error');
        return;
        }

        // Handle Upload Gambar (opsional)
        const imageFile = formData.get('image_file');
        let photoUrl = formData.get('current_photo_url') || null;

        if (imageFile && imageFile.size > 0) {
        const fileExt = imageFile.name.split('.').pop();
        const fileName = `menus/${id || 'new'}/${Date.now()}.${fileExt}`;

        const { error: uploadError } = await supabase.storage
            .from('menu-photos')
            .upload(fileName, imageFile);

        if (uploadError) {
            showToast(`Gagal mengupload gambar: ${uploadError.message}`, 'error');
            return;
        }

        // Dapatkan URL publik
        const { data: urlData } = supabase.storage
            .from('menu-photos')
            .getPublicUrl(fileName);

        photoUrl = urlData.publicUrl;

        // Hapus foto lama (jika ada dan ganti baru)
        const oldPhotoUrl = formData.get('current_photo_url');
        if (oldPhotoUrl) {
            const oldPath = getPathFromUrl(oldPhotoUrl);
            if (oldPath) {
            await supabase.storage.from('menu-photos').remove([oldPath]);
            }
        }
        }

        // Payload final (SATU sumber kebenaran)
        const payload = {
        name,
        category_id,
        price,
        description,
        is_available,
        labels: labelsArr,
        allergen: allergenArr,
        photo_url: photoUrl
        };

        // INSERT vs UPDATE (satu kali saja)
        let error = null;
        if (!id) {
        ({ error } = await supabase.from('menus').insert([payload]));
        } else {
        ({ error } = await supabase.from('menus').update(payload).eq('id', id));
        }

        if (error) {
        showToast(`Gagal menyimpan item: ${error.message}`, 'error');
        return;
        }

        showToast(`Item berhasil ${id ? 'diperbarui' : 'ditambahkan'}!`, 'success');
        closeModal();
        fetchMenuItems();
    } catch (err) {
        console.error(err);
        showToast('Terjadi kesalahan tak terduga saat menyimpan', 'error');
    } finally {
        saveBtn.disabled = false;
        saveBtn.textContent = 'Simpan';
    }
    });


    tableBody.addEventListener('click', async (e) => {
        const editBtn = e.target.closest('.edit-btn');
        const deleteBtn = e.target.closest('.delete-btn');

        if (editBtn) {
            const id = editBtn.dataset.id;
            const { data, error } = await supabase.from('menus').select('*').eq('id', id).single();
            if (error) {
                showToast('Gagal mengambil data item', 'error');
            } else {
                openModal(data);
            }
        }

        if (deleteBtn) {
            const id = deleteBtn.dataset.id;
            if (confirm('Apakah Anda yakin ingin menghapus item ini?')) {
                // 1. Ambil data item untuk mendapatkan URL foto
                const { data: itemToDelete, error: fetchError } = await supabase
                    .from('menus')
                    .select('photo_url')
                    .eq('id', id)
                    .single();

                if (fetchError) {
                    showToast(`Gagal mengambil data item untuk dihapus: ${fetchError.message}`, 'error');
                    return;
                }

                // 2. Hapus item dari database
                const { error: deleteDbError } = await supabase.from('menus').delete().eq('id', id);

                if (deleteDbError) {
                    showToast(`Gagal menghapus item: ${deleteDbError.message}`, 'error');
                    return;
                }

                // 3. Jika item DB berhasil dihapus & ada foto, hapus file dari storage
                if (itemToDelete.photo_url) {
                    const pathToDelete = getPathFromUrl(itemToDelete.photo_url);
                    if (pathToDelete) {
                        const { error: deleteStorageError } = await supabase.storage.from('menu-photos').remove([pathToDelete]);
                        if (deleteStorageError) {
                            // Tampilkan warning jika file gagal dihapus, tapi proses utama sudah berhasil
                            showToast('Item berhasil dihapus, namun file gambar gagal dihapus dari storage.', 'warning');
                            console.warn(`Gagal menghapus file gambar: ${deleteStorageError.message}`);
                        }
                    }
                }
                
                showToast('Item berhasil dihapus', 'success');
                fetchMenuItems();
            }
        }
    });

    imageFileInput.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (file) {
            imagePreview.src = URL.createObjectURL(file);
        }
    });

    addItemBtn.addEventListener('click', () => openModal());
    addItemLink.addEventListener('click', (e) => {
        e.preventDefault();
        openModal();
    });
    closeModalBtn.addEventListener('click', closeModal);
    cancelBtn.addEventListener('click', closeModal);
    modal.addEventListener('click', (e) => {
        if (e.target === modal) {
            closeModal();
        }
    });
    searchInput.addEventListener('input', fetchMenuItems);
    categoryFilter.addEventListener('change', fetchMenuItems);

    const initializePage = async () => {
        await fetchCategories();
        await fetchMenuItems();
    };

    initializePage();
});
