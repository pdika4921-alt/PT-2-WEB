const https = require('https');
const http = require('http');
const config = require('../config');

// Sheet "MANUAL/GAMAS" pada DASHBOARD MATERIAL.
// Kolom yang dipakai: A TIKET | B KET | D PID | E GI | F ID RESV | M ID BARANG | N VOLUME.
const DEFAULT_SHEET_URL =
  'https://docs.google.com/spreadsheets/d/1a-RklR3S_3_5c2OkithjUTzuwEaTba21h2uMdNrCKtU/export?format=csv&gid=462113428';

const CACHE_TTL_MS = 5 * 60 * 1000;
let cache = { at: 0, rows: [], error: null };

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
      let data = '';
      res.on('data', chunk => { data += chunk; });
      res.on('end', () => resolve(data));
    }).on('error', reject);
  });
}

/** Parser CSV yang tahan koma di dalam tanda kutip (banyak tiket mengandung koma). */
function parseCSV(text) {
  const rows = [];
  let row = [];
  let cell = '';
  let quoted = false;

  for (let i = 0; i < text.length; i += 1) {
    const c = text[i];
    const next = text[i + 1];
    if (c === '"') {
      if (quoted && next === '"') {
        cell += '"';
        i += 1;
      } else {
        quoted = !quoted;
      }
    } else if (c === ',' && !quoted) {
      row.push(cell.trim());
      cell = '';
    } else if ((c === '\r' || c === '\n') && !quoted) {
      if (c === '\r' && next === '\n') i += 1;
      row.push(cell.trim());
      if (row.length > 1 || row[0] !== '') rows.push(row);
      row = [];
      cell = '';
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
  return s === '#N/A' || s === '#VALUE!' ? '' : s;
};

function toNumber(v) {
  let s = clean(v).replace(/Rp/gi, '').replace(/\s/g, '');
  if (!s) return 0;
  // "1.234,56" → desimal koma; "Rp6.860.000" → titik adalah pemisah ribuan.
  if (/,\d+$/.test(s)) {
    s = s.replace(/\./g, '').replace(',', '.');
  } else {
    s = s.replace(/[^\d]/g, '');
  }
  const n = Number(s);
  return Number.isFinite(n) ? n : 0;
}

function mapRow(cells, index) {
  const c = (i) => clean(cells[i]);
  return {
    no: index + 1,
    tiket: c(0),                 // A
    ket: c(1),                   // B
    status: c(2),                // C
    pid: c(3),                   // D
    gi: c(4),                    // E — bon/goods issue
    idResv: c(5),                // F — ID reservasi
    sisaBudget: c(6),            // G
    tanggal: c(7),               // H
    pengambil: c(8),             // I
    waspang: c(9),               // J
    lokasi: c(10),               // K
    namaWh: c(11),               // L
    idBarang: c(12),             // M
    volume: toNumber(cells[13]), // N
    khs: c(14),                  // O
    totalNilai: toNumber(cells[15]), // P
    noRfc: c(16),                // Q
    statusTransaksi: c(19),      // T
    mulaiPid: c(21),             // V
    selesaiPid: c(22),           // W
    umurPid: c(23)               // X
  };
}

async function getWarehouseData(force = false) {
  const url = config.WAREHOUSE_SHEET_CSV_URL || DEFAULT_SHEET_URL;
  const fresh = Date.now() - cache.at < CACHE_TTL_MS;

  if (!force && fresh && cache.rows.length) {
    return { rows: cache.rows, fetchedAt: cache.at, error: cache.error, stale: false };
  }

  try {
    const text = await fetchUrl(url);
    const rows = parseCSV(text).slice(1).map(mapRow);
    if (rows.length === 0) throw new Error('Sheet tidak mengandung baris data');
    cache = { at: Date.now(), rows, error: null };
    return { rows, fetchedAt: cache.at, error: null, stale: false };
  } catch (err) {
    const message = err && err.message ? err.message : String(err);
    // Kalau fetch gagal, tetap sajikan data terakhir daripada halaman kosong.
    return {
      rows: cache.rows,
      fetchedAt: cache.at,
      error: message,
      stale: cache.rows.length > 0
    };
  }
}

module.exports = { getWarehouseData, parseCSV, mapRow };
