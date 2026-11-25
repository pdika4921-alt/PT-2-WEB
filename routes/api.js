const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const archiver = require('archiver');
const db = require('../db/connection');
const config = require('../config');
const { requireAuth } = require('../middleware/auth');
const { syncDatabasePt2, getSyncStatus: getDbpt2Status } = require('../db/sync-dbpt2');
const { syncValidasi, getSyncStatus: getValStatus } = require('../db/sync-validasi');
const {
  generateValid4Pdf,
  generateValid4Excel,
  generateMancoreImage,
  generateBastPdf
} = require('../controllers/documentGenerator');

// Nama ODP boleh mengandung "/" (contoh: ODP-CSR-FC/51) — amankan untuk nama file
const safeName = (s) => String(s || 'odp').replace(/[\\/:*?"<>|]+/g, '-');

// Generate maksimal 100 baris per file. Kalau lebih, dibagi beberapa file lalu di-zip.
const GENERATE_MAX = 100;
function splitGenerateItems(items, res, label) {
  if (items.length <= GENERATE_MAX) return [items];
  const total = Math.ceil(items.length / GENERATE_MAX);
  console.log(`${label}: ${items.length} data dibagi ${total} file @${GENERATE_MAX}.`);
  res.setHeader('X-Generate-Limit', String(GENERATE_MAX));
  res.setHeader('X-Generate-Chunks', String(total));
  res.setHeader('X-Requested-Count', String(items.length));
  const chunks = [];
  for (let i = 0; i < items.length; i += GENERATE_MAX) {
    chunks.push(items.slice(i, i + GENERATE_MAX));
  }
  return chunks;
}

async function sendChunkedZip(res, chunks, ext, generateFn, baseName) {
  const ts = Date.now();
  res.setHeader('Content-Type', 'application/zip');
  res.setHeader('Content-Disposition', `attachment; filename="${baseName}_${ts}_parts.zip"`);
  const archive = archiver('zip', { zlib: { level: 1 } });
  archive.on('error', (err) => {
    console.error('Archive error:', err);
    if (!res.headersSent) return res.status(500).json({ ok: false, error: err.message });
    res.destroy(err);
  });
  archive.pipe(res);

  for (let i = 0; i < chunks.length; i += 1) {
    const result = await generateFn(chunks[i]);
    const raw = result && result.buffer ? result.buffer : result;
    const buffer = Buffer.isBuffer(raw) ? raw : Buffer.from(raw);
    const fileExt = result && result.ext ? result.ext : ext;
    archive.append(buffer, {
      name: `${baseName}_${ts}_part${i + 1}.${fileExt}`,
      store: true
    });
  }
  await archive.finalize();
}

// Merge item dari request body dengan baris DB lengkap (frontend hanya kirim id + field editable)
function hydrateItems(items) {
  const getById = db.prepare('SELECT * FROM validasi_pekerjaan WHERE id = ?');
  const getByName = db.prepare('SELECT * FROM validasi_pekerjaan WHERE nama_odp = ? ORDER BY id DESC LIMIT 1');
  return items.map(it => {
    let full = null;
    if (it && it.id) full = getById.get(it.id);
    if (!full && it && it.nama_odp) full = getByName.get(it.nama_odp);
    if (!full) return it || {};
    // field editable dari frontend tetap menang (ea_ftm, oa_ftm, core_feeder)
    return Object.assign({}, full, it || {});
  });
}

// ODP tanpa eviden foto tidak ikut generate (pengaman kedua selain filter di browser)
const EVIDENCE_FIELDS = [
  'url_foto_eviden',
  'eviden_odp_terbuka',
  'eviden_odp_tertutup',
  'eviden_closure',
  'eviden_foto_lengkap',
  'eviden_spliter',
  'eviden_opm1'
];
function hasEvidence(it) {
  return EVIDENCE_FIELDS.some(f => String((it && it[f]) || '').trim() !== '');
}
function filterEvidenceItems(items, res, label) {
  const kept = [];
  const skipped = [];
  items.forEach(it => (hasEvidence(it) ? kept : skipped).push(it));
  if (skipped.length) {
    console.log(`${label}: ${skipped.length} ODP tanpa eviden dilewati dari generate.`);
    res.setHeader('X-No-Evidence-Count', String(skipped.length));
    res.setHeader('X-No-Evidence-List', encodeURIComponent(
      skipped.map(i => i.nama_odp || i.odp || '').join('\n')
    ));
  }
  return kept;
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    if (!fs.existsSync(config.UPLOAD_PATH)) {
      fs.mkdirSync(config.UPLOAD_PATH, { recursive: true });
    }
    cb(null, config.UPLOAD_PATH);
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname) || '.jpg';
    cb(null, `upload_${Date.now()}_${Math.random().toString(36).substring(2, 7)}${ext}`);
  }
});
const upload = multer({ storage, limits: { fileSize: 10 * 1024 * 1024 } });

// 1. GET /api/summary
router.get('/summary', (req, res) => {
  try {
    const summary = db.prepare('SELECT * FROM v_dashboard_summary').get() || {};
    const totalDatabasePt2 = db.prepare('SELECT COUNT(*) as cnt FROM database_pt2').get()?.cnt || 0;
    const progressPct = summary.total_pekerjaan > 0
      ? Math.round((summary.total_valid / summary.total_pekerjaan) * 100)
      : 0;

    return res.json({
      ok: true,
      summary,
      totalDatabasePt2,
      progressPct
    });
  } catch (err) {
    return res.status(500).json({ ok: false, error: err.message });
  }
});

// 2. GET /api/validasi (page, limit<=100, search, status)
router.get('/validasi', (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 20));
    const offset = (page - 1) * limit;
    const { search, status } = req.query;

    let whereClauses = [];
    let params = [];

    if (status) {
      whereClauses.push('status_validasi = ?');
      params.push(status);
    }
    if (search) {
      whereClauses.push('(nama_odp LIKE ? OR teknisi LIKE ? OR sto LIKE ? OR mitra LIKE ?)');
      const term = `%${search}%`;
      params.push(term, term, term, term);
    }

    const whereSql = whereClauses.length > 0 ? 'WHERE ' + whereClauses.join(' AND ') : '';
    const countSql = `SELECT COUNT(*) as total FROM validasi_pekerjaan ${whereSql}`;
    const total = db.prepare(countSql).get(...params)?.total || 0;

    const dataSql = `
      SELECT * FROM validasi_pekerjaan
      ${whereSql}
      ORDER BY tanggal DESC, id DESC
      LIMIT ? OFFSET ?
    `;
    const rows = db.prepare(dataSql).all(...params, limit, offset);

    return res.json({
      ok: true,
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
      data: rows
    });
  } catch (err) {
    return res.status(500).json({ ok: false, error: err.message });
  }
});

// 3. GET /api/validasi/:id
router.get('/validasi/:id', (req, res) => {
  try {
    const row = db.prepare('SELECT * FROM validasi_pekerjaan WHERE id = ?').get(req.params.id);
    if (!row) {
      return res.status(404).json({ ok: false, error: 'Data validasi tidak ditemukan' });
    }
    const materials = db.prepare('SELECT * FROM input_material WHERE validasi_id = ?').all(req.params.id);
    const evidenKurang = db.prepare('SELECT * FROM eviden_kurang WHERE validasi_id = ?').all(req.params.id);

    return res.json({
      ok: true,
      data: row,
      materials,
      evidenKurang
    });
  } catch (err) {
    return res.status(500).json({ ok: false, error: err.message });
  }
});

// 4. GET /api/validasi/:id/material
router.get('/validasi/:id/material', (req, res) => {
  try {
    const materials = db.prepare('SELECT * FROM input_material WHERE validasi_id = ? ORDER BY id ASC').all(req.params.id);
    return res.json({ ok: true, data: materials });
  } catch (err) {
    return res.status(500).json({ ok: false, error: err.message });
  }
});

// 5. POST /api/validasi/:id/material (requireAuth)
router.post('/validasi/:id/material', requireAuth, (req, res) => {
  try {
    const validasiId = req.params.id;
    const { nama_material, satuan = 'Unit', qty = 1, harga_satuan = 0 } = req.body;

    if (!nama_material) {
      return res.status(400).json({ ok: false, error: 'nama_material wajib diisi' });
    }

    const insert = db.prepare(`
      INSERT INTO input_material (validasi_id, nama_material, satuan, qty, harga_satuan)
      VALUES (?, ?, ?, ?, ?)
    `).run(validasiId, nama_material, satuan, Number(qty), Number(harga_satuan));

    return res.json({
      ok: true,
      message: 'Material berhasil ditambahkan',
      id: insert.lastInsertRowid
    });
  } catch (err) {
    return res.status(500).json({ ok: false, error: err.message });
  }
});

// 6. DELETE /api/validasi/:id/material/:matId (requireAuth)
router.delete('/validasi/:id/material/:matId', requireAuth, (req, res) => {
  try {
    const result = db.prepare('DELETE FROM input_material WHERE id = ? AND validasi_id = ?').run(req.params.matId, req.params.id);
    if (result.changes === 0) {
      return res.status(404).json({ ok: false, error: 'Material tidak ditemukan' });
    }
    return res.json({ ok: true, message: 'Material berhasil dihapus' });
  } catch (err) {
    return res.status(500).json({ ok: false, error: err.message });
  }
});

// 7. PATCH /api/validasi/:id/status (requireAuth)
router.patch('/validasi/:id/status', requireAuth, (req, res) => {
  try {
    const { status } = req.body;
    if (!['pending', 'valid', 'invalid', 'revisi'].includes(status)) {
      return res.status(400).json({ ok: false, error: 'Status tidak valid' });
    }

    const result = db.prepare(`
      UPDATE validasi_pekerjaan
      SET status_validasi = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(status, req.params.id);

    if (result.changes === 0) {
      return res.status(404).json({ ok: false, error: 'Data validasi tidak ditemukan' });
    }

    return res.json({ ok: true, message: `Status berhasil diubah menjadi ${status}`, status });
  } catch (err) {
    return res.status(500).json({ ok: false, error: err.message });
  }
});

// 8. POST /api/validasi/:id/generate-bast (requireAuth)
router.post('/validasi/:id/generate-bast', requireAuth, async (req, res) => {
  try {
    const result = await generateBastPdf(req.params.id);
    const now = new Date().toISOString();
    const bastUrl = `/api/validasi/${req.params.id}/bast-download`;

    db.prepare(`
      UPDATE validasi_pekerjaan
      SET bast_url = ?, bast_generated = 1, bast_generated_at = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(bastUrl, now, req.params.id);

    return res.json({
      ok: true,
      message: 'BAST berhasil dibuat',
      bast_url: bastUrl,
      generated_at: now
    });
  } catch (err) {
    console.error('Error generating BAST:', err);
    return res.status(500).json({ ok: false, error: err.message });
  }
});

router.get('/validasi/:id/bast-download', async (req, res) => {
  try {
    const result = await generateBastPdf(req.params.id);
    res.setHeader('Content-Type', result.type);
    res.setHeader('Content-Disposition', `inline; filename="${result.filename}"`);
    return res.send(result.buffer);
  } catch (err) {
    return res.status(500).send('Gagal download BAST: ' + err.message);
  }
});

// 9. GET /api/odp/lookup?q= (max 20)
router.get('/odp/lookup', (req, res) => {
  try {
    const q = req.query.q || '';
    if (!q) {
      return res.json({ ok: true, data: [] });
    }

    const term = `%${q}%`;
    const results = db.prepare(`
      SELECT DISTINCT odp_name, sto, area, group_mitra, nama_lop
      FROM database_pt2
      WHERE odp_name LIKE ? OR sto LIKE ? OR area LIKE ?
      LIMIT 20
    `).all(term, term, term);

    return res.json({ ok: true, data: results });
  } catch (err) {
    return res.status(500).json({ ok: false, error: err.message });
  }
});

// 10. GET /api/odp/detail?odp= (fallback ke validasi_pekerjaan + form)
router.get('/odp/detail', (req, res) => {
  try {
    const odp = req.query.odp;
    if (!odp) {
      return res.status(400).json({ ok: false, error: 'Parameter odp diperlukan' });
    }

    const pt2 = db.prepare('SELECT * FROM database_pt2 WHERE odp_name = ?').get(odp);
    const validasi = db.prepare('SELECT * FROM validasi_pekerjaan WHERE nama_odp = ? ORDER BY id DESC').get(odp);

    return res.json({
      ok: true,
      data: {
        odp_name: odp,
        database_pt2: pt2 || null,
        validasi_pekerjaan: validasi || null,
        sto: pt2?.sto || validasi?.sto || '',
        area: pt2?.area || validasi?.hsa_area || '',
        mitra: pt2?.group_mitra || validasi?.mitra || '',
        ip_olt: validasi?.ip_olt || '',
        slot_olt: validasi?.slot_olt || '',
        port_olt: validasi?.port_olt || '',
        tipe_splitter: validasi?.tipe_splitter || '1:4',
        lat: validasi?.latitude || '',
        lng: validasi?.longitude || ''
      }
    });
  } catch (err) {
    return res.status(500).json({ ok: false, error: err.message });
  }
});

// 11. GET /api/sync/status
router.get('/sync/status', (req, res) => {
  try {
    const countDbpt2 = db.prepare('SELECT COUNT(*) as cnt FROM database_pt2').get()?.cnt || 0;
    const countValidasi = db.prepare('SELECT COUNT(*) as cnt FROM validasi_pekerjaan').get()?.cnt || 0;

    return res.json({
      ok: true,
      lastSyncDbpt2: getDbpt2Status(),
      lastSyncValidasi: getValStatus(),
      countDbpt2,
      countValidasi
    });
  } catch (err) {
    return res.status(500).json({ ok: false, error: err.message });
  }
});

// 12. POST /api/sync/database-pt2 (requireAuth)
router.post('/sync/database-pt2', requireAuth, async (req, res) => {
  try {
    const { csvContent } = req.body;
    const result = await syncDatabasePt2(csvContent, config.DBPT2_SHEET_CSV_URL);
    return res.json(result);
  } catch (err) {
    return res.status(500).json({ ok: false, error: err.message });
  }
});

// 13. POST /api/sync/validasi (requireAuth)
router.post('/sync/validasi', requireAuth, async (req, res) => {
  try {
    const { csvContent } = req.body;
    const result = await syncValidasi(csvContent, config.VALIDASI_SHEET_CSV_URL);
    return res.json(result);
  } catch (err) {
    return res.status(500).json({ ok: false, error: err.message });
  }
});

// 14. POST /api/upload-mancore
router.post('/upload-mancore', upload.single('image'), (req, res) => {
  try {
    const { validasiId, odpName } = req.body;
    if (!req.file) {
      return res.status(400).json({ ok: false, error: 'File gambar wajib diunggah' });
    }

    const fileUrl = `/uploads/${req.file.filename}`;

    if (validasiId) {
      db.prepare('UPDATE validasi_pekerjaan SET mancore_image = ? WHERE id = ?').run(fileUrl, validasiId);
    } else if (odpName) {
      db.prepare('UPDATE validasi_pekerjaan SET mancore_image = ? WHERE nama_odp = ?').run(fileUrl, odpName);
      db.prepare('UPDATE rekon_pt2 SET foto_mancore = ? WHERE odp_name = ?').run(fileUrl, odpName);
    }

    return res.json({
      ok: true,
      url: fileUrl,
      message: 'Mancore image uploaded successfully'
    });
  } catch (err) {
    return res.status(500).json({ ok: false, error: err.message });
  }
});

// 15. POST /api/valid4/generate { data, skipImages }
router.post('/valid4/generate', async (req, res) => {
  try {
    const { data = [], skipImages = false } = req.body;
    let items = Array.isArray(data) ? data : [];
    if (items.length === 0) {
      items = db.prepare("SELECT * FROM validasi_pekerjaan WHERE status_validasi = 'valid' LIMIT 50").all();
    } else {
      items = hydrateItems(items);
    }

    items = filterEvidenceItems(items, res, 'valid4/pdf');
    if (items.length === 0) {
      return res.status(400).json({ ok: false, error: 'Tidak ada ODP dengan eviden untuk digenerate' });
    }

    const chunks = splitGenerateItems(items, res, 'valid4/pdf');
    if (chunks.length > 1) {
      await sendChunkedZip(
        res,
        chunks,
        'pdf',
        (chunk) => generateValid4Pdf(chunk, Boolean(skipImages)).then((r) => ({
          ...r,
          ext: r.type === 'application/pdf' ? 'pdf' : 'html'
        })),
        'VALID4_MANCORE'
      );
      return;
    }

    const result = await generateValid4Pdf(chunks[0], Boolean(skipImages));
    res.setHeader('Content-Type', result.type);
    res.setHeader('Content-Disposition', `attachment; filename="VALID4_MANCORE_${Date.now()}.${result.type === 'application/pdf' ? 'pdf' : 'html'}"`);
    return res.send(result.buffer);
  } catch (err) {
    console.error('Error generating valid4 pdf:', err);
    return res.status(500).json({ ok: false, error: err.message });
  }
});

// 16. POST /api/valid4/generate-excel { data, skipImages, tableOnly }
router.post('/valid4/generate-excel', async (req, res) => {
  try {
    const { data = [], skipImages = false, tableOnly = false } = req.body;
    let items = Array.isArray(data) ? data : [];
    if (items.length === 0) {
      items = db.prepare("SELECT * FROM validasi_pekerjaan WHERE status_validasi = 'valid' LIMIT 50").all();
    } else {
      items = hydrateItems(items);
    }

    items = filterEvidenceItems(items, res, 'valid4/excel');
    if (items.length === 0) {
      return res.status(400).json({ ok: false, error: 'Tidak ada ODP dengan eviden untuk digenerate' });
    }

    const chunks = splitGenerateItems(items, res, 'valid4/excel');
    if (chunks.length > 1) {
      await sendChunkedZip(
        res,
        chunks,
        'xlsx',
        (chunk) => generateValid4Excel(chunk, Boolean(skipImages), Boolean(tableOnly)),
        'VALID4_MANCORE'
      );
      return;
    }

    const buffer = await generateValid4Excel(chunks[0], Boolean(skipImages), Boolean(tableOnly));
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="VALID4_MANCORE_${Date.now()}.xlsx"`);
    return res.send(buffer);
  } catch (err) {
    console.error('Error generating valid4 excel:', err);
    return res.status(500).json({ ok: false, error: err.message });
  }
});

// 17. POST /api/valid4/generate-image { data } (1 file jpg, multi -> ZIP MANCORE_TABLES_<ts>.zip + update mancore_image)
router.post('/valid4/generate-image', async (req, res) => {
  try {
    const { data = [] } = req.body;
    let items = Array.isArray(data) ? data : [];
    if (items.length === 0) {
      items = db.prepare("SELECT * FROM validasi_pekerjaan WHERE status_validasi = 'valid' LIMIT 10").all();
    } else {
      items = hydrateItems(items);
    }

    // Gambar sudah dikirim sebagai satu ZIP, jadi tidak perlu dipotong per 100.
    items = filterEvidenceItems(items, res, 'valid4/image');
    if (items.length === 0) {
      return res.status(400).json({ ok: false, error: 'Tidak ada ODP dengan eviden untuk digenerate' });
    }

    if (items.length === 1) {
      const item = items[0];
      const { buffer, mime, ext } = await generateMancoreImage(item);
      const filename = `mancore_${safeName(item.nama_odp)}_${Date.now()}.${ext}`;
      const filePath = path.join(config.UPLOAD_PATH, filename);
      fs.writeFileSync(filePath, buffer);

      const fileUrl = `/uploads/${filename}`;
      if (item.id && ext === 'jpg') {
        db.prepare('UPDATE validasi_pekerjaan SET mancore_image = ? WHERE id = ?').run(fileUrl, item.id);
      }

      res.setHeader('Content-Type', mime);
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      return res.send(buffer);
    } else {
      const ts = Date.now();
      const zipFilename = `MANCORE_TABLES_${ts}.zip`;
      res.setHeader('Content-Type', 'application/zip');
      res.setHeader('Content-Disposition', `attachment; filename="${zipFilename}"`);

      const archive = archiver('zip', { zlib: { level: 9 } });
      archive.pipe(res);

      for (const item of items) {
        const { buffer, ext } = await generateMancoreImage(item);
        const imgName = `mancore_${safeName(item.nama_odp)}.${ext}`;
        archive.append(buffer, { name: imgName });

        const saveName = `mancore_${safeName(item.nama_odp)}_${ts}.${ext}`;
        const filePath = path.join(config.UPLOAD_PATH, saveName);
        fs.writeFileSync(filePath, buffer);
        const fileUrl = `/uploads/${saveName}`;
        if (item.id && ext === 'jpg') {
          db.prepare('UPDATE validasi_pekerjaan SET mancore_image = ? WHERE id = ?').run(fileUrl, item.id);
        }
      }

      await archive.finalize();
    }
  } catch (err) {
    console.error('Error generating mancore image(s):', err);
    return res.status(500).json({ ok: false, error: err.message });
  }
});

module.exports = router;
