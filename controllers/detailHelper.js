const db = require('../db/connection');

function getDetailData(id) {
  const v = db.prepare('SELECT * FROM validasi_pekerjaan WHERE id = ?').get(id);
  if (!v) return null;

  const materials = db.prepare('SELECT * FROM input_material WHERE validasi_id = ?').all(id);
  const evidenKurang = db.prepare('SELECT * FROM eviden_kurang WHERE validasi_id = ?').all(id);

  // 9 label: ODP Terbuka, ODP Tertutup, Closure, Foto Lengkap, Spliter, FTM Jumper, OPM 1, OPM 2, Pengembalian PS 8
  const rawEvidenList = [
    { label: 'ODP Terbuka', url: v.eviden_odp_terbuka },
    { label: 'ODP Tertutup', url: v.eviden_odp_tertutup },
    { label: 'Closure', url: v.eviden_closure },
    { label: 'Foto Lengkap', url: v.eviden_foto_lengkap },
    { label: 'Spliter', url: v.eviden_spliter },
    { label: 'FTM Jumper', url: v.eviden_ftm_jumper },
    { label: 'OPM 1', url: v.eviden_opm1 },
    { label: 'OPM 2', url: v.eviden_opm2 },
    { label: 'Pengembalian PS 8', url: v.eviden_pengembalian_ps8 },
    // If url_foto_eviden is present and not matched above, we can also include it
    { label: 'Foto Eviden Utama', url: v.url_foto_eviden }
  ];

  // Hanya yang url-nya terisi
  const evidenList = rawEvidenList.filter(item => item.url && item.url.trim() !== '');

  return {
    v,
    materials,
    evidenKurang,
    evidenList
  };
}

module.exports = { getDetailData };
