const express = require('express');
const router = express.Router();
const db = require('../db/connection');
const { getDetailData } = require('../controllers/detailHelper');

router.get('/', (req, res) => {
  try {
    const { tgl_awal, tgl_akhir, sto, q } = req.query;

    const total = db.prepare('SELECT COUNT(*) as cnt FROM validasi_pekerjaan').get()?.cnt || 0;
    const withEviden = db.prepare("SELECT COUNT(*) as cnt FROM validasi_pekerjaan WHERE (url_foto_eviden IS NOT NULL AND url_foto_eviden != '') OR (eviden_odp_terbuka IS NOT NULL AND eviden_odp_terbuka != '')").get()?.cnt || 0;
    const withoutEviden = total - withEviden;

    const stoRows = db.prepare("SELECT DISTINCT sto FROM validasi_pekerjaan WHERE sto IS NOT NULL AND sto != '' ORDER BY sto ASC").all();
    const stoList = stoRows.map(r => r.sto);

    let whereClauses = [];
    let params = [];

    if (tgl_awal) {
      whereClauses.push('tanggal >= ?');
      params.push(tgl_awal);
    }
    if (tgl_akhir) {
      whereClauses.push('tanggal <= ?');
      params.push(tgl_akhir);
    }
    if (sto) {
      whereClauses.push('sto = ?');
      params.push(sto);
    }
    if (q) {
      whereClauses.push('(nama_odp LIKE ? OR teknisi LIKE ? OR sto LIKE ? OR hsa_area LIKE ? OR id_valins LIKE ?)');
      const term = `%${q}%`;
      params.push(term, term, term, term, term);
    }

    const whereSql = whereClauses.length > 0 ? 'WHERE ' + whereClauses.join(' AND ') : '';
    const rows = db.prepare(`
      SELECT * FROM validasi_pekerjaan
      ${whereSql}
      ORDER BY tanggal DESC, id DESC
    `).all(...params);

    const filteredCount = rows.length;

    res.render('database', {
      page: 'database',
      title: 'Database PT2 — Monitoring',
      total,
      filteredCount,
      withEviden,
      withoutEviden,
      stoList,
      rows,
      query: {
        tgl_awal: tgl_awal || '',
        tgl_akhir: tgl_akhir || '',
        sto: sto || '',
        q: q || ''
      }
    });
  } catch (err) {
    console.error('Error rendering database page:', err);
    res.status(500).render('error', { message: 'Gagal memuat database: ' + err.message });
  }
});

router.get('/export', (req, res) => {
  try {
    const rows = db.prepare('SELECT * FROM validasi_pekerjaan ORDER BY tanggal DESC, id DESC').all();
    
    // CSV with UTF-8 BOM
    let csv = '\uFEFF';
    csv += 'No,Tanggal,Teknisi,STO,HSA,ODP,IP OLT,Valins,Eviden\r\n';

    rows.forEach((r, idx) => {
      const hasEviden = (r.url_foto_eviden || r.eviden_odp_terbuka) ? 'Ada' : 'Kosong';
      const line = [
        idx + 1,
        `"${r.tanggal || ''}"`,
        `"${(r.teknisi || '').replace(/"/g, '""')}"`,
        `"${r.sto || ''}"`,
        `"${(r.hsa_area || '').replace(/"/g, '""')}"`,
        `"${(r.nama_odp || '').replace(/"/g, '""')}"`,
        `"${r.ip_olt || ''}"`,
        `"${r.id_valins || ''}"`,
        `"${hasEviden}"`
      ].join(',');
      csv += line + '\r\n';
    });

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="database_pt2.csv"');
    return res.send(csv);
  } catch (err) {
    console.error('Error exporting database CSV:', err);
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
      page: 'database',
      title: `Detail Validasi — ${detail.v.nama_odp}`,
      ...detail
    });
  } catch (err) {
    console.error('Error rendering detail:', err);
    res.status(500).render('error', { message: 'Gagal memuat detail: ' + err.message });
  }
});

module.exports = router;
