const express = require('express');
const router = express.Router();
const db = require('../db/connection');
const { getDetailData } = require('../controllers/detailHelper');

router.get('/', (req, res) => {
  try {
    const { tgl_awal, tgl_akhir, klasifikasi, q } = req.query;

    const allKlasifikasiRows = db.prepare(`
      SELECT DISTINCT klasifikasi_eksekutor FROM validasi_pekerjaan
      WHERE klasifikasi_eksekutor IS NOT NULL AND klasifikasi_eksekutor != ''
      ORDER BY klasifikasi_eksekutor ASC
    `).all();
    const allKlasifikasi = allKlasifikasiRows.map(r => r.klasifikasi_eksekutor);

    const kemitraanCount = db.prepare("SELECT COUNT(*) as cnt FROM validasi_pekerjaan WHERE LOWER(klasifikasi_eksekutor) LIKE '%kemitraan%'").get()?.cnt || 0;
    const swakelolaCount = db.prepare("SELECT COUNT(*) as cnt FROM validasi_pekerjaan WHERE LOWER(klasifikasi_eksekutor) LIKE '%swakelola%'").get()?.cnt || 0;
    const totalCount = db.prepare('SELECT COUNT(*) as cnt FROM validasi_pekerjaan').get()?.cnt || 0;

    let whereClauses = [];
    let params = [];

    if (tgl_awal) {
      whereClauses.push('v.tanggal >= ?');
      params.push(tgl_awal);
    }
    if (tgl_akhir) {
      whereClauses.push('v.tanggal <= ?');
      params.push(tgl_akhir);
    }
    if (klasifikasi) {
      const selectedList = klasifikasi.split(',').map(s => s.trim()).filter(Boolean);
      if (selectedList.length > 0) {
        const ph = selectedList.map(() => '?').join(',');
        whereClauses.push(`v.klasifikasi_eksekutor IN (${ph})`);
        params.push(...selectedList);
      }
    }
    if (q) {
      whereClauses.push('(v.nama_odp LIKE ? OR v.teknisi LIKE ? OR v.mitra LIKE ? OR v.sto LIKE ? OR d.nama_lop LIKE ?)');
      const term = `%${q}%`;
      params.push(term, term, term, term, term);
    }

    const whereSql = whereClauses.length > 0 ? 'WHERE ' + whereClauses.join(' AND ') : '';

    const sql = `
      SELECT 
        v.*,
        d.nama_lop,
        d.area as pt2_area,
        d.progress_update as pt2_progress
      FROM validasi_pekerjaan v
      LEFT JOIN database_pt2 d ON v.nama_odp = d.odp_name
      ${whereSql}
      ORDER BY v.tanggal DESC, v.id DESC
    `;

    const rows = db.prepare(sql).all(...params);
    const filteredCount = rows.length;

    res.render('rekon-freelance', {
      page: 'rekon-freelance',
      title: 'Rekon Freelance — PT 2 KONS',
      rows,
      totalCount,
      filteredCount,
      kemitraanCount,
      swakelolaCount,
      allKlasifikasi,
      query: {
        tgl_awal: tgl_awal || '',
        tgl_akhir: tgl_akhir || '',
        klasifikasi: klasifikasi || '',
        q: q || ''
      }
    });
  } catch (err) {
    console.error('Error rendering rekon freelance:', err);
    res.status(500).render('error', { message: 'Gagal memuat rekon freelance: ' + err.message });
  }
});

router.get('/export', (req, res) => {
  try {
    const sql = `
      SELECT 
        v.*,
        d.nama_lop
      FROM validasi_pekerjaan v
      LEFT JOIN database_pt2 d ON v.nama_odp = d.odp_name
      ORDER BY v.tanggal DESC, v.id DESC
    `;
    const rows = db.prepare(sql).all();

    let csv = '\uFEFF';
    csv += 'No,Tanggal,Regional,Witel STO,HSA Area,Nama ODP,ID Valins,NIK Teknisi,Mitra,Klasifikasi Eksekutor,Klasifikasi Order,No Order,Status Validasi,Kolom 14,Kolom 15,Kolom 16\r\n';

    rows.forEach((r, idx) => {
      const line = [
        idx + 1,
        `"${r.tanggal || ''}"`,
        '"2"', // Regional hardcode 2
        `"${r.sto || ''}"`,
        `"${(r.hsa_area || '').replace(/"/g, '""')}"`,
        `"${(r.nama_odp || '').replace(/"/g, '""')}"`,
        `"${r.id_valins || ''}"`,
        `"${(r.teknisi || '').replace(/"/g, '""')}"`,
        `"${(r.mitra || '').replace(/"/g, '""')}"`,
        `"${(r.klasifikasi_eksekutor || '').replace(/"/g, '""')}"`,
        `"${(r.klasifikasi_order || '').replace(/"/g, '""')}"`,
        `"${r.no_order || ''}"`,
        `"${r.status_validasi || ''}"`,
        '""', // 3 kolom terakhir kosong
        '""',
        '""'
      ].join(',');
      csv += line + '\r\n';
    });

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="rekon_freelance.csv"');
    return res.send(csv);
  } catch (err) {
    console.error('Error export freelance CSV:', err);
    res.status(500).send('Export failed');
  }
});

router.get('/detail/:id', (req, res) => {
  try {
    const detail = getDetailData(req.params.id);
    if (!detail) {
      return res.status(404).render('error', { message: 'Data validasi tidak ditemukan' });
    }
    res.render('detail', {
      page: 'rekon-freelance',
      title: `Detail Validasi — ${detail.v.nama_odp}`,
      ...detail
    });
  } catch (err) {
    res.status(500).render('error', { message: 'Gagal memuat detail: ' + err.message });
  }
});

module.exports = router;
