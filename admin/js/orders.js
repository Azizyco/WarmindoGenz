import { supabase } from '../../shared/js/supabase.js';
import { showToast } from '../../shared/js/ui.js';

// === DOM refs
const content = document.getElementById('content-area');
const statusDot = document.getElementById('connection-status');
const roleEl = document.getElementById('user-role');
const userEmailEl = document.getElementById('user-email');
const logoutBtn = document.getElementById('logout-btn');

// === State
let currentUser = null;
let roleKey = null;
let canWrite = false;
let chan = null;

// === Utils
const PROOF_BUCKET = 'payment-proofs';
const rp = (n) => 'Rp ' + Number(n || 0).toLocaleString('id-ID');
const short = (id='') => id.slice(0,8);
const safe = (s='') => String(s).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;');
const isUuid = (s='') => /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(s).trim());

const debounce = (fn, wait=350) => { let t; return (...a)=>{ clearTimeout(t); t=setTimeout(()=>fn(...a), wait); }; };
const fetchOrdersDebounced = debounce(() => fetchOrders(), 350);

async function withRetry(fn, { attempts=5, base=250 } = {}) {
  let last = null;
  for (let i=0; i<attempts; i++) {
    const res = await fn();
    if (!res?.error || res?.status !== 429) return res;
    const wait = base * (2 ** i) + Math.floor(Math.random() * 150);
    await new Promise(r => setTimeout(r, wait));
    last = res;
  }
  return last ?? {};
}

// Layanan: dine_in / takeaway
const isDineInSvc = (s) => String(s || '').toLowerCase() === 'dine_in';

// Transisi status yang diizinkan per status saat ini (untuk tombol di modal)
const STATUS_TRANSITIONS = {
  placed:     ['paid','canceled'],
  paid:       ['confirmed','canceled'],
  confirmed:  ['prep','canceled'],
  prep:       ['ready','canceled'],
  ready:      ['served','canceled'],
  served:     ['completed','canceled'],
  completed:  [],
  canceled:   []
};

// Transisi linear untuk tombol "Next" di tabel
const LINEAR_NEXT = {
  placed:'paid',
  paid:'confirmed',
  confirmed:'prep',
  prep:'ready',
  ready:'served',
  served:'completed'
};

function updateConnectionStatus() {
  if (!statusDot) return;
  const online = navigator.onLine;
  statusDot.classList.toggle('status-offline', !online);
  statusDot.classList.toggle('status-online', online);
  statusDot.title = online ? 'Online' : 'Offline';
}
window.addEventListener('online', updateConnectionStatus);
window.addEventListener('offline', updateConnectionStatus);

// === Auth & RBAC
async function ensureAuth() {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    content.innerHTML = `<div class="empty">Silakan login terlebih dahulu.</div>`;
    throw new Error('not-authenticated');
  }
  currentUser = user;
  userEmailEl && (userEmailEl.textContent = user.email || '(logged in)');
  const { data: prof, error } = await supabase
    .from('profiles')
    .select('role_id, roles:role_id(key)')
    .eq('id', user.id).maybeSingle();
  if (error) throw error;
  roleKey = prof?.roles?.key || 'viewer';
  roleEl && (roleEl.textContent = roleKey);
  canWrite = ['admin', 'manager', 'cashier'].includes(roleKey);
}

// === Layout UI (filters + table + modal)
function mountUI() {
  content.innerHTML = `
    <div class="toolbar">
      <div class="search">
        <input id="q" type="search" placeholder="Cari ID/WA/Email …">
      </div>
      <select id="f-status">
        <option value="">Semua Status</option>
        <option>placed</option><option>paid</option><option>confirmed</option>
        <option>prep</option><option>ready</option><option>served</option>
        <option>completed</option><option>canceled</option>
      </select>
      <select id="f-source">
        <option value="">Semua Sumber</option>
        <option value="web">web</option>
        <option value="pos">pos</option>
      </select>
      <select id="f-svc">
        <option value="">Semua Layanan</option>
        <option value="dine_in">dine_in</option>
        <option value="takeaway">takeaway</option>
      </select>
      <input id="f-from" type="date">
      <input id="f-to" type="date">
    </div>

    <div id="orders-wrap">
      <table class="table">
        <thead>
          <tr>
            <th class="nowrap">Waktu</th>
            <th>ID</th>
            <th>Sumber</th>
            <th>Layanan</th>
            <th>Meja</th>
            <th>Status</th>
            <th>Pemesan</th>
            <th class="right nowrap">Total</th>
            <th class="nowrap">Bukti</th>
            <th class="nowrap">Aksi</th>
          </tr>
        </thead>
        <tbody id="orders-tbody"></tbody>
      </table>
      <div id="orders-empty" class="empty" style="display:none">Belum ada data.</div>
    </div>

    <!-- Modal detail -->
    <div id="order-modal" class="modal" role="dialog" aria-modal="true" aria-labelledby="order-modal-title">
      <div class="modal-card">
        <div class="modal-header">
          <h3 id="order-modal-title">Detail Pesanan</h3>
          <div>
            <button class="btn ghost" id="btn-print">Cetak Struk</button>
            <button class="btn" id="btn-set-table">Set Nomor Meja</button>
            <button class="btn" id="btn-close">Tutup</button>
          </div>
        </div>
        <div class="modal-body">
          <div class="two-col">
            <div>
              <div class="order-meta" id="meta"></div>
              <h4>Item</h4>
              <table class="table items-table">
                <thead><tr><th>Menu</th><th class="right">Qty</th><th class="right">Harga</th></tr></thead>
                <tbody id="items"></tbody>
              </table>
            </div>
            <div>
              <h4>Pembayaran</h4>
              <div class="payments" id="pays"></div>
              <div class="proof">
                <input type="file" id="proof-file" accept="image/*">
                <button class="btn" id="btn-upload-proof" ${canWrite ? '' : 'disabled'}>Upload Bukti</button>
              </div>
              <div id="proof-preview" class="proof-preview" style="margin-top:.5rem"></div>
              <div style="margin-top:.75rem">
                <button class="btn primary" id="btn-mark-paid" ${canWrite ? '' : 'disabled'}>Tandai Lunas</button>
                <button class="btn ghost" id="btn-send-wa">Kirim Struk WA</button>
                <button class="btn ghost" id="btn-send-email">Kirim Struk Email</button>
              </div>
              <h4 style="margin-top:1rem">Ringkasan</h4>
              <div id="totals"></div>
              <h4 style="margin-top:1rem">Ubah Status</h4>
              <div id="status-actions"></div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Modal bukti (popup gambar/file) -->
    <div id="proof-modal" class="modal" role="dialog" aria-modal="true" aria-labelledby="proof-modal-title">
      <div class="modal-card" style="max-width:720px;">
        <div class="modal-header">
          <h3 id="proof-modal-title">Bukti Pembayaran</h3>
          <div>
            <button class="btn" id="proof-close">Tutup</button>
          </div>
        </div>
        <div class="modal-body">
          <div id="proof-content" style="display:flex;align-items:center;justify-content:center;min-height:200px"></div>
        </div>
      </div>
    </div>
  `;
}

function statusBadge(st) {
  const m = {
    placed:'st-placed', paid:'st-paid', confirmed:'st-confirmed', prep:'st-prep',
    ready:'st-ready', served:'st-served', completed:'st-completed', canceled:'st-canceled'
  }[st] || 'st-placed';
  return `<span class="status-badge ${m}">${st}</span>`;
}

// === RPC helper: set status dengan guard & pesan error yang jelas
async function setOrderStatus(orderId, newStatus) {
  try {
    if (!canWrite) {
      showToast('Peran Anda read-only.', 'warning');
      return { ok:false };
    }
    const cleanId = String(orderId).trim();
    if (!isUuid(cleanId)) {
      showToast('Order ID tidak valid.', 'error');
      return { ok:false };
    }

    // Precheck: ambil status & info layanan
    const { data: row, error: e0, status: s0 } = await withRetry(() =>
      supabase.from('orders')
        .select('status, service_type, table_no, source')
        .eq('id', cleanId)
        .maybeSingle()
    );
    if (e0) {
      console.error('Precheck orders failed', { s0, e0 });
      showToast(e0.details || e0.message || 'Gagal ambil order', 'error');
      return { ok:false };
    }
    if (!row) {
      showToast('Order tidak ditemukan.', 'warning');
      return { ok:false };
    }

    // Validasi transisi
    const allowed = STATUS_TRANSITIONS[row.status] || [];
    if (allowed.length && !allowed.includes(newStatus)) {
      showToast(`Transisi dari "${row.status}" ke "${newStatus}" tidak diizinkan.`, 'warning');
      return { ok:false };
    }

    // Guard tambahan: dine-in harus punya nomor meja sebelum masuk dapur/lanjut
    const REQUIRES_TABLE = new Set(['prep','ready','served','completed']);
    if (isDineInSvc(row.service_type) && REQUIRES_TABLE.has(newStatus) && !row.table_no) {
      showToast('Isi nomor meja dulu untuk pesanan dine-in.', 'warning');
      return { ok:false };
    }

    const { error: e1, status: s1 } = await withRetry(() =>
      supabase.rpc('set_order_status', { p_order_id: cleanId, p_status: newStatus })
    );
    if (e1) {
      console.error('RPC set_order_status failed:', { s1, e1 });
      let msg = e1.details || e1.message || 'Status gagal diubah';
      if (String(msg).includes('invalid input syntax for type uuid')) msg = 'Order ID bukan UUID yang valid.';
      showToast(msg, 'error');
      return { ok:false };
    }
    showToast(`Status → ${newStatus}`, 'success');
    return { ok:true };
  } catch (err) {
    console.error(err);
    showToast('Terjadi kesalahan saat mengubah status', 'error');
    return { ok:false };
  }
}

// === Data fetch
async function fetchOrders() {
  const tbody = document.getElementById('orders-tbody');
  const empty = document.getElementById('orders-empty');
  tbody.innerHTML = '';

  // filters
  const q = document.getElementById('q').value.trim();
  const fStatus = document.getElementById('f-status').value;
  const fSource = document.getElementById('f-source').value;
  const fSvc    = document.getElementById('f-svc').value;
  const fFrom = document.getElementById('f-from').value;
  const fTo = document.getElementById('f-to').value;

  const doFetch = () => {
    let query = supabase
      .from('orders')
      .select('id, created_at, source, service_type, status, guest_name, contact, payment_method, total_amount, table_no, proof_url')
      .order('created_at', { ascending: false })
      .limit(200);

    if (fStatus) query = query.eq('status', fStatus);
    if (fSource) query = query.eq('source', fSource);
    if (fSvc)    query = query.eq('service_type', fSvc);
    if (fFrom)   query = query.gte('created_at', fFrom);
    if (fTo)     query = query.lte('created_at', fTo + ' 23:59:59');

    if (q) {
      const qq = q.trim();
      if (qq.length >= 6 && qq.includes('-') && isUuid(qq)) {
        query = query.eq('id', qq);
      } else {
        query = query.or(`contact.ilike.%${qq}%,guest_name.ilike.%${qq}%`);
      }
    }
    return query;
  };

  const { data, error, status } = await withRetry(() => doFetch());
  if (error) {
    console.error('orders list error', { status, error });
    showToast(status === 429 ? 'Terlalu banyak permintaan. Coba lagi sebentar.' : 'Gagal memuat pesanan', status === 429 ? 'warning' : 'error');
    empty.style.display = '';
    return;
  }

  if (!data || data.length === 0) {
    empty.style.display = '';
    return;
  }
  empty.style.display = 'none';

  for (const o of data) {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td class="nowrap">${new Date(o.created_at).toLocaleString('id-ID')}</td>
      <td class="nowrap"><code>${short(o.id)}</code></td>
      <td class="nowrap"><span class="badge">${o.source || '-'}</span></td>
      <td class="nowrap"><span class="badge">${o.service_type || '-'}</span></td>
      <td class="nowrap">${isDineInSvc(o.service_type) ? (o.table_no || '-') : '-'}</td>
      <td>${statusBadge(o.status)}</td>
      <td>
      <div><strong>${safe(o.guest_name || '-')}</strong></div>${o.contact ? `<div class="muted" style="font-size:.85em">${safe(o.contact)}</div>` : ''}
      </td>
      <td class="right nowrap">${rp(o.total_amount)}</td>
      <td class="nowrap">${o.proof_url ? `<button class="btn ghost" data-view-order-proof="${o.id}">Lihat</button>` : '<span class="muted">—</span>'}</td>
      <td class="nowrap">
        <div class="actions">
          <button class="btn" data-action="view" data-id="${o.id}">Lihat</button>
          ${canWrite ? `<button class="btn ghost" data-action="advance" data-id="${o.id}">Next</button>` : ''}
          ${canWrite ? `<button class="btn danger" data-action="cancel" data-id="${o.id}">Cancel</button>` : ''}
        </div>
      </td>
    `;
    tbody.appendChild(tr);
  }
}

// Helper: resolve signed/public URL for proof
async function resolveProofUrl(path) {
  try {
    if (!path) return '';
    const p = String(path);
    if (/^(https?:)?\/\//i.test(p) || p.startsWith('data:')) return p; // absolute/public URL
    // If path accidentally contains full public storage URL for this bucket, allow direct open
    if (p.includes('/storage/v1/object/public/')) return p;
    const { data, error } = await supabase.storage.from(PROOF_BUCKET).createSignedUrl(p, 600);
    if (error) {
      console.warn('Signed URL error', error);
      return '';
    }
    return data?.signedUrl || '';
  } catch (e) {
    console.error('resolveProofUrl failed', e);
    return '';
  }
}

async function openProof(path) {
  const url = await resolveProofUrl(path);
  if (!url) return showToast('Gagal membuka bukti', 'error');
  window.open(url, '_blank');
}

function openProofModalWithUrl(url) {
  const m = document.getElementById('proof-modal');
  const box = document.getElementById('proof-content');
  if (!m || !box) return window.open(url, '_blank');
  box.innerHTML = '';
  const clean = url.split('?')[0];
  const isImg = /\.(png|jpe?g|gif|webp|svg)$/i.test(clean) || url.startsWith('data:image/');
  if (isImg) {
    const img = document.createElement('img');
    img.src = url;
    img.alt = 'Bukti pembayaran';
    img.style.maxWidth = '100%';
    img.style.border = '1px solid #e5e7eb';
    img.style.borderRadius = '6px';
    box.appendChild(img);
  } else {
    const a = document.createElement('a');
    a.href = url; a.target = '_blank'; a.rel = 'noopener';
    a.className = 'btn ghost';
    a.textContent = 'Buka Bukti di Tab Baru';
    box.appendChild(a);
  }
  m.classList.add('open');
  document.body.classList.add('modal-open');
}

async function openProofModal(path) {
  const url = await resolveProofUrl(path);
  if (!url) return showToast('Gagal membuka bukti', 'error');
  openProofModalWithUrl(url);
}

function closeProofModal() {
  const m = document.getElementById('proof-modal');
  if (!m) return;
  m.classList.remove('open');
  // Hanya hapus class modal-open bila tidak ada modal lain yang masih open
  const anyOpen = document.querySelector('.modal.open');
  if (!anyOpen) document.body.classList.remove('modal-open');
}

// === Detail modal
function openModal() {
  const m = document.getElementById('order-modal');
  m.classList.add('open');
  document.body.classList.add('modal-open');
  m.scrollTop = 0;
}
function closeModal() {
  const m = document.getElementById('order-modal');
  m.classList.remove('open');
  document.body.classList.remove('modal-open');
}

// ambil detail pesanan (items, totals)
async function loadOrderDetail(orderId) {
  const cleanId = String(orderId).trim();

  // order
  const { data: order, error: e1, status: s1 } = await withRetry(() =>
    supabase
      .from('orders')
      .select('id, created_at, source, service_type, status, guest_name, contact, payment_method, table_no, proof_url')
      .eq('id', cleanId).maybeSingle()
  );
  if (e1) throw e1;
  if (!order) throw new Error('Order tidak ditemukan');

  // items + opsi + nama menu
  const { data: items, error: e2 } = await supabase
    .from('order_items')
    .select('id, qty, unit_price, note, menus:menu_id(name), order_item_options(id, price_delta, options:option_id(name))')
    .eq('order_id', cleanId)
    .order('id', { ascending: true });
  if (e2) throw e2;

  // totals
  const { data: tot, error: e4 } = await supabase
    .from('vw_order_totals')
    .select('*')
    .eq('order_id', cleanId).maybeSingle();
  if (e4) throw e4;

  // Render meta
  const meta = document.getElementById('meta');
  meta.innerHTML = `
    <div class="kv"><div class="k">Order ID</div><div class="v"><code>${order.id}</code></div></div>
    <div class="kv"><div class="k">Waktu</div><div class="v">${new Date(order.created_at).toLocaleString('id-ID')}</div></div>
    <div class="kv"><div class="k">Sumber</div><div class="v"><span class="badge">${order.source}</span></div></div>
    <div class="kv"><div class="k">Layanan</div><div class="v"><span class="badge">${order.service_type}</span></div></div>
    <div class="kv"><div class="k">Meja</div><div class="v">${isDineInSvc(order.service_type) ? (order.table_no || '-') : '-'}</div></div>
    <div class="kv"><div class="k">Status</div><div class="v">${statusBadge(order.status)}</div></div>
    <div class="kv"><div class="k">Pemesan</div>
    <div class="v">
        ${safe(order.guest_name || '-')}
        ${order.contact ? `<div class="muted" style="font-size:.9em">${safe(order.contact)}</div>` : ''}
    </div>
    </div>
    <div class="kv"><div class="k">Pembayaran</div><div class="v">${safe(order.payment_method || '-')}</div></div>
    <div class="kv"><div class="k">Bukti</div><div class="v">${order.proof_url ? `<button class="btn ghost" id="btn-view-order-proof">Lihat Bukti</button>` : '<span class="muted">Belum ada</span>'}</div></div>
  `;

  // Render proof preview (image if possible)
  const preview = document.getElementById('proof-preview');
  if (preview) {
    preview.innerHTML = '';
    if (order.proof_url) {
      const url = await resolveProofUrl(order.proof_url);
      if (url) {
        const clean = url.split('?')[0];
        const isImg = /\.(png|jpe?g|gif|webp|svg)$/i.test(clean);
        if (isImg) {
          preview.innerHTML = `<img src="${url}" alt="Bukti pembayaran" style="max-width:100%;border:1px solid #e5e7eb;border-radius:6px">`;
        } else {
          preview.innerHTML = `<a href="${url}" target="_blank" class="btn ghost">Buka Bukti</a>`;
        }
      } else {
        preview.innerHTML = '<div class="muted">Tidak dapat memuat preview bukti.</div>';
      }
    } else {
      preview.innerHTML = '<div class="muted">Belum ada bukti.</div>';
    }
  }

  // Render items
  const tbody = document.getElementById('items');
  tbody.innerHTML = '';
  for (const it of items || []) {
    const opt = (it.order_item_options || []).map(x => x.options?.name ? `• ${x.options.name}${x.price_delta ? ` (${rp(x.price_delta)})` : ''}` : '').filter(Boolean);
    const row = document.createElement('tr');
    const unit = (it.unit_price || 0) + (it.order_item_options || []).reduce((a,b)=>a + (b.price_delta||0), 0);
    row.innerHTML = `
      <td>
        <div><strong>${safe(it.menus?.name || '-')}</strong></div>
        ${opt.length ? `<div class="opt">${opt.join('<br>')}</div>` : ''}
        ${it.note ? `<div class="opt">Catatan: ${safe(it.note)}</div>` : ''}
      </td>
      <td class="right">${it.qty}</td>
      <td class="right">${rp(unit * it.qty)}</td>
    `;
    tbody.appendChild(row);
  }

  // Render pembayaran ringkas (tanpa tabel payments)
  const paysWrap = document.getElementById('pays');
  paysWrap.innerHTML = '';
  const p1 = document.createElement('div');
  p1.className = 'kv';
  p1.innerHTML = `<div class="k">Metode</div><div class="v"><span class="badge">${safe(order.payment_method || '-')}</span></div>`;
  paysWrap.appendChild(p1);
  const p2 = document.createElement('div');
  p2.className = 'kv';
  p2.innerHTML = `<div class="k">Status</div><div class="v">${statusBadge(order.status)}</div>`;
  paysWrap.appendChild(p2);

  // Render totals
  const totals = document.getElementById('totals');
  totals.innerHTML = `
    <div class="kv"><div class="k">Subtotal</div><div class="v right">${rp(tot?.items_subtotal)}</div></div>
    <div class="kv"><div class="k">Diskon</div><div class="v right">${rp(tot?.discount_total)}</div></div>
    <div class="kv"><div class="k">Setelah Diskon</div><div class="v right">${rp(tot?.after_discount)}</div></div>
    <div class="kv"><div class="k">PPN</div><div class="v right">${rp(tot?.tax_amount)}</div></div>
    <div class="kv"><div class="k">Service</div><div class="v right">${rp(tot?.service_fee)}</div></div>
    <div class="kv"><div class="k"><strong>Grand Total</strong></div><div class="v right"><strong>${rp(tot?.grand_total)}</strong></div></div>
  `;

  // Status actions
  const act = document.getElementById('status-actions');
  const nexts = STATUS_TRANSITIONS[order.status] || [];
  act.innerHTML = '';
  if (!canWrite || nexts.length === 0) {
    act.innerHTML = `<div class="muted">${!canWrite ? 'Read-only untuk peran Anda.' : 'Tidak ada aksi lanjutan.'}</div>`;
  } else {
    for (const st of nexts) {
      const b = document.createElement('button');
      b.className = `btn ${st==='canceled'?'danger':'primary'}`;
      b.textContent = `Set ${st.toUpperCase()}`;
      b.dataset.setStatus = st;
      b.dataset.orderId = order.id;
      act.appendChild(b);
    }
  }

  // Proof viewer
  document.querySelectorAll('[data-view-proof]').forEach(btn => {
    btn.addEventListener('click', async () => {
      const path = btn.getAttribute('data-view-proof');
      await openProof(path);
    });
  });
  const orderProofBtn = document.getElementById('btn-view-order-proof');
  if (orderProofBtn && order.proof_url) {
    orderProofBtn.addEventListener('click', async () => {
      await openProof(order.proof_url);
    });
  }

  // Bind buttons in modal
  const btnClose = document.getElementById('btn-close');
  btnClose.onclick = closeModal;

  const btnPrint = document.getElementById('btn-print');
  btnPrint.onclick = () => printReceipt(order, items, tot);

  const uploadBtn = document.getElementById('btn-upload-proof');
  uploadBtn.onclick = async () => {
    if (!canWrite) return;
    const file = document.getElementById('proof-file').files[0];
    if (!file) return showToast('Pilih file bukti dulu', 'warning');
    const path = `proofs/${order.id}/${Date.now()}_${file.name}`;
    const up = await supabase.storage.from(PROOF_BUCKET).upload(path, file, { upsert:false });
    if (up.error) return showToast('Upload gagal', 'error');
    // Simpan ke kolom orders.proof_url (skema baru)
    const { error } = await supabase.from('orders').update({ proof_url: path }).eq('id', order.id);
    if (error) showToast('Gagal menyimpan bukti', 'error'); else { showToast('Bukti diunggah', 'success'); loadOrderDetail(order.id); fetchOrders(); }
  };

  const markBtn = document.getElementById('btn-mark-paid');
  markBtn.onclick = async () => {
    if (!canWrite) return;
    const res = await setOrderStatus(order.id, 'paid');
    if (res.ok) { await loadOrderDetail(order.id); await fetchOrders(); }
  };

  document.getElementById('btn-send-wa').onclick = async () => {
    const addr = prompt('Nomor WA (contoh: +62812xxxxxxx):');
    if (!addr) return;
    const { error } = await supabase.from('receipt_dispatches').insert({ order_id: order.id, channel:'whatsapp', address: addr });
    if (error) showToast('Gagal antri struk WA', 'error'); else showToast('Struk dikirim (queued)', 'success');
  };
  document.getElementById('btn-send-email').onclick = async () => {
    const addr = prompt('Email pelanggan:');
    if (!addr) return;
    const { error } = await supabase.from('receipt_dispatches').insert({ order_id: order.id, channel:'email', address: addr });
    if (error) showToast('Gagal antri struk Email', 'error'); else showToast('Struk dikirim (queued)', 'success');
  };

  // Bind status changes
  act.querySelectorAll('button[data-set-status]').forEach(b => {
    b.addEventListener('click', async () => {
      const st = b.dataset.setStatus;
      const res = await setOrderStatus(order.id, st);
      if (res.ok) { await loadOrderDetail(order.id); await fetchOrders(); }
    });
  });

  // Set Nomor Meja (auto set service_type = dine_in bila belum)
  const btnSetTable = document.getElementById('btn-set-table');
  if (btnSetTable) {
    btnSetTable.onclick = async () => {
      const val = prompt('Nomor meja? (mis. 1-10 atau A3)', order.table_no || '');
      if (val === null) return; // cancel
      const tableNo = val.trim();
      if (!tableNo) return showToast('Nomor meja kosong', 'error');

      const patch = { table_no: tableNo };
      if (!isDineInSvc(order.service_type)) patch.service_type = 'dine_in';

      const { error } = await supabase.from('orders').update(patch).eq('id', order.id);
      if (error) return showToast('Gagal menyimpan nomor meja', 'error');
      showToast('Nomor meja disimpan', 'success');
      await loadOrderDetail(order.id);
      await fetchOrders();
    };
  }

  openModal();
}

// Cetak struk sederhana (print CSS bawaan)
function printReceipt(order, items, tot) {
  const w = window.open('', '_blank');
  const rows = (items||[]).map(it => {
    const extra = (it.order_item_options||[]).map(x=>x.options?.name).filter(Boolean).join(', ');
    const unit = (it.unit_price || 0) + (it.order_item_options || []).reduce((a,b)=>a + (b.price_delta||0), 0);
    return `<tr>
      <td>${safe(it.menus?.name || '-')}${extra?`<div style="font-size:.8rem;color:#64748b">${safe(extra)}</div>`:''}</td>
      <td style="text-align:right">${it.qty}</td>
      <td style="text-align:right">${rp(unit*it.qty)}</td>
    </tr>`;
  }).join('');
  w.document.write(`
    <html><head><title>Struk</title>
    <style>
      body { font-family: ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Arial; padding:16px; }
      h3 { margin:0 0 4px 0; }
      table { width:100%; border-collapse:collapse; }
      td { padding:6px 4px; border-bottom:1px solid #eee; }
      .right { text-align:right; }
      @media print { @page { size: A5 portrait; margin:10mm; } }
    </style></head>
    <body>
      <h3>WarmindoGenz</h3>
      <div>
        ID: ${order.id}<br>
        Waktu: ${new Date(order.created_at).toLocaleString('id-ID')}<br>
        Nama: ${safe(order.guest_name || '-')}${order.contact ? ` (${safe(order.contact)})` : ''}<br>
        ${isDineInSvc(order.service_type) ? `Meja: ${order.table_no || '-'}` : ''}
      </div>
      <hr>
      <table>${rows}</table>
      <hr>
      <table>
        <tr><td>Subtotal</td><td class="right">${rp(tot?.items_subtotal)}</td></tr>
        <tr><td>Diskon</td><td class="right">${rp(tot?.discount_total)}</td></tr>
        <tr><td>PPN</td><td class="right">${rp(tot?.tax_amount)}</td></tr>
        <tr><td>Service</td><td class="right">${rp(tot?.service_fee)}</td></tr>
        <tr><td><strong>Total</strong></td><td class="right"><strong>${rp(tot?.grand_total)}</strong></td></tr>
      </table>
      <p>Metode: ${safe(order.payment_method || '-')}</p>
      <script>window.print();</script>
    </body></html>
  `);
  w.document.close();
}

// === Events
function bindEvents() {
  const qEl = document.getElementById('q');
  qEl && qEl.addEventListener('input', fetchOrdersDebounced);

  ['f-status','f-source','f-svc','f-from','f-to'].forEach(id => {
    const el = document.getElementById(id);
    el && el.addEventListener('change', fetchOrdersDebounced);
  });

  document.getElementById('orders-tbody').addEventListener('click', async (e) => {
    // Lihat bukti langsung dari tabel (kolom Bukti)
    const proofBtn = e.target.closest('button[data-view-order-proof]');
    if (proofBtn) {
      const orderId = proofBtn.getAttribute('data-view-order-proof');
      const { data: ord, error: eProof } = await supabase.from('orders').select('proof_url').eq('id', orderId).maybeSingle();
      if (eProof) return showToast('Gagal ambil data bukti', 'error');
      if (!ord?.proof_url) return showToast('Belum ada bukti', 'warning');
      await openProofModal(ord.proof_url);
      return;
    }

    const btn = e.target.closest('button[data-action]');
    if (!btn) return;
    const id = String(btn.dataset.id || '').trim();
    const action = btn.dataset.action;

    if (action === 'view') {
      try { await loadOrderDetail(id); } catch(err){ console.error(err); showToast('Gagal membuka detail', 'error'); }
    }

    if (action === 'advance' && canWrite) {
      if (!isUuid(id)) { showToast('Order ID tidak valid.', 'error'); return; }
      const { data, error, status } = await withRetry(() =>
        supabase.from('orders').select('status').eq('id', id).maybeSingle()
      );
      if (error) { console.error('Fetch status failed', { status, error }); showToast(error.details || error.message || 'Gagal ambil order', 'error'); return; }
      if (!data) { showToast('Order tidak ditemukan', 'warning'); return; }
      const st = data.status;
      const next = LINEAR_NEXT[st];
      if (!next) return showToast('Tidak ada langkah lanjut', 'warning');
      const res = await setOrderStatus(id, next);
      if (res.ok) await fetchOrders();
    }

    if (action === 'cancel' && canWrite) {
      if (!confirm('Batalkan pesanan ini?')) return;
      const res = await setOrderStatus(id, 'canceled');
      if (res.ok) await fetchOrders();
    }

    // (handled at the top of handler)
  });

  const orderModalEl = document.getElementById('order-modal');
  orderModalEl.addEventListener('click', (e) => {
    if (e.target === e.currentTarget) closeModal();
  });

  const proofModalEl = document.getElementById('proof-modal');
  proofModalEl.addEventListener('click', (e) => {
    if (e.target === e.currentTarget) closeProofModal();
  });
  const proofClose = document.getElementById('proof-close');
  proofClose && (proofClose.onclick = closeProofModal);

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      const anyOpenProof = document.getElementById('proof-modal')?.classList.contains('open');
      if (anyOpenProof) return closeProofModal();
      closeModal();
    }
  });

  logoutBtn && logoutBtn.addEventListener('click', async () => {
    await supabase.auth.signOut();
    location.reload();
  });

  // Rekap Penjualan -> panggil RPC di DB lalu redirect ke laporan
  const btnRekap = document.getElementById('btn-rekap');
  if (btnRekap) {
    btnRekap.addEventListener('click', async () => {
      try {
        if (!canWrite) {
          showToast('Peran Anda tidak diizinkan mengeksekusi rekap.', 'warning');
          return;
        }
        // Ambil rentang dari filter, default ke hari ini
        const fromEl = document.getElementById('f-from');
        const toEl = document.getElementById('f-to');
        const today = new Date();
        const y = today.getFullYear();
        const m = String(today.getMonth() + 1).padStart(2, '0');
        const d = String(today.getDate()).padStart(2, '0');
        const todayStr = `${y}-${m}-${d}`;
        const p_from = (fromEl?.value) || todayStr;
        const p_to = (toEl?.value) || todayStr;

        if (!confirm(`Jalankan rekap penjualan untuk ${p_from} s/d ${p_to}?`)) return;
        btnRekap.disabled = true;
        btnRekap.textContent = 'Memproses…';
        showToast('Memproses rekap penjualan…', 'info');

        // Status yang disertakan saat rekap. Anda bisa ubah di sisi DB jika perlu.
        const statuses = ['placed','paid'];

        // Panggil RPC di database (Postgres function) agar agregasi dilakukan di server
        const { error: rpcError } = await supabase.rpc('rekap_sales', {
          p_from,
          p_to,
          p_statuses: statuses
        });
        if (rpcError) throw rpcError;

        showToast('Rekap selesai. Membuka halaman laporan…', 'success');
        // Arahkan ke laporan dengan range custom sesuai yang direkap
        const url = `/admin/reports.html?tab=summary&range=custom&start=${encodeURIComponent(p_from)}&end=${encodeURIComponent(p_to)}`;
        window.location.href = url;
      } catch (err) {
        console.error('Rekap penjualan gagal', err);
        showToast(err?.message || 'Gagal menjalankan rekap penjualan', 'error');
      } finally {
        btnRekap.disabled = false;
        btnRekap.textContent = 'Rekap Penjualan';
      }
    });
  }
}

// === Realtime
function setupRealtime() {
  if (chan) supabase.removeChannel(chan);
  chan = supabase.channel('orders-live')
    .on('postgres_changes', { event:'*', schema:'public', table:'orders' }, fetchOrdersDebounced)
    .subscribe();
}

// === Init
(async function init(){
  try {
    updateConnectionStatus();
    await ensureAuth();
    mountUI();
    bindEvents();
    setupRealtime();
    await fetchOrders();
  } catch (e) {
    if (e.message !== 'not-authenticated') console.error(e);
  }
})();
