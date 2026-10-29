const express = require('express');
const router = express.Router();
const db = require('../db/connection');
const config = require('../config');
const { getSyncStatus: getDbpt2SyncStatus } = require('../db/sync-dbpt2');
const { getSyncStatus: getValSyncStatus } = require('../db/sync-validasi');

router.get('/', (req, res) => {
  try {
    const totalValidasi = db.prepare('SELECT COUNT(*) as cnt FROM validasi_pekerjaan').get()?.cnt || 0;
    const totalDatabasePt2 = db.prepare('SELECT COUNT(*) as cnt FROM database_pt2').get()?.cnt || 0;
    const totalData = {
      validasi: totalValidasi,
      dbpt2: totalDatabasePt2,
      total: totalValidasi + totalDatabasePt2
    };

    const users = db.prepare('SELECT id, username, nama, role, created_at FROM users ORDER BY id ASC').all();

    const syncStatus = {
      dbpt2: getDbpt2SyncStatus(),
      validasi: getValSyncStatus(),
      dbpt2UrlConfigured: Boolean(config.DBPT2_SHEET_CSV_URL),
      validasiUrlConfigured: Boolean(config.VALIDASI_SHEET_CSV_URL)
    };

    res.render('pengaturan', {
      page: 'pengaturan',
      title: 'Pengaturan Sistem — PT 2 KONS',
      totalData,
      users,
      syncStatus,
      webhookConfig: {
        endpoint: '/webhook/form',
        secretConfigured: Boolean(config.WEBHOOK_SECRET)
      }
    });
  } catch (err) {
    console.error('Error rendering pengaturan:', err);
    res.status(500).render('error', { message: 'Gagal memuat pengaturan: ' + err.message });
  }
});

module.exports = router;
