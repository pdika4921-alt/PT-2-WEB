const express = require('express');
const router = express.Router();
const {
  ensureOdpMonitoringData,
  getCachedOdpMonitoringData,
  refreshOdpMonitoringData
} = require('../controllers/odpMonitoringData');

router.get('/', (req, res) => {
  try {
    const data = ensureOdpMonitoringData();
    res.render('odp-monitoring', {
      page: 'odp-monitoring',
      title: 'Monitoring Pengambilan ODP PT 2 — Telkom Akses',
      data,
      fetchedAt: data.fetchedAt
    });
  } catch (err) {
    console.error('Error rendering odp-monitoring:', err);
    res.status(500).render('error', { message: 'Gagal memuat Monitoring ODP PT 2: ' + err.message });
  }
});

router.get('/api/data', async (req, res) => {
  try {
    const data = req.query.refresh === '1'
      ? await refreshOdpMonitoringData()
      : getCachedOdpMonitoringData();
    res.json({ ok: !data.error || data.stale || data.loading, ...data });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

module.exports = router;
