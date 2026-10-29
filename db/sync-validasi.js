const https = require('https');
const http = require('http');
const db = require('./connection');

let lastSyncTime = null;
let lastSyncStatus = 'idle';
let lastSyncError = null;

function parseCSV(text) {
  const lines = [];
  let row = [];
  let inQuotes = false;
  let cell = '';

  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    const next = text[i + 1];

    if (char === '"') {
      if (inQuotes && next === '"') {
        cell += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === ',' && !inQuotes) {
      row.push(cell.trim());
      cell = '';
    } else if ((char === '\r' || char === '\n') && !inQuotes) {
      if (char === '\r' && next === '\n') {
        i++;
      }
      row.push(cell.trim());
      if (row.length > 1 || row[0] !== '') {
        lines.push(row);
      }
      row = [];
      cell = '';
    } else {
      cell += char;
    }
  }

  if (cell || row.length > 0) {
    row.push(cell.trim());
    if (row.length > 1 || row[0] !== '') {
      lines.push(row);
    }
  }

  return lines;
}

function fetchUrl(url) {
  return new Promise((resolve, reject) => {
    const client = url.startsWith('https') ? https : http;
    client.get(url, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        return fetchUrl(res.headers.location).then(resolve).catch(reject);
      }
      if (res.statusCode !== 200) return reject(new Error(`HTTP ${res.statusCode}`));
      let data = '';
      res.on('data', chunk => { data += chunk; });
      res.on('end', () => resolve(data));
    }).on('error', reject);
  });
}

const clean = (v) => {
  if (v === undefined || v === null) return null;
  const s = String(v).trim();
  if (s === '' || s === '#N/A' || s === '#VALUE!') return null;
  return s;
};

function parseTanggal(s) {
  if (!s) return null;
  const m = s.match(/(\d{2})\/(\d{2})\/(\d{4})/);
  if (m) return `${m[3]}-${m[2]}-${m[1]}`;
  return s.split(' ')[0];
}

function toCoord(v) {
  const s = clean(v);
  if (!s) return null;
  const n = parseFloat(String(s).replace(',', '.'));
  return Number.isNaN(n) ? null : n;
}

// Pemetaan kolom sheet "RESPON VALID 4" (gid=323518508):
// 0 Tanggal | 1 Teknisi | 2 STO | 3 HSA Area | 5 Splitter | 6 Nama ODP
// 7 IP OLT | 8 Slot | 9 Port | 10 Kapasitas Kabel | 11 Distribusi | 12 Core
// 13 Lat | 14 Long | 15 Copy Hasil Valins | 16 Eviden ODP Terbuka
// 17 Eviden ODP Tertutup | 18 Eviden Closure | 19 Foto Lengkap | 20 Eviden Splitter
// 21 Eviden FTM Jumper | 22 Eviden OPM1 | 23 Eviden OPM2 | 24 ID Valins
// 25 District | 30 Eviden Pengembalian PS1:8 | 32 NO EA FTM | 33 NO OA FTM
// 34 Klasifikasi Eksekutor | 35 Klasifikasi Order | 36 No Order | 37 Nama Mitra
async function syncValidasi(csvContent = null, csvUrl = null) {
  try {
    lastSyncStatus = 'running';
    let text = csvContent;
    if (!text && csvUrl) {
      text = await fetchUrl(csvUrl);
    }
    if (!text) {
      lastSyncStatus = 'no_data';
      return { ok: false, message: 'No CSV content or URL provided' };
    }

    const rows = parseCSV(text);
    // skip header row
    const dataRows = rows.slice(1);
    if (dataRows.length === 0) {
      return { ok: true, count: 0, message: 'No data rows found in CSV' };
    }

    const insertStmt = db.prepare(`
      INSERT INTO validasi_pekerjaan (
        tanggal, teknisi, sto, hsa_area, tipe_splitter, nama_odp,
        ip_olt, slot_olt, port_olt, kapasitas_kabel, distribusi, core_distribusi,
        latitude, longitude, textarea_data, eviden_odp_terbuka, eviden_odp_tertutup,
        eviden_closure, eviden_foto_lengkap, eviden_spliter, eviden_ftm_jumper,
        eviden_opm1, eviden_opm2, eviden_pengembalian_ps8,
        id_valins, district, ea_ftm, oa_ftm,
        klasifikasi_eksekutor, klasifikasi_order, no_order, mitra,
        url_foto_eviden, keterangan, status_validasi,
        slot_out, core_feeder
      ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
    `);

    const updateStmt = db.prepare(`
      UPDATE validasi_pekerjaan SET
        teknisi = ?, sto = ?, hsa_area = ?, tipe_splitter = ?, nama_odp = ?,
        ip_olt = ?, slot_olt = ?, port_olt = ?, kapasitas_kabel = ?, distribusi = ?,
        core_distribusi = ?, latitude = ?, longitude = ?, textarea_data = ?,
        eviden_odp_terbuka = ?, eviden_odp_tertutup = ?, eviden_closure = ?,
        eviden_foto_lengkap = ?, eviden_spliter = ?, eviden_ftm_jumper = ?,
        eviden_opm1 = ?, eviden_opm2 = ?, eviden_pengembalian_ps8 = ?,
        district = ?, ea_ftm = ?, oa_ftm = ?,
        klasifikasi_eksekutor = ?, klasifikasi_order = ?, no_order = ?, mitra = ?,
        url_foto_eviden = ?, keterangan = ?, status_validasi = ?,
        slot_out = ?, core_feeder = ?,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `);

    const checkByIdValins = db.prepare("SELECT id FROM validasi_pekerjaan WHERE id_valins = ? AND id_valins != ''");
    const checkByOdpTanggal = db.prepare('SELECT id FROM validasi_pekerjaan WHERE nama_odp = ? AND tanggal = ?');

    const syncTx = db.transaction(() => {
      let count = 0;
      for (let i = 0; i < dataRows.length; i++) {
        const r = dataRows[i];
        if (!r || r.length < 7) continue;

        const namaOdp = clean(r[6]);
        if (!namaOdp) continue;

        const tanggal = parseTanggal(clean(r[0])) || new Date().toISOString().split('T')[0];
        const teknisi = clean(r[1]);
        const sto = clean(r[2]);
        const hsaArea = clean(r[3]);
        const tipeSplitter = clean(r[5]);
        const ipOlt = clean(r[7]);
        const slotOlt = clean(r[8]);
        const portOlt = clean(r[9]);
        const kapasitasKabel = clean(r[10]);
        const distribusi = clean(r[11]);
        const coreDistribusi = clean(r[12]);
        const lat = toCoord(r[13]);
        const lng = toCoord(r[14]);
        const textareaData = clean(r[15]);
        const evidenOdpTerbuka = clean(r[16]);
        const evidenOdpTertutup = clean(r[17]);
        const evidenClosure = clean(r[18]);
        const evidenFotoLengkap = clean(r[19]);
        const evidenSpliter = clean(r[20]);
        const evidenFtmJumper = clean(r[21]);
        const evidenOpm1 = clean(r[22]);
        const evidenOpm2 = clean(r[23]);
        const idValins = clean(r[24]);
        const district = clean(r[25]);
        const evidenPengembalianPs8 = clean(r[30]);
        const coreFeeder = clean(r[31]);
        const eaFtm = clean(r[32]);
        const oaFtm = clean(r[33]);
        const klasEksekutor = clean(r[34]);
        const klasOrder = clean(r[35]);
        const noOrder = clean(r[36]);
        const mitra = clean(r[37]);
        const slotOut = clean(r[4]); // PS 1:4 → SLOT OUT

        const isValid = Boolean(evidenOdpTerbuka || evidenOdpTertutup || evidenOpm1);
        const statusValidasi = isValid ? 'valid' : 'pending';

        const ketParts = [];
        if (mitra) ketParts.push(`Mitra: ${mitra}`);
        if (klasEksekutor) ketParts.push(`Eksekutor: ${klasEksekutor}`);
        if (klasOrder) ketParts.push(`Klas Order: ${klasOrder}`);
        if (noOrder) ketParts.push(`No Order: ${noOrder}`);
        const keterangan = ketParts.length > 0 ? ketParts.join(' | ') : null;

        const existing = idValins
          ? checkByIdValins.get(idValins)
          : checkByOdpTanggal.get(namaOdp, tanggal);

        if (existing) {
          updateStmt.run(
            teknisi, sto, hsaArea, tipeSplitter, namaOdp,
            ipOlt, slotOlt, portOlt, kapasitasKabel, distribusi,
            coreDistribusi, lat, lng, textareaData,
            evidenOdpTerbuka, evidenOdpTertutup, evidenClosure, evidenFotoLengkap,
            evidenSpliter, evidenFtmJumper, evidenOpm1, evidenOpm2, evidenPengembalianPs8,
            district, eaFtm, oaFtm,
            klasEksekutor, klasOrder, noOrder, mitra,
            evidenOdpTerbuka, keterangan, statusValidasi,
            slotOut, coreFeeder,
            existing.id
          );
        } else {
          insertStmt.run(
            tanggal, teknisi, sto, hsaArea, tipeSplitter, namaOdp,
            ipOlt, slotOlt, portOlt, kapasitasKabel, distribusi, coreDistribusi,
            lat, lng, textareaData,
            evidenOdpTerbuka, evidenOdpTertutup, evidenClosure, evidenFotoLengkap,
            evidenSpliter, evidenFtmJumper, evidenOpm1, evidenOpm2, evidenPengembalianPs8,
            idValins || `sync-${Date.now()}-${i}`,
            district, eaFtm, oaFtm,
            klasEksekutor, klasOrder, noOrder, mitra,
            evidenOdpTerbuka, keterangan, statusValidasi,
            slotOut, coreFeeder
          );
        }
        count++;
      }
      return count;
    });

    const count = syncTx();
    lastSyncTime = new Date().toISOString();
    lastSyncStatus = 'success';
    lastSyncError = null;

    return { ok: true, count, synced_at: lastSyncTime };
  } catch (err) {
    lastSyncStatus = 'failed';
    lastSyncError = err.message;
    console.error('Error syncing validasi:', err);
    return { ok: false, error: err.message };
  }
}

function getSyncStatus() {
  return {
    lastSyncTime,
    lastSyncStatus,
    lastSyncError
  };
}

module.exports = {
  syncValidasi,
  getSyncStatus
};
