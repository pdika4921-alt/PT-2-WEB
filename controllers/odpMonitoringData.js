const https = require('https');
const http = require('http');

const SHEET_ID = '1a-RklR3S_3_5c2OkithjUTzuwEaTba21h2uMdNrCKtU';
const SO_SHEETS = [
  'BOGOR',
  'SO SUKMAJAYA',
  'SO DEPOK',
  'SO CIBINONG',
  'SO DRAMAGA',
  'SO CILEUNGSI',
  'SO CISARUA',
  'SO CIAWI',
  'SO GUNUNG PUTRI',
  'SO KEDUNG HALANG'
];

/** Kode gudang SO sesuai permintaan filter. */
const SO_CODES = {
  BOGOR: { code: 'BGR', name: 'BOGOR' },
  'SO SUKMAJAYA': { code: 'SKJ', name: 'SO SUKMAJAYA' },
  'SO DEPOK': { code: 'DPK', name: 'SO DEPOK' },
  'SO CIBINONG': { code: 'CBI', name: 'SO CIBINONG' },
  'SO DRAMAGA': { code: 'DRM', name: 'SO DRAMAGA' },
  'SO CILEUNGSI': { code: 'CLS', name: 'SO CILEUNGSI' },
  'SO CISARUA': { code: 'CSR', name: 'SO CISARUA' },
  'SO CIAWI': { code: 'CIA', name: 'SO CIAWI' },
  'SO GUNUNG PUTRI': { code: 'GPY', name: 'SO GUNUNG PUTRI' },
  'SO KEDUNG HALANG': { code: 'KDH', name: 'SO KEDUNG HALANG' }
};

const SO_ORDER = ['SKJ', 'DPK', 'BGR', 'CBI', 'CLS', 'GPY', 'CSR', 'CIA', 'DRM', 'KDH'];

const soStatsPlaceholder = () => SO_ORDER.map(code => {
  const meta = Object.values(SO_CODES).find(s => s.code === code);
  return { code, name: meta ? meta.name : code, lokasi: 0, sudah: 0, belum: 0, qty: 0 };
});

const CACHE_TTL_MS = 30 * 60 * 1000;
let cache = { at: 0, data: null, error: null };

const MONTHS = { jan: 1, feb: 2, mar: 3, apr: 4, mei: 5, jun: 6, jul: 7, agu: 8, sep: 9, okt: 10, nov: 11, des: 12 };

function fetchUrl(url, redirects = 0) {
  return new Promise((resolve, reject) => {
    if (redirects > 5) return reject(new Error('Terlalu banyak redirect'));
    const client = url.startsWith('https') ? https : http;
    client.get(url, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        res.resume();
        const next = res.headers.location.startsWith('http')
          ? res.headers.location
          : new URL(res.headers.location, url).toString();
        return fetchUrl(next, redirects + 1).then(resolve, reject);
      }
      if (res.statusCode !== 200) {
        res.resume();
        return reject(new Error(`HTTP ${res.statusCode}`));
      }
      res.setEncoding('utf8');
      let text = '';
      res.on('data', chunk => { text += chunk; });
      res.on('end', () => resolve(text));
    }).on('error', reject);
  });
}

function parseCSV(text) {
  const rows = [];
  let row = [];
  let cell = '';
  let quoted = false;
  for (let i = 0; i < text.length; i += 1) {
    const c = text[i];
    const next = text[i + 1];
    if (c === '"') {
      if (quoted && next === '"') { cell += '"'; i += 1; } else quoted = !quoted;
    } else if (c === ',' && !quoted) {
      row.push(cell.trim()); cell = '';
    } else if ((c === '\r' || c === '\n') && !quoted) {
      if (c === '\r' && next === '\n') i += 1;
      row.push(cell.trim());
      if (row.length > 1 || row[0] !== '') rows.push(row);
      row = []; cell = '';
    } else {
      cell += c;
    }
  }
  if (cell || row.length) {
    row.push(cell.trim());
    if (row.length > 1 || row[0] !== '') rows.push(row);
  }
  return rows;
}

const clean = (v) => {
  const s = String(v == null ? '' : v).trim();
  return s === '#N/A' || s === '#VALUE!' || s === '0' ? '' : s;
};

function toNumber(v) {
  let s = clean(v).replace(/Rp/gi, '').replace(/\s/g, '');
  if (!s) return 0;
  if (/,\d+$/.test(s)) s = s.replace(/\./g, '').replace(',', '.');
  else s = s.replace(/[^\d]/g, '');
  const n = Number(s);
  return Number.isFinite(n) ? n : 0;
}

function parseDate(raw) {
  const m = String(raw || '').match(/(\d{1,2})\s*-\s*([A-Za-z]{3})[-\s]*(\d{2,4})/);
  if (!m) return null;
  const month = MONTHS[m[2].toLowerCase().slice(0, 3)];
  if (!month) return null;
  let year = Number(m[3]);
  if (year < 100) year += 2000;
  return { day: Number(m[1]), month, year };
}

/** ISO week key, misal 2026-W23. */
function weekKey(date) {
  if (!date) return '';
  const d = new Date(Date.UTC(date.year, date.month - 1, date.day));
  const day = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const week = Math.ceil(((d - yearStart) / 86400000 + 1) / 7);
  return `${d.getUTCFullYear()}-W${String(week).padStart(2, '0')}`;
}

const CATEGORY_RULES = [
  ['QE AKSES', 'QE AKSES'],
  ['QE', 'QE'],
  ['EXPAND', 'EXPAND'],
  ['KONSTRUKSI', 'KONSTRUKSI']
];

function getCategory(row) {
  const text = `${row.porto} ${row.program} ${row.ketManual}`.toUpperCase();
  for (const [needle, label] of CATEGORY_RULES) {
    if (text.includes(needle)) return label;
  }
  return '';
}

const isOdpMaterial = (row) => /ODP/i.test(`${row.idMaterial} ${row.namaMaterial}`);

function mapRow(cells, sheet) {
  const c = (i) => clean(cells[i]);
  const so = SO_CODES[sheet] || { code: sheet, name: sheet };
  return {
    sheet,
    soCode: so.code,
    soName: so.name,
    tanggal: c(0),
    reservasi: c(1),
    gi: c(2),
    rfc: c(3),
    jenis: c(4).toUpperCase(),
    porto: c(5),
    program: c(6),
    sto: c(7),
    lokasi: c(11),
    ketManual: c(12),
    idMaterial: c(13),
    qty: toNumber(cells[14]),
    mitra: c(17),
    namaMaterial: c(18)
  };
}

async function mapLimit(items, limit, worker) {
  const results = new Array(items.length);
  let cursor = 0;
  const runners = Array.from({ length: Math.max(1, Math.min(limit, items.length)) }, async () => {
    while (cursor < items.length) {
      const idx = cursor;
      cursor += 1;
      results[idx] = await worker(items[idx], idx);
    }
  });
  await Promise.all(runners);
  return results;
}

async function fetchAllRows() {
  const results = await mapLimit(SO_SHEETS, 3, async (sheet) => {
    const url = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/gviz/tq?tqx=out:csv&sheet=${encodeURIComponent(sheet)}`;
    const text = await fetchUrl(url);
    return parseCSV(text).slice(1).map(cells => mapRow(cells, sheet));
  });
  return results.flat();
}

function aggregate(rows) {
  const locations = new Map();
  const materials = new Map();
  const soStats = new Map(SO_ORDER.map(code => {
    const meta = Object.values(SO_CODES).find(s => s.code === code);
    return [code, { code, name: meta ? meta.name : code, lokasi: 0, sudah: 0, belum: 0, qty: 0 }];
  }));
  const stoStats = new Map();
  const programStats = new Map();
  const mitraStats = new Map();
  const weekly = new Map();
  let sourceRows = 0;
  let odpRows = 0;

  const eligible = rows.filter(r => r.jenis === 'PENGELUARAN' && getCategory(r));
  sourceRows = eligible.length;

  eligible.forEach(r => {
    const lokasi = r.lokasi;
    if (!lokasi || lokasi === '-') return;
    const mitra = r.mitra && r.mitra !== '-' ? r.mitra : 'Tanpa Mitra';
    const key = `${r.soCode}|${r.sto || '-'}|${lokasi}|${mitra}`;
    if (!locations.has(key)) {
      locations.set(key, {
        key,
        soCode: r.soCode,
        soName: r.soName,
        sto: r.sto || '-',
        lokasi,
        mitra,
        categories: new Set(),
        materials: new Map(),
        totalQty: 0,
        odpQty: 0,
        weeks: new Map(),
        lastDate: ''
      });
    }
    const loc = locations.get(key);
    loc.totalQty += r.qty;
    loc.categories.add(getCategory(r));
    if (r.tanggal > loc.lastDate) loc.lastDate = r.tanggal;

    if (isOdpMaterial(r)) {
      odpRows += 1;
      loc.odpQty += r.qty;
      const id = r.idMaterial || r.namaMaterial || 'ODP';
      const mat = loc.materials.get(id) || { id, nama: r.namaMaterial || id, qty: 0 };
      mat.qty += r.qty;
      loc.materials.set(id, mat);

      const globalMat = materials.get(id) || { id, nama: r.namaMaterial || id, qty: 0, locations: new Set() };
      globalMat.qty += r.qty;
      globalMat.locations.add(key);
      materials.set(id, globalMat);

      const wk = weekKey(parseDate(r.tanggal));
      if (wk) {
        weekly.set(wk, (weekly.get(wk) || 0) + r.qty);
        loc.weeks.set(wk, (loc.weeks.get(wk) || 0) + r.qty);
      }
    }
  });

  const categoryPriority = ['QE AKSES', 'QE', 'EXPAND', 'KONSTRUKSI'];
  const locationList = [...locations.values()].map(loc => {
    const program = categoryPriority.find(c => loc.categories.has(c)) || '';
    return {
      key: loc.key,
      soCode: loc.soCode,
      soName: loc.soName,
      sto: loc.sto,
      lokasi: loc.lokasi,
      mitra: loc.mitra,
      program,
      status: loc.odpQty > 0 ? 'SUDAH' : 'BELUM',
      totalQty: loc.totalQty,
      odpQty: loc.odpQty,
      lastDate: loc.lastDate,
      materials: [...loc.materials.values()].sort((a, b) => b.qty - a.qty),
      weeks: Object.fromEntries([...loc.weeks.entries()])
    };
  }).sort((a, b) => SO_ORDER.indexOf(a.soCode) - SO_ORDER.indexOf(b.soCode)
    || a.sto.localeCompare(b.sto) || a.lokasi.localeCompare(b.lokasi));

  locationList.forEach(loc => {
    const so = soStats.get(loc.soCode) || { code: loc.soCode, name: loc.soName, lokasi: 0, sudah: 0, belum: 0, qty: 0 };
    so.lokasi += 1;
    so[loc.status === 'SUDAH' ? 'sudah' : 'belum'] += 1;
    so.qty += loc.odpQty;
    soStats.set(loc.soCode, so);

    const s = stoStats.get(loc.sto) || { sto: loc.sto, lokasi: 0, sudah: 0, belum: 0, qty: 0 };
    s.lokasi += 1;
    s[loc.status === 'SUDAH' ? 'sudah' : 'belum'] += 1;
    s.qty += loc.odpQty;
    stoStats.set(loc.sto, s);

    const p = programStats.get(loc.program) || { program: loc.program || 'LAIN', lokasi: 0, sudah: 0, belum: 0, qty: 0 };
    p.lokasi += 1;
    p[loc.status === 'SUDAH' ? 'sudah' : 'belum'] += 1;
    p.qty += loc.odpQty;
    programStats.set(loc.program, p);

    const m = mitraStats.get(loc.mitra) || { mitra: loc.mitra, lokasi: 0, sudah: 0, belum: 0, qty: 0 };
    m.lokasi += 1;
    m[loc.status === 'SUDAH' ? 'sudah' : 'belum'] += 1;
    m.qty += loc.odpQty;
    mitraStats.set(loc.mitra, m);
  });

  return {
    locations: locationList,
    materials: [...materials.values()]
      .map(m => ({ id: m.id, nama: m.nama, qty: m.qty, lokasi: m.locations.size }))
      .sort((a, b) => b.qty - a.qty),
    soStats: [...soStats.values()],
    stoStats: [...stoStats.values()].sort((a, b) => b.qty - a.qty || a.sto.localeCompare(b.sto)),
    programStats: [...programStats.values()].sort((a, b) => b.qty - a.qty),
    mitraStats: [...mitraStats.values()].sort((a, b) => b.qty - a.qty || a.mitra.localeCompare(b.mitra)),
    weekly: [...weekly.entries()].map(([week, qty]) => ({ week, qty })).sort((a, b) => a.week.localeCompare(b.week)),
    totals: {
      lokasi: locationList.length,
      sudah: locationList.filter(l => l.status === 'SUDAH').length,
      belum: locationList.filter(l => l.status === 'BELUM').length,
      unit: locationList.reduce((s, l) => s + l.odpQty, 0)
    },
    counts: { sourceRows, odpRows, sheetRows: rows.length }
  };
}

function emptyData(error = null, loading = false) {
  return {
    locations: [], materials: [], soStats: soStatsPlaceholder(), stoStats: [], programStats: [], mitraStats: [], weekly: [],
    totals: { lokasi: 0, sudah: 0, belum: 0, unit: 0 },
    counts: { sourceRows: 0, odpRows: 0, sheetRows: 0 },
    fetchedAt: 0, error, stale: false, loading
  };
}

function cachedData(extra = {}) {
  if (!cache.data) return emptyData(cache.error, Boolean(inFlight));
  return {
    ...cache.data,
    fetchedAt: cache.at,
    error: cache.error,
    stale: Date.now() - cache.at >= CACHE_TTL_MS,
    loading: Boolean(inFlight),
    ...extra
  };
}

let inFlight = null;

async function refreshOdpMonitoringData() {
  if (inFlight) return inFlight;
  inFlight = (async () => {
    try {
      const rows = await fetchAllRows();
      const data = aggregate(rows);
      cache = { at: Date.now(), data, error: null };
      return cachedData({ stale: false, loading: false });
    } catch (err) {
      const message = err && err.message ? err.message : String(err);
      cache.error = message;
      if (cache.data) return cachedData({ error: message, stale: true, loading: false });
      return emptyData(message, false);
    }
  })();
  const running = inFlight;
  running.finally(() => { if (inFlight === running) inFlight = null; });
  return running;
}

/** Render cepat: pakai cache bila ada, dan mulai scan background bila stale. */
function ensureOdpMonitoringData() {
  const stale = !cache.data || Date.now() - cache.at >= CACHE_TTL_MS;
  if (stale && !inFlight) {
    refreshOdpMonitoringData().catch(err => console.error('Gagal refresh ODP monitoring:', err));
  }
  return cachedData();
}

function getCachedOdpMonitoringData() {
  const data = cachedData();
  const stale = !data.fetchedAt || data.stale;
  if (stale && !inFlight) {
    refreshOdpMonitoringData().catch(err => console.error('Gagal refresh ODP monitoring:', err));
  }
  return cachedData();
}

async function getOdpMonitoringData(force = false) {
  if (!force && cache.data && Date.now() - cache.at < CACHE_TTL_MS) return cachedData();
  return refreshOdpMonitoringData();
}

module.exports = {
  getOdpMonitoringData,
  getCachedOdpMonitoringData,
  ensureOdpMonitoringData,
  refreshOdpMonitoringData,
  SO_SHEETS,
  parseCSV,
  getCategory,
  isOdpMaterial
};
