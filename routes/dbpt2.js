const express = require('express');
const router = express.Router();
const db = require('../db/connection');

router.get('/', (req, res) => {
  try {
    const { area, golive, q } = req.query;

    const total = db.prepare('SELECT COUNT(*) as cnt FROM database_pt2').get()?.cnt || 0;
    const goliveCount = db.prepare("SELECT COUNT(*) as cnt FROM database_pt2 WHERE progress_update = '05. GOLIVE' OR progress_update LIKE '%GOLIVE%'").get()?.cnt || 0;
    const belumGolive = total - goliveCount;

    const areasGroup = db.prepare(`
      SELECT 
        COALESCE(NULLIF(area, ''), 'Lainnya') as area,
        COUNT(*) as jumlah
      FROM database_pt2
      GROUP BY area
      ORDER BY jumlah DESC
    `).all();

    const areaList = areasGroup.map(a => a.area);

    let whereClauses = [];
    let params = [];

    if (area) {
      whereClauses.push('area = ?');
      params.push(area);
    }
    if (golive === '1') {
      whereClauses.push("(progress_update = '05. GOLIVE' OR progress_update LIKE '%GOLIVE%')");
    } else if (golive === '0') {
      whereClauses.push("(progress_update != '05. GOLIVE' AND (progress_update NOT LIKE '%GOLIVE%' OR progress_update IS NULL))");
    }
    if (q) {
      whereClauses.push('(odp_name LIKE ? OR sto LIKE ? OR area LIKE ? OR group_mitra LIKE ? OR nama_lop LIKE ?)');
      const term = `%${q}%`;
      params.push(term, term, term, term, term);
    }

    const whereSql = whereClauses.length > 0 ? 'WHERE ' + whereClauses.join(' AND ') : '';
    const rows = db.prepare(`
      SELECT * FROM database_pt2
      ${whereSql}
      ORDER BY id DESC
    `).all(...params);

    res.render('dbpt2', {
      page: 'dbpt2',
      title: 'DB PT 2 Lengkap — Monitoring',
      total,
      golive: goliveCount,
      belumGolive,
      areas: areasGroup,
      areaList,
      rows,
      query: {
        area: area || '',
        golive: golive || '',
        q: q || ''
      }
    });
  } catch (err) {
    console.error('Error rendering dbpt2:', err);
    res.status(500).render('error', { message: 'Gagal memuat DB PT2: ' + err.message });
  }
});

router.get('/export', (req, res) => {
  try {
    const rows = db.prepare('SELECT * FROM database_pt2 ORDER BY id DESC').all();

    let csv = '\uFEFF';
    csv += 'No,Area,STO,ODP Name,Tematik,Mitra,Progress,Tgl Golive,Status\r\n';

    rows.forEach((r, idx) => {
      const isGolive = (r.progress_update && r.progress_update.includes('GOLIVE')) ? 'GOLIVE' : 'PROGRESS';
      const line = [
        idx + 1,
        `"${(r.area || '').replace(/"/g, '""')}"`,
        `"${r.sto || ''}"`,
        `"${(r.odp_name || '').replace(/"/g, '""')}"`,
        `"${(r.tematik_project || '').replace(/"/g, '""')}"`,
        `"${(r.group_mitra || '').replace(/"/g, '""')}"`,
        `"${(r.progress_update || '').replace(/"/g, '""')}"`,
        `"${r.tgl_golive || ''}"`,
        `"${isGolive}"`
      ].join(',');
      csv += line + '\r\n';
    });

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="db_pt2_lengkap.csv"');
    return res.send(csv);
  } catch (err) {
    console.error('Error exporting dbpt2:', err);
    res.status(500).send('Export failed');
  }
});

router.get('/detail/:id', (req, res) => {
  try {
    const row = db.prepare('SELECT * FROM database_pt2 WHERE id = ?').get(req.params.id);
    if (!row) {
      return res.status(404).render('error', { message: 'Data DB PT2 tidak ditemukan' });
    }

    // 29 fields list for display
    const fields = [
      { label: 'No Urut', val: row.no },
      { label: 'Area', val: row.area },
      { label: 'Nama LOP', val: row.nama_lop },
      { label: 'Tematik Project', val: row.tematik_project },
      { label: 'STO', val: row.sto },
      { label: 'ODP Name', val: row.odp_name },
      { label: 'Jumlah ODP', val: row.jml_odp },
      { label: 'Jumlah Port', val: row.jml_port },
      { label: 'Type PT2', val: row.type_pt2 },
      { label: 'ID IHLD', val: row.id_ihld },
      { label: 'ID E-Prop', val: row.id_e_prop },
      { label: 'Datel / HSA', val: row.datel_hsa },
      { label: 'Group Mitra', val: row.group_mitra },
      { label: 'Sub Mitra', val: row.sub_mitra },
      { label: 'Progress Update', val: row.progress_update },
      { label: 'Periode Order', val: row.periode_order },
      { label: 'Tanggal Golive', val: row.tgl_golive },
      { label: 'SP PT2', val: row.sp_pt2 },
      { label: 'Prioritas', val: row.prioritas },
      { label: 'ID Nimon', val: row.id_nimon },
      { label: 'PID', val: row.pid },
      { label: 'ID SAP', val: row.id_sap },
      { label: 'No RFC', val: row.no_rfc },
      { label: 'Progress Terakhir', val: row.progress_terakhir },
      { label: 'Keterangan Lookup', val: row.ket_lookup },
      { label: 'Jenis OLT', val: row.jenis_olt },
      { label: 'OLT Tx', val: row.olt_tx },
      { label: 'ONU Rx', val: row.onu_rx },
      { label: 'Status Mapping', val: row.status_mapping }
    ];

    res.render('dbpt2-detail', {
      page: 'dbpt2',
      title: `Detail DB PT2 — ${row.odp_name}`,
      row,
      fields
    });
  } catch (err) {
    console.error('Error rendering dbpt2 detail:', err);
    res.status(500).render('error', { message: 'Gagal memuat detail DB PT2: ' + err.message });
  }
});

module.exports = router;
