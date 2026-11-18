// ==================== KONFIGURASI UTAMA (EDIT BAGIAN INI) ====================
const CONFIG = {
  // Password untuk membuka halaman depan dashboard
  PASSWORD: 'ODSLOLA2026',

  // Daftar 10 UID/UIW Regional Sumatera & Kalimantan (SUMKAL)
  SUMKAL_UIDS: [
    'UID Aceh',
    'UID Sumut',
    'UID Sumbar',
    'UID RKR',
    'UID S2JB',
    'UIW Babel',
    'UID Lampung',
    'UID Kalbar',
    'UID Kalselteng',
    'UID Kaltimra'
  ],

  // 1. Konfigurasi Google Sheets SEKOLAH VOKASI
  VOKASI: {
    spreadsheetId: '1WgHd9zG0FYvaKxRC2GrLLONx3z5RJ8xfNxEpywXMins',
    sheetName: 'SUMKAL',
    tq: 'select A,B,C,E,F,H,K,L,T,Y,AA,AB,AC,AJ,AT,AU,AV,AW,AX,BE,BM,BN,BO,BP,BS where B is not null'
  },

  // 2. Konfigurasi Google Sheets SEKOLAH TERPADU
  TERPADU: {
    spreadsheetId: '13ixWoCMBWe9Atzi6lqRaAK8Aw7J5B_SUClLfhW-mUIA',
    sheetName: 'SUMKAL',
    tq: 'select A,B,C,E,F,G,I,L,M,S,V,X,Y,Z,AE,AO,AP,AQ,AR,AS,AZ,BH,BI,BJ,BK where B is not null'
  },

  // 3. Konfigurasi Google Sheets SEKOLAH RAKYAT TAHAP 3 TAHUN 2026
  // Menarik langsung dari 10 tab UID SUMKAL agar bebas dari filter pada tab Rekap Nyala
  RAKYAT: {
    spreadsheetId: '1pjbSQasuvpqMtsMdQVjBBafWtgDlpMohTt5yI-gtc34',
    sumkalTabs: ['Aceh', 'Sumut', 'Sumbar', 'RKR', 'S2JB', 'Babel', 'Lampung', 'Kalbar', 'Kalselteng', 'Kaltimra'],
    filterSumkalOnly: true
  }
};

// ==================== STATE GLOBAL ====================
let activeProgram = 'VOKASI'; // 'VOKASI' | 'TERPADU' | 'RAKYAT'
const dataCache = { VOKASI: null, TERPADU: null, RAKYAT: null };
let allRows = [];
let filteredRows = [];
let map = null;
let markersLayer = null;
let chartUidInstance = null;
let chartKategoriInstance = null;

const UID_ORDER = [
  'UID Aceh', 'UID Sumut', 'UID Sumbar', 'UID RKR', 'UID S2JB',
  'UIW Babel', 'UID Lampung', 'UID Kalbar', 'UID Kalselteng', 'UID Kaltimra'
];

// ==================== LOGIN GATE ====================
(function initAuth() {
  const loginScreen = document.getElementById('loginScreen');
  const dashboardApp = document.getElementById('dashboardApp');
  const loginForm = document.getElementById('loginForm');
  const passwordInput = document.getElementById('passwordInput');
  const loginError = document.getElementById('loginError');

  if (sessionStorage.getItem('pln_sumkal_auth') === 'true') {
    loginScreen.classList.add('hidden');
    dashboardApp.classList.remove('hidden');
    bootDashboard();
  }

  loginForm.addEventListener('submit', (e) => {
    e.preventDefault();
    if (passwordInput.value === CONFIG.PASSWORD) {
      sessionStorage.setItem('pln_sumkal_auth', 'true');
      loginError.classList.add('hidden');
      loginScreen.classList.add('hidden');
      dashboardApp.classList.remove('hidden');
      bootDashboard();
    } else {
      loginError.classList.remove('hidden');
      passwordInput.focus();
    }
  });

  document.getElementById('btnLogout').addEventListener('click', () => {
    sessionStorage.removeItem('pln_sumkal_auth');
    location.reload();
  });
})();

// ==================== INISIALISASI PETA & EVENT ====================
function bootDashboard() {
  if (!map) {
    initMap();
    bindEvents();
  }
  switchProgram(activeProgram, false);
}

function initMap() {
  map = L.map('map').setView([-0.5, 108.5], 5);
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '&copy; OpenStreetMap contributors | PT PLN (Persero)'
  }).addTo(map);
  markersLayer = L.layerGroup().addTo(map);
}

function bindEvents() {
  ['filterUid', 'filterProv', 'filterKategori', 'filterNyala'].forEach((id) => {
    document.getElementById(id).addEventListener('change', applyFilters);
  });
  document.getElementById('filterSearch').addEventListener('input', applyFilters);

  document.getElementById('btnReset').addEventListener('click', () => {
    document.getElementById('filterUid').value = 'ALL';
    document.getElementById('filterProv').value = 'ALL';
    document.getElementById('filterKategori').value = 'ALL';
    document.getElementById('filterNyala').value = 'ALL';
    document.getElementById('filterSearch').value = '';
    applyFilters();
  });

  document.getElementById('btnRefresh').addEventListener('click', () => {
    dataCache[activeProgram] = null;
    loadProgramData(activeProgram, true);
  });

  document.getElementById('btnExportCsv').addEventListener('click', exportFilteredCsv);
}

// ==================== SWITCH TAB PROGRAM ====================
window.switchProgram = function(program, forceReload = false) {
  activeProgram = program;

  const btnVokasi = document.getElementById('tabVokasi');
  const btnTerpadu = document.getElementById('tabTerpadu');
  const btnRakyat = document.getElementById('tabRakyat');
  const headerTitle = document.getElementById('headerTitle');
  const labelFilterKategori = document.getElementById('labelFilterKategori');
  const labelFilterStatus = document.getElementById('labelFilterStatus');
  const kpiDayaLabel = document.getElementById('kpiDayaLabel');
  const mapLegend = document.getElementById('mapLegend');
  const chartUidSub = document.getElementById('chartUidSub');
  const chartKatTitle = document.getElementById('chartKatTitle');
  const chartKatSub = document.getElementById('chartKatSub');
  const tableTitle = document.getElementById('tableTitle');

  [btnVokasi, btnTerpadu, btnRakyat].forEach((b) => {
    b.className = 'px-3 py-1.5 rounded-lg text-xs font-bold transition tab-btn-inactive';
  });

  if (program === 'VOKASI' || program === 'TERPADU') {
    const isVokasi = program === 'VOKASI';
    (isVokasi ? btnVokasi : btnTerpadu).className = 'px-3 py-1.5 rounded-lg text-xs font-bold transition tab-btn-active';
    headerTitle.textContent = isVokasi
      ? 'Monitoring Kelistrikan Sekolah Vokasi 2026'
      : 'Monitoring Kelistrikan Sekolah Terpadu 2026';

    labelFilterKategori.textContent = 'Kategori Kelistrikan';
    labelFilterStatus.textContent = 'Jenis Permohonan (PB / PD)';
    kpiDayaLabel.textContent = 'Total Daya Tujuan';
    mapLegend.innerHTML = `
      <span class="inline-flex items-center gap-1.5"><span class="w-3 h-3 rounded-full bg-emerald-500 inline-block"></span> Reguler</span>
      <span class="inline-flex items-center gap-1.5"><span class="w-3 h-3 rounded-full bg-amber-500 inline-block"></span> Non Reguler</span>
    `;
    chartUidSub.textContent = 'Perbandingan Kategori Kelistrikan (Reguler vs Non Reguler)';
    chartKatTitle.textContent = 'Komposisi Permohonan PB / PD';
    chartKatSub.textContent = 'Distribusi Pasang Baru (PB) vs Penambahan Daya (PD)';
    tableTitle.textContent = isVokasi
      ? 'Rincian Data Sekolah Vokasi per Lokasi'
      : 'Rincian Data Sekolah Terpadu per Lokasi';
  } else {
    btnRakyat.className = 'px-3 py-1.5 rounded-lg text-xs font-bold transition tab-btn-active';
    headerTitle.textContent = 'Monitoring Kelistrikan Sekolah Rakyat Tahap 3 Tahun 2026';

    labelFilterKategori.textContent = 'Kategori / Kondisi Lahan';
    labelFilterStatus.textContent = 'Status Penyalaan';
    kpiDayaLabel.textContent = 'Total Rencana Daya';
    mapLegend.innerHTML = `
      <span class="inline-flex items-center gap-1.5"><span class="w-3 h-3 rounded-full bg-emerald-500 inline-block"></span> Nyala</span>
      <span class="inline-flex items-center gap-1.5"><span class="w-3 h-3 rounded-full bg-amber-500 inline-block"></span> Dalam Proses</span>
      <span class="inline-flex items-center gap-1.5"><span class="w-3 h-3 rounded-full bg-rose-500 inline-block"></span> Lahan / Belum</span>
    `;
    chartUidSub.textContent = 'Perbandingan lokasi sudah nyala vs belum nyala';
    chartKatTitle.textContent = 'Komposisi Kategori / Kondisi Lokasi';
    chartKatSub.textContent = 'Distribusi lokasi Sekolah Rakyat SUMKAL (31 Lokasi)';
    tableTitle.textContent = 'Rincian Data Sekolah Rakyat Tahap 3 SUMKAL per Lokasi';
  }

  document.getElementById('filterUid').value = 'ALL';
  document.getElementById('filterProv').value = 'ALL';
  document.getElementById('filterKategori').value = 'ALL';
  document.getElementById('filterNyala').value = 'ALL';
  document.getElementById('filterSearch').value = '';

  loadProgramData(program, forceReload);
};

// ==================== FETCH GOOGLE SHEETS (GVIZ JSONP) ====================
function fetchSheetViaJsonp(spreadsheetId, sheetName, tqQuery = '') {
  return new Promise((resolve, reject) => {
    const callbackName = 'gvizCb_' + Date.now() + '_' + Math.floor(Math.random() * 100000);
    const script = document.createElement('script');
    const timeout = setTimeout(() => {
      cleanup();
      reject(new Error(`Timeout (30 detik) mengambil data sheet ${sheetName || ''}. Coba klik Refresh.`));
    }, 30000);

    function cleanup() {
      clearTimeout(timeout);
      delete window[callbackName];
      if (script.parentNode) script.parentNode.removeChild(script);
    }

    window[callbackName] = function(response) {
      cleanup();
      if (!response || response.status === 'error') {
        const detail = (response && response.errors && response.errors.map((e) => e.detailed_message || e.message).join(' | ')) || 'Gagal membaca Google Sheets.';
        reject(new Error(detail));
        return;
      }
      resolve(response.table);
    };

    const sheetParam = sheetName ? `&sheet=${encodeURIComponent(sheetName)}` : '';
    const tqParam = tqQuery ? `&tq=${encodeURIComponent(tqQuery)}` : '';
    script.src = `https://docs.google.com/spreadsheets/d/${spreadsheetId}/gviz/tq?tqx=out:json;responseHandler:${callbackName}${sheetParam}${tqParam}`;
    script.onerror = () => {
      cleanup();
      reject(new Error('Gagal terhubung ke Google Sheets. Pastikan akses Share pada file Google Sheets sudah diset ke "Anyone with the link (Siapa saja yang memiliki link) - Viewer".'));
    };
    document.body.appendChild(script);
  });
}

function showBanner(type, htmlMsg) {
  const banner = document.getElementById('statusBanner');
  banner.classList.remove('hidden', 'bg-rose-50', 'border-rose-300', 'text-rose-800', 'bg-sky-50', 'border-sky-300', 'text-sky-800');
  if (type === 'error') {
    banner.classList.add('bg-rose-50', 'border-rose-300', 'text-rose-800');
  } else {
    banner.classList.add('bg-sky-50', 'border-sky-300', 'text-sky-800');
  }
  banner.innerHTML = htmlMsg;
}

function hideBanner() {
  document.getElementById('statusBanner').classList.add('hidden');
}

function normalizeUid(rawUid) {
  const u = String(rawUid || '').trim();
  if (!u) return '';
  const match = UID_ORDER.find((std) => std.toLowerCase() === u.toLowerCase());
  return match || u;
}

function isSumkalUid(uid) {
  const norm = normalizeUid(uid).toLowerCase();
  return CONFIG.SUMKAL_UIDS.some((s) => s.toLowerCase() === norm);
}

// Normalisasi "Regular" / "Reguler" -> "Reguler", "Non Reguler" / "Non Regular" -> "Non Reguler"
function normalizeKategoriKelistrikan(raw) {
  const s = String(raw || '').trim();
  if (!s) return 'Lainnya';
  const low = s.toLowerCase().replace(/[-_]/g, ' ');
  if (low.includes('non')) return 'Non Reguler';
  if (low.includes('regul')) return 'Reguler';
  return s;
}

// Normalisasi PB / PD -> "PB" / "PD"
function normalizePbPd(raw) {
  const s = String(raw || '').trim().toUpperCase();
  if (!s) return 'Lainnya';
  if (s === 'PB' || s.includes('PASANG BARU')) return 'PB';
  if (s === 'PD' || s.includes('TAMBAH DAYA') || s.includes('PERUBAHAN DAYA')) return 'PD';
  return s;
}

async function loadProgramData(program, forceReload = false) {
  const progCfg = CONFIG[program];
  const labelMap = {
    VOKASI: 'Sekolah Vokasi',
    TERPADU: 'Sekolah Terpadu',
    RAKYAT: 'Sekolah Rakyat Tahap 3'
  };
  const progLabel = labelMap[program] || program;

  if (!progCfg.spreadsheetId || progCfg.spreadsheetId.startsWith('TEMPEL_ID')) {
    allRows = [];
    populateFilterDropdowns();
    applyFilters();
    showBanner('info', `<strong>Konfigurasi Diperlukan (${progLabel}):</strong> Tempel ID Google Sheets <strong>${progLabel}</strong> Anda pada variabel <code>CONFIG.${program}.spreadsheetId</code> di file <code>app.js</code>.`);
    return;
  }

  if (!forceReload && dataCache[program]) {
    hideBanner();
    allRows = dataCache[program];
    populateFilterDropdowns();
    applyFilters();
    return;
  }

  try {
    document.getElementById('lastUpdated').textContent = `Memuat ${progLabel}...`;
    let parsed = [];

    if (program === 'RAKYAT' && Array.isArray(progCfg.sumkalTabs)) {
      const tables = await Promise.all(
        progCfg.sumkalTabs.map((tab) => fetchSheetViaJsonp(progCfg.spreadsheetId, tab))
      );
      tables.forEach((tbl, i) => {
        const defaultUid = CONFIG.SUMKAL_UIDS[i] || '';
        parsed.push(...parseRakyatUnitTab(tbl, defaultUid));
      });
    } else {
      const table = await fetchSheetViaJsonp(progCfg.spreadsheetId, progCfg.sheetName, progCfg.tq || '');
      parsed = parseGvizTable(table, program);
      if (progCfg.filterSumkalOnly) {
        parsed = parsed.filter((r) => isSumkalUid(r.uid));
      }
    }

    dataCache[program] = parsed;
    allRows = parsed;
    hideBanner();
    populateFilterDropdowns();
    applyFilters();

    const now = new Date();
    document.getElementById('lastUpdated').textContent =
      `Update: ${now.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })} WIB`;
  } catch (err) {
    allRows = [];
    populateFilterDropdowns();
    applyFilters();
    showBanner('error', `<strong>Gagal Memuat Data ${progLabel}:</strong> ${err.message}`);
  }
}

// ==================== PARSER KHUSUS 10 TAB UNIT SEKOLAH RAKYAT SUMKAL ====================
function parseRakyatUnitTab(table, defaultUid) {
  const rawRows = table.rows || [];
  const parsed = [];

  for (let r = 0; r < rawRows.length; r++) {
    const cells = rawRows[r].c || [];
    const getVal = (idx) => {
      if (idx < 0 || !cells[idx]) return '';
      const cell = cells[idx];
      if (typeof cell.v === 'boolean') return cell.v;
      if (cell.v != null && cell.v !== '') return cell.v;
      if (cell.f != null) return cell.f;
      return '';
    };

    const noRaw = String(getVal(0)).trim();
    const prov = String(getVal(1)).trim();
    if (!/^\d+$/.test(noRaw) || !prov || /^provinsi$/i.test(prov)) continue;

    const kab = String(getVal(2)).trim() || '-';
    const sekolahRaw = String(getVal(4)).trim();
    const sekolah = sekolahRaw || (kab !== '-' ? `Sekolah Rakyat ${kab}` : 'Lokasi Sekolah Rakyat');
    const alamat = String(getVal(7)).trim() || '-';

    const lat = parseFloat(String(getVal(8)).replace(',', '.'));
    const lng = parseFloat(String(getVal(9)).replace(',', '.'));
    const uid = normalizeUid(getVal(17)) || defaultUid;

    const jtm = parseNum(getVal(28));
    const jtr = parseNum(getVal(29));
    const gardu = parseNum(getVal(30));
    const sr = parseNum(getVal(31));
    const rab = parseNum(getVal(32));

    const valNyalaRaw = getVal(40);
    const bp = parseNum(getVal(46));
    const dayaRaw = parseNum(getVal(47));
    const realisasiRaw = parseNum(getVal(48));
    const ketClean = String(getVal(50)).trim();

    const dayaKva = dayaRaw > 10000 ? dayaRaw / 1000 : dayaRaw;
    const realisasiKva = realisasiRaw > 10000 ? realisasiRaw / 1000 : realisasiRaw;
    const statusNyala = normalizeStatusNyala(valNyalaRaw, '', realisasiKva);

    let kategori = '';
    if (statusNyala === 'NYALA') {
      kategori = (realisasiKva > 0 && dayaKva > 0 && realisasiKva < dayaKva)
        ? 'Nyala Butuh Tambah Daya'
        : 'Nyala Sesuai Daya Tujuan';
    } else if (/lahan kosong|pembebasan lahan|belum ada bangunan/i.test(ketClean)) {
      kategori = 'Belum Nyala (Lahan / Belum Ada Bangunan)';
    } else {
      kategori = 'Belum Nyala (Proses / Survey)';
    }

    parsed.push({
      uid,
      prov,
      kab,
      sekolah,
      alamat,
      jenjang: '-',
      kategori,
      pbPd: '-',
      dayaAwalKva: 0,
      dayaKva,
      realisasiKva,
      statusNyala,
      rawNyala: statusNyala === 'NYALA' ? 'Sudah Nyala' : 'Belum Nyala',
      jtm,
      jtr,
      gardu,
      sr,
      rab,
      bp,
      ket: ketClean || '-',
      fotoUrl: '',
      lat: !isNaN(lat) && Math.abs(lat) <= 15 ? lat : null,
      lng: !isNaN(lng) && lng >= 90 && lng <= 145 ? lng : null
    });
  }
  return parsed;
}

// ==================== PARSER UNTUK SEKOLAH VOKASI & SEKOLAH TERPADU ====================
function parseGvizTable(table, program) {
  const cols = (table.cols || []).map((c) => (c.label || c.id || '').trim());
  const rawRows = table.rows || [];
  let headerRowIdx = -1;
  let headers = cols;

  const hasNamedLabels = cols.some((c) => /uid|sekolah|provinsi|kab|daya|kategori/i.test(c));
  if (!hasNamedLabels) {
    for (let i = 0; i < Math.min(rawRows.length, 10); i++) {
      const vals = (rawRows[i].c || []).map((cell) => (cell && cell.v != null ? String(cell.v).trim() : ''));
      if (vals.some((v) => /uid|sekolah|provinsi|kab|kategori/i.test(v))) {
        headerRowIdx = i;
        headers = vals;
        break;
      }
    }
  }

  const findCol = (patterns) => {
    for (const p of patterns) {
      const idx = headers.findIndex((h) => p.test(h));
      if (idx !== -1) return idx;
    }
    return -1;
  };

  // Mapping sesuai struktur exact tab SUMKAL Sekolah Vokasi & Sekolah Terpadu
  const idxMap = {
    uidPrimary: findCol([/^uid$/i, /^uid\/uiw$/i, /^uid\/w$/i, /uid \/ uiw pln/i]),
    uidFallback: findCol([/uid/i]),
    prov: findCol([/^provinsi$/i, /^prov$/i]),
    kab: findCol([/^kabupaten$/i, /kab\/kota/i, /kabupaten\/kota/i]),
    sekolah: findCol([/nama satuan pendidikan/i, /^nama$/i, /nama sekolah/i, /^sekolah$/i]),
    jenjang: findCol([/^jenjang$/i]),
    alamat: findCol([/desa.*kelurahan/i, /^alamat$/i]),
    kategoriKelistrikan: findCol([/kategori kelistrikan/i]),
    pbPd: findCol([/pb\s*\/\s*pd/i]),
    dayaAwal: findCol([/daya awal/i, /daya listrik \(va\)/i, /daya listrik update/i]),
    dayaTujuan: findCol([/daya tujuan/i, /daya akhir/i, /rencana daya tersambung/i]),
    realisasiDaya: findCol([/realisasi daya/i]),
    nyala: findCol([/ceklist sudah dilistriki/i, /^nyala$/i, /status sambungan/i]),
    jtm: findCol([/volume jtm/i, /^jtm/i]),
    jtr: findCol([/volume jtr/i, /^jtr/i]),
    gardu: findCol([/volume gardu/i, /^gardu/i]),
    sr: findCol([/volume sr/i, /^sr$/i]),
    rab: findCol([/total rab/i, /^rab/i]),
    bp: findCol([/potensi penerimaan bp/i, /^bp$/i]),
    ket: findCol([/^keterangan$/i, /keterangan/i]),
    lat: findCol([/^lintang$/i, /^lat/i]),
    lng: findCol([/^bujur$/i, /^long/i, /^lng/i])
  };

  const parsed = [];
  for (let r = headerRowIdx + 1; r < rawRows.length; r++) {
    const cells = rawRows[r].c || [];
    const getVal = (idx) => {
      if (idx < 0 || !cells[idx]) return '';
      const cell = cells[idx];
      if (typeof cell.v === 'boolean') return cell.v;
      if (cell.v != null && cell.v !== '') return cell.v;
      if (cell.f != null) return cell.f;
      return '';
    };

    const rawUid1 = String(getVal(idxMap.uidPrimary)).trim();
    const rawUid2 = String(getVal(idxMap.uidFallback)).trim();
    const uid = normalizeUid(rawUid1 || rawUid2);
    const prov = String(getVal(idxMap.prov)).trim();
    const kab = String(getVal(idxMap.kab)).trim();
    const sekolahRaw = String(getVal(idxMap.sekolah)).trim();
    const alamat = String(getVal(idxMap.alamat)).trim();

    if (!uid && !sekolahRaw && !prov && !kab) continue;
    if (/^total|^jumlah/i.test(uid) || /^total|^jumlah/i.test(sekolahRaw) || /^total|^jumlah/i.test(prov)) continue;

    const sekolah = sekolahRaw || (kab ? `Sekolah ${kab}` : alamat || 'Lokasi Sekolah');
    const jenjang = String(getVal(idxMap.jenjang)).trim() || '-';

    const lat = parseFloat(String(getVal(idxMap.lat)).replace(',', '.'));
    const lng = parseFloat(String(getVal(idxMap.lng)).replace(',', '.'));

    // Daya Awal & Daya Tujuan (dalam VA di sheet Vokasi/Terpadu -> konversi ke kVA)
    const dayaAwalRaw = parseNum(getVal(idxMap.dayaAwal));
    const dayaTujuanRaw = parseNum(getVal(idxMap.dayaTujuan));
    const realisasiRaw = parseNum(getVal(idxMap.realisasiDaya));

    const dayaAwalKva = dayaAwalRaw >= 100 ? dayaAwalRaw / 1000 : dayaAwalRaw;
    const dayaBase = dayaTujuanRaw > 0 ? dayaTujuanRaw : dayaAwalRaw;
    const dayaKva = dayaBase >= 100 ? dayaBase / 1000 : dayaBase;
    const realisasiKva = realisasiRaw >= 100 ? realisasiRaw / 1000 : realisasiRaw;

    // Kategori Kelistrikan (Reguler vs Non Reguler) & PB / PD (PB vs PD)
    const kategori = normalizeKategoriKelistrikan(getVal(idxMap.kategoriKelistrikan));
    const pbPd = normalizePbPd(getVal(idxMap.pbPd));
    const statusNyala = normalizeStatusNyala(getVal(idxMap.nyala), '', realisasiRaw);

    parsed.push({
      uid: uid || 'Lainnya',
      prov: prov || '-',
      kab: kab || '-',
      sekolah,
      alamat: alamat || '-',
      jenjang,
      kategori,
      pbPd,
      dayaAwalKva,
      dayaKva,
      realisasiKva,
      statusNyala,
      rawNyala: statusNyala === 'NYALA' ? 'Sudah Nyala' : 'Belum Nyala',
      jtm: parseNum(getVal(idxMap.jtm)),
      jtr: parseNum(getVal(idxMap.jtr)),
      gardu: parseNum(getVal(idxMap.gardu)),
      sr: parseNum(getVal(idxMap.sr)),
      rab: parseNum(getVal(idxMap.rab)),
      bp: parseNum(getVal(idxMap.bp)),
      ket: String(getVal(idxMap.ket)).trim() || '-',
      fotoUrl: '',
      lat: !isNaN(lat) && Math.abs(lat) <= 15 ? lat : null,
      lng: !isNaN(lng) && lng >= 90 && lng <= 145 ? lng : null
    });
  }
  return parsed;
}

function parseNum(val) {
  if (typeof val === 'number') return isNaN(val) ? 0 : val;
  if (!val) return 0;
  let s = String(val).replace(/[^0-9.,-]/g, '').trim();
  if (!s) return 0;
  if (s.includes(',') && s.includes('.')) {
    if (s.lastIndexOf('.') > s.lastIndexOf(',')) {
      s = s.replace(/,/g, '');
    } else {
      s = s.replace(/\./g, '').replace(',', '.');
    }
  } else if (s.includes(',')) {
    const parts = s.split(',');
    if (parts[parts.length - 1].length === 3) {
      s = s.replace(/,/g, '');
    } else {
      s = s.replace(',', '.');
    }
  }
  const n = parseFloat(s);
  return isNaN(n) ? 0 : n;
}

function normalizeStatusNyala(raw, katNyala = '', realisasiDaya = 0) {
  if (raw === true) return 'NYALA';
  if (raw === false) return realisasiDaya > 0 ? 'NYALA' : 'BELUM';
  const rawStr = String(raw ?? '').toLowerCase().trim();
  if (rawStr === 'true') return 'NYALA';
  if (rawStr === 'false') return realisasiDaya > 0 ? 'NYALA' : 'BELUM';
  if (realisasiDaya > 0) return 'NYALA';

  const combined = `${rawStr} ${katNyala}`.toLowerCase().trim();
  if (!combined) return 'BELUM';
  if (combined.includes('belum') || combined.includes('tidak') || combined.includes('proses') || combined.includes('lahan') || combined === '0' || combined === 'no') {
    return 'BELUM';
  }
  if (combined.includes('nyala') || combined.includes('sudah') || combined.includes('berlistrik') || combined.includes('aktif') || combined === 'ya' || combined === '1' || combined === 'ok') {
    return 'NYALA';
  }
  return 'BELUM';
}

// ==================== POPULATE FILTER DROPDOWNS ====================
function populateFilterDropdowns() {
  const uidSelect = document.getElementById('filterUid');
  const provSelect = document.getElementById('filterProv');
  const katSelect = document.getElementById('filterKategori');
  const nyalaSelect = document.getElementById('filterNyala');

  const uids = [...new Set(allRows.map((r) => r.uid))].sort((a, b) => {
    const ia = UID_ORDER.indexOf(a);
    const ib = UID_ORDER.indexOf(b);
    if (ia !== -1 && ib !== -1) return ia - ib;
    if (ia !== -1) return -1;
    if (ib !== -1) return 1;
    return a.localeCompare(b);
  });
  const provs = [...new Set(allRows.map((r) => r.prov).filter((p) => p !== '-'))].sort();
  const kats = [...new Set(allRows.map((r) => r.kategori).filter(Boolean))].sort();

  uidSelect.innerHTML = `<option value="ALL">Semua UID SUMKAL (${uids.length} Unit)</option>` +
    uids.map((u) => `<option value="${escapeHtml(u)}">${escapeHtml(u)}</option>`).join('');

  provSelect.innerHTML = `<option value="ALL">Semua Provinsi (${provs.length})</option>` +
    provs.map((p) => `<option value="${escapeHtml(p)}">${escapeHtml(p)}</option>`).join('');

  katSelect.innerHTML = `<option value="ALL">Semua Kategori (${kats.length})</option>` +
    kats.map((k) => `<option value="${escapeHtml(k)}">${escapeHtml(k)}</option>`).join('');

  if (activeProgram === 'VOKASI' || activeProgram === 'TERPADU') {
    const pbpds = [...new Set(allRows.map((r) => r.pbPd).filter((x) => x && x !== '-'))].sort();
    nyalaSelect.innerHTML = `<option value="ALL">Semua PB / PD (${pbpds.length})</option>` +
      pbpds.map((p) => `<option value="${escapeHtml(p)}">${escapeHtml(p === 'PB' ? 'PB (Pasang Baru)' : (p === 'PD' ? 'PD (Penambahan Daya)' : p))}</option>`).join('');
  } else {
    nyalaSelect.innerHTML = `
      <option value="ALL">Semua Status</option>
      <option value="NYALA">Sudah Nyala / Berlistrik</option>
      <option value="BELUM">Belum Nyala / Konstruksi / Lahan</option>
    `;
  }
}

// ==================== FILTER & RENDER PIPELINE ====================
function applyFilters() {
  const fUid = document.getElementById('filterUid').value;
  const fProv = document.getElementById('filterProv').value;
  const fKat = document.getElementById('filterKategori').value;
  const fNyala = document.getElementById('filterNyala').value;
  const fSearch = document.getElementById('filterSearch').value.toLowerCase().trim();

  filteredRows = allRows.filter((r) => {
    if (fUid !== 'ALL' && r.uid !== fUid) return false;
    if (fProv !== 'ALL' && r.prov !== fProv) return false;
    if (fKat !== 'ALL' && r.kategori !== fKat) return false;
    if (fNyala !== 'ALL') {
      if (activeProgram === 'VOKASI' || activeProgram === 'TERPADU') {
        if (r.pbPd !== fNyala) return false;
      } else {
        if (r.statusNyala !== fNyala) return false;
      }
    }
    if (fSearch) {
      const hay = `${r.sekolah} ${r.kab} ${r.prov} ${r.uid} ${r.alamat} ${r.ket}`.toLowerCase();
      if (!hay.includes(fSearch)) return false;
    }
    return true;
  });

  updateKpis();
  updateMap();
  updateCharts();
  updateTable();
}

function updateKpis() {
  const total = filteredRows.length;
  const totalDayaKva = filteredRows.reduce((acc, r) => acc + r.dayaKva, 0);
  const totalRab = filteredRows.reduce((acc, r) => acc + r.rab, 0);

  const labelMap = { VOKASI: 'Sekolah Vokasi', TERPADU: 'Sekolah Terpadu', RAKYAT: 'Sekolah Rakyat' };
  document.getElementById('kpiTotalLabel').textContent = `Total ${labelMap[activeProgram]}`;
  document.getElementById('kpiTotal').textContent = total.toLocaleString('id-ID');
  document.getElementById('kpiDaya').innerHTML = `${totalDayaKva.toLocaleString('id-ID', { maximumFractionDigits: 1 })} <span class="text-xs font-bold">kVA</span>`;
  document.getElementById('kpiRab').textContent = formatRupiahShort(totalRab);

  const c2Label = document.getElementById('kpiCard2Label');
  const c2Body = document.getElementById('kpiCard2Body');
  const c2Sub = document.getElementById('kpiCard2Sub');
  const c3Label = document.getElementById('kpiCard3Label');
  const c3Body = document.getElementById('kpiCard3Body');
  const c3Sub = document.getElementById('kpiCard3Sub');

  if (activeProgram === 'VOKASI' || activeProgram === 'TERPADU') {
    const regCount = filteredRows.filter((r) => r.kategori === 'Reguler').length;
    const nonRegCount = filteredRows.filter((r) => r.kategori === 'Non Reguler').length;
    const pbCount = filteredRows.filter((r) => r.pbPd === 'PB').length;
    const pdCount = filteredRows.filter((r) => r.pbPd === 'PD').length;

    c2Label.textContent = 'Kategori Kelistrikan';
    c2Body.innerHTML = `
      <div class="flex items-baseline justify-between gap-2">
        <div>
          <span class="text-lg sm:text-xl font-extrabold text-emerald-700">${regCount.toLocaleString('id-ID')}</span>
          <span class="text-[11px] font-bold text-emerald-800 ml-0.5">Reguler</span>
        </div>
        <div class="text-right">
          <span class="text-lg sm:text-xl font-extrabold text-amber-600">${nonRegCount.toLocaleString('id-ID')}</span>
          <span class="text-[11px] font-bold text-amber-700 ml-0.5">Non Reg</span>
        </div>
      </div>
    `;
    const regPct = total > 0 ? ((regCount / total) * 100).toFixed(1) : '0.0';
    c2Sub.textContent = `Reguler ${regPct}% • Non Reguler ${nonRegCount.toLocaleString('id-ID')}`;

    c3Label.textContent = 'Permohonan PB / PD';
    c3Body.innerHTML = `
      <div class="flex items-baseline justify-between gap-2">
        <div>
          <span class="text-lg sm:text-xl font-extrabold text-sky-700">${pbCount.toLocaleString('id-ID')}</span>
          <span class="text-[11px] font-bold text-sky-800 ml-0.5">PB</span>
        </div>
        <div class="text-right">
          <span class="text-lg sm:text-xl font-extrabold text-indigo-700">${pdCount.toLocaleString('id-ID')}</span>
          <span class="text-[11px] font-bold text-indigo-800 ml-0.5">PD</span>
        </div>
      </div>
    `;
    c3Sub.textContent = `Pasang Baru: ${pbCount.toLocaleString('id-ID')} • Tambah Daya: ${pdCount.toLocaleString('id-ID')}`;
  } else {
    const nyalaCount = filteredRows.filter((r) => r.statusNyala === 'NYALA').length;
    const belumCount = total - nyalaCount;
    const pct = total > 0 ? ((nyalaCount / total) * 100).toFixed(1) : '0.0';

    c2Label.textContent = 'Sudah Nyala';
    c2Body.innerHTML = `<p class="text-2xl font-extrabold text-emerald-700">${nyalaCount.toLocaleString('id-ID')}</p>`;
    c2Sub.textContent = `${pct}% dari total terfilter`;

    c3Label.textContent = 'Dalam Proses / Lahan';
    c3Body.innerHTML = `<p class="text-2xl font-extrabold text-amber-700">${belumCount.toLocaleString('id-ID')}</p>`;
    c3Sub.textContent = 'Konstruksi & persiapan';
  }
}

// ==================== MAP RENDER ====================
function getMarkerColor(r) {
  if (activeProgram === 'VOKASI' || activeProgram === 'TERPADU') {
    return r.kategori === 'Reguler' ? '#10b981' : '#f59e0b';
  }
  if (r.statusNyala === 'NYALA') return '#10b981';
  const k = `${r.ket} ${r.kategori} ${r.rawNyala}`.toLowerCase();
  if (k.includes('lahan') || k.includes('belum ada bangunan') || k.includes('pembebasan')) return '#ef4444';
  return '#f59e0b';
}

function updateMap() {
  markersLayer.clearLayers();
  const bounds = [];
  let validCoords = 0;

  filteredRows.forEach((r) => {
    if (r.lat != null && r.lng != null) {
      validCoords++;
      const color = getMarkerColor(r);
      const isVokasiOrTerpadu = activeProgram === 'VOKASI' || activeProgram === 'TERPADU';

      const badgeText = isVokasiOrTerpadu ? `${r.kategori} • ${r.pbPd}` : (r.statusNyala === 'NYALA' ? 'Sudah Nyala' : 'Belum Nyala');
      const badgeClass = isVokasiOrTerpadu
        ? (r.kategori === 'Reguler' ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800')
        : (r.statusNyala === 'NYALA' ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800');

      const marker = L.circleMarker([r.lat, r.lng], {
        radius: 7.5,
        fillColor: color,
        color: '#ffffff',
        weight: 2,
        opacity: 1,
        fillOpacity: 0.92
      });

      const popupHtml = `
        <div class="text-xs space-y-1.5 min-w-[235px] max-w-[290px]">
          <div class="flex items-center justify-between gap-2">
            <span class="font-bold text-sky-800 bg-sky-100 px-2 py-0.5 rounded">${escapeHtml(r.uid)}</span>
            <span class="font-bold px-2 py-0.5 rounded ${badgeClass}">
              ${escapeHtml(badgeText)}
            </span>
          </div>
          <p class="font-extrabold text-slate-900 text-sm leading-snug pt-0.5">${escapeHtml(r.sekolah)}</p>
          <p class="text-slate-600">${escapeHtml(r.kab)}, ${escapeHtml(r.prov)}</p>
          <p class="text-[11px] text-slate-500">${escapeHtml(r.alamat)}</p>
          <div class="border-t border-slate-200 pt-1.5 grid grid-cols-2 gap-1 text-[11px]">
            <div><span class="text-slate-400">Kategori:</span> <strong>${escapeHtml(r.kategori)}</strong></div>
            <div><span class="text-slate-400">${isVokasiOrTerpadu ? 'PB/PD:' : 'Rencana Daya:'}</span> <strong>${isVokasiOrTerpadu ? escapeHtml(r.pbPd) : r.dayaKva.toLocaleString('id-ID') + ' kVA'}</strong></div>
            <div><span class="text-slate-400">Daya Tujuan:</span> <strong>${r.dayaKva.toLocaleString('id-ID')} kVA</strong></div>
            <div><span class="text-slate-400">RAB:</span> <strong>${formatRupiahShort(r.rab)}</strong></div>
          </div>
          ${r.ket && r.ket !== '-' ? `<p class="text-[11px] text-slate-600 bg-slate-50 p-1.5 rounded border border-slate-200"><strong>Ket:</strong> ${escapeHtml(r.ket)}</p>` : ''}
        </div>
      `;

      marker.bindPopup(popupHtml);
      markersLayer.addLayer(marker);
      bounds.push([r.lat, r.lng]);
    }
  });

  document.getElementById('mapNote').textContent =
    `Menampilkan ${validCoords} titik koordinat valid dari ${filteredRows.length} lokasi terfilter.`;

  if (bounds.length > 0) {
    map.fitBounds(bounds, { padding: [30, 30], maxZoom: 11 });
  } else {
    map.setView([-0.5, 108.5], 5);
  }
}

// ==================== CHARTS RENDER ====================
function updateCharts() {
  const isVokasiOrTerpadu = activeProgram === 'VOKASI' || activeProgram === 'TERPADU';
  const uidMap = {};
  UID_ORDER.forEach((u) => { uidMap[u] = { s1: 0, s2: 0 }; });

  filteredRows.forEach((r) => {
    if (!uidMap[r.uid]) uidMap[r.uid] = { s1: 0, s2: 0 };
    if (isVokasiOrTerpadu) {
      if (r.kategori === 'Reguler') uidMap[r.uid].s1++;
      else uidMap[r.uid].s2++;
    } else {
      if (r.statusNyala === 'NYALA') uidMap[r.uid].s1++;
      else uidMap[r.uid].s2++;
    }
  });

  const activeUids = Object.keys(uidMap).filter(
    (u) => UID_ORDER.includes(u) || uidMap[u].s1 + uidMap[u].s2 > 0
  );

  const labels = activeUids.map((u) => u.replace(/^UI[DW]\s+/i, ''));
  const dataS1 = activeUids.map((u) => uidMap[u].s1);
  const dataS2 = activeUids.map((u) => uidMap[u].s2);

  if (chartUidInstance) chartUidInstance.destroy();
  chartUidInstance = new Chart(document.getElementById('chartUid'), {
    type: 'bar',
    data: {
      labels,
      datasets: [
        { label: isVokasiOrTerpadu ? 'Reguler' : 'Sudah Nyala', data: dataS1, backgroundColor: '#10b981', borderRadius: 4 },
        { label: isVokasiOrTerpadu ? 'Non Reguler' : 'Belum Nyala / Proses', data: dataS2, backgroundColor: '#f59e0b', borderRadius: 4 }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { position: 'top', labels: { boxWidth: 12, font: { size: 11 } } } },
      scales: {
        x: { stacked: true, ticks: { font: { size: 10 } }, grid: { display: false } },
        y: { stacked: true, beginAtZero: true, ticks: { precision: 0, font: { size: 10 } } }
      }
    }
  });

  const katCounts = {};
  filteredRows.forEach((r) => {
    const k = isVokasiOrTerpadu ? (r.pbPd || 'Lainnya') : (r.kategori || 'Lainnya');
    katCounts[k] = (katCounts[k] || 0) + 1;
  });
  const katLabels = Object.keys(katCounts).map((k) =>
    isVokasiOrTerpadu ? (k === 'PB' ? 'PB (Pasang Baru)' : (k === 'PD' ? 'PD (Penambahan Daya)' : k)) : k
  );
  const katValues = Object.values(katCounts);
  const palette = ['#0284c7', '#6366f1', '#10b981', '#f59e0b', '#ec4899', '#8b5cf6', '#14b8a6'];

  if (chartKategoriInstance) chartKategoriInstance.destroy();
  chartKategoriInstance = new Chart(document.getElementById('chartKategori'), {
    type: 'doughnut',
    data: {
      labels: katLabels,
      datasets: [{
        data: katValues,
        backgroundColor: katLabels.map((_, i) => palette[i % palette.length]),
        borderWidth: 2,
        borderColor: '#ffffff'
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      cutout: '58%',
      plugins: {
        legend: { position: 'right', labels: { boxWidth: 11, font: { size: 11 } } }
      }
    }
  });
}

// ==================== TABLE RENDER (ADAPTIF PER TAB) ====================
function updateTable() {
  const thead = document.getElementById('tableHead');
  const tbody = document.getElementById('tableBody');
  document.getElementById('tableCount').textContent = `Menampilkan ${filteredRows.length} dari ${allRows.length} lokasi`;

  if (activeProgram === 'RAKYAT') {
    thead.innerHTML = `
      <tr>
        <th class="px-3 py-3 font-semibold">No</th>
        <th class="px-3 py-3 font-semibold">UID / UIW</th>
        <th class="px-3 py-3 font-semibold">Provinsi</th>
        <th class="px-3 py-3 font-semibold">Kab / Kota</th>
        <th class="px-3 py-3 font-semibold">Nama Sekolah</th>
        <th class="px-3 py-3 font-semibold">Alamat Lokasi</th>
        <th class="px-3 py-3 font-semibold text-right">Rencana Daya (kVA)</th>
        <th class="px-3 py-3 font-semibold text-right">Realisasi (kVA)</th>
        <th class="px-3 py-3 font-semibold text-right">JTM (kms)</th>
        <th class="px-3 py-3 font-semibold text-right">JTR (kms)</th>
        <th class="px-3 py-3 font-semibold text-right">Gardu (kVA)</th>
        <th class="px-3 py-3 font-semibold text-right">RAB (Rp)</th>
        <th class="px-3 py-3 font-semibold text-right">BP (Rp)</th>
        <th class="px-3 py-3 font-semibold text-center">Status Nyala</th>
        <th class="px-3 py-3 font-semibold">Keterangan / Kendala</th>
      </tr>
    `;

    if (filteredRows.length === 0) {
      tbody.innerHTML = `<tr><td colspan="15" class="px-4 py-8 text-center text-slate-400">Tidak ada data yang sesuai dengan filter.</td></tr>`;
      return;
    }

    tbody.innerHTML = filteredRows.map((r, idx) => {
      const isNyala = r.statusNyala === 'NYALA';
      return `
        <tr class="hover:bg-sky-50/60 transition">
          <td class="px-3 py-2.5 text-slate-500">${idx + 1}</td>
          <td class="px-3 py-2.5 font-semibold text-slate-800 whitespace-nowrap">${escapeHtml(r.uid)}</td>
          <td class="px-3 py-2.5 text-slate-700 whitespace-nowrap">${escapeHtml(r.prov)}</td>
          <td class="px-3 py-2.5 font-medium text-slate-800 whitespace-nowrap">${escapeHtml(r.kab)}</td>
          <td class="px-3 py-2.5 font-bold text-slate-900 min-w-[190px]">${escapeHtml(r.sekolah)}</td>
          <td class="px-3 py-2.5 text-slate-600 max-w-[230px]">${escapeHtml(r.alamat)}</td>
          <td class="px-3 py-2.5 text-right font-semibold text-slate-800">${r.dayaKva ? r.dayaKva.toLocaleString('id-ID') : '-'}</td>
          <td class="px-3 py-2.5 text-right font-semibold text-emerald-700">${r.realisasiKva ? r.realisasiKva.toLocaleString('id-ID') : '-'}</td>
          <td class="px-3 py-2.5 text-right text-slate-600">${r.jtm ? r.jtm.toLocaleString('id-ID') : '-'}</td>
          <td class="px-3 py-2.5 text-right text-slate-600">${r.jtr ? r.jtr.toLocaleString('id-ID') : '-'}</td>
          <td class="px-3 py-2.5 text-right text-slate-600">${r.gardu ? r.gardu.toLocaleString('id-ID') : '-'}</td>
          <td class="px-3 py-2.5 text-right text-slate-700 whitespace-nowrap">${r.rab ? r.rab.toLocaleString('id-ID') : '-'}</td>
          <td class="px-3 py-2.5 text-right text-slate-700 whitespace-nowrap">${r.bp ? r.bp.toLocaleString('id-ID') : '-'}</td>
          <td class="px-3 py-2.5 text-center whitespace-nowrap">
            <span class="px-2.5 py-0.5 rounded-full text-[11px] font-bold ${isNyala ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'}">
              ${isNyala ? 'Sudah Nyala' : 'Belum Nyala'}
            </span>
          </td>
          <td class="px-3 py-2.5 text-slate-600 max-w-[240px]">${escapeHtml(r.ket)}</td>
        </tr>
      `;
    }).join('');
    return;
  }

  // Tabel untuk Sekolah Vokasi & Sekolah Terpadu (Kategori Kelistrikan + PB / PD)
  thead.innerHTML = `
    <tr>
      <th class="px-3 py-3 font-semibold">No</th>
      <th class="px-3 py-3 font-semibold">UID / UIW</th>
      <th class="px-3 py-3 font-semibold">Provinsi</th>
      <th class="px-3 py-3 font-semibold">Kab / Kota</th>
      <th class="px-3 py-3 font-semibold">Nama Sekolah</th>
      <th class="px-3 py-3 font-semibold">Jenjang</th>
      <th class="px-3 py-3 font-semibold text-center">Kategori Kelistrikan</th>
      <th class="px-3 py-3 font-semibold text-center">PB / PD</th>
      <th class="px-3 py-3 font-semibold text-right">Daya Awal (kVA)</th>
      <th class="px-3 py-3 font-semibold text-right">Daya Tujuan (kVA)</th>
      <th class="px-3 py-3 font-semibold text-right">JTM (kms)</th>
      <th class="px-3 py-3 font-semibold text-right">JTR (kms)</th>
      <th class="px-3 py-3 font-semibold text-right">RAB (Rp)</th>
      <th class="px-3 py-3 font-semibold">Keterangan</th>
    </tr>
  `;

  if (filteredRows.length === 0) {
    tbody.innerHTML = `<tr><td colspan="14" class="px-4 py-8 text-center text-slate-400">Tidak ada data yang sesuai dengan filter.</td></tr>`;
    return;
  }

  tbody.innerHTML = filteredRows.map((r, idx) => {
    const isReg = r.kategori === 'Reguler';
    const isPb = r.pbPd === 'PB';
    return `
      <tr class="hover:bg-sky-50/60 transition">
        <td class="px-3 py-2.5 text-slate-500">${idx + 1}</td>
        <td class="px-3 py-2.5 font-semibold text-slate-800 whitespace-nowrap">${escapeHtml(r.uid)}</td>
        <td class="px-3 py-2.5 text-slate-700 whitespace-nowrap">${escapeHtml(r.prov)}</td>
        <td class="px-3 py-2.5 text-slate-700 whitespace-nowrap">${escapeHtml(r.kab)}</td>
        <td class="px-3 py-2.5 font-bold text-slate-900 min-w-[200px]">${escapeHtml(r.sekolah)}</td>
        <td class="px-3 py-2.5 text-slate-700 whitespace-nowrap">${escapeHtml(r.jenjang)}</td>
        <td class="px-3 py-2.5 text-center whitespace-nowrap">
          <span class="px-2.5 py-0.5 rounded-full text-[11px] font-bold ${isReg ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'}">
            ${escapeHtml(r.kategori)}
          </span>
        </td>
        <td class="px-3 py-2.5 text-center whitespace-nowrap">
          <span class="px-2.5 py-0.5 rounded-full text-[11px] font-bold ${isPb ? 'bg-sky-100 text-sky-800' : 'bg-indigo-100 text-indigo-800'}">
            ${escapeHtml(r.pbPd)}
          </span>
        </td>
        <td class="px-3 py-2.5 text-right text-slate-600">${r.dayaAwalKva ? r.dayaAwalKva.toLocaleString('id-ID') : '-'}</td>
        <td class="px-3 py-2.5 text-right font-semibold text-slate-800">${r.dayaKva ? r.dayaKva.toLocaleString('id-ID') : '-'}</td>
        <td class="px-3 py-2.5 text-right text-slate-700">${r.jtm ? r.jtm.toLocaleString('id-ID') : '-'}</td>
        <td class="px-3 py-2.5 text-right text-slate-700">${r.jtr ? r.jtr.toLocaleString('id-ID') : '-'}</td>
        <td class="px-3 py-2.5 text-right text-slate-700 whitespace-nowrap">${r.rab ? r.rab.toLocaleString('id-ID') : '-'}</td>
        <td class="px-3 py-2.5 text-slate-600 max-w-[220px] truncate" title="${escapeHtml(r.ket)}">${escapeHtml(r.ket)}</td>
      </tr>
    `;
  }).join('');
}

// ==================== CSV EXPORT ====================
function exportFilteredCsv() {
  const headers = ['Program', 'UID', 'Provinsi', 'Kab_Kota', 'Nama_Lokasi', 'Alamat', 'Kategori_Kelistrikan', 'PB_PD', 'Daya_Awal_kVA', 'Daya_Tujuan_kVA', 'Realisasi_Daya_kVA', 'Status_Nyala', 'JTM_kms', 'JTR_kms', 'Gardu_kVA', 'RAB_Rp', 'BP_Rp', 'Keterangan', 'Lat', 'Long'];
  const csvLines = [headers.join(',')];

  filteredRows.forEach((r) => {
    const row = [
      activeProgram, r.uid, r.prov, r.kab, r.sekolah, r.alamat, r.kategori, r.pbPd, r.dayaAwalKva, r.dayaKva, r.realisasiKva,
      r.statusNyala === 'NYALA' ? 'Sudah Nyala' : 'Belum Nyala',
      r.jtm, r.jtr, r.gardu, r.rab, r.bp, r.ket, r.lat ?? '', r.lng ?? ''
    ].map((v) => `"${String(v ?? '').replace(/"/g, '""')}"`);
    csvLines.push(row.join(','));
  });

  const blob = new Blob([csvLines.join('\n')], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `Monitoring_${activeProgram}_SUMKAL_${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

// ==================== HELPERS ====================
function formatRupiahShort(num) {
  if (!num || num === 0) return 'Rp 0';
  if (num >= 1e9) return `Rp ${(num / 1e9).toFixed(2).replace('.', ',')} M`;
  if (num >= 1e6) return `Rp ${(num / 1e6).toFixed(1).replace('.', ',')} Jt`;
  return `Rp ${num.toLocaleString('id-ID')}`;
}

function escapeHtml(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
