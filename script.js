// Replace this URL with your Google Apps Script Web App URL
const GOOGLE_SHEET_API_URL = 'https://script.google.com/macros/s/AKfycbyH9de26U1yYUqFH3y1MzGIVI0WOUSO0_CvC3hgoSs-0pcH_rremvm3Ks3-nB_8BLAT/exec';

let currentRole = 'admin';
let students = [];
let attendanceData = [];
let filteredData = [];
let autoRefreshTimer = null; // Used for live polling

// --- HELPER TO FIX DD/MM/YYYY DATES ---
function safeParseDate(dateStr) {
    if (!dateStr) return null;
    let d = new Date(dateStr);
    if (!isNaN(d)) return d; // If JS natively understands it, return it

    // Custom fallback to force JS to read DD/MM/YYYY
    try {
        let parts = String(dateStr).trim().split(" ");
        let dParts = parts[0].split("/");
        if (dParts.length === 3) {
            let tParts = parts[1] ? parts[1].split(":") : ["00", "00", "00"];
            // Convert to browser-safe ISO string: YYYY-MM-DDTHH:mm:ss
            return new Date(`${dParts[2]}-${dParts[1]}-${dParts[0]}T${tParts[0]}:${tParts[1]}:${tParts[2] || '00'}`);
        }
    } catch (e) { }

    return null;
}

// ── FETCH DATA FROM GOOGLE SHEETS ──
async function loadDataFromSheets() {
    try {
        const response = await fetch(GOOGLE_SHEET_API_URL);
        if (!response.ok) throw new Error("API not ready yet");

        const data = await response.json();
        students = data.students || [];

        attendanceData = (data.attendance || []).map(record => ({
            ...record,
            // Using the new safe parser here!
            inTime: safeParseDate(record.inTime),
            outTime: safeParseDate(record.outTime),
        }));

        filteredData = [...attendanceData];
        refreshUI();
    } catch (error) {
        console.log('Error fetching data. Check your API URL.');
    }
}

// ── PUSH MANUAL SCANS TO GOOGLE SHEETS ──
async function pushScanToSheet(uid) {
    try {
        await fetch(GOOGLE_SHEET_API_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id: uid })
        });
    } catch (error) {
        console.error('Error pushing to Google Sheet:', error);
    }
}

const now = new Date();

// Added an extra failsafe here to prevent "Invalid Date" text
function fmtShort(d) {
    if (!d || isNaN(d)) return '—';
    return d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true });
}

// ── CLOCK ──
function updateClock() { document.getElementById('clock').textContent = new Date().toLocaleTimeString('en-IN', { hour12: true }); }
setInterval(updateClock, 1000); updateClock();

const dateStr = now.toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
document.getElementById('page-sub').textContent = `IoT Lab — ${dateStr}`;

// ── LOGIN ──
function selectRole(btn, role) {
    document.querySelectorAll('.role-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    currentRole = role;
}

function doLogin() {
    const u = document.getElementById('login-user').value.trim();
    const p = document.getElementById('login-pass').value.trim();
    const err = document.getElementById('login-error');

    if ((u === 'admin' && p === 'admin123') || (u === 'hod' && p === 'hod123')) {
        document.getElementById('login-screen').style.display = 'none';
        document.getElementById('app').style.display = 'flex';

        const isHod = u === 'hod';

        // --- THIS IS THE TEXT YOU WANTED TO CHANGE ---
        document.getElementById('sidebar-name').textContent = isHod ? 'HOD' : 'Lab Admin';
        document.getElementById('sidebar-role').textContent = isHod ? 'Head of Department' : 'Administrator';
        document.getElementById('sidebar-avatar').textContent = isHod ? 'H' : 'A';
        // ---------------------------------------------

        // Initial data fetch
        loadDataFromSheets();

        // Live Updates
        if (autoRefreshTimer) clearInterval(autoRefreshTimer);
        autoRefreshTimer = setInterval(loadDataFromSheets, 8000);

    } else {
        err.style.display = 'block';
        setTimeout(() => err.style.display = 'none', 3000);
    }
}

function doLogout() {
    document.getElementById('app').style.display = 'none';
    document.getElementById('login-screen').style.display = 'flex';
    document.getElementById('login-user').value = '';
    document.getElementById('login-pass').value = '';
    if (autoRefreshTimer) clearInterval(autoRefreshTimer);
}

// ── NAVIGATION ──
const pageTitles = {
    dashboard: ['Dashboard', 'Live overview of lab activity'],
    attendance: ['Attendance Records', 'RFID in/out log for today'],
    rfid: ['RFID Scanner', 'Log student entry & exit'],
    reports: ['Reports & Export', 'Weekly summaries and data export'],
};

function showPage(id, btn) {
    document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
    document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
    document.getElementById('page-' + id).classList.add('active');
    btn.classList.add('active');
    document.getElementById('page-title').textContent = pageTitles[id][0];
    if (id === 'dashboard') { document.getElementById('page-sub').textContent = `IoT Lab — ${dateStr}`; }
    else { document.getElementById('page-sub').textContent = pageTitles[id][1]; }
}

// ── UI REFRESH HELPERS ──
function refreshUI() {
    renderActivityList();
    renderPresentList();
    renderTable();
    updateDashboardStats();
}

function updateDashboardStats() {
    const presentCount = attendanceData.filter(r => r.status === 'present').length;
    const exitCount = attendanceData.filter(r => r.status === 'left').length;
    document.getElementById('stat-total').textContent = students.length;
    document.getElementById('stat-present').textContent = presentCount;
    document.getElementById('stat-exited').textContent = exitCount;
    document.getElementById('stat-scans').textContent = attendanceData.length * 2 - presentCount;
}

function renderActivityList() {
    const events = [];
    attendanceData.forEach(r => {
        if (r.inTime) events.push({ name: r.name, roll: r.roll, time: r.inTime, type: 'IN' });
        if (r.outTime) events.push({ name: r.name, roll: r.roll, time: r.outTime, type: 'OUT' });
    });
    events.sort((a, b) => b.time - a.time);
    const top = events.slice(0, 8);
    const list = document.getElementById('activity-list');
    list.innerHTML = top.map(e => `
    <div class="activity-item">
      <div class="activity-avatar">${e.name[0] || '?'}</div>
      <div class="activity-info">
        <div class="activity-name">${e.name}</div>
        <div class="activity-roll">${e.roll}</div>
      </div>
      <div class="activity-time">
        <div class="activity-time-val">${fmtShort(e.time)}</div>
        <span class="${e.type === 'IN' ? 'in-badge' : 'out-badge'}">${e.type}</span>
      </div>
    </div>
  `).join('');
}

function renderPresentList() {
    const present = attendanceData.filter(r => r.status === 'present');
    const count = present.length;
    document.getElementById('in-count').textContent = count;
    document.getElementById('capacity-text').textContent = `${count} / 30`;
    document.getElementById('capacity-fill').style.width = Math.min((count / 30 * 100), 100) + '%';
    document.getElementById('present-list').innerHTML = present.map(r => `
    <div class="present-item">
      <div class="present-dot"></div>
      <div class="present-name">${r.name}</div>
      <div class="present-since">since ${fmtShort(r.inTime)}</div>
    </div>
  `).join('');
}

function renderTable() {
    const tbody = document.getElementById('attendance-tbody');
    tbody.innerHTML = filteredData.map((r, i) => `
    <tr>
      <td>${i + 1}</td>
      <td><div class="td-name-wrap"><div class="name">${r.name}</div></div></td>
      <td><span style="font-family:monospace;font-size:13px;color:var(--gray-600)">${r.roll}</span></td>
      <td><span class="time-chip in">↓ ${fmtShort(r.inTime)}</span></td>
      <td>${r.outTime ? `<span class="time-chip out">↑ ${fmtShort(r.outTime)}</span>` : '<span class="time-chip pending">In Lab</span>'}</td>
      <td>${r.duration && r.duration !== '—' ? `<span class="duration-pill">${r.duration}</span>` : '<span style="color:var(--gray-400);font-size:13px">—</span>'}</td>
      <td>
        <span class="status-dot ${r.status}"></span>
        <span style="font-size:13px;font-weight:600;color:${r.status === 'present' ? 'var(--green)' : 'var(--gray-400)'}">
          ${r.status === 'present' ? 'In Lab' : 'Exited'}
        </span>
      </td>
    </tr>
  `).join('');
    document.getElementById('record-count').textContent = `Showing ${filteredData.length} records`;
}

function filterTable() {
    const search = document.getElementById('filter-search').value.toLowerCase();
    const status = document.getElementById('filter-status').value;
    filteredData = attendanceData.filter(r => {
        const matchSearch = !search || r.name.toLowerCase().includes(search) || r.roll.includes(search);
        const matchStatus = !status || r.status === status;
        return matchSearch && matchStatus;
    });
    renderTable();
}

function resetFilters() {
    document.getElementById('filter-search').value = '';
    document.getElementById('filter-status').value = '';
    filteredData = [...attendanceData];
    renderTable();
}

// ── RFID PROCESSING (MANUAL SCAN ON WEBSITE) ──
async function processRFID() {
    const uid = document.getElementById('rfid-card-input').value.trim().toUpperCase();
    if (!uid) { alert('Please enter a Card UID'); return; }

    const card = document.getElementById('rfid-scanner-card');
    card.classList.add('scanning');
    document.getElementById('rfid-card-input').value = '';

    await pushScanToSheet(uid);
    await loadDataFromSheets();

    const activeSession = attendanceData.find(r => r.id === uid);
    if (activeSession) {
        const isOut = activeSession.status === 'left';
        document.getElementById('sr-name').textContent = activeSession.name;
        document.getElementById('sr-roll').textContent = activeSession.roll;
        document.getElementById('sr-action').textContent = isOut ? '✅ Checked OUT' : '🟢 Checked IN';
        document.getElementById('sr-time').textContent = fmtShort(isOut ? activeSession.outTime : activeSession.inTime);
        document.getElementById('sr-uid').textContent = uid;
        document.getElementById('sr-duration').textContent = activeSession.duration;
        document.getElementById('sr-avatar').textContent = activeSession.name[0] || '?';
        document.getElementById('scan-result-card').classList.add('visible');

        showToast(activeSession.name, isOut ? 'Exited the lab' : 'Entered the lab', isOut ? '🚪' : '✅');
    }

    card.classList.remove('scanning');
}

function showToast(title, sub, icon) {
    const toast = document.getElementById('scan-toast');
    document.getElementById('toast-title').textContent = title;
    document.getElementById('toast-sub').textContent = sub;
    document.getElementById('toast-icon').textContent = icon;
    toast.classList.add('show');
    setTimeout(() => toast.classList.remove('show'), 3500);
}