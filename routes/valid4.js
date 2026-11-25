const express = require('express');
const router = express.Router();
const db = require('../db/connection');
const { getDetailData } = require('../controllers/detailHelper');

router.get('/', (req, res) => {
  try {
    // Daftar ODP dari "Load Data" (?odp=ODP-A%0AODP-B): tabel harus persis berisi daftar itu
    const odpList = [...new Set(
      String(req.query.odp || '').split(/[\n,]+/).map(s => s.trim()).filter(Boolean)
    )];
    const filtered = odpList.length > 0;

    let rows = [];
    let missing = [];
    let cleanOdpList = [];
    if (filtered) {
      const placeholders = odpList.map(() => '?').join(',');
      // Ambil SEMUA yang cocok (tanpa LIMIT 500), urut id DESC supaya dedupe ambil data terbaru
      const found = db.prepare(`
        SELECT * FROM validasi_pekerjaan
        WHERE status_validasi = 'valid' AND nama_odp COLLATE NOCASE IN (${placeholders})
        ORDER BY id DESC
      `).all(...odpList);

      const byName = new Map();
      found.forEach(r => {
        const key = String(r.nama_odp || '').toUpperCase();
        if (key && !byName.has(key)) byName.set(key, r);
      });
      // Susun sesuai urutan daftar yang diminta agar presisi
      rows = odpList.map(n => byName.get(n.toUpperCase())).filter(Boolean);
      missing = odpList.filter(n => !byName.has(n.toUpperCase()));
      // Daftar yang dikembalikan ke textarea hanya yang benar-benar ditemukan
      cleanOdpList = odpList.filter(n => byName.has(n.toUpperCase()));
    }
    // Tanpa daftar ODP: tabel kosong (tanpa auto-load data)

    res.render('valid4', {
      page: 'valid4',
      title: 'VALID 4 — Management Core FO',
      rows,
      totalCount: rows.length,
      odpList: cleanOdpList,
      requestedCount: odpList.length,
      missing,
      filtered
    });
  } catch (err) {
    console.error('Error rendering valid4:', err);
    res.status(500).render('error', { message: 'Gagal memuat VALID 4: ' + err.message });
  }
});

router.get('/detail/:id', (req, res) => {
  try {
    const detail = getDetailData(req.params.id);
    if (!detail) {
      return res.status(404).render('error', { message: 'Data validasi tidak ditemukan' });
    }
    res.render('detail', {
      page: 'valid4',
      title: `Detail Validasi — ${detail.v.nama_odp}`,
      ...detail
    });
  } catch (err) {
    console.error('Error rendering detail:', err);
    res.status(500).render('error', { message: 'Gagal memuat detail: ' + err.message });
  }
});

module.exports = router;
