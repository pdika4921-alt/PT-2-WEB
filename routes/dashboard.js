const express = require('express');
const router = express.Router();
const { getDashboardData } = require('../controllers/dashboardController');
const { getDetailData } = require('../controllers/detailHelper');

router.get('/', (req, res) => {
  try {
    const data = getDashboardData(req.query);
    res.render('dashboard', {
      page: 'dashboard',
      title: 'Dashboard - PT 2 KONS',
      ...data
    });
  } catch (err) {
    console.error('Error rendering dashboard:', err);
    res.status(500).render('error', { message: 'Gagal memuat dashboard: ' + err.message });
  }
});

router.get('/detail/:id', (req, res) => {
  try {
    const detail = getDetailData(req.params.id);
    if (!detail) {
      return res.status(404).render('error', { message: 'Data validasi tidak ditemukan' });
    }
    res.render('detail', {
      page: 'dashboard',
      title: `Detail Validasi — ${detail.v.nama_odp}`,
      ...detail
    });
  } catch (err) {
    console.error('Error rendering detail:', err);
    res.status(500).render('error', { message: 'Gagal memuat detail: ' + err.message });
  }
});

module.exports = router;
