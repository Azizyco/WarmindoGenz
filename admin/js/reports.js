import { supabase } from '../../shared/js/supabase.js';
import { showToast } from '../../shared/js/ui.js';

let currentUser = null;
let revenueChart = null;
let paymentChart = null;
let topItemsChart = null;

// Current filters
let filters = {
    dateRange: '30days',
    startDate: null,
    endDate: null,
    paymentMethod: '',
    serviceType: '',
    status: ''
};

// Pagination state
let transactionsPagination = {
    currentPage: 1,
    pageSize: 20,
    totalRecords: 0,
    sortBy: 'order_date',
    sortOrder: 'desc',
    searchQuery: ''
};

let itemsPagination = {
    currentPage: 1,
    pageSize: 20,
    totalRecords: 0,
    sortBy: 'total_revenue',
    sortOrder: 'desc',
    searchQuery: ''
};

// Initialize page
document.addEventListener('DOMContentLoaded', async () => {
    await checkAuth();
    initializeTabs();
    initializeFilters();
    // Apply initial tab/range from URL if provided, else default 30 days
    applyInitialParamsFromURL();
    setDefaultDateRange();
    await loadSummaryData();
});

function applyInitialParamsFromURL() {
    const params = new URLSearchParams(window.location.search);
    const tab = params.get('tab');
    const range = params.get('range');
    const start = params.get('start');
    const end = params.get('end');

    // Handle tab
    if (tab && ['summary','transactions','items'].includes(tab)) {
        activateTab(tab);
    }

    // Handle date range
    if (range) {
        const btns = document.querySelectorAll('.filter-btn');
        btns.forEach(b => b.classList.remove('active'));

        if (['today','7days','30days'].includes(range)) {
            document.querySelector(`[data-range="${range}"]`)?.classList.add('active');
            filters.dateRange = range;
        } else if (range === 'month') {
            filters.dateRange = 'custom';
            // current month first/last day
            const now = new Date();
            const first = new Date(now.getFullYear(), now.getMonth(), 1);
            const last = new Date(now.getFullYear(), now.getMonth() + 1, 0);
            filters.startDate = formatDate(first);
            filters.endDate = formatDate(last);
            document.querySelector('.custom-date-range')?.classList.add('show');
            document.getElementById('start-date').value = filters.startDate;
            document.getElementById('end-date').value = filters.endDate;
        } else if (range === 'custom' && start && end) {
            filters.dateRange = 'custom';
            filters.startDate = start;
            filters.endDate = end;
            document.querySelector('.custom-date-range')?.classList.add('show');
            document.getElementById('start-date').value = start;
            document.getElementById('end-date').value = end;
        } else {
            // Fallback to 30days
            document.querySelector('[data-range="30days"]')?.classList.add('active');
            filters.dateRange = '30days';
        }
    } else {
        // Default to last 30 days
        const btns = document.querySelectorAll('.filter-btn');
        btns.forEach(b => b.classList.remove('active'));
        document.querySelector('[data-range="30days"]')?.classList.add('active');
        filters.dateRange = '30days';
    }
}

function activateTab(tabId) {
    const btns = document.querySelectorAll('.tab-btn');
    const views = document.querySelectorAll('.tab-content');
    btns.forEach(b => b.classList.remove('active'));
    views.forEach(v => v.classList.remove('active'));
    document.querySelector(`.tab-btn[data-tab="${tabId}"]`)?.classList.add('active');
    document.getElementById(`${tabId}-tab`)?.classList.add('active');
}

// ==================== AUTHENTICATION ====================

async function checkAuth() {
    const { data: { user } } = await supabase.auth.getUser();
    
    if (!user) {
        window.location.href = '/admin/login.html';
        return;
    }

    currentUser = user;

    const { data: profile } = await supabase
        .from('profiles')
        .select('*, roles(*)')
        .eq('id', user.id)
        .single();

    if (profile) {
        const emailEl = document.getElementById('user-email');
        if (emailEl) emailEl.textContent = user.email;
    }
}

// Logout
document.getElementById('logout-btn')?.addEventListener('click', async () => {
    await supabase.auth.signOut();
    window.location.href = '/admin/login.html';
});

// ==================== TAB NAVIGATION ====================

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

            // Load data for selected tab
            if (tabId === 'summary') {
                loadSummaryData();
            } else if (tabId === 'transactions') {
                loadTransactions();
            } else if (tabId === 'items') {
                loadItemsReport();
            }
        });
    });
}

// ==================== FILTERS ====================

function initializeFilters() {
    // Date range quick filters
    document.querySelectorAll('.filter-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
            e.target.classList.add('active');
            
            const range = e.target.dataset.range;
            filters.dateRange = range;

            if (range === 'custom') {
                document.querySelector('.custom-date-range').classList.add('show');
            } else {
                document.querySelector('.custom-date-range').classList.remove('show');
                setDefaultDateRange();
            }
        });
    });

    // Apply filters button
    document.getElementById('apply-filters').addEventListener('click', () => {
        updateFiltersFromForm();
        const activeTab = document.querySelector('.tab-btn.active').dataset.tab;
        
        if (activeTab === 'summary') {
            loadSummaryData();
        } else if (activeTab === 'transactions') {
            transactionsPagination.currentPage = 1;
            loadTransactions();
        } else if (activeTab === 'items') {
            itemsPagination.currentPage = 1;
            loadItemsReport();
        }
    });

    // Reset filters
    document.getElementById('reset-filters').addEventListener('click', () => {
        filters = {
            dateRange: '30days',
            startDate: null,
            endDate: null,
            paymentMethod: '',
            serviceType: '',
            status: ''
        };
        
        document.getElementById('filter-payment').value = '';
        document.getElementById('filter-service').value = '';
        document.getElementById('filter-status').value = '';
        
        document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
        document.querySelector('[data-range="30days"]').classList.add('active');
        document.querySelector('.custom-date-range').classList.remove('show');
        
        setDefaultDateRange();
        
        const activeTab = document.querySelector('.tab-btn.active').dataset.tab;
        if (activeTab === 'summary') {
            loadSummaryData();
        } else if (activeTab === 'transactions') {
            transactionsPagination.currentPage = 1;
            loadTransactions();
        } else if (activeTab === 'items') {
            itemsPagination.currentPage = 1;
            loadItemsReport();
        }
    });

    // Search transactions
    let transactionSearchTimeout;
    document.getElementById('search-transaction')?.addEventListener('input', (e) => {
        clearTimeout(transactionSearchTimeout);
        transactionSearchTimeout = setTimeout(() => {
            transactionsPagination.searchQuery = e.target.value;
            transactionsPagination.currentPage = 1;
            loadTransactions();
        }, 500);
    });

    // Search items
    let itemSearchTimeout;
    document.getElementById('search-item')?.addEventListener('input', (e) => {
        clearTimeout(itemSearchTimeout);
        itemSearchTimeout = setTimeout(() => {
            itemsPagination.searchQuery = e.target.value;
            itemsPagination.currentPage = 1;
            loadItemsReport();
        }, 500);
    });

    // Export buttons
    document.getElementById('export-transactions')?.addEventListener('click', exportTransactions);
    document.getElementById('export-items')?.addEventListener('click', exportItems);
}

function setDefaultDateRange() {
    const today = new Date();
    let startDate, endDate;

    switch (filters.dateRange) {
        case 'today':
            startDate = endDate = formatDate(today);
            break;
        case '7days':
            endDate = formatDate(today);
            startDate = formatDate(new Date(today.setDate(today.getDate() - 6)));
            break;
        case '30days':
            endDate = formatDate(new Date());
            startDate = formatDate(new Date(today.setDate(today.getDate() - 29)));
            break;
        default:
            return;
    }

    filters.startDate = startDate;
    filters.endDate = endDate;
    
    document.getElementById('start-date').value = startDate;
    document.getElementById('end-date').value = endDate;
}

function updateFiltersFromForm() {
    if (filters.dateRange === 'custom') {
        filters.startDate = document.getElementById('start-date').value;
        filters.endDate = document.getElementById('end-date').value;
    }
    
    filters.paymentMethod = document.getElementById('filter-payment').value;
    filters.serviceType = document.getElementById('filter-service').value;
    filters.status = document.getElementById('filter-status').value;
}

function buildFilterQuery(query) {
    if (filters.startDate) {
        query = query.gte('order_date', filters.startDate);
    }
    if (filters.endDate) {
        query = query.lte('order_date', filters.endDate);
    }
    if (filters.paymentMethod) {
        query = query.eq('payment_method', filters.paymentMethod);
    }
    if (filters.serviceType) {
        query = query.eq('service_type', filters.serviceType);
    }
    if (filters.status) {
        query = query.eq('status', filters.status);
    }
    return query;
}

// ==================== SUMMARY DASHBOARD ====================

async function loadSummaryData() {
    await Promise.all([
        loadKPIs(),
        loadRevenueChart(),
        loadPaymentChart()
    ]);
}

async function loadKPIs() {
    try {
        let query = supabase
            .from('report_sales_orders')
            .select('total_amount, total_qty, order_id');

        query = buildFilterQuery(query);

        const { data, error } = await query;

        if (error) throw error;

        const totalRevenue = data.reduce((sum, order) => sum + (order.total_amount || 0), 0);
        const totalOrders = data.length;
        const totalItems = data.reduce((sum, order) => sum + (order.total_qty || 0), 0);
        const avgOrderValue = totalOrders > 0 ? totalRevenue / totalOrders : 0;

        document.getElementById('kpi-revenue').textContent = formatCurrency(totalRevenue);
        document.getElementById('kpi-orders').textContent = totalOrders.toLocaleString('id-ID');
        document.getElementById('kpi-items').textContent = totalItems.toLocaleString('id-ID');
        document.getElementById('kpi-aov').textContent = formatCurrency(avgOrderValue);

    } catch (error) {
        console.error('Error loading KPIs:', error);
        showToast('Gagal memuat KPI', 'error');
    }
}

async function loadRevenueChart() {
    try {
        let query = supabase
            .from('report_sales_orders')
            .select('order_date, total_amount');

        query = buildFilterQuery(query);

        const { data, error } = await query;

        if (error) throw error;

        // Group by date
        const revenueByDate = {};
        data.forEach(order => {
            const date = order.order_date;
            if (!revenueByDate[date]) {
                revenueByDate[date] = 0;
            }
            revenueByDate[date] += order.total_amount || 0;
        });

        const dates = Object.keys(revenueByDate).sort();
        const revenues = dates.map(date => revenueByDate[date]);

        renderRevenueChart(dates, revenues);

    } catch (error) {
        console.error('Error loading revenue chart:', error);
        showToast('Gagal memuat grafik pendapatan', 'error');
    }
}

function renderRevenueChart(labels, data) {
    const ctx = document.getElementById('revenue-chart');
    
    if (revenueChart) {
        revenueChart.destroy();
    }

    revenueChart = new Chart(ctx, {
        type: 'line',
        data: {
            labels: labels.map(date => formatDateShort(date)),
            datasets: [{
                label: 'Pendapatan',
                data: data,
                borderColor: '#667eea',
                backgroundColor: 'rgba(102, 126, 234, 0.1)',
                borderWidth: 2,
                fill: true,
                tension: 0.4
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: true,
            plugins: {
                legend: {
                    display: false
                },
                tooltip: {
                    callbacks: {
                        label: function(context) {
                            return 'Rp ' + context.parsed.y.toLocaleString('id-ID');
                        }
                    }
                }
            },
            scales: {
                y: {
                    beginAtZero: true,
                    ticks: {
                        callback: function(value) {
                            return 'Rp ' + (value / 1000) + 'k';
                        }
                    }
                }
            }
        }
    });
}

async function loadPaymentChart() {
    try {
        let query = supabase
            .from('report_sales_orders')
            .select('payment_method, total_amount');

        query = buildFilterQuery(query);

        const { data, error } = await query;

        if (error) throw error;

        // Group by payment method
        const revenueByMethod = {};
        data.forEach(order => {
            const method = order.payment_method || 'Unknown';
            if (!revenueByMethod[method]) {
                revenueByMethod[method] = 0;
            }
            revenueByMethod[method] += order.total_amount || 0;
        });

        const methods = Object.keys(revenueByMethod);
        const revenues = methods.map(method => revenueByMethod[method]);

        renderPaymentChart(methods, revenues);

    } catch (error) {
        console.error('Error loading payment chart:', error);
        showToast('Gagal memuat grafik metode pembayaran', 'error');
    }
}

function renderPaymentChart(labels, data) {
    const ctx = document.getElementById('payment-chart');
    
    if (paymentChart) {
        paymentChart.destroy();
    }

    const colors = ['#667eea', '#f093fb', '#4facfe', '#43e97b', '#fa709a'];

    paymentChart = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: labels.map(l => l.charAt(0).toUpperCase() + l.slice(1)),
            datasets: [{
                label: 'Pendapatan',
                data: data,
                backgroundColor: colors,
                borderWidth: 0
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: true,
            plugins: {
                legend: {
                    display: false
                },
                tooltip: {
                    callbacks: {
                        label: function(context) {
                            return 'Rp ' + context.parsed.y.toLocaleString('id-ID');
                        }
                    }
                }
            },
            scales: {
                y: {
                    beginAtZero: true,
                    ticks: {
                        callback: function(value) {
                            return 'Rp ' + (value / 1000) + 'k';
                        }
                    }
                }
            }
        }
    });
}

// ==================== TRANSACTIONS TABLE ====================

async function loadTransactions() {
    const tbody = document.getElementById('transactions-list');
    tbody.innerHTML = '<tr><td colspan="8" class="text-center">Memuat data...</td></tr>';

    try {
        // Count total records
        let countQuery = supabase
            .from('report_sales_orders')
            .select('*', { count: 'exact', head: true });

        countQuery = buildFilterQuery(countQuery);

        if (transactionsPagination.searchQuery) {
            countQuery = countQuery.or(`payment_code.ilike.%${transactionsPagination.searchQuery}%,contact_name.ilike.%${transactionsPagination.searchQuery}%,contact_phone.ilike.%${transactionsPagination.searchQuery}%`);
        }

        const { count } = await countQuery;
        transactionsPagination.totalRecords = count || 0;

        // Fetch data
        let query = supabase
            .from('report_sales_orders')
            .select('*')
            .order(transactionsPagination.sortBy, { ascending: transactionsPagination.sortOrder === 'asc' })
            .range(
                (transactionsPagination.currentPage - 1) * transactionsPagination.pageSize,
                transactionsPagination.currentPage * transactionsPagination.pageSize - 1
            );

        query = buildFilterQuery(query);

        if (transactionsPagination.searchQuery) {
            query = query.or(`payment_code.ilike.%${transactionsPagination.searchQuery}%,contact_name.ilike.%${transactionsPagination.searchQuery}%,contact_phone.ilike.%${transactionsPagination.searchQuery}%`);
        }

        const { data, error } = await query;

        if (error) throw error;

        if (!data || data.length === 0) {
            tbody.innerHTML = '<tr><td colspan="8" class="text-center">Tidak ada data transaksi</td></tr>';
            renderPagination('transactions-pagination', transactionsPagination, loadTransactions);
            return;
        }

        tbody.innerHTML = data.map(order => {
            const serviceInfo = order.service_type === 'dine-in' && order.table_no 
                ? `Dine-in (Meja ${order.table_no})` 
                : order.service_type === 'take-away' ? 'Take-away' : order.service_type;

            return `
            <tr>
                <td>${formatDateShort(order.order_date)} ${order.order_time || ''}</td>
                <td><strong>${order.payment_code || '-'}</strong></td>
                <td><span class="service-badge">${serviceInfo}</span></td>
                <td><span class="payment-badge ${order.payment_method}">${formatPaymentMethod(order.payment_method)}</span></td>
                <td>${order.total_qty || 0}</td>
                <td class="text-right"><strong>${formatCurrency(order.total_amount)}</strong></td>
                <td><span class="status-badge ${order.status}">${formatStatus(order.status)}</span></td>
                <td>
                    <button class="btn btn-small btn-secondary" onclick="viewOrderDetail('${order.order_id}')">Detail</button>
                </td>
            </tr>`;
        }).join('');

        renderPagination('transactions-pagination', transactionsPagination, loadTransactions);
        setupTableSorting('transactions-table', transactionsPagination, loadTransactions);

    } catch (error) {
        console.error('Error loading transactions:', error);
        showToast('Gagal memuat data transaksi', 'error');
        tbody.innerHTML = '<tr><td colspan="8" class="text-center">Gagal memuat data</td></tr>';
    }
}

// View order detail modal
window.viewOrderDetail = async function(orderId) {
    const modal = document.getElementById('order-detail-modal');
    const content = document.getElementById('order-detail-content');
    
    modal.classList.add('active');
    content.innerHTML = '<div class="loading">Memuat detail...</div>';

    try {
        // Get order header
        const { data: order, error: orderError } = await supabase
            .from('report_sales_orders')
            .select('*')
            .eq('order_id', orderId)
            .single();

        if (orderError) throw orderError;

        // Get order items
        const { data: items, error: itemsError } = await supabase
            .from('report_sales_detail')
            .select('*')
            .eq('order_id', orderId);

        if (itemsError) throw itemsError;

        const serviceInfo = order.service_type === 'dine-in' && order.table_no 
            ? `Dine-in (Meja ${order.table_no})` 
            : order.service_type === 'take-away' ? 'Take-away' : order.service_type;

        content.innerHTML = `
            <div class="order-detail-header">
                <div class="order-detail-item">
                    <div class="order-detail-label">Kode Pembayaran</div>
                    <div class="order-detail-value">${order.payment_code || '-'}</div>
                </div>
                <div class="order-detail-item">
                    <div class="order-detail-label">Tanggal & Waktu</div>
                    <div class="order-detail-value">${formatDateShort(order.order_date)} ${order.order_time || ''}</div>
                </div>
                <div class="order-detail-item">
                    <div class="order-detail-label">Layanan</div>
                    <div class="order-detail-value">${serviceInfo}</div>
                </div>
                <div class="order-detail-item">
                    <div class="order-detail-label">Metode Pembayaran</div>
                    <div class="order-detail-value">${formatPaymentMethod(order.payment_method)}</div>
                </div>
                <div class="order-detail-item">
                    <div class="order-detail-label">Status</div>
                    <div class="order-detail-value"><span class="status-badge ${order.status}">${formatStatus(order.status)}</span></div>
                </div>
                ${order.contact_name ? `
                <div class="order-detail-item">
                    <div class="order-detail-label">Kontak</div>
                    <div class="order-detail-value">${order.contact_name}${order.contact_phone ? ` (${order.contact_phone})` : ''}</div>
                </div>` : ''}
            </div>

            <h4 style="margin-bottom: 1rem;">Item Pesanan</h4>
            <ul class="order-items-list">
                ${items.map(item => `
                    <li>
                        <div class="item-info">
                            <div class="item-name">${item.menu_name || 'Unknown'}</div>
                                <div class="item-qty">Qty: ${item.qty ?? item.quantity ?? 0}</div>
                            ${item.options_summary ? `<div class="item-options">${item.options_summary}</div>` : ''}
                        </div>
                        <div class="item-price">
                            <div class="item-total">${formatCurrency(item.line_total)}</div>
                        </div>
                    </li>
                `).join('')}
            </ul>

            <div class="order-total">
                <span>Total</span>
                <span>${formatCurrency(order.total_amount)}</span>
            </div>
        `;

    } catch (error) {
        console.error('Error loading order detail:', error);
        content.innerHTML = '<div class="loading">Gagal memuat detail pesanan</div>';
        showToast('Gagal memuat detail pesanan', 'error');
    }
}

window.closeOrderDetailModal = function() {
    document.getElementById('order-detail-modal').classList.remove('active');
}

// ==================== ITEMS REPORT ====================

// Aggregate per item from report_sales_detail (Solution A)
async function loadItemsReport() {
    const tbody = document.getElementById('items-list');
    tbody.innerHTML = '<tr><td colspan="5" class="text-center">Memuat data...</td></tr>';

    try {
        // Pull detailed rows (without menu_name as requested), then aggregate client-side
        let query = supabase
            .from('report_sales_detail')
            // Option A: tanpa menu_name (belum ada di view)
            .select('order_date, menu_id, qty, base_unit_price, final_unit_price, line_total, payment_method, service_type, status');

        // Apply global filters safely (uses gte/lte etc.)
        query = buildFilterQuery(query);

        // Optional search by menu name
        // Tidak bisa ilike menu_name karena kolom tidak ada; pencarian dilakukan setelah agregasi

        const { data, error } = await query;
        if (error) throw error;

        if (!data || data.length === 0) {
            tbody.innerHTML = '<tr><td colspan="5" class="text-center">Belum ada data di rentang ini</td></tr>';
            itemsPagination.totalRecords = 0;
            renderPagination('items-pagination', itemsPagination, loadItemsReport);
            // Clear top items chart as well
            renderTopItemsChart([], []);
            return;
        }

        // Aggregate per menu_id
        const aggMap = new Map();
        let grandRevenue = 0;
        data.forEach(row => {
            const key = row.menu_id ?? 'unknown';
            const qty = Number(row.qty ?? row.quantity) || 0;
            const revenue = Number(row.line_total) || 0;
            grandRevenue += revenue;
            if (!aggMap.has(key)) {
                aggMap.set(key, {
                    menu_id: row.menu_id ?? null,
                    menu_name: row.menu_id != null ? `Menu ${row.menu_id}` : 'Unknown',
                    total_qty: 0,
                    total_revenue: 0,
                    price_acc: 0,
                    price_count: 0
                });
            }
            const rec = aggMap.get(key);
            rec.total_qty += qty;
            rec.total_revenue += revenue;
            const priceUnit = (row.final_unit_price ?? row.base_unit_price);
            if (priceUnit != null) {
                rec.price_acc += Number(priceUnit) || 0;
                rec.price_count += 1;
            }
        });

        let aggList = Array.from(aggMap.values()).map(r => ({
            ...r,
            avg_price: r.price_count > 0 ? r.price_acc / r.price_count : (r.total_qty ? r.total_revenue / r.total_qty : 0),
            contribution_pct: grandRevenue > 0 ? (r.total_revenue / grandRevenue) * 100 : 0
        }));

        // Sorting
        const sortKey = itemsPagination.sortBy;
        const asc = itemsPagination.sortOrder === 'asc';
        aggList.sort((a, b) => {
            const va = a[sortKey];
            const vb = b[sortKey];
            if (typeof va === 'string') {
                return asc ? va.localeCompare(vb) : vb.localeCompare(va);
            }
            return asc ? (va - vb) : (vb - va);
        });

        // Total records and pagination
        itemsPagination.totalRecords = aggList.length;
        const start = (itemsPagination.currentPage - 1) * itemsPagination.pageSize;
        const end = itemsPagination.currentPage * itemsPagination.pageSize;
        const pageRows = aggList.slice(start, end);

        if (pageRows.length === 0) {
            tbody.innerHTML = '<tr><td colspan="5" class="text-center">Belum ada data di rentang ini</td></tr>';
        } else {
            tbody.innerHTML = pageRows.map(item => `
                <tr>
                    <td><strong>${item.menu_name || 'Unknown'}</strong></td>
                    <td>${item.total_qty || 0}</td>
                    <td class="text-right"><strong>${formatCurrency(item.total_revenue)}</strong></td>
                    <td class="text-right">${formatCurrency(item.avg_price)}</td>
                    <td>${(item.contribution_pct || 0).toFixed(2)}%</td>
                </tr>
            `).join('');
        }

        renderPagination('items-pagination', itemsPagination, loadItemsReport);
        setupTableSorting('items-table', itemsPagination, loadItemsReport);

        // Load top items chart from aggregated data
        renderTopItemsFromAgg(aggList);

    } catch (error) {
        console.error('Error loading items report:', error);
        showToast('Gagal memuat laporan per item', 'error');
        tbody.innerHTML = '<tr><td colspan="5" class="text-center">Gagal memuat data</td></tr>';
    }
}

async function loadTopItemsChart() {
    // Kept for compatibility; actual rendering now uses aggregated data from loadItemsReport
    // to ensure consistent filtering and avoid invalid filters on non-existent columns.
}

function renderTopItemsFromAgg(aggList) {
    const top = [...aggList]
        .sort((a, b) => b.total_revenue - a.total_revenue)
        .slice(0, 10);
    const labels = top.map(i => i.menu_name || 'Unknown');
    const revenues = top.map(i => i.total_revenue || 0);
    renderTopItemsChart(labels, revenues);
}

function renderTopItemsChart(labels, data) {
    const ctx = document.getElementById('top-items-chart');
    
    if (topItemsChart) {
        topItemsChart.destroy();
    }

    const colors = ['#667eea', '#764ba2', '#f093fb', '#f5576c', '#4facfe', 
                    '#00f2fe', '#43e97b', '#38f9d7', '#fa709a', '#fee140'];

    topItemsChart = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: labels,
            datasets: [{
                label: 'Total Revenue',
                data: data,
                backgroundColor: colors,
                borderWidth: 0
            }]
        },
        options: {
            indexAxis: 'y',
            responsive: true,
            maintainAspectRatio: true,
            plugins: {
                legend: {
                    display: false
                },
                tooltip: {
                    callbacks: {
                        label: function(context) {
                            return 'Rp ' + context.parsed.x.toLocaleString('id-ID');
                        }
                    }
                }
            },
            scales: {
                x: {
                    beginAtZero: true,
                    ticks: {
                        callback: function(value) {
                            return 'Rp ' + (value / 1000) + 'k';
                        }
                    }
                }
            }
        }
    });
}

// ==================== TABLE UTILITIES ====================

function setupTableSorting(tableId, pagination, loadFunction) {
    const table = document.getElementById(tableId);
    const headers = table.querySelectorAll('th[data-sort]');

    headers.forEach(header => {
        header.addEventListener('click', () => {
            const sortBy = header.dataset.sort;

            if (pagination.sortBy === sortBy) {
                pagination.sortOrder = pagination.sortOrder === 'asc' ? 'desc' : 'asc';
            } else {
                pagination.sortBy = sortBy;
                pagination.sortOrder = 'desc';
            }

            // Update UI
            headers.forEach(h => {
                h.classList.remove('sorted-asc', 'sorted-desc');
            });
            header.classList.add(pagination.sortOrder === 'asc' ? 'sorted-asc' : 'sorted-desc');

            pagination.currentPage = 1;
            loadFunction();
        });
    });
}

function renderPagination(containerId, pagination, loadFunction) {
    const container = document.getElementById(containerId);
    const totalPages = Math.ceil(pagination.totalRecords / pagination.pageSize);

    if (totalPages <= 1) {
        container.innerHTML = '';
        return;
    }

    const pages = [];
    const maxVisiblePages = 5;
    let startPage = Math.max(1, pagination.currentPage - Math.floor(maxVisiblePages / 2));
    let endPage = Math.min(totalPages, startPage + maxVisiblePages - 1);

    if (endPage - startPage < maxVisiblePages - 1) {
        startPage = Math.max(1, endPage - maxVisiblePages + 1);
    }

    let html = `
        <button ${pagination.currentPage === 1 ? 'disabled' : ''} onclick="changePage(${pagination.currentPage - 1}, '${containerId}')">‹ Prev</button>
    `;

    if (startPage > 1) {
        html += `<button onclick="changePage(1, '${containerId}')">1</button>`;
        if (startPage > 2) html += `<span>...</span>`;
    }

    for (let i = startPage; i <= endPage; i++) {
        html += `<button class="${i === pagination.currentPage ? 'active' : ''}" onclick="changePage(${i}, '${containerId}')">${i}</button>`;
    }

    if (endPage < totalPages) {
        if (endPage < totalPages - 1) html += `<span>...</span>`;
        html += `<button onclick="changePage(${totalPages}, '${containerId}')">${totalPages}</button>`;
    }

    html += `
        <button ${pagination.currentPage === totalPages ? 'disabled' : ''} onclick="changePage(${pagination.currentPage + 1}, '${containerId}')">Next ›</button>
        <span class="pagination-info">${pagination.totalRecords} total</span>
    `;

    container.innerHTML = html;
}

window.changePage = function(page, containerId) {
    if (containerId.includes('transactions')) {
        transactionsPagination.currentPage = page;
        loadTransactions();
    } else if (containerId.includes('items')) {
        itemsPagination.currentPage = page;
        loadItemsReport();
    }
}

// ==================== EXPORT CSV ====================

async function exportTransactions() {
    try {
        showToast('Mengekspor data transaksi...', 'info');

        let query = supabase
            .from('report_sales_orders')
            .select('*')
            .order('order_date', { ascending: false });

        query = buildFilterQuery(query);

        if (transactionsPagination.searchQuery) {
            query = query.or(`payment_code.ilike.%${transactionsPagination.searchQuery}%,contact_name.ilike.%${transactionsPagination.searchQuery}%`);
        }

        const { data, error } = await query;

        if (error) throw error;

        const csv = convertToCSV(data, [
            { key: 'order_date', label: 'Tanggal' },
            { key: 'order_time', label: 'Waktu' },
            { key: 'payment_code', label: 'Kode Pembayaran' },
            { key: 'service_type', label: 'Tipe Layanan' },
            { key: 'table_no', label: 'No Meja' },
            { key: 'payment_method', label: 'Metode Bayar' },
            { key: 'total_qty', label: 'Total Qty' },
            { key: 'total_amount', label: 'Total Amount' },
            { key: 'status', label: 'Status' }
        ]);

        downloadCSV(csv, `transaksi-${new Date().toISOString().split('T')[0]}.csv`);
        showToast('Data transaksi berhasil diekspor', 'success');

    } catch (error) {
        console.error('Error exporting transactions:', error);
        showToast('Gagal mengekspor data transaksi', 'error');
    }
}

async function exportItems() {
    try {
        showToast('Mengekspor data per item...', 'info');

        // Fetch detail with filters (without menu_name), aggregate, then export full aggregated list (ignore pagination)
        let query = supabase
            .from('report_sales_detail')
            .select('order_date, menu_id, qty, base_unit_price, final_unit_price, line_total, payment_method, service_type, status');

        query = buildFilterQuery(query);

        // Tidak ada kolom menu_name; pencarian nanti di agregasi

        const { data, error } = await query;
        if (error) throw error;

        // Aggregate (reuse logic)
        const aggMap = new Map();
        let grandRevenue = 0;
        data.forEach(row => {
            const key = row.menu_id ?? 'unknown';
            const qty = Number(row.qty ?? row.quantity) || 0;
            const revenue = Number(row.line_total) || 0;
            grandRevenue += revenue;
            if (!aggMap.has(key)) {
                aggMap.set(key, {
                    menu_id: row.menu_id ?? null,
                    menu_name: row.menu_id != null ? `Menu ${row.menu_id}` : 'Unknown',
                    total_qty: 0,
                    total_revenue: 0,
                    price_acc: 0,
                    price_count: 0
                });
            }
            const rec = aggMap.get(key);
            rec.total_qty += qty;
            rec.total_revenue += revenue;
            const priceUnit = (row.final_unit_price ?? row.base_unit_price);
            if (priceUnit != null) {
                rec.price_acc += Number(priceUnit) || 0;
                rec.price_count += 1;
            }
        });

        let aggList = Array.from(aggMap.values()).map(r => ({
            menu_id: r.menu_id,
            menu_name: r.menu_name,
            total_qty: r.total_qty,
            total_revenue: r.total_revenue,
            avg_price: r.price_count > 0 ? r.price_acc / r.price_count : (r.total_qty ? r.total_revenue / r.total_qty : 0),
            contribution_pct: grandRevenue > 0 ? (r.total_revenue / grandRevenue) * 100 : 0
        }));

        // Pencarian lokal berdasarkan menu_name sintetis atau menu_id
        if (itemsPagination.searchQuery) {
            const q = itemsPagination.searchQuery.toLowerCase();
            aggList = aggList.filter(r => r.menu_name.toLowerCase().includes(q) || String(r.menu_id).includes(q));
        }

        // Sort by revenue desc for export
        aggList.sort((a, b) => b.total_revenue - a.total_revenue);

        const csv = convertToCSV(aggList, [
            { key: 'menu_id', label: 'Menu ID' },
            { key: 'menu_name', label: 'Nama Menu (Sintetis)' },
            { key: 'total_qty', label: 'Total Qty' },
            { key: 'total_revenue', label: 'Total Revenue' },
            { key: 'avg_price', label: 'Harga Rata-rata' },
            { key: 'contribution_pct', label: 'Kontribusi %' }
        ]);

        downloadCSV(csv, `item-menu-${new Date().toISOString().split('T')[0]}.csv`);
        showToast('Data per item berhasil diekspor', 'success');

    } catch (error) {
        console.error('Error exporting items:', error);
        showToast('Gagal mengekspor data per item', 'error');
    }
}

function convertToCSV(data, columns) {
    const headers = columns.map(col => col.label).join(',');
    const rows = data.map(row => {
        return columns.map(col => {
            let value = row[col.key] || '';
            // Escape commas and quotes
            if (typeof value === 'string' && (value.includes(',') || value.includes('"'))) {
                value = `"${value.replace(/"/g, '""')}"`;
            }
            return value;
        }).join(',');
    });
    return [headers, ...rows].join('\n');
}

function downloadCSV(csv, filename) {
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', filename);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
}

// ==================== UTILITY FUNCTIONS ====================

function formatCurrency(amount) {
    return 'Rp ' + (amount || 0).toLocaleString('id-ID', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
}

function formatDate(date) {
    const d = new Date(date);
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

function formatDateShort(dateStr) {
    if (!dateStr) return '-';
    const [year, month, day] = dateStr.split('-');
    return `${day}/${month}/${year}`;
}

function formatPaymentMethod(method) {
    const methods = {
        'cash': 'Cash',
        'transfer': 'Transfer',
        'qris': 'QRIS',
        'ewallet': 'E-Wallet'
    };
    return methods[method] || method;
}

function formatStatus(status) {
    const statuses = {
        'paid': 'Paid',
        'placed': 'Placed',
        'preparing': 'Preparing',
        'ready': 'Ready',
        'completed': 'Completed',
        'cancelled': 'Cancelled'
    };
    return statuses[status] || status;
}

// Close modal on outside click
window.addEventListener('click', (e) => {
    if (e.target.classList.contains('modal')) {
        e.target.classList.remove('active');
    }
});
