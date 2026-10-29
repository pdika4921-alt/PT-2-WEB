const db = require('../db/connection');

function handleFormWebhook(req, res) {
  try {
    const data = req.body;
    const {
      teknisi,
      sto,
      nama_odp,
      tanggal = new Date().toISOString().split('T')[0],
      hsa_area,
      tipe_splitter,
      ip_olt,
      slot_olt,
      port_olt,
      kapasitas_kabel,
      distribusi,
      core_distribusi,
      latitude,
      longitude,
      textarea_data,
      id_valins,
      district,
      klasifikasi_eksekutor,
      klasifikasi_order,
      no_order,
      mitra,
      eviden_odp_terbuka,
      eviden_odp_tertutup,
      eviden_closure,
      eviden_foto_lengkap,
      eviden_spliter,
      eviden_ftm_jumper,
      eviden_opm1,
      eviden_opm2,
      eviden_pengembalian_ps8,
      url_foto_eviden,
      url_foto_lain,
      keterangan,
      status_validasi = 'pending',
      ea_ftm,
      oa_ftm,
      material = []
    } = data;

    if (!teknisi || !sto || !nama_odp) {
      return res.status(400).json({
        ok: false,
        error: 'Missing required fields: teknisi, sto, and nama_odp are required'
      });
    }

    const insertStmt = db.prepare(`
      INSERT INTO validasi_pekerjaan (
        tanggal, teknisi, sto, hsa_area, tipe_splitter, nama_odp, ip_olt, slot_olt, port_olt,
        kapasitas_kabel, distribusi, core_distribusi, latitude, longitude, textarea_data,
        id_valins, district, klasifikasi_eksekutor, klasifikasi_order, no_order, mitra,
        eviden_odp_terbuka, eviden_odp_tertutup, eviden_closure, eviden_foto_lengkap,
        eviden_spliter, eviden_ftm_jumper, eviden_opm1, eviden_opm2, eviden_pengembalian_ps8,
        url_foto_eviden, url_foto_lain, keterangan, status_validasi, ea_ftm, oa_ftm
      ) VALUES (
        ?, ?, ?, ?, ?, ?, ?, ?, ?,
        ?, ?, ?, ?, ?, ?,
        ?, ?, ?, ?, ?, ?,
        ?, ?, ?, ?,
        ?, ?, ?, ?, ?,
        ?, ?, ?, ?, ?, ?
      )
    `);

    const result = insertStmt.run(
      tanggal, teknisi, sto, hsa_area || '', tipe_splitter || '', nama_odp,
      ip_olt || '', slot_olt || '', port_olt || '', kapasitas_kabel || '', distribusi || '',
      core_distribusi || '', latitude || '', longitude || '', textarea_data || '',
      id_valins || '', district || '', klasifikasi_eksekutor || '', klasifikasi_order || '',
      no_order || '', mitra || '', eviden_odp_terbuka || '', eviden_odp_tertutup || '',
      eviden_closure || '', eviden_foto_lengkap || '', eviden_spliter || '', eviden_ftm_jumper || '',
      eviden_opm1 || '', eviden_opm2 || '', eviden_pengembalian_ps8 || '',
      url_foto_eviden || '', url_foto_lain || '', keterangan || '', status_validasi,
      ea_ftm || '', oa_ftm || ''
    );

    const validasiId = result.lastInsertRowid;

    // jika url_foto_eviden kosong -> insert eviden_kurang
    if (!url_foto_eviden || url_foto_eviden.trim() === '') {
      db.prepare(`
        INSERT INTO eviden_kurang (validasi_id, jenis_eviden, catatan, status)
        VALUES (?, ?, ?, ?)
      `).run(validasiId, 'Foto Eviden Utama', 'Foto eviden utama belum diunggah via form', 'kurang');
    }

    // jika ada material[] -> insert input_material
    if (Array.isArray(material) && material.length > 0) {
      const insertMat = db.prepare(`
        INSERT INTO input_material (validasi_id, nama_material, satuan, qty, harga_satuan)
        VALUES (?, ?, ?, ?, ?)
      `);
      for (const m of material) {
        if (m.nama_material) {
          insertMat.run(
            validasiId,
            m.nama_material,
            m.satuan || 'Unit',
            Number(m.qty) || 0,
            Number(m.harga_satuan) || 0
          );
        }
      }
    }

    return res.json({
      ok: true,
      message: 'Validasi form processed successfully',
      id: validasiId
    });
  } catch (err) {
    console.error('Error handling form webhook:', err);
    return res.status(500).json({ ok: false, error: err.message });
  }
}

function handleBastCallback(req, res) {
  try {
    const { validasi_id, bast_url } = req.body;
    if (!validasi_id || !bast_url) {
      return res.status(400).json({ ok: false, error: 'validasi_id and bast_url are required' });
    }

    const now = new Date().toISOString();
    const result = db.prepare(`
      UPDATE validasi_pekerjaan
      SET bast_url = ?, bast_generated = 1, bast_generated_at = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(bast_url, now, validasi_id);

    if (result.changes === 0) {
      return res.status(404).json({ ok: false, error: 'validasi_pekerjaan not found' });
    }

    return res.json({ ok: true, message: 'BAST callback updated successfully', bast_url, validasi_id });
  } catch (err) {
    console.error('Error handling bast callback:', err);
    return res.status(500).json({ ok: false, error: err.message });
  }
}

module.exports = {
  handleFormWebhook,
  handleBastCallback
};
