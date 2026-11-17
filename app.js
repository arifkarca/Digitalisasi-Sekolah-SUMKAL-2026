// ============================================================================
// KONFIGURASI PORTAL MONITORING SUMKAL 2026 (VOKASI & TERPADU DALAM 1 DASHBOARD)
// ============================================================================
const PORTAL_CONFIG = {
  // 1. Ganti password akses portal di bawah ini sesuai keinginan Anda
  PASSWORD: 'ODSLOLA2026',

  // 2. Tempel masing-masing ID Google Sheets Anda (dari URL browser di antara /d/ dan /edit)
  SOURCES: {
    VOKASI: {
      label: 'Sekolah Vokasi',
      title: 'Dashboard Digitalisasi Pembelajaran Sekolah Vokasi 2026',
      spreadsheetId: '1WgHd9zG0FYvaKxRC2GrLLONx3z5RJ8xfNxEpywXMins',
      sheetName: 'SUMKAL'
    },
    TERPADU: {
      label: 'Sekolah Terpadu',
      title: 'Dashboard Digitalisasi Pembelajaran Sekolah Terpadu 2026',
      spreadsheetId: '13ixWoCMBWe9Atzi6lqRaAK8Aw7J5B_SUClLfhW-mUIA',
      sheetName: 'SUMKAL'
    }
  },

  MAX_MAP_MARKERS: 2500,
  UID_ORDER: [
    'UID Aceh', 'UID Sumut', 'UID Sumbar', 'UID RKR', 'UID S2JB',
    'UIW Babel', 'UID Lampung', 'UID Kalbar', 'UID Kalselteng', 'UID Kaltimra'
  ]
};

let activeMode = 'VOKASI';
const cacheByMode = {}; // Cache memori agar pindah tab Vokasi <-> Terpadu instan
let rawData = [];
let filteredData = [];
let currentPage = 1;
const rowsPerPage = 25;
let chartUidInstance = null;
let chartJenjangInstance = null;
let mapInstance = null;
let markersLayer = null;
const canvasRenderer = L.canvas({ padding: 0.5 });

// ==================== LOGIKA LOGIN & SESSION ====================
function unlockDashboard() {
  document.getElementById('loginScreen').classList.add('hidden');
  document.getElementById('dashboardWrapper').classList.remove('hidden');

  if (!mapInstance) {
    initMap();
  } else {
    setTimeout(() => mapInstance.invalidateSize(), 150);
  }
  loadDataset(activeMode, false);
}

function lockDashboard() {
  sessionStorage.removeItem('ods_portal_auth');
  document.getElementById('dashboardWrapper').classList.add('hidden');
  document.getElementById('loginScreen').classList.remove('hidden');
  document.getElementById('passwordInput').value = '';
  document.getElementById('loginError').classList.add('hidden');
}

// ==================== SWITCHER VOKASI <-> TERPADU ====================
function switchDataset(mode) {
  if (activeMode === mode && rawData.length > 0) return;
  activeMode = mode;

  const btnVokasi = document.getElementById('tabVokasi');
  const btnTerpadu = document.getElementById('tabTerpadu');
  if (mode === 'VOKASI') {
    btnVokasi.className = 'tab-active px-4 py-1.5 rounded-lg text-xs font-bold transition';
    btnTerpadu.className = 'tab-inactive px-4 py-1.5 rounded-lg text-xs font-bold transition';
  } else {
    btnTerpadu.className = 'tab-active px-4 py-1.5 rounded-lg text-xs font-bold transition';
    btnVokasi.className = 'tab-inactive px-4 py-1.5 rounded-lg text-xs font-bold transition';
  }

  document.getElementById('headerTitle').textContent = PORTAL_CONFIG.SOURCES[mode].title;

  // Reset filter saat berpindah kategori
  document.getElementById('filterUid').value = 'ALL';
  document.getElementById('filterJenjang').value = 'ALL';
  document.getElementById('filterPbPd').value = 'ALL';
  document.getElementById('filterStatus').value = 'ALL';
  document.getElementById('searchInput').value = '';

  loadDataset(mode, false);
}

function initMap() {
  mapInstance = L.map('map', { preferCanvas: true }).setView([-0.5, 108.0], 5);
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '&copy; OpenStreetMap contributors'
  }).addTo(mapInstance);
  markersLayer = L.layerGroup().addTo(mapInstance);
}

function isTrue(val) {
  if (typeof val === 'boolean') return val;
  if (!val) return false;
  const s = String(val).trim().toUpperCase();
  return s === 'TRUE' || s === 'YA' || s === 'YES' || s === '1' || s === 'SUDAH';
}

function loadDataset(mode, forceReload = false) {
  const src = PORTAL_CONFIG.SOURCES[mode];
  const statusEl = document.getElementById('syncStatus');

  if (!forceReload && cacheByMode[mode]) {
    rawData = cacheByMode[mode].data;
    populateFilters();
    applyFilters();
    statusEl.innerHTML = `<span class="w-2 h-2 rounded-full bg-emerald-400"></span> Terhubung: ${src.label} (${src.sheetName})`;
    document.getElementById('lastUpdate').textContent = 'Terakhir sinkron: ' + cacheByMode[mode].time;
    return;
  }

  if (!src.spreadsheetId || src.spreadsheetId.includes('TEMPEL_ID')) {
    statusEl.innerHTML = `<span class="w-2 h-2 rounded-full bg-rose-400"></span> ID Spreadsheet ${src.label} belum diisi di app.js`;
    rawData = [];
    populateFilters();
    applyFilters();
    return;
  }

  statusEl.innerHTML = `<span class="w-2 h-2 rounded-full bg-amber-400 animate-ping"></span> Menarik data ${src.label}...`;
  const url = `https://docs.google.com/spreadsheets/d/${src.spreadsheetId}/gviz/tq?tqx=out:csv&sheet=${encodeURIComponent(src.sheetName)}`;

  Papa.parse(url, {
    download: true,
    header: true,
    skipEmptyLines: true,
    complete: function(results) {
      const cleaned = results.data.filter(row => row['NPSN'] || row['Nama Satuan Pendidikan']);
      const nowStr = new Date().toLocaleString('id-ID');
      cacheByMode[mode] = { data: cleaned, time: nowStr };

      if (activeMode === mode) {
        rawData = cleaned;
        populateFilters();
        applyFilters();
        statusEl.innerHTML = `<span class="w-2 h-2 rounded-full bg-emerald-400"></span> Terhubung: ${src.label} (${src.sheetName})`;
        document.getElementById('lastUpdate').textContent = 'Terakhir sinkron: ' + nowStr;
      }
    },
    error: function(err) {
      console.error('Error memuat Google Sheets:', err);
      statusEl.innerHTML = `<span class="w-2 h-2 rounded-full bg-rose-400"></span> Gagal menarik ${src.label} (Cek Share: Anyone with link)`;
    }
  });
}

function getUidName(row) {
  return (row['UID / UIW PLN'] || row['UID/UIW'] || row['Sumber_Sheet'] || 'Lainnya').trim();
}

function populateFilters() {
  const uidSet = new Set(rawData.map(getUidName));
  const orderedUids = [
    ...PORTAL_CONFIG.UID_ORDER.filter(u => uidSet.has(u)),
    ...[...uidSet].filter(u => !PORTAL_CONFIG.UID_ORDER.includes(u))
  ];

  const uidSel = document.getElementById('filterUid');
  uidSel.innerHTML = '<option value="ALL">Semua UID (10 Unit)</option>';
  orderedUids.forEach(u => {
    uidSel.innerHTML += `<option value="${u}">${u}</option>`;
  });

  const jenjangSet = [...new Set(rawData.map(r => (r['Jenjang'] || '').trim()).filter(Boolean))].sort();
  const jenjangSel = document.getElementById('filterJenjang');
  jenjangSel.innerHTML = '<option value="ALL">Semua Jenjang</option>';
  jenjangSet.forEach(j => {
    jenjangSel.innerHTML += `<option value="${j}">${j}</option>`;
  });

  const pbpdSet = [...new Set(rawData.map(r => (r['PB / PD'] || '').trim()).filter(Boolean))].sort();
  const pbpdSel = document.getElementById('filterPbPd');
  pbpdSel.innerHTML = '<option value="ALL">Semua (PB & PD)</option>';
  pbpdSet.forEach(p => {
    pbpdSel.innerHTML += `<option value="${p}">${p}</option>`;
  });
}

function applyFilters() {
  const fUid = document.getElementById('filterUid').value;
  const fJenjang = document.getElementById('filterJenjang').value;
  const fPbPd = document.getElementById('filterPbPd').value;
  const fStatus = document.getElementById('filterStatus').value;
  const q = document.getElementById('searchInput').value.trim().toLowerCase();

  filteredData = rawData.filter(row => {
    const uid = getUidName(row);
    const jenjang = (row['Jenjang'] || '').trim();
    const pbpd = (row['PB / PD'] || '').trim();
    const nyala = isTrue(row['Ceklist Sudah Dilistriki PLN']);

    if (fUid !== 'ALL' && uid !== fUid) return false;
    if (fJenjang !== 'ALL' && jenjang !== fJenjang) return false;
    if (fPbPd !== 'ALL' && pbpd !== fPbPd) return false;
    if (fStatus === 'TRUE' && !nyala) return false;
    if (fStatus === 'FALSE' && nyala) return false;

    if (q) {
      const hay = [
        row['NPSN'], row['Nama Satuan Pendidikan'], row['UP3'],
        row['ULP'], row['Kabupaten'], row['Provinsi'], uid
      ].join(' ').toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });

  currentPage = 1;
  updateKpis();
  updateChartsAndSummary();
  updateMap();
  renderDetailTable();
}

function updateKpis() {
  const total = filteredData.length;
  const nyala = filteredData.filter(r => isTrue(r['Ceklist Sudah Dilistriki PLN'])).length;
  const survey = filteredData.filter(r => isTrue(r['Ceklist Survey Lapangan'])).length;
  const pb = filteredData.filter(r => (r['PB / PD'] || '').trim().toUpperCase() === 'PB').length;
  const pd = filteredData.filter(r => (r['PB / PD'] || '').trim().toUpperCase() === 'PD').length;

  document.getElementById('kpiTotal').textContent = total.toLocaleString('id-ID');
  document.getElementById('kpiNyala').textContent = nyala.toLocaleString('id-ID');
  document.getElementById('kpiNyalaPct').textContent = total ? ((nyala / total) * 100).toFixed(1) + '%' : '0%';
  document.getElementById('kpiSurvey').textContent = survey.toLocaleString('id-ID');
  document.getElementById('kpiSurveyPct').textContent = total ? ((survey / total) * 100).toFixed(1) + '%' : '0%';
  document.getElementById('kpiPb').textContent = pb.toLocaleString('id-ID');
  document.getElementById('kpiPd').textContent = pd.toLocaleString('id-ID');
}

function updateChartsAndSummary() {
  const summaryMap = {};
  PORTAL_CONFIG.UID_ORDER.forEach(u => {
    summaryMap[u] = { uid: u, total: 0, pb: 0, pd: 0, survey: 0, nyala: 0 };
  });

  filteredData.forEach(r => {
    const u = getUidName(r);
    if (!summaryMap[u]) {
      summaryMap[u] = { uid: u, total: 0, pb: 0, pd: 0, survey: 0, nyala: 0 };
    }
    summaryMap[u].total++;
    const pbpd = (r['PB / PD'] || '').trim().toUpperCase();
    if (pbpd === 'PB') summaryMap[u].pb++;
    if (pbpd === 'PD') summaryMap[u].pd++;
    if (isTrue(r['Ceklist Survey Lapangan'])) summaryMap[u].survey++;
    if (isTrue(r['Ceklist Sudah Dilistriki PLN'])) summaryMap[u].nyala++;
  });

  const rows = Object.values(summaryMap).filter(x => x.total > 0 || document.getElementById('filterUid').value === 'ALL');

  const tbody = document.getElementById('tbodySummary');
  tbody.innerHTML = '';
  let grand = { total: 0, pb: 0, pd: 0, survey: 0, nyala: 0 };

  rows.forEach(item => {
    grand.total += item.total;
    grand.pb += item.pb;
    grand.pd += item.pd;
    grand.survey += item.survey;
    grand.nyala += item.nyala;
    const pct = item.total ? ((item.nyala / item.total) * 100).toFixed(1) : '0.0';

    tbody.innerHTML += `
      <tr class="hover:bg-slate-50">
        <td class="py-2 px-3 font-semibold text-slate-700">${item.uid}</td>
        <td class="py-2 px-2 text-right">${item.total.toLocaleString('id-ID')}</td>
        <td class="py-2 px-2 text-right text-indigo-600">${item.pb.toLocaleString('id-ID')}</td>
        <td class="py-2 px-2 text-right text-cyan-700">${item.pd.toLocaleString('id-ID')}</td>
        <td class="py-2 px-2 text-right text-amber-600">${item.survey.toLocaleString('id-ID')}</td>
        <td class="py-2 px-2 text-right font-semibold text-emerald-600">${item.nyala.toLocaleString('id-ID')}</td>
        <td class="py-2 px-3 text-right font-semibold">${pct}%</td>
      </tr>
    `;
  });

  const grandPct = grand.total ? ((grand.nyala / grand.total) * 100).toFixed(1) : '0.0';
  document.getElementById('tfootSummary').innerHTML = `
    <tr>
      <td class="py-2.5 px-3">TOTAL SUMKAL</td>
      <td class="py-2.5 px-2 text-right">${grand.total.toLocaleString('id-ID')}</td>
      <td class="py-2.5 px-2 text-right">${grand.pb.toLocaleString('id-ID')}</td>
      <td class="py-2.5 px-2 text-right">${grand.pd.toLocaleString('id-ID')}</td>
      <td class="py-2.5 px-2 text-right">${grand.survey.toLocaleString('id-ID')}</td>
      <td class="py-2.5 px-2 text-right text-emerald-700">${grand.nyala.toLocaleString('id-ID')}</td>
      <td class="py-2.5 px-3 text-right">${grandPct}%</td>
    </tr>
  `;

  const labels = rows.map(r => r.uid.replace('UID ', '').replace('UIW ', ''));
  const belumData = rows.map(r => r.total - r.nyala);
  const nyalaData = rows.map(r => r.nyala);

  if (chartUidInstance) chartUidInstance.destroy();
  chartUidInstance = new Chart(document.getElementById('chartUid'), {
    type: 'bar',
    data: {
      labels,
      datasets: [
        { label: 'Sudah Dilistriki', data: nyalaData, backgroundColor: '#10b981', borderRadius: 4 },
        { label: 'Dalam Proses / Belum', data: belumData, backgroundColor: '#0284c7', borderRadius: 4 }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      scales: {
        x: { stacked: true, grid: { display: false } },
        y: { stacked: true, beginAtZero: true }
      },
      plugins: { legend: { position: 'top' } }
    }
  });

  const jenjangCounts = {};
  filteredData.forEach(r => {
    const j = (r['Jenjang'] || 'Lainnya').trim();
    jenjangCounts[j] = (jenjangCounts[j] || 0) + 1;
  });

  if (chartJenjangInstance) chartJenjangInstance.destroy();
  chartJenjangInstance = new Chart(document.getElementById('chartJenjang'), {
    type: 'doughnut',
    data: {
      labels: Object.keys(jenjangCounts),
      datasets: [{
        data: Object.values(jenjangCounts),
        backgroundColor: ['#0284c7', '#10b981', '#f59e0b', '#6366f1', '#ec4899', '#8b5cf6', '#14b8a6']
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { position: 'bottom' } }
    }
  });
}

function updateMap() {
  if (!markersLayer) return;
  markersLayer.clearLayers();
  const bounds = [];

  const validCoords = [];
  for (let i = 0; i < filteredData.length; i++) {
    const r = filteredData[i];
    const lat = parseFloat(String(r['Lintang'] || '').replace(',', '.'));
    const lon = parseFloat(String(r['Bujur'] || '').replace(',', '.'));
    if (!isNaN(lat) && !isNaN(lon) && lat !== 0 && lon !== 0) {
      validCoords.push({ r, lat, lon });
    }
  }

  const step = validCoords.length > PORTAL_CONFIG.MAX_MAP_MARKERS ? Math.ceil(validCoords.length / PORTAL_CONFIG.MAX_MAP_MARKERS) : 1;
  let plotted = 0;

  for (let i = 0; i < validCoords.length; i += step) {
    const { r, lat, lon } = validCoords[i];
    const nyala = isTrue(r['Ceklist Sudah Dilistriki PLN']);
    const marker = L.circleMarker([lat, lon], {
      renderer: canvasRenderer,
      radius: 4.5,
      fillColor: nyala ? '#10b981' : '#f43f5e',
      color: '#ffffff',
      weight: 0.8,
      opacity: 1,
      fillOpacity: 0.85
    });
    marker.bindPopup(`
      <div class="text-xs">
        <strong>${r['Nama Satuan Pendidikan'] || '-'}</strong><br/>
        NPSN: ${r['NPSN'] || '-'} (${r['Jenjang'] || '-'})<br/>
        Unit: ${getUidName(r)} - ${r['UP3'] || '-'}<br/>
        Layanan: ${r['PB / PD'] || '-'} (${r['Daya Akhir'] || '-'} VA)<br/>
        Status: <b>${nyala ? 'Sudah Dilistriki' : 'Belum Dilistriki'}</b>
      </div>
    `);
    markersLayer.addLayer(marker);
    bounds.push([lat, lon]);
    plotted++;
  }

  const mapNote = document.getElementById('mapNote');
  if (step > 1) {
    mapNote.textContent = `Menampilkan sampel ${plotted.toLocaleString('id-ID')} dari ${validCoords.length.toLocaleString('id-ID')} titik`;
  } else {
    mapNote.textContent = `Menampilkan ${plotted.toLocaleString('id-ID')} titik koordinat sekolah`;
  }

  if (bounds.length > 0) {
    mapInstance.fitBounds(bounds, { padding: [20, 20], maxZoom: 10 });
  }
}

function renderDetailTable() {
  const total = filteredData.length;
  const totalPages = Math.max(1, Math.ceil(total / rowsPerPage));
  if (currentPage > totalPages) currentPage = totalPages;

  const start = (currentPage - 1) * rowsPerPage;
  const pageItems = filteredData.slice(start, start + rowsPerPage);

  document.getElementById('detailCount').textContent = `Menampilkan ${total.toLocaleString('id-ID')} satuan pendidikan`;
  document.getElementById('pageInfo').textContent = `Halaman ${currentPage} dari ${totalPages.toLocaleString('id-ID')}`;
  document.getElementById('prevPage').disabled = currentPage <= 1;
  document.getElementById('nextPage').disabled = currentPage >= totalPages;

  const tbody = document.getElementById('tbodyDetail');
  tbody.innerHTML = '';

  pageItems.forEach(r => {
    const nyala = isTrue(r['Ceklist Sudah Dilistriki PLN']);
    const survey = isTrue(r['Ceklist Survey Lapangan']);
    const dayaAkhir = r['Daya Akhir'] ? Number(r['Daya Akhir']).toLocaleString('id-ID') : '-';

    tbody.innerHTML += `
      <tr class="hover:bg-slate-50">
        <td class="py-2 px-3 font-medium text-slate-700 whitespace-nowrap">${getUidName(r)}</td>
        <td class="py-2 px-3 whitespace-nowrap">${r['UP3'] || '-'}</td>
        <td class="py-2 px-3 whitespace-nowrap">${r['ULP'] || '-'}</td>
        <td class="py-2 px-3 font-mono text-slate-600">${r['NPSN'] || '-'}</td>
        <td class="py-2 px-3 font-semibold text-slate-800">${r['Nama Satuan Pendidikan'] || '-'}</td>
        <td class="py-2 px-2">${r['Jenjang'] || '-'}</td>
        <td class="py-2 px-2">${r['PB / PD'] || '-'}</td>
        <td class="py-2 px-3 text-right">${dayaAkhir}</td>
        <td class="py-2 px-3 text-center">
          <span class="px-2 py-0.5 rounded-full text-[11px] font-semibold ${survey ? 'bg-amber-100 text-amber-800' : 'bg-slate-100 text-slate-500'}">
            ${survey ? 'Sudah' : 'Belum'}
          </span>
        </td>
        <td class="py-2 px-3 text-center">
          <span class="px-2 py-0.5 rounded-full text-[11px] font-semibold ${nyala ? 'bg-emerald-100 text-emerald-800' : 'bg-rose-100 text-rose-700'}">
            ${nyala ? 'Dilistriki' : 'Proses'}
          </span>
        </td>
      </tr>
    `;
  });
}

// ==================== INISIALISASI HALAMAN ====================
document.addEventListener('DOMContentLoaded', () => {
  // Cek apakah sesi browser sudah login sebelumnya
  if (sessionStorage.getItem('ods_portal_auth') === '1') {
    unlockDashboard();
  }

  document.getElementById('loginForm').addEventListener('submit', (e) => {
    e.preventDefault();
    const entered = document.getElementById('passwordInput').value;
    if (entered === PORTAL_CONFIG.PASSWORD) {
      sessionStorage.setItem('ods_portal_auth', '1');
      document.getElementById('loginError').classList.add('hidden');
      unlockDashboard();
    } else {
      document.getElementById('loginError').classList.remove('hidden');
    }
  });

  document.getElementById('btnLogout').addEventListener('click', lockDashboard);

  ['filterUid', 'filterJenjang', 'filterPbPd', 'filterStatus'].forEach(id => {
    document.getElementById(id).addEventListener('change', applyFilters);
  });
  document.getElementById('searchInput').addEventListener('input', applyFilters);
  document.getElementById('btnReset').addEventListener('click', () => {
    document.getElementById('filterUid').value = 'ALL';
    document.getElementById('filterJenjang').value = 'ALL';
    document.getElementById('filterPbPd').value = 'ALL';
    document.getElementById('filterStatus').value = 'ALL';
    document.getElementById('searchInput').value = '';
    applyFilters();
  });
  document.getElementById('btnRefresh').addEventListener('click', () => loadDataset(activeMode, true));
  document.getElementById('prevPage').addEventListener('click', () => {
    if (currentPage > 1) { currentPage--; renderDetailTable(); }
  });
  document.getElementById('nextPage').addEventListener('click', () => {
    currentPage++; renderDetailTable();
  });
});
