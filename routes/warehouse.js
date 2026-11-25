const express = require('express');
const router = express.Router();
const { getWarehouseData } = require('../controllers/warehouseData');

// Baris yang ditampilkan: sheet MANUAL/GAMAS, kolom B (KET) = KONSTRUKSI saja.
const KET_FILTER = 'KONSTRUKSI';

function onlyKonstruksi(rows) {
  return rows.filter(r => String(r.ket || '').trim().toUpperCase() === KET_FILTER);
}

router.get('/', async (req, res) => {
  try {
    const data = await getWarehouseData(req.query.refresh === '1');
    const rows = onlyKonstruksi(data.rows);
    const allCount = data.rows.length;

    res.render('warehouse', {
      page: 'warehouse',
      title: 'WAREHOUSE — Rekon Freelance',
      rows,
      allCount,
      ketFilter: KET_FILTER,
      fetchedAt: data.fetchedAt,
      fetchError: data.error,
      stale: data.stale
    });
  } catch (err) {
    console.error('Error rendering warehouse:', err);
    res.status(500).render('error', { message: 'Gagal memuat dashboard WAREHOUSE: ' + err.message });
  }
});

router.get('/api/data', async (req, res) => {
  try {
    const data = await getWarehouseData(req.query.refresh === '1');
    const rows = onlyKonstruksi(data.rows);
    res.json({
      ok: !data.error || data.stale,
      rows,
      count: rows.length,
      allCount: data.rows.length,
      fetchedAt: data.fetchedAt,
      error: data.error,
      stale: data.stale
    });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

module.exports = router;
