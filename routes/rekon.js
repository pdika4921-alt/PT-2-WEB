const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const archiver = require('archiver');
const db = require('../db/connection');
const config = require('../config');
const { generateRekonWord } = require('../controllers/documentGenerator');
const { getDetailData } = require('../controllers/detailHelper');

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    if (!fs.existsSync(config.UPLOAD_PATH)) {
      fs.mkdirSync(config.UPLOAD_PATH, { recursive: true });
    }
    cb(null, config.UPLOAD_PATH);
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname) || '.jpg';
    cb(null, `rekon_${Date.now()}_${Math.random().toString(36).substring(2, 8)}${ext}`);
  }
});

const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 }
});

const WHITELIST_FIELDS = [
  'foto_odp_luar',
  'foto_odp_dalam',
  'foto_joint_closure',
  'foto_ps_1_4',
  'foto_lengkap',
  'foto_ufo_opm',
  'foto_sivdum',
  'foto_mancore'
];

// Generate Word maksimal 100 ODP per file; sisanya jadi beberapa file di dalam ZIP.
const GENERATE_MAX = 100;
function splitWordChunks(list, res) {
  if (list.length <= GENERATE_MAX) return [list];
  const total = Math.ceil(list.length / GENERATE_MAX);
  console.log(`generate-word: ${list.length} ODP dibagi ${total} file @${GENERATE_MAX}.`);
  res.setHeader('X-Generate-Limit', String(GENERATE_MAX));
  res.setHeader('X-Generate-Chunks', String(total));
  res.setHeader('X-Requested-Count', String(list.length));
  const chunks = [];
  for (let i = 0; i < list.length; i += GENERATE_MAX) {
    chunks.push(list.slice(i, i + GENERATE_MAX));
  }
  return chunks;
}

async function sendWordZip(res, chunks, title) {
  const ts = Date.now();
  res.setHeader('Content-Type', 'application/zip');
  res.setHeader('Content-Disposition', `attachment; filename="REKON_PT2_${ts}_parts.zip"`);
  const archive = archiver('zip', { zlib: { level: 1 } });
  archive.on('error', (err) => {
    console.error('Archive error:', err);
    if (!res.headersSent) return res.status(500).json({ ok: false, error: err.message });
    res.destroy(err);
  });
  archive.pipe(res);

  const cleanTitle = typeof title === 'string' ? title.trim() : '';
  for (let i = 0; i < chunks.length; i += 1) {
    const raw = await generateRekonWord(chunks[i], { title: cleanTitle });
    const buffer = Buffer.isBuffer(raw) ? raw : Buffer.from(raw);
    archive.append(buffer, {
      name: `REKON_PT2_${ts}_part${i + 1}.docx`,
      store: true
    });
  }
  await archive.finalize();
}

// Ubah URL eksternal (Google Drive open?id= dll) menjadi /api/proxy-image agar bisa tampil sebagai <img>
const toPhotoUrl = (u) => {
  const v = (u || '').trim();
  if (!v) return '';
  return v.startsWith('http') ? '/api/proxy-image?url=' + encodeURIComponent(v) : v;
};

router.get('/', (req, res) => {
  res.render('rekon_pt2', {
    page: 'rekon',
    title: 'Rekon PT2 — Eviden Pekerjaan'
  });
});

router.get('/legacy', (req, res) => {
  res.render('rekon', {
    page: 'rekon',
    title: 'Rekon Legacy'
  });
});

router.get('/detail/:id', (req, res) => {
  try {
    const detail = getDetailData(req.params.id);
    if (!detail) {
      return res.status(404).render('error', { message: 'Data validasi tidak ditemukan' });
    }
    res.render('detail', {
      page: 'rekon',
      title: `Detail Validasi — ${detail.v.nama_odp}`,
      ...detail
    });
  } catch (err) {
    res.status(500).render('error', { message: 'Gagal memuat detail: ' + err.message });
  }
});

// Ambil seluruh data Rekon PT2 langsung dari sheet RESPON VALID 4 (tabel validasi_pekerjaan)
router.get('/api/sheet-list', (req, res) => {
  try {
    const q = (req.query.q || '').trim();
    const limit = Math.min(parseInt(req.query.limit, 10) || 5000, 5000);
    const offset = parseInt(req.query.offset, 10) || 0;

    const where = q ? ' WHERE nama_odp LIKE ?' : '';
    const params = q ? [`%${q}%`] : [];

    const total = db.prepare(`SELECT COUNT(*) c FROM validasi_pekerjaan${where}`).get(...params).c;
    const rows = db.prepare(
      `SELECT * FROM validasi_pekerjaan${where} ORDER BY id DESC LIMIT ? OFFSET ?`
    ).all(...params, limit, offset);

    const rekonMap = new Map(
      db.prepare('SELECT * FROM rekon_pt2').all().map(r => [r.odp_name, r])
    );

    const lopMap = new Map(
      db.prepare('SELECT odp_name, nama_lop, id_ihld, sto FROM database_pt2').all()
        .map(r => [r.odp_name, r])
    );

    const toUrl = toPhotoUrl;

    const out = rows.map((r, i) => {
      const rk = rekonMap.get(r.nama_odp) || {};
      const lop = lopMap.get(r.nama_odp) || {};
      return {
        no: offset + i + 1,
        odp: r.nama_odp || '-',
        id_lop: rk.id_nama_lop || lop.nama_lop || lop.id_ihld || r.nama_odp || '-',
        sto: r.sto || lop.sto || rk.witel_sto || '-',
        teknisi: r.teknisi || '-',
        district: r.district || '-',
        tanggal: r.tanggal || '-',
        photos: {
          foto_odp_luar: toUrl(rk.foto_odp_luar || r.eviden_odp_terbuka),
          foto_odp_dalam: toUrl(rk.foto_odp_dalam || r.eviden_odp_tertutup),
          foto_joint_closure: toUrl(rk.foto_joint_closure || r.eviden_closure),
          foto_ps_1_4: toUrl(rk.foto_ps_1_4 || r.eviden_spliter),
          foto_lengkap: toUrl(rk.foto_lengkap || r.eviden_foto_lengkap),
          foto_ufo_opm: toUrl(rk.foto_ufo_opm || r.eviden_opm1),
          foto_sivdum: toUrl(rk.foto_sivdum || r.eviden_opm2),
          foto_mancore: toUrl(rk.foto_mancore || r.mancore_image)
        }
      };
    });

    return res.json({ ok: true, total, count: out.length, source: 'RESPON VALID 4', rows: out });
  } catch (err) {
    console.error('Error sheet-list rekon:', err);
    return res.status(500).json({ ok: false, error: err.message });
  }
});

router.get('/api/odp', (req, res) => {
  try {
    const odp = req.query.odp;
    if (!odp) {
      return res.status(400).json({ ok: false, error: 'Parameter odp diperlukan' });
    }

    const dbRow = db.prepare('SELECT * FROM database_pt2 WHERE odp_name = ?').get(odp);
    const rekonRow = db.prepare('SELECT * FROM rekon_pt2 WHERE odp_name = ?').get(odp);
    const valRow = db.prepare('SELECT * FROM validasi_pekerjaan WHERE nama_odp = ? ORDER BY id DESC').get(odp);

    // Fallback photos dari eviden
    const photos = {
      foto_odp_luar: toPhotoUrl(rekonRow?.foto_odp_luar || valRow?.eviden_odp_terbuka),
      foto_odp_dalam: toPhotoUrl(rekonRow?.foto_odp_dalam || valRow?.eviden_odp_tertutup),
      foto_joint_closure: toPhotoUrl(rekonRow?.foto_joint_closure || valRow?.eviden_closure),
      foto_ps_1_4: toPhotoUrl(rekonRow?.foto_ps_1_4 || valRow?.eviden_spliter),
      foto_lengkap: toPhotoUrl(rekonRow?.foto_lengkap || valRow?.eviden_foto_lengkap),
      foto_ufo_opm: toPhotoUrl(rekonRow?.foto_ufo_opm || valRow?.eviden_opm1),
      foto_sivdum: toPhotoUrl(rekonRow?.foto_sivdum || valRow?.eviden_opm2),
      foto_mancore: toPhotoUrl(rekonRow?.foto_mancore || valRow?.mancore_image)
    };

    return res.json({
      ok: true,
      db: dbRow || null,
      rekon: rekonRow || null,
      photos
    });
  } catch (err) {
    console.error('Error fetching rekon odp:', err);
    return res.status(500).json({ ok: false, error: err.message });
  }
});

router.post('/api/upload-foto', upload.single('image'), (req, res) => {
  try {
    const { odpName, field } = req.body;
    if (!odpName || !field || !WHITELIST_FIELDS.includes(field)) {
      return res.status(400).json({ ok: false, error: 'Field foto tidak valid atau odpName kosong' });
    }

    if (!req.file) {
      return res.status(400).json({ ok: false, error: 'File gambar wajib diunggah' });
    }

    const fileUrl = `/uploads/${req.file.filename}`;

    // Upsert into rekon_pt2
    const existing = db.prepare('SELECT id FROM rekon_pt2 WHERE odp_name = ?').get(odpName);
    if (existing) {
      db.prepare(`UPDATE rekon_pt2 SET ${field} = ?, updated_at = CURRENT_TIMESTAMP WHERE odp_name = ?`).run(fileUrl, odpName);
    } else {
      const dbRow = db.prepare('SELECT nama_lop, sto FROM database_pt2 WHERE odp_name = ?').get(odpName);
      db.prepare(`
        INSERT INTO rekon_pt2 (odp_name, id_nama_lop, witel_sto, ${field})
        VALUES (?, ?, ?, ?)
      `).run(odpName, dbRow?.nama_lop || '', dbRow?.sto || '', fileUrl);
    }

    return res.json({ ok: true, url: fileUrl, field, odpName });
  } catch (err) {
    console.error('Error upload rekon foto:', err);
    return res.status(500).json({ ok: false, error: err.message });
  }
});

router.post('/api/remove-foto', (req, res) => {
  try {
    const { odpName, field } = req.body;
    if (!odpName || !field || !WHITELIST_FIELDS.includes(field)) {
      return res.status(400).json({ ok: false, error: 'Parameter tidak valid' });
    }

    db.prepare(`UPDATE rekon_pt2 SET ${field} = '', updated_at = CURRENT_TIMESTAMP WHERE odp_name = ?`).run(odpName);
    return res.json({ ok: true, message: 'Foto berhasil dihapus' });
  } catch (err) {
    return res.status(500).json({ ok: false, error: err.message });
  }
});

router.post('/api/save', (req, res) => {
  try {
    const { odpName, data } = req.body;
    if (!odpName) {
      return res.status(400).json({ ok: false, error: 'odpName wajib diisi' });
    }

    const existing = db.prepare('SELECT id FROM rekon_pt2 WHERE odp_name = ?').get(odpName);
    if (existing) {
      const updates = [];
      const values = [];
      for (const f of WHITELIST_FIELDS) {
        if (data && data[f] !== undefined) {
          updates.push(`${f} = ?`);
          values.push(data[f]);
        }
      }
      if (updates.length > 0) {
        values.push(odpName);
        db.prepare(`UPDATE rekon_pt2 SET ${updates.join(', ')}, updated_at = CURRENT_TIMESTAMP WHERE odp_name = ?`).run(...values);
      }
    } else {
      const dbRow = db.prepare('SELECT nama_lop, sto FROM database_pt2 WHERE odp_name = ?').get(odpName);
      db.prepare(`
        INSERT INTO rekon_pt2 (
          odp_name, id_nama_lop, witel_sto,
          foto_odp_luar, foto_odp_dalam, foto_joint_closure, foto_ps_1_4,
          foto_lengkap, foto_ufo_opm, foto_sivdum, foto_mancore
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        odpName,
        dbRow?.nama_lop || data?.id_nama_lop || '',
        dbRow?.sto || data?.witel_sto || '',
        data?.foto_odp_luar || '',
        data?.foto_odp_dalam || '',
        data?.foto_joint_closure || '',
        data?.foto_ps_1_4 || '',
        data?.foto_lengkap || '',
        data?.foto_ufo_opm || '',
        data?.foto_sivdum || '',
        data?.foto_mancore || ''
      );
    }

    return res.json({ ok: true, message: 'Rekon berhasil disimpan' });
  } catch (err) {
    console.error('Error saving rekon:', err);
    return res.status(500).json({ ok: false, error: err.message });
  }
});

router.post('/api/generate-word', async (req, res) => {
  try {
    const { odpList, title } = req.body;
    const list = Array.isArray(odpList) ? odpList : (odpList ? odpList.split(',').map(s => s.trim()) : []);
    const cleanTitle = typeof title === 'string' ? title.trim() : '';

    const chunks = splitWordChunks(list, res);
    if (chunks.length > 1) {
      await sendWordZip(res, chunks, cleanTitle);
      return;
    }

    // Judul opsional; bila kosong akan memakai judul dari templates/masterpt2.docx
    const buffer = await generateRekonWord(chunks[0], { title: cleanTitle });
    const filename = `REKON_PT2_${Date.now()}.docx`;

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    return res.send(buffer);
  } catch (err) {
    console.error('Error generating rekon word:', err);
    return res.status(500).json({ ok: false, error: err.message });
  }
});

module.exports = router;
