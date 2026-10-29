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

async function syncDatabasePt2(csvContent = null, csvUrl = null) {
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
    // baris ke-0 summary, ke-1 header, data mulai baris ke-2
    // mapping kolom r[0..28], r[30], r[32], r[33]
    const dataRows = rows.slice(2);
    if (dataRows.length === 0) {
      return { ok: true, count: 0, message: 'No data rows found in CSV' };
    }

    const insertPt2 = db.prepare(`
      INSERT INTO database_pt2 (
        no, area, nama_lop, tematik_project, sto, odp_name, jml_odp, jml_port, type_pt2,
        id_ihld, id_e_prop, datel_hsa, group_mitra, sub_mitra, progress_update, periode_order,
        tgl_golive, sp_pt2, prioritas, id_nimon, pid, id_sap, no_rfc, progress_terakhir,
        ket_lookup, jenis_olt, olt_tx, onu_rx, asumsi_onu_rx_cplus, ket, status_mapping, source_order_prioritas
      ) VALUES (
        ?, ?, ?, ?, ?, ?, ?, ?, ?,
        ?, ?, ?, ?, ?, ?, ?,
        ?, ?, ?, ?, ?, ?, ?, ?,
        ?, ?, ?, ?, ?, ?, ?, ?
      )
    `);

    const syncTransaction = db.transaction(() => {
      db.prepare('DELETE FROM database_pt2').run();
      let inserted = 0;
      for (const r of dataRows) {
        if (!r || r.length < 2 || !r[1]) continue;
        const g = (i) => (r[i] !== undefined ? clean(r[i]) : null);
        insertPt2.run(
          g(0), g(1), g(2), g(3), g(4), g(5),
          g(6), g(7), g(8), g(9), g(10), g(11),
          g(12), g(13), g(14), g(15), g(16), g(17),
          g(18), g(19), g(20), g(21), g(22), g(23),
          g(24), g(25), g(26), g(27), g(28),
          g(30), g(32), g(33)
        );
        inserted++;
      }
      return inserted;
    });

    const count = syncTransaction();
    lastSyncTime = new Date().toISOString();
    lastSyncStatus = 'success';
    lastSyncError = null;

    return { ok: true, count, synced_at: lastSyncTime };
  } catch (err) {
    lastSyncStatus = 'failed';
    lastSyncError = err.message;
    console.error('Error syncing database_pt2:', err);
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
  syncDatabasePt2,
  getSyncStatus
};
