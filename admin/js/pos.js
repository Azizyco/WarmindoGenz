import { supabase } from '../../shared/js/supabase.js';
import { showToast } from '../../shared/js/ui.js';

// === State
let MENU = [];
let CART = []; // { menu_id, name, unit_price, qty, note }
let currentType = 'takeaway'; // dine_in | takeaway
let paymentMethod = 'cash';
let proofFile = null;
let discounts = { percent:0, nominal:0 };
let serviceFee = 0; // fixed
let taxPercent = 0; // percent
let tableNo = '';
let guestName = '';
let contact = '';
let orderNote = '';

// === DOM refs (assigned after mount)
let elSearch, elCategory, elMenuWrap, elCartWrap, elTotalsWrap, elTypeToggle, elPaymentSelect, elProofInput, elProofGroup, elSubmitBtn, elReceiptModal, elReceiptContent, elTableInput, elGuestName, elContact, elOrderNote, elTableSection;

// === Helpers
const rp = n => 'Rp ' + Number(n||0).toLocaleString('id-ID');
const safe = s => String(s||'').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;');
const debounce = (fn, w=300) => { let t; return (...a)=>{ clearTimeout(t); t=setTimeout(()=>fn(...a), w); }; };
const isImageFile = f => !!f && /image\//.test(f.type);

function computeTotals() {
  const subtotal = CART.reduce((a,it)=> a + it.unit_price * it.qty, 0);
  return { subtotal, discountTotal: 0, afterDiscount: subtotal, taxAmount: 0, serviceFee: 0, grandTotal: subtotal };
}

function mountUI() {
  const root = document.getElementById('pos-root');
  root.innerHTML = `
  <div class="pos-layout">
    <div class="pos-left">
      <div class="toolbar">
        <input id="pos-search" type="search" placeholder="Cari menu..." />
        <select id="pos-category"><option value="">Semua Kategori</option></select>
        <button id="toggle-type" class="btn type-btn">Take-Away</button>
      </div>
      <div id="menu-wrap" class="menu-grid"></div>
    </div>
    <div class="pos-right">
      <h3>Keranjang</h3>
      <div id="cart-wrap" class="cart"></div>
      <div class="cart-customer">
        <div class="kv"><div class="k">Nama</div><div class="v"><input id="guest-name" type="text" placeholder="Nama pelanggan (opsional)" /></div></div>
        <div class="kv"><div class="k">Telepon</div><div class="v"><input id="contact" type="text" placeholder="No. WA / Telepon (opsional)" /></div></div>
        <div class="kv"><div class="k">Catatan Order</div><div class="v"><input id="order-note" type="text" placeholder="Catatan umum (opsional)" /></div></div>
      </div>
      <div class="cart-extras" id="table-section" style="display:none">
        <div class="kv"><div class="k">Nomor Meja</div><div class="v"><input id="table-no" type="text" placeholder="Wajib untuk Dine-In" /></div></div>
      </div>
      <div class="payments">
        <div class="kv"><div class="k">Metode Bayar</div><div class="v">
          <select id="payment-method">
            <option value="cash">Cash</option>
            <option value="transfer">Transfer</option>
            <option value="ewallet">E-Wallet</option>
            <option value="qris">QRIS</option>
          </select>
        </div></div>
        <div class="kv" id="proof-group" style="display:none"><div class="k">Bukti Transfer</div><div class="v"><input id="proof-file" type="file" accept="image/*" /></div></div>
      </div>
      <div id="totals-wrap" class="totals"></div>
      <button id="submit-order" class="btn primary full">Simpan & Bayar</button>
    </div>
  </div>

  <div id="receipt-modal" class="modal" role="dialog" aria-modal="true">
    <div class="modal-card" style="max-width:600px">
      <div class="modal-header"><h3>Struk</h3><div><button class="btn" id="receipt-close">Tutup</button><button class="btn ghost" id="receipt-print">Print</button></div></div>
      <div class="modal-body" id="receipt-content"></div>
    </div>
  </div>
  `;
  // assign refs
  elSearch = document.getElementById('pos-search');
  elCategory = document.getElementById('pos-category');
  elMenuWrap = document.getElementById('menu-wrap');
  elCartWrap = document.getElementById('cart-wrap');
  elTotalsWrap = document.getElementById('totals-wrap');
  elTypeToggle = document.getElementById('toggle-type');
  elPaymentSelect = document.getElementById('payment-method');
  elProofInput = document.getElementById('proof-file');
  elProofGroup = document.getElementById('proof-group');
  elSubmitBtn = document.getElementById('submit-order');
  elReceiptModal = document.getElementById('receipt-modal');
  elReceiptContent = document.getElementById('receipt-content');
  elTableInput = document.getElementById('table-no');
  elTableSection = document.getElementById('table-section');
  elGuestName = document.getElementById('guest-name');
  elContact = document.getElementById('contact');
  elOrderNote = document.getElementById('order-note');
}

async function loadMenus() {
  let q = supabase.from('menus').select('id, name, price, category_id, photo_url, menu_categories(name), is_available');
  const { data, error } = await q;
  if (error) { showToast('Gagal memuat menu', 'error'); return; }
  MENU = data || [];
  renderCategories();
  renderMenuList();
}

function renderCategories() {
  const cats = [...new Set(MENU.map(m=> m.menu_categories?.name || 'Lainnya'))];
  elCategory.innerHTML = '<option value="">Semua Kategori</option>' + cats.map(c=> `<option value="${safe(c)}">${safe(c)}</option>`).join('');
}

function renderMenuList() {
  const term = elSearch.value.trim().toLowerCase();
  const cat = elCategory.value.trim().toLowerCase();
  const items = MENU.filter(m => (
    (!term || m.name.toLowerCase().includes(term)) &&
    (!cat || (m.menu_categories?.name||'lainnya').toLowerCase() === cat)
  ));
  const placeholder = 'https://placehold.co/600x600/f3f4f6/9ca3af?text=No+Image';
  elMenuWrap.innerHTML = items.map(m => `
    <div class="menu-card ${!m.is_available?'unavailable':''}" data-id="${m.id}">
      <div class="menu-image">
        <img src="${m.photo_url || placeholder}" alt="${safe(m.name)}" loading="lazy" />
        ${!m.is_available ? '<div class="unavailable-badge">Habis</div>' : ''}
      </div>
      <div class="menu-info">
        <div class="menu-category">${safe(m.menu_categories?.name || 'Lainnya')}</div>
        <div class="menu-name">${safe(m.name)}</div>
        <div class="menu-price">${rp(m.price)}</div>
      </div>
    </div>`).join('') || '<div class="empty-state">🍽️ Tidak ada menu ditemukan</div>';
}

function addToCart(menuId) {
  const menu = MENU.find(m=> m.id === menuId);
  if (!menu) return;
  const existing = CART.find(it=> it.menu_id === menuId);
  if (existing) existing.qty += 1; else CART.push({ menu_id: menu.id, name: menu.name, unit_price: menu.price, qty:1, note:'' });
  renderCart();
}

function renderCart() {
  if (!CART.length) { elCartWrap.innerHTML = '<div class="muted">Keranjang kosong.</div>'; updateTotals(); return; }
  elCartWrap.innerHTML = CART.map((it,i)=> `
    <div class="cart-item" data-idx="${i}">
      <div class="ci-head">
        <strong>${safe(it.name)}</strong>
        <div class="ci-actions">
          <button class="btn ghost" data-act="dec">−</button>
          <span>${it.qty}</span>
          <button class="btn ghost" data-act="inc">+</button>
          <button class="btn danger" data-act="del">×</button>
        </div>
      </div>
      <div class="ci-note">
        <label>Catatan</label>
        <input type="text" data-act="note" value="${safe(it.note)}" placeholder="Tambahkan catatan (opsional)" />
      </div>
      <div class="ci-sub">${rp(it.unit_price * it.qty)}</div>
    </div>`).join('');
  updateTotals();
}

function updateTotals() {
  const t = computeTotals();
  elTotalsWrap.innerHTML = `
    <div class="kv grand"><div class="k"><strong>Total</strong></div><div class="v right"><strong>${rp(t.grandTotal)}</strong></div></div>
  `;
}

function bindEvents() {
  elSearch.addEventListener('input', debounce(renderMenuList, 250));
  elCategory.addEventListener('change', renderMenuList);
  elMenuWrap.addEventListener('click', e => {
    const card = e.target.closest('.menu-card');
    if (!card || card.classList.contains('unavailable')) return;
    addToCart(card.getAttribute('data-id'));
  });
  elCartWrap.addEventListener('click', e => {
    const root = e.target.closest('.cart-item');
    if (!root) return;
    const idx = Number(root.getAttribute('data-idx'));
    const actBtn = e.target.closest('button[data-act]');
    if (actBtn) {
      const act = actBtn.getAttribute('data-act');
      const it = CART[idx];
      if (!it) return;
      if (act==='inc') it.qty += 1;
      if (act==='dec') it.qty = Math.max(1, it.qty - 1);
      if (act==='del') CART.splice(idx,1);
      renderCart();
      return;
    }
    const noteInput = e.target.closest('input[data-act="note"]');
    if (noteInput) {
      CART[idx].note = noteInput.value.slice(0,200);
      // no full rerender needed
    }
  });
  elTypeToggle.addEventListener('click', () => {
    currentType = currentType === 'takeaway' ? 'dine_in' : 'takeaway';
    elTypeToggle.textContent = currentType === 'dine_in' ? 'Dine-In' : 'Take-Away';
    elTypeToggle.classList.toggle('dine', currentType === 'dine_in');
    elTypeToggle.classList.toggle('take', currentType === 'takeaway');
    // Show/hide table section
    if (elTableSection) {
      elTableSection.style.display = currentType === 'dine_in' ? '' : 'none';
      if (currentType === 'takeaway') {
        if (elTableInput) elTableInput.value = '';
        tableNo = '';
      }
    }
  });
  elPaymentSelect.addEventListener('change', () => {
    paymentMethod = elPaymentSelect.value;
    // Tampilkan upload bukti untuk transfer, e-wallet, dan QRIS
    elProofGroup.style.display = ['transfer','ewallet','qris'].includes(paymentMethod) ? '' : 'none';
  });
  elProofInput.addEventListener('change', e => { proofFile = e.target.files[0] || null; });
  elTableInput && elTableInput.addEventListener('input', () => { tableNo = elTableInput.value.trim(); });
  elGuestName.addEventListener('input', () => { guestName = elGuestName.value.trim(); });
  elContact.addEventListener('input', () => { contact = elContact.value.trim(); });
  elOrderNote.addEventListener('input', () => { orderNote = elOrderNote.value.trim(); });
  elSubmitBtn.addEventListener('click', submitOrder);
  document.getElementById('receipt-close').addEventListener('click', closeReceipt);
  document.getElementById('receipt-print').addEventListener('click', () => {
    const w = window.open('', '_blank');
    w.document.write(`<html><head><title>Struk</title><style>body{font-family:system-ui;padding:16px;}table{width:100%;border-collapse:collapse;}td{padding:4px;border-bottom:1px solid #eee;} .right{text-align:right}</style></head><body>${elReceiptContent.innerHTML}<script>window.print();<\/script></body></html>`);
    w.document.close();
  });
}

function openReceipt(html) {
  elReceiptContent.innerHTML = html;
  elReceiptModal.classList.add('open');
  document.body.classList.add('modal-open');
}
function closeReceipt() {
  elReceiptModal.classList.remove('open');
  const anyOpen = document.querySelector('.modal.open');
  if (!anyOpen) document.body.classList.remove('modal-open');
}

async function uploadProofIfNeeded(orderId) {
  // Upload bukti untuk metode non-tunai: transfer, e-wallet, dan QRIS
  if (!proofFile || !['transfer','ewallet','qris'].includes(paymentMethod)) return null;
  const path = `proofs/${orderId}/${Date.now()}_${proofFile.name}`;
  const up = await supabase.storage.from('payment-proofs').upload(path, proofFile, { upsert:false });
  if (up.error) { showToast('Upload bukti gagal', 'error'); return null; }
  const { error } = await supabase.from('orders').update({ proof_url: path }).eq('id', orderId);
  if (error) { showToast('Simpan path bukti gagal', 'error'); }
  return path;
}

async function submitOrder() {
  if (!CART.length) return showToast('Keranjang masih kosong', 'warning');
  if (currentType === 'dine_in' && !tableNo) return showToast('Nomor meja wajib untuk Dine-In', 'warning');
  const totals = computeTotals();
  elSubmitBtn.disabled = true;
  elSubmitBtn.textContent = 'Memproses...';
  try {
    // Payment code sederhana
    const paymentCode = `POS-${Date.now().toString(36).toUpperCase()}`;
    // Insert order
    const payloadOrder = {
      status: 'paid',
      service_type: currentType,
      table_no: currentType === 'dine_in' ? (tableNo || null) : null,
      payment_method: paymentMethod,
      total_amount: totals.grandTotal,
      // NOTE: constraint orders_session_or_pos currently enforces source = 'web'
      // To satisfy it without changing DB, we use 'web' here.
      source: 'web',
      guest_name: guestName || null,
      contact: contact || null,
      note: orderNote || null,
      payment_code: paymentCode
    };
    // Try RPC if available for RLS-safe insert with items
    let orderId = null;
    let usedRpc = false;
    
    // Attempt 1: Try pos_create_order RPC
    try {
      const itemsForRpc = CART.map(it => ({ 
        menu_id: it.menu_id, 
        qty: it.qty, 
        unit_price: it.unit_price, 
        note: it.note || null 
      }));
      const { data: rpcRes, error: rpcErr } = await supabase.rpc('pos_create_order', { 
        order: payloadOrder, 
        items: itemsForRpc 
      });
      if (!rpcErr && rpcRes?.order_id) {
        orderId = rpcRes.order_id;
        usedRpc = true;
      } else if (rpcErr) {
        console.warn('RPC pos_create_order failed, trying fallback:', rpcErr);
      }
    } catch (rpcCatch) {
      console.warn('RPC pos_create_order not available or error:', rpcCatch);
    }
    
    // Attempt 2: Direct insert (if RPC failed or not available)
    if (!orderId) {
      const { data: orderRow, error: eOrder } = await supabase.from('orders').insert(payloadOrder).select('id').maybeSingle();
      if (eOrder) {
        // If RLS error, suggest creating RPC function
        if (eOrder.code === '42501' || eOrder.message.includes('row-level security')) {
          throw new Error('⚠️ RLS Policy Error: Buat fungsi RPC pos_create_order dengan SECURITY DEFINER untuk bypass RLS. Detail: ' + eOrder.message);
        }
        throw new Error(eOrder?.message || 'Insert order gagal');
      }
      if (!orderRow) throw new Error('Insert order tidak mengembalikan ID');
      orderId = orderRow.id;
      
      // Insert items if not done by RPC
      const itemsPayload = CART.map(it => ({
        order_id: orderId,
        menu_id: it.menu_id,
        qty: it.qty,
        unit_price: it.unit_price,
        note: it.note || null
      }));
      const { error: eItems } = await supabase.from('order_items').insert(itemsPayload);
      if (eItems) {
        if (eItems.code === '42501' || eItems.message.includes('row-level security')) {
          throw new Error('⚠️ RLS Policy Error pada order_items. Gunakan RPC atau sesuaikan policy RLS.');
        }
        throw new Error(eItems.message || 'Insert items gagal');
      }
    }

    // Upload proof if needed
    const proofPath = await uploadProofIfNeeded(orderId);
    // Optional RPC to finalize proof by payment code if exists
    if (proofPath) {
      try { await supabase.rpc('set_order_proof_by_code', { p_payment_code: payloadOrder.payment_code, p_path: proofPath }); } catch(_) {}
    }

    // Reload form state
    const receiptHtml = buildReceiptHtml(orderId, proofPath, totals);
    showToast('Order tersimpan', 'success');
    CART = []; renderCart();
    proofFile = null; if (elProofInput) elProofInput.value='';
    openReceipt(receiptHtml);
  } catch (err) {
    console.error(err);
    showToast(err.message || 'Gagal menyimpan order', 'error');
  } finally {
    elSubmitBtn.disabled = false;
    elSubmitBtn.textContent = 'Simpan & Bayar';
  }
}

function buildReceiptHtml(orderId, proofPath, totals) {
  const rows = CART.map(it => `<tr><td>${safe(it.name)}</td><td class='right'>${it.qty}</td><td class='right'>${rp(it.unit_price * it.qty)}</td></tr>`).join('');
  return `
    <div style='margin-bottom:8px'>ID: ${orderId}<br>Jenis: ${currentType}<br>Metode: ${safe(paymentMethod)}${currentType==='dine_in'?`<br>Meja: ${safe(tableNo||'-')}`:''}</div>
    <table>${rows}</table>
    <hr>
    <table>
      <tr><td><strong>Total</strong></td><td class='right'><strong>${rp(totals.grandTotal)}</strong></td></tr>
    </table>
    ${proofPath ? `<p>Bukti: ${safe(proofPath)}</p>` : ''}
  `;
}

// === Auth & Status (like orders.js)
async function initAuth() {
  const statusDot = document.getElementById('connection-status');
  const roleEl = document.getElementById('user-role');
  const userEmailEl = document.getElementById('user-email');
  const logoutBtn = document.getElementById('logout-btn');

  // Connection status
  const updateStatus = () => {
    if (!statusDot) return;
    const online = navigator.onLine;
    statusDot.classList.toggle('status-offline', !online);
    statusDot.classList.toggle('status-online', online);
    statusDot.title = online ? 'Online' : 'Offline';
  };
  updateStatus();
  window.addEventListener('online', updateStatus);
  window.addEventListener('offline', updateStatus);

  // Auth check
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (user && userEmailEl) {
      userEmailEl.textContent = user.email || '(logged in)';
      const { data: prof } = await supabase.from('profiles').select('role_id, roles:role_id(key)').eq('id', user.id).maybeSingle();
      const roleKey = prof?.roles?.key || 'viewer';
      if (roleEl) roleEl.textContent = roleKey;
    }
  } catch (e) {
    console.warn('Auth check failed', e);
  }

  // Logout
  if (logoutBtn) {
    logoutBtn.addEventListener('click', async () => {
      await supabase.auth.signOut();
      location.href = '/admin/login.html';
    });
  }
}

(async function init() {
  try {
    await initAuth();
    mountUI();
    bindEvents();
    await loadMenus();
    renderCart();
  } catch (e) { console.error(e); }
})();
