/* ===================================================
   Sistem Penjadwalan Kontrol RS - App Logic
   =================================================== */

(function () {
    'use strict';

    // =============================================
    // STATE & CONFIG (Sesuai PRD Lengkap)
    // =============================================
    const CONFIG = {
        adminUser: 'rbbn77',
        adminPass: '123098',
        doctors: {
            panji: {
                id: 'panji',
                name: 'dr. Panji Gugag B. S.PD',
                // Kuota Harian (0=Minggu, 1=Senin, 2=Selasa, dll)
                quotaRules: { 1: 7, 2: 5, 3: 7, 4: 7, 5: 0, 6: 0, 0: 0 }
            },
            setyo: {
                id: 'setyo',
                name: 'dr. Setyo Anestyo S.S',
                quotaRules: { 1: 10, 2: 10, 3: 10, 4: 10, 5: 10, 6: 0, 0: 0 }
            },
            indah: {
                id: 'indah',
                name: 'dr. Indah Lestari Sp.A',
                quotaRules: { 1: 8, 2: 8, 3: 8, 4: 8, 5: 8, 6: 0, 0: 0 }
            }
        },
        holidays: ['2026-08-17', '2026-08-19'] // Hari libur simulasi
    };

    let state = {
        editingPatientId: null,
        currentUser: null,        // Data user yang login { username, role, display_name }
        activePage: 'dashboard',
        patients: [],
        dateOverrides: {},
        calendarMonth: new Date().getMonth(),
        calendarYear: new Date().getFullYear(),
        calendarDPJP: 'panji',
        calendarUnit: 'ranap',
        calendarMonthRajal: new Date().getMonth(),
        calendarYearRajal: new Date().getFullYear(),
        calendarDPJPRajal: 'panji'
    };

    const $ = (sel) => document.querySelector(sel);
    const $$ = (sel) => document.querySelectorAll(sel);

    // =============================================
    // API HELPERS
    // =============================================
    const API_BASE = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
        ? 'http://localhost:8001'
        : '';

    const api = {
        _headers() {
            const h = { 'Content-Type': 'application/json' };
            const token = sessionStorage.getItem('rs_auth_token');
            if (token) h['Authorization'] = `Bearer ${token}`;
            return h;
        },
        async get(url) {
            const res = await fetch(`${API_BASE}${url}`, { headers: this._headers() });
            if (res.status === 401) { doLogout(); throw new Error('Sesi berakhir'); }
            if (!res.ok) throw new Error(await res.text());
            return res.json();
        },
        async post(url, body) {
            const res = await fetch(`${API_BASE}${url}`, {
                method: 'POST',
                headers: this._headers(),
                body: JSON.stringify(body)
            });
            if (res.status === 401) { doLogout(); throw new Error('Sesi berakhir'); }
            if (!res.ok) {
                const err = await res.json();
                throw new Error(err.detail || 'Request gagal');
            }
            return res.json();
        },
        async put(url, body) {
            const res = await fetch(`${API_BASE}${url}`, {
                method: 'PUT',
                headers: this._headers(),
                body: JSON.stringify(body)
            });
            if (res.status === 401) { doLogout(); throw new Error('Sesi berakhir'); }
            if (!res.ok) {
                const err = await res.json();
                throw new Error(err.detail || 'Request gagal');
            }
            return res.json();
        },
        async del(url) {
            const res = await fetch(`${API_BASE}${url}`, { method: 'DELETE', headers: this._headers() });
            if (res.status === 401) { doLogout(); throw new Error('Sesi berakhir'); }
            if (!res.ok) {
                const err = await res.json();
                throw new Error(err.detail || 'Request gagal');
            }
            return res.json();
        }
    };

    // Konversi format: Backend API → Front-end state
    function mapPatientFromAPI(p) {
        return {
            id: p.id,
            name: p.name,
            rm: p.rm_number,
            hp: p.phone,
            dpjp: p.doctor_id,
            unit: p.unit,
            date: p.schedule_date,
            catatan: p.notes || ''
        };
    }

    // Konversi format: Front-end state → Backend API
    function mapPatientToAPI(p) {
        return {
            name: p.name,
            rm_number: p.rm,
            phone: p.hp,
            doctor_id: p.dpjp,
            unit: p.unit,
            schedule_date: p.date,
            notes: p.catatan || ''
        };
    }

    // =============================================
    // DATA LOADING (dari Backend API)
    // =============================================
    async function loadState() {
        try {
            // Ambil data dokter dari API
            const doctors = await api.get('/api/doctors');
            doctors.forEach(doc => {
                CONFIG.doctors[doc.id] = {
                    id: doc.id,
                    name: doc.name,
                    quotaRules: {}
                };
                Object.entries(doc.quota_rules).forEach(([k, v]) => {
                    CONFIG.doctors[doc.id].quotaRules[parseInt(k)] = v;
                });
            });

            // Ambil data pasien dari API
            const patients = await api.get('/api/patients');
            state.patients = patients.map(mapPatientFromAPI);

            // Ambil data overrides dari API
            const overrides = await api.get('/api/overrides');
            state.dateOverrides = {};
            overrides.forEach(o => {
                const key = `${o.override_date}_${o.doctor_id}`;
                state.dateOverrides[key] = { status: o.status };
                if (o.custom_quota !== null && o.custom_quota !== undefined) {
                    state.dateOverrides[key].quota = o.custom_quota;
                }
            });

            // Ambil hari libur dari API
            const holidays = await api.get('/api/holidays');
            CONFIG.holidays = holidays.map(h => h.date);

        } catch (err) {
            console.error('Gagal memuat data dari server:', err);
            showToast('⚠️ Gagal terhubung ke server. Pastikan backend berjalan.');
        }
    }

    // saveState tidak lagi diperlukan untuk data utama (sudah di API)
    function saveState() { }

    function generateId() { return Math.random().toString(36).substr(2, 9); }
    function toDateString(y, m, d) { return `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`; }
    function getTodayStr() { const d = new Date(); return toDateString(d.getFullYear(), d.getMonth(), d.getDate()); }

    function formatDateIndo(dateStr) {
        if (!dateStr) return '';
        const d = new Date(dateStr);
        const days = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];
        const months = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agt', 'Sep', 'Okt', 'Nov', 'Des'];
        return `${days[d.getDay()]}, ${d.getDate()} ${months[d.getMonth()]} ${d.getFullYear()}`;
    }

    // maskRM dihapus - No. RM ditampilkan penuh
    function maskRM(rm) { return rm || ''; }

    function showToast(msg) {
        const c = $('#toastContainer');
        const t = document.createElement('div');
        t.className = `toast`;
        t.textContent = msg;
        c.appendChild(t);
        setTimeout(() => { t.style.opacity = '0'; setTimeout(() => t.remove(), 300); }, 3000);
    }

    // =============================================
    // BUSINESS LOGIC
    // =============================================
    function getQuota(dateStr, dpjpId, unit = 'ranap', excludeId = null) {
        const dateObj = new Date(dateStr);
        const dayOfWeek = dateObj.getDay();
        const doc = CONFIG.doctors[dpjpId];
        let maxQuota = doc ? doc.quotaRules[dayOfWeek] : 0;

        let isHoliday = CONFIG.holidays.includes(dateStr);
        let override = state.dateOverrides[`${dateStr}_${dpjpId}`];
        if (!override) {
            // Backward compatibility for old string-based global overrides
            const globalOverride = state.dateOverrides[dateStr];
            if (typeof globalOverride === 'string') {
                override = { status: globalOverride };
            }
        }

        let status = '';
        if (override && override.status === 'buka') {
            status = 'override_buka';
            if (override.quota !== undefined && !isNaN(override.quota)) {
                maxQuota = override.quota;
            } else if (maxQuota === 0) {
                maxQuota = 10;
            }
        } else if (override && override.status === 'tutup') {
            status = 'override_tutup';
            maxQuota = 0;
        } else if (isHoliday || maxQuota === 0) {
            status = 'tutup';
            maxQuota = 0;
        } else {
            status = 'buka';
        }

        const targetUnit = unit || 'ranap';
        const booked = state.patients.filter(p => p.date === dateStr && p.dpjp === dpjpId && (p.unit || 'ranap') === targetUnit && p.id !== excludeId).length;
        const available = Math.max(0, maxQuota - booked);

        return { maxQuota, booked, available, status, unit: targetUnit };
    }

    // =============================================
    // NAVIGATION
    // =============================================
    let navInitialized = false;

    function toggleMobileSidebar() {
        const sidebar = $('#sidebar');
        const hamburgerBtn = $('#hamburgerBtn');
        const overlay = $('#sidebarOverlay');
        if (sidebar && hamburgerBtn && overlay) {
            const isOpen = sidebar.classList.toggle('open');
            hamburgerBtn.classList.toggle('open', isOpen);
            overlay.classList.toggle('active', isOpen);
        }
    }

    function closeMobileSidebar() {
        const sidebar = $('#sidebar');
        const hamburgerBtn = $('#hamburgerBtn');
        const overlay = $('#sidebarOverlay');
        if (sidebar) sidebar.classList.remove('open');
        if (hamburgerBtn) hamburgerBtn.classList.remove('open');
        if (overlay) overlay.classList.remove('active');
    }

    function initNav() {
        if (navInitialized) return;
        navInitialized = true;

        $$('.nav-item, .card-action').forEach(el => {
            el.addEventListener('click', (e) => {
                e.preventDefault();
                const page = el.dataset.page || el.dataset.goto;
                if (!page) return;
                switchPage(page);
                closeMobileSidebar();
            });
        });

        // Hamburger Menu & Overlay for Mobile
        const hamburger = $('#hamburgerBtn');
        const overlay = $('#sidebarOverlay');

        if (hamburger) {
            hamburger.addEventListener('click', (e) => {
                e.preventDefault();
                toggleMobileSidebar();
            });
        }

        if (overlay) {
            overlay.addEventListener('click', (e) => {
                e.preventDefault();
                closeMobileSidebar();
            });
        }
    }

    function switchPage(pageId) {
        state.activePage = pageId;
        $$('.page-content').forEach(p => p.classList.remove('active'));
        $$('.nav-item').forEach(n => n.classList.remove('active'));

        const pageEl = $(`#page-${pageId}`);
        if (pageEl) pageEl.classList.add('active');

        const navEl = $(`#nav-${pageId}`);
        if (navEl) navEl.classList.add('active');

        // Titles
        const titles = {
            'dashboard': 'Dashboard Utama',
            'dashboard-rajal': 'Dashboard Admin (Rajal)',
            'pasien': 'Data Pasien Kontrol',
            'pasien-rajal': 'Data Pasien Rawat Jalan (Rajal)',
            'kuota': 'Kelola Kuota & Tanggal'
        };
        $('#pageTitle').textContent = titles[pageId] || '';

        renderApp();
    }

    // =============================================
    // RENDERING
    // =============================================
    function renderApp() {
        renderAdminUI();
        if (state.activePage === 'dashboard') {
            renderDashboardStats();
            renderMiniCalendar();
            renderQuotaBars();
        } else if (state.activePage === 'dashboard-rajal') {
            renderDashboardStatsRajal();
            renderMiniCalendarRajal();
            renderQuotaBarsRajal();
        } else if (state.activePage === 'pasien') {
            renderTablePasien();
        } else if (state.activePage === 'pasien-rajal') {
            renderTablePasienRajal();
        }
    }

    function renderAdminUI() {
        const isAdmin = state.currentUser && state.currentUser.role === 'admin_rajal';

        // Update user profile in sidebar
        if (state.currentUser) {
            const u = state.currentUser;
            $('#userDisplayName').textContent = u.display_name;
            $('#userRoleLabel').textContent = u.role === 'admin_rajal' ? 'Admin Rajal' : 'Rawat Inap';
            $('#userAvatar').textContent = u.role === 'admin_rajal' ? 'AD' : 'PR';
            $('#userAvatar').style.background = u.role === 'admin_rajal' ? 'var(--burgundy)' : '';
        }

        // Show/hide admin menu items based on role
        $$('.admin-hidden').forEach(el => {
            el.style.display = isAdmin ? 'flex' : 'none';
        });

        // Redirect if non-admin tries to access admin pages
        if (!isAdmin && ['kuota', 'dashboard-rajal', 'pasien-rajal'].includes(state.activePage)) {
            switchPage('dashboard');
        }
    }

    // Login/Logout functions
    function doLogout() {
        sessionStorage.removeItem('rs_auth_token');
        state.currentUser = null;
        state.patients = [];
        state.dateOverrides = {};
        $('#loginScreen').style.display = 'flex';
        $('#sidebar').style.display = 'none';
        $('#mainContent').style.display = 'none';
    }

    function showApp() {
        $('#loginScreen').style.display = 'none';
        $('#sidebar').style.display = '';
        $('#mainContent').style.display = '';
    }

    function renderDashboardStats() {
        const today = getTodayStr();
        const ptsTodayRanap = state.patients.filter(p => p.date === today && (p.unit || 'ranap') === 'ranap');

        $('#valJadwalHariIni').textContent = ptsTodayRanap.length;

        let totalAvailableRanap = 0;
        Object.keys(CONFIG.doctors).forEach(docId => {
            totalAvailableRanap += getQuota(today, docId, 'ranap').available;
        });

        $('#valKuotaTersedia').textContent = `${totalAvailableRanap}`;
        $('#valPasienBaru').textContent = state.patients.filter(p => (p.unit || 'ranap') === 'ranap').length;
    }

    function renderMiniCalendar() {
        const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agt', 'Sep', 'Okt', 'Nov', 'Des'];
        $('#calMonthLabel').textContent = `${monthNames[state.calendarMonth]} ${state.calendarYear}`;

        const grid = $('#miniCalendar');
        let html = '<div class="cal-grid">';
        const dayLabels = ['Min', 'Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab'];
        dayLabels.forEach(d => html += `<div class="cal-day-label">${d}</div>`);

        const firstDay = new Date(state.calendarYear, state.calendarMonth, 1).getDay();
        const daysInMonth = new Date(state.calendarYear, state.calendarMonth + 1, 0).getDate();
        const today = new Date();
        today.setHours(0, 0, 0, 0);

        for (let i = 0; i < firstDay; i++) {
            html += `<div class="cal-day empty"></div>`;
        }

        const activeUnit = 'ranap';

        for (let d = 1; d <= daysInMonth; d++) {
            const dateStr = toDateString(state.calendarYear, state.calendarMonth, d);
            const isToday = (dateStr === getTodayStr());
            const q = getQuota(dateStr, state.calendarDPJP, activeUnit);

            let statusCls = '';

            if (q.status === 'tutup' || q.status === 'override_tutup') {
                statusCls = 'status-closed'; // Merah - Libur/Tutup
            } else if (q.available <= 0) {
                statusCls = 'status-full'; // Biru - Kuota penuh
            } else {
                statusCls = 'status-available'; // Hijau - Masih tersedia
            }

            html += `<div class="cal-day ${isToday ? 'today' : ''} has-schedule ${statusCls}" data-date="${dateStr}" title="Klik untuk lihat detail (${activeUnit.toUpperCase()})">${d}</div>`;
        }
        html += '</div>';
        grid.innerHTML = html;

        grid.querySelectorAll('.cal-day:not(.empty)').forEach(el => {
            el.addEventListener('click', () => {
                const dateStr = el.dataset.date;
                if (dateStr) showDatePreview(dateStr, state.calendarDPJP, activeUnit);
            });
        });

        renderQuotaBars();
    }

    let selectedPreviewDate = null;
    let selectedPreviewDPJP = null;
    let selectedPreviewUnit = 'ranap';

    function renderQuotaBars() {
        const list = $('#quotaList');
        if (!list) return;

        const year = state.calendarYear;
        const month = state.calendarMonth;
        const monthNames = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];
        const activeUnit = 'ranap';

        const sublabel = $('#quotaMonthSublabel');
        if (sublabel) {
            sublabel.textContent = `Unit: Rawat Inap (Ranap) | Bulan: ${monthNames[month]} ${year}`;
        }

        const daysInMonth = new Date(year, month + 1, 0).getDate();

        let html = '';

        Object.values(CONFIG.doctors).forEach(doc => {
            let totalMaxQuota = 0;
            let totalBooked = 0;

            for (let d = 1; d <= daysInMonth; d++) {
                const dateStr = toDateString(year, month, d);
                const q = getQuota(dateStr, doc.id, activeUnit);
                totalMaxQuota += q.maxQuota;
                totalBooked += q.booked;
            }

            const pct = totalMaxQuota > 0 ? (totalBooked / totalMaxQuota) * 100 : 0;
            const barClass = pct >= 100 ? 'full' : 'low';

            html += `
                <div class="quota-item">
                    <div class="quota-item-header">
                        <span>${doc.name}</span>
                        <span>${totalBooked}/${totalMaxQuota} Terisi</span>
                    </div>
                    <div class="quota-bar">
                        <div class="quota-bar-fill ${barClass}" style="width: ${Math.min(100, pct)}%"></div>
                    </div>
                    <div class="quota-label">
                        <span>Status Unit: <span class="unit-badge badge-${activeUnit}">${activeUnit === 'ranap' ? 'Ranap' : 'Rajal'}</span></span>
                        <span class="post-ranap-tag">${totalMaxQuota - totalBooked} slot tersisa</span>
                    </div>
                </div>
            `;
        });
        list.innerHTML = html;
    }

    function renderDashboardStatsRajal() {
        const today = getTodayStr();
        const ptsTodayRajal = state.patients.filter(p => p.date === today && p.unit === 'rajal');

        $('#valJadwalHariIniRajal').textContent = ptsTodayRajal.length;

        let totalAvailableRajal = 0;
        Object.keys(CONFIG.doctors).forEach(docId => {
            totalAvailableRajal += getQuota(today, docId, 'rajal').available;
        });

        $('#valKuotaTersediaRajal').textContent = `${totalAvailableRajal}`;
        $('#valPasienBaruRajal').textContent = state.patients.filter(p => p.unit === 'rajal').length;
    }

    function renderMiniCalendarRajal() {
        const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agt', 'Sep', 'Okt', 'Nov', 'Des'];
        $('#calMonthLabelRajal').textContent = `${monthNames[state.calendarMonthRajal]} ${state.calendarYearRajal}`;

        const grid = $('#miniCalendarRajal');
        let html = '<div class="cal-grid">';
        const dayLabels = ['Min', 'Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab'];
        dayLabels.forEach(d => html += `<div class="cal-day-label">${d}</div>`);

        const firstDay = new Date(state.calendarYearRajal, state.calendarMonthRajal, 1).getDay();
        const daysInMonth = new Date(state.calendarYearRajal, state.calendarMonthRajal + 1, 0).getDate();
        const today = new Date();
        today.setHours(0, 0, 0, 0);

        for (let i = 0; i < firstDay; i++) {
            html += `<div class="cal-day empty"></div>`;
        }

        const activeUnit = 'rajal';

        for (let d = 1; d <= daysInMonth; d++) {
            const dateStr = toDateString(state.calendarYearRajal, state.calendarMonthRajal, d);
            const isToday = (dateStr === getTodayStr());
            const q = getQuota(dateStr, state.calendarDPJPRajal, activeUnit);

            let statusCls = '';

            if (q.status === 'tutup' || q.status === 'override_tutup') {
                statusCls = 'status-closed'; // Merah - Libur/Tutup
            } else if (q.available <= 0) {
                statusCls = 'status-full'; // Biru - Kuota penuh
            } else {
                statusCls = 'status-available'; // Hijau - Masih tersedia
            }

            html += `<div class="cal-day ${isToday ? 'today' : ''} has-schedule ${statusCls}" data-date="${dateStr}" title="Klik untuk lihat detail (RAJAL)">${d}</div>`;
        }
        html += '</div>';
        grid.innerHTML = html;

        grid.querySelectorAll('.cal-day:not(.empty)').forEach(el => {
            el.addEventListener('click', () => {
                const dateStr = el.dataset.date;
                if (dateStr) showDatePreview(dateStr, state.calendarDPJPRajal, activeUnit);
            });
        });

        renderQuotaBarsRajal();
    }

    function renderQuotaBarsRajal() {
        const list = $('#quotaListRajal');
        if (!list) return;

        const year = state.calendarYearRajal;
        const month = state.calendarMonthRajal;
        const monthNames = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];
        const activeUnit = 'rajal';

        const sublabel = $('#quotaMonthSublabelRajal');
        if (sublabel) {
            sublabel.textContent = `Unit: Rawat Jalan (Rajal) | Bulan: ${monthNames[month]} ${year}`;
        }

        const daysInMonth = new Date(year, month + 1, 0).getDate();

        let html = '';

        Object.values(CONFIG.doctors).forEach(doc => {
            let totalMaxQuota = 0;
            let totalBooked = 0;

            for (let d = 1; d <= daysInMonth; d++) {
                const dateStr = toDateString(year, month, d);
                const q = getQuota(dateStr, doc.id, activeUnit);
                totalMaxQuota += q.maxQuota;
                totalBooked += q.booked;
            }

            const pct = totalMaxQuota > 0 ? (totalBooked / totalMaxQuota) * 100 : 0;
            const barClass = pct >= 100 ? 'full' : 'low';

            html += `
                <div class="quota-item">
                    <div class="quota-item-header">
                        <span>${doc.name}</span>
                        <span>${totalBooked}/${totalMaxQuota} Terisi</span>
                    </div>
                    <div class="quota-bar">
                        <div class="quota-bar-fill ${barClass}" style="width: ${Math.min(100, pct)}%"></div>
                    </div>
                    <div class="quota-label">
                        <span>Status Unit: <span class="unit-badge badge-rajal">Rajal</span></span>
                        <span class="post-ranap-tag">${totalMaxQuota - totalBooked} slot tersisa</span>
                    </div>
                </div>
            `;
        });
        list.innerHTML = html;
    }

    function showDatePreview(dateStr, dpjpId, unit = 'ranap') {
        selectedPreviewDate = dateStr;
        selectedPreviewDPJP = dpjpId;
        selectedPreviewUnit = unit;

        const doc = CONFIG.doctors[dpjpId];
        const q = getQuota(dateStr, dpjpId, unit);
        const pts = state.patients.filter(p => p.date === dateStr && p.dpjp === dpjpId && (p.unit || 'ranap') === unit);

        $('#previewModalTitle').textContent = `${formatDateIndo(dateStr)} (${unit === 'ranap' ? 'Ranap' : 'Rajal'})`;
        $('#previewModalSubtitle').textContent = `DPJP: ${doc ? doc.name : '-'}`;

        let badgeBg = 'var(--moss-green-pale)';
        let badgeColor = 'var(--moss-green)';
        let statusText = 'BEROPERASI (BUKA)';

        if (q.status === 'tutup' || q.status === 'override_tutup') {
            badgeBg = 'var(--burgundy-pale)';
            badgeColor = 'var(--burgundy)';
            statusText = 'LIBUR / TUTUP';
        } else if (q.available === 0) {
            badgeBg = 'var(--burgundy-pale)';
            badgeColor = 'var(--burgundy)';
            statusText = 'KUOTA PENUH';
        } else if (q.status === 'override_buka') {
            badgeBg = 'rgba(218, 165, 32, 0.15)';
            badgeColor = '#DAA520';
            statusText = 'OVERRIDE ADMIN (BUKA)';
        }

        const summaryHtml = `
            <div style="background: ${badgeBg}; color: ${badgeColor}; padding: 12px 14px; border-radius: var(--radius-sm); font-size: 0.78rem;">
                <div style="font-weight: 700; text-transform: uppercase; margin-bottom: 2px;">Status: ${statusText}</div>
                <div>Kuota Total (${unit.toUpperCase()}): <strong>${q.maxQuota} Pasien</strong></div>
            </div>
            <div style="background: var(--ivory-bg); padding: 12px 14px; border-radius: var(--radius-sm); font-size: 0.78rem; border: 1px solid var(--border-color);">
                <div style="color: var(--text-muted); font-weight: 500;">Sisa Slot Kuota (${unit.toUpperCase()})</div>
                <div style="font-size: 1.3rem; font-weight: 800; color: ${q.available > 0 ? 'var(--moss-green)' : 'var(--burgundy)'};">
                    ${q.available} <span style="font-size: 0.75rem; font-weight: 500; color: var(--text-muted);">/ ${q.maxQuota} slot</span>
                </div>
            </div>
        `;
        $('#previewModalQuotaSummary').innerHTML = summaryHtml;
        $('#previewPatientCount').textContent = `${pts.length} Pasien`;

        const container = $('#previewPatientListContainer');
        if (pts.length === 0) {
            container.innerHTML = `
                <div style="padding: 28px; text-align: center; color: var(--text-muted); font-size: 0.82rem;">
                    Belum ada pasien yang terdaftar kontrol (${unit.toUpperCase()}) pada tanggal ini.
                </div>
            `;
        } else {
            let tableHtml = `
                <table class="data-table" style="font-size: 0.8rem;">
                    <thead>
                        <tr style="background: var(--ivory-bg);">
                            <th style="padding: 8px 12px;">Unit</th>
                            <th style="padding: 8px 12px;">No. RM</th>
                            <th style="padding: 8px 12px;">Nama Pasien</th>
                            <th style="padding: 8px 12px;">No. HP</th>
                        </tr>
                    </thead>
                    <tbody>
                         ${pts.map(p => `
                            <tr>
                                <td style="padding: 8px 12px;"><span class="unit-badge badge-${p.unit || 'ranap'}">${(p.unit || 'ranap') === 'ranap' ? 'Ranap' : 'Rajal'}</span></td>
                                <td style="font-family: monospace; font-weight: 600; padding: 8px 12px;">${maskRM(p.rm)}</td>
                                <td style="padding: 8px 12px;">
                                    <strong>${p.name}</strong>
                                    ${p.catatan ? `<div style="font-size: 0.72rem; color: var(--text-muted); font-style: italic; margin-top: 2px;">📝 ${p.catatan}</div>` : ''}
                                </td>
                                <td style="padding: 8px 12px; color: var(--text-secondary);">${p.hp}</td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
            `;
            container.innerHTML = tableHtml;
        }

        const addBtn = $('#btnPreviewTambahJadwal');
        if (q.status === 'tutup' || q.status === 'override_tutup' || q.available <= 0) {
            addBtn.disabled = true;
            addBtn.style.opacity = '0.5';
            addBtn.style.cursor = 'not-allowed';
        } else {
            addBtn.disabled = false;
            addBtn.style.opacity = '1';
            addBtn.style.cursor = 'pointer';
        }

        $('#modalPreviewOverlay').classList.add('active');
    }



    function renderTablePasien() {
        const q = $('#searchPasien').value.toLowerCase();

        let data = state.patients.filter(p => (p.unit || 'ranap') === 'ranap');
        if (q) {
            data = data.filter(p => p.name.toLowerCase().includes(q) || p.rm.includes(q));
        }

        const tbody = $('#tbodyPasien');
        if (data.length === 0) {
            tbody.innerHTML = `<tr><td colspan="7" style="text-align:center; color:#999;">Pasien tidak ditemukan</td></tr>`;
            return;
        }

        tbody.innerHTML = data.map(p => `
            <tr>
                <td><span class="unit-badge badge-${p.unit || 'ranap'}">${(p.unit || 'ranap') === 'ranap' ? 'Ranap' : 'Rajal'}</span></td>
                <td style="font-family:monospace;">${maskRM(p.rm)}</td>
                <td>
                    <strong>${p.name}</strong>
                    ${p.catatan ? `<div style="font-size: 0.72rem; color: var(--text-muted); font-style: italic; margin-top: 2px;">📝 ${p.catatan}</div>` : ''}
                </td>
                <td>${p.hp}</td>
                <td>${CONFIG.doctors[p.dpjp].name}</td>
                <td>${formatDateIndo(p.date)}</td>
                <td>
                    <div style="display:flex; gap:5px;">
                        <button class="action-btn" onclick="app.editPasien('${p.id}')">Edit</button>
                        <button class="action-btn danger" onclick="app.hapusJadwal('${p.id}')">Hapus</button>
                    </div>
                </td>
            </tr>
        `).join('');
    }

    function renderTablePasienRajal() {
        const q = $('#searchPasienRajal') ? $('#searchPasienRajal').value.toLowerCase() : '';
        let data = state.patients.filter(p => p.unit === 'rajal');

        if (q) {
            data = data.filter(p => p.name.toLowerCase().includes(q) || p.rm.includes(q));
        }

        const tbody = $('#tbodyPasienRajal');
        if (!tbody) return;

        if (data.length === 0) {
            tbody.innerHTML = `<tr><td colspan="7" style="text-align:center; color:#999;">Tidak ada data pasien Rawat Jalan (Rajal)</td></tr>`;
            return;
        }

        tbody.innerHTML = data.map(p => `
            <tr>
                <td><span class="unit-badge badge-rajal">Rajal</span></td>
                <td style="font-family:monospace;">${maskRM(p.rm)}</td>
                <td>
                    <strong>${p.name}</strong>
                    ${p.catatan ? `<div style="font-size: 0.72rem; color: var(--text-muted); font-style: italic; margin-top: 2px;">📝 ${p.catatan}</div>` : ''}
                </td>
                <td>${p.hp}</td>
                <td>${CONFIG.doctors[p.dpjp].name}</td>
                <td>${formatDateIndo(p.date)}</td>
                <td>
                    <div style="display:flex; gap:5px;">
                        <button class="action-btn" onclick="app.editPasien('${p.id}')">Edit</button>
                        <button class="action-btn danger" onclick="app.hapusJadwal('${p.id}')">Hapus</button>
                    </div>
                </td>
            </tr>
        `).join('');
    }

    // =============================================
    // EVENTS
    // =============================================
    $('#calPrev').addEventListener('click', () => { state.calendarMonth--; if (state.calendarMonth < 0) { state.calendarMonth = 11; state.calendarYear--; } renderMiniCalendar(); });
    $('#calNext').addEventListener('click', () => { state.calendarMonth++; if (state.calendarMonth > 11) { state.calendarMonth = 0; state.calendarYear++; } renderMiniCalendar(); });
    $('#calFilterDPJP').addEventListener('change', (e) => { state.calendarDPJP = e.target.value; renderMiniCalendar(); });

    if ($('#calPrevRajal')) $('#calPrevRajal').addEventListener('click', () => { state.calendarMonthRajal--; if (state.calendarMonthRajal < 0) { state.calendarMonthRajal = 11; state.calendarYearRajal--; } renderMiniCalendarRajal(); });
    if ($('#calNextRajal')) $('#calNextRajal').addEventListener('click', () => { state.calendarMonthRajal++; if (state.calendarMonthRajal > 11) { state.calendarMonthRajal = 0; state.calendarYearRajal++; } renderMiniCalendarRajal(); });
    if ($('#calFilterDPJPRajal')) $('#calFilterDPJPRajal').addEventListener('change', (e) => { state.calendarDPJPRajal = e.target.value; renderMiniCalendarRajal(); });





    const closeJadwalModal = () => {
        $('#modalJadwalOverlay').classList.remove('active');
        state.editingPatientId = null;
        $('#formPendaftaranPasien').reset();
    };
    $('.modal-close').addEventListener('click', closeJadwalModal);
    $('#btnBatalModal').addEventListener('click', closeJadwalModal);

    // Preview Modal Handlers
    $('#modalPreviewClose').addEventListener('click', () => { $('#modalPreviewOverlay').classList.remove('active'); });
    $('#btnPreviewClose').addEventListener('click', () => { $('#modalPreviewOverlay').classList.remove('active'); });

    $('#btnPreviewTambahJadwal').addEventListener('click', () => {
        $('#modalPreviewOverlay').classList.remove('active');
        if (selectedPreviewDate && selectedPreviewDPJP) {
            if ($('#selectUnit')) $('#selectUnit').value = selectedPreviewUnit || 'ranap';
            $('#selectDokter').value = selectedPreviewDPJP;
            window.setDateValue($('#inputTglKontrol'), selectedPreviewDate);
        }
        $('#modalJadwalOverlay').classList.add('active');
    });

    // Validate date & unit on modal form
    function validateModalForm() {
        const dpjp = $('#selectDokter').value;
        const date = $('#inputTglKontrol').value;
        const unit = $('#selectUnit') ? $('#selectUnit').value : 'ranap';
        const resEl = $('#quotaCheckResult');

        if (!dpjp || !date) { resEl.style.display = 'none'; return; }

        const q = getQuota(date, dpjp, unit, state.editingPatientId);
        resEl.style.display = 'block';
        resEl.style.padding = '10px';
        resEl.style.marginTop = '10px';
        resEl.style.borderRadius = '8px';

        if (q.status === 'tutup' || q.status === 'override_tutup') {
            resEl.style.background = 'var(--burgundy-pale)';
            resEl.style.color = 'var(--burgundy)';
            resEl.textContent = `❌ Tanggal ini adalah hari libur / jadwal tutup (${unit.toUpperCase()}).`;
            $('#btnSimpanJadwal').disabled = true;
        } else if (q.available <= 0) {
            resEl.style.background = 'var(--burgundy-pale)';
            resEl.style.color = 'var(--burgundy)';
            resEl.textContent = `❌ Kuota ${unit.toUpperCase()} pada tanggal ini sudah penuh.`;
            $('#btnSimpanJadwal').disabled = true;
        } else {
            resEl.style.background = 'var(--moss-green-pale)';
            resEl.style.color = 'var(--moss-green)';
            resEl.textContent = `✅ Kuota ${unit.toUpperCase()} tersedia (${q.available} slot tersisa).`;
            $('#btnSimpanJadwal').disabled = false;
        }
    }

    $('#inputTglKontrol').addEventListener('change', validateModalForm);
    $('#selectDokter').addEventListener('change', validateModalForm);
    if ($('#selectUnit')) $('#selectUnit').addEventListener('change', validateModalForm);

    $('#formPendaftaranPasien').addEventListener('submit', async (e) => {
        e.preventDefault();
        const dpjp = $('#selectDokter').value;
        const date = $('#inputTglKontrol').value;
        const unit = $('#selectUnit') ? $('#selectUnit').value : 'ranap';
        const q = getQuota(date, dpjp, unit, state.editingPatientId);

        if (q.available <= 0) return;
        const rmInput = $('#inputNoRM').value.trim();
        if (isNaN(rmInput) || rmInput.length !== 8) {
            const warnEl = $('#quotaCheckResult');
            warnEl.style.display = 'block';
            warnEl.style.background = 'var(--burgundy-pale)';
            warnEl.style.color = 'var(--burgundy)';
            warnEl.textContent = '❌ Nomor RM harus berupa angka dan tepat 8 digit';
            return;
        }

        const patientData = {
            unit: unit,
            name: $('#inputNamaPasien').value.trim(),
            rm: $('#inputNoRM').value.trim(),
            hp: $('#inputHP').value.trim(),
            dpjp: dpjp,
            date: date,
            catatan: $('#inputCatatan').value.trim()
        };

        const isEdit = !!state.editingPatientId;

        try {
            if (isEdit) {
                // PUT ke API
                const result = await api.put(`/api/patients/${state.editingPatientId}`, mapPatientToAPI(patientData));
                const mapped = mapPatientFromAPI(result);
                const idx = state.patients.findIndex(p => p.id === state.editingPatientId);
                if (idx !== -1) state.patients[idx] = mapped;
            } else {
                // POST ke API
                const result = await api.post('/api/patients', mapPatientToAPI(patientData));
                state.patients.push(mapPatientFromAPI(result));
            }

            $('#formPendaftaranPasien').reset();
            $('#quotaCheckResult').style.display = 'none';
            $('#modalJadwalOverlay').classList.remove('active');
            state.editingPatientId = null;
            showToast(isEdit ? 'Jadwal kontrol berhasil diperbarui' : `Jadwal kontrol (${unit.toUpperCase()}) berhasil disimpan`);
            renderApp();
        } catch (err) {
            showToast(`❌ Gagal: ${err.message}`);
        }
    });

    // Login Form
    $('#loginForm').addEventListener('submit', async (e) => {
        e.preventDefault();
        const username = $('#loginUsername').value.trim();
        const password = $('#loginPassword').value;
        const errEl = $('#loginErrorMsg');
        errEl.style.display = 'none';

        try {
            const res = await fetch(`${API_BASE}/api/auth/login`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ username, password })
            });
            if (!res.ok) {
                const err = await res.json();
                errEl.textContent = err.detail || 'Login gagal';
                errEl.style.display = 'block';
                return;
            }
            const data = await res.json();
            sessionStorage.setItem('rs_auth_token', data.access_token);
            state.currentUser = data.user;

            showApp();
            await loadState();
            initNav();
            renderApp();
            showToast(`Selamat datang, ${data.user.display_name}!`);
        } catch (err) {
            errEl.textContent = 'Gagal terhubung ke server';
            errEl.style.display = 'block';
        }
    });

    // Logout
    $('#btnLogout').addEventListener('click', (e) => {
        e.preventDefault();
        doLogout();
        showToast('Berhasil logout');
    });

    $('#btnAdminSetBuka').addEventListener('click', async () => {
        const d = $('#adminOverrideDate').value;
        const dpjp = $('#adminOverrideDPJP').value;
        if (!d || !dpjp) return;
        try {
            await api.post('/api/overrides', { doctor_id: dpjp, override_date: d, status: 'buka' });
            state.dateOverrides[`${d}_${dpjp}`] = { status: 'buka' };
            showToast(`Tanggal ${d} dipaksa BUKA (DPJP: ${CONFIG.doctors[dpjp].name})`);
            renderApp();
        } catch (err) { showToast(`❌ Gagal: ${err.message}`); }
    });
    $('#btnAdminSetTutup').addEventListener('click', async () => {
        const d = $('#adminOverrideDate').value;
        const dpjp = $('#adminOverrideDPJP').value;
        if (!d || !dpjp) return;
        try {
            await api.post('/api/overrides', { doctor_id: dpjp, override_date: d, status: 'tutup' });
            state.dateOverrides[`${d}_${dpjp}`] = { status: 'tutup' };
            showToast(`Tanggal ${d} dipaksa TUTUP/LIBUR (DPJP: ${CONFIG.doctors[dpjp].name})`);
            renderApp();
        } catch (err) {
            showToast(`❌ Gagal: ${err.message}`);
        }
    });
    if ($('#btnAdminSetQuota')) {
        $('#btnAdminSetQuota').addEventListener('click', async () => {
            const d = $('#adminQuotaDate').value;
            const dpjp = $('#adminQuotaDPJP').value;
            const quotaInput = $('#adminQuotaValue').value;
            if (!d || !dpjp) return;
            try {
                const customQuota = (quotaInput && !isNaN(quotaInput) && quotaInput !== '') ? parseInt(quotaInput, 10) : null;
                await api.post('/api/overrides', { doctor_id: dpjp, override_date: d, status: 'buka', custom_quota: customQuota });
                const key = `${d}_${dpjp}`;
                state.dateOverrides[key] = { status: 'buka' };
                if (customQuota !== null) state.dateOverrides[key].quota = customQuota;
                showToast(`Kuota khusus tanggal ${d} untuk DPJP ${CONFIG.doctors[dpjp].name} berhasil disimpan`);
                renderApp();
            } catch (err) { showToast(`❌ Gagal: ${err.message}`); }
        });
    }


    $('#searchPasien').addEventListener('input', renderTablePasien);
    if ($('#searchPasienRajal')) $('#searchPasienRajal').addEventListener('input', renderTablePasienRajal);

    window.app = {
        hapusJadwal: async function (id) {
            id = parseInt(id);
            if (confirm('Batalkan jadwal ini? Kuota akan otomatis dikembalikan.')) {
                try {
                    await api.del(`/api/patients/${id}`);
                    state.patients = state.patients.filter(p => p.id !== id);
                    renderApp();
                    showToast('Jadwal dibatalkan');
                } catch (err) { showToast(`❌ Gagal: ${err.message}`); }
            }
        },
        editPasien: function (id) {
            id = parseInt(id);
            const p = state.patients.find(x => x.id === id);
            if (!p) return;
            state.editingPatientId = id;
            if ($('#selectUnit')) $('#selectUnit').value = p.unit || 'ranap';
            $('#inputNamaPasien').value = p.name;
            $('#inputNoRM').value = p.rm;
            $('#inputHP').value = p.hp;
            $('#selectDokter').value = p.dpjp;
            window.setDateValue($('#inputTglKontrol'), p.date);
            $('#inputCatatan').value = p.catatan || '';
            $('#modalJadwalOverlay').classList.add('active');
        }
    };

    $('#todayDate').textContent = formatDateIndo(getTodayStr());

    // Initialize Flatpickr
    if (typeof flatpickr !== 'undefined') {
        flatpickr('input[type="date"]', {
            dateFormat: "Y-m-d",
            altInput: true,
            altFormat: "d/m/Y",
            locale: "id",
            minDate: "today"
        });
    }

    // Helper to safely set date value with Flatpickr support
    window.setDateValue = function(el, val) {
        if (el._flatpickr) {
            el._flatpickr.setDate(val, true); // true = trigger change event
        } else {
            el.value = val;
            el.dispatchEvent(new Event('change'));
        }
    };

    // Initialize (async karena loadState mengambil data dari API)
    (async () => {
        const token = sessionStorage.getItem('rs_auth_token');
        if (token) {
            // Cek apakah token masih valid
            try {
                const user = await api.get('/api/auth/me');
                state.currentUser = user;
                showApp();
                await loadState();
                initNav();
                renderApp();
            } catch (err) {
                // Token invalid/expired
                doLogout();
            }
        } else {
            // Belum login: tampilkan login screen
            doLogout();
        }
    })();
})();
