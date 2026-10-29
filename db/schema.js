const db = require('./connection');

function initSchema() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS validasi_pekerjaan (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      tanggal TEXT,
      teknisi TEXT,
      sto TEXT,
      hsa_area TEXT,
      tipe_splitter TEXT,
      nama_odp TEXT,
      ip_olt TEXT,
      slot_olt TEXT,
      port_olt TEXT,
      kapasitas_kabel TEXT,
      distribusi TEXT,
      core_distribusi TEXT,
      latitude TEXT,
      longitude TEXT,
      textarea_data TEXT,
      id_valins TEXT,
      district TEXT,
      klasifikasi_eksekutor TEXT,
      klasifikasi_order TEXT,
      no_order TEXT,
      mitra TEXT,
      eviden_odp_terbuka TEXT,
      eviden_odp_tertutup TEXT,
      eviden_closure TEXT,
      eviden_foto_lengkap TEXT,
      eviden_spliter TEXT,
      eviden_ftm_jumper TEXT,
      eviden_opm1 TEXT,
      eviden_opm2 TEXT,
      eviden_pengembalian_ps8 TEXT,
      url_foto_eviden TEXT,
      url_foto_lain TEXT,
      keterangan TEXT,
      status_validasi TEXT DEFAULT 'pending' CHECK(status_validasi IN ('pending','valid','invalid','revisi')),
      bast_url TEXT,
      bast_generated INTEGER DEFAULT 0,
      bast_generated_at TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
      ea_ftm TEXT,
      oa_ftm TEXT,
      mancore_image TEXT
    );

    CREATE TABLE IF NOT EXISTS database_pt2 (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      no TEXT,
      area TEXT,
      nama_lop TEXT,
      tematik_project TEXT,
      sto TEXT,
      odp_name TEXT,
      jml_odp TEXT,
      jml_port TEXT,
      type_pt2 TEXT,
      id_ihld TEXT,
      id_e_prop TEXT,
      datel_hsa TEXT,
      group_mitra TEXT,
      sub_mitra TEXT,
      progress_update TEXT,
      periode_order TEXT,
      tgl_golive TEXT,
      sp_pt2 TEXT,
      prioritas TEXT,
      id_nimon TEXT,
      pid TEXT,
      id_sap TEXT,
      no_rfc TEXT,
      progress_terakhir TEXT,
      ket_lookup TEXT,
      jenis_olt TEXT,
      olt_tx TEXT,
      onu_rx TEXT,
      asumsi_onu_rx_cplus TEXT,
      ket TEXT,
      status_mapping TEXT,
      source_order_prioritas TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS input_material (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      validasi_id INTEGER NOT NULL REFERENCES validasi_pekerjaan(id) ON DELETE CASCADE,
      nama_material TEXT NOT NULL,
      satuan TEXT,
      qty REAL NOT NULL DEFAULT 0,
      harga_satuan REAL NOT NULL DEFAULT 0,
      total_harga REAL GENERATED ALWAYS AS (qty * harga_satuan) STORED,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS eviden_kurang (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      validasi_id INTEGER NOT NULL REFERENCES validasi_pekerjaan(id) ON DELETE CASCADE,
      jenis_eviden TEXT,
      catatan TEXT,
      status TEXT DEFAULT 'kurang',
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE NOT NULL,
      password TEXT NOT NULL,
      nama TEXT,
      role TEXT DEFAULT 'admin',
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS rekon_pt2 (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      odp_name TEXT UNIQUE NOT NULL,
      id_nama_lop TEXT,
      witel_sto TEXT,
      foto_odp_luar TEXT,
      foto_odp_dalam TEXT,
      foto_joint_closure TEXT,
      foto_ps_1_4 TEXT,
      foto_lengkap TEXT,
      foto_ufo_opm TEXT,
      foto_sivdum TEXT,
      foto_mancore TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP
    );

    CREATE INDEX IF NOT EXISTS idx_val_odp ON validasi_pekerjaan(nama_odp);
    CREATE INDEX IF NOT EXISTS idx_val_sto ON validasi_pekerjaan(sto);
    CREATE INDEX IF NOT EXISTS idx_val_status ON validasi_pekerjaan(status_validasi);
    CREATE INDEX IF NOT EXISTS idx_val_tanggal ON validasi_pekerjaan(tanggal);
    CREATE INDEX IF NOT EXISTS idx_dbpt2_odp ON database_pt2(odp_name);
    CREATE INDEX IF NOT EXISTS idx_dbpt2_area ON database_pt2(area);
    CREATE INDEX IF NOT EXISTS idx_rekon_odp ON rekon_pt2(odp_name);

    DROP VIEW IF EXISTS v_rekap_validasi;
    CREATE VIEW v_rekap_validasi AS
    SELECT 
      v.*,
      CASE WHEN (v.bast_generated = 1 OR (v.bast_url IS NOT NULL AND v.bast_url != '')) THEN 1 ELSE 0 END AS ada_bast,
      COALESCE(m.jumlah_material, 0) AS jumlah_material,
      COALESCE(m.total_material_rp, 0) AS total_material_rp,
      COALESCE(e.eviden_kurang_count, 0) AS eviden_kurang_count
    FROM validasi_pekerjaan v
    LEFT JOIN (
      SELECT validasi_id, COUNT(*) as jumlah_material, SUM(total_harga) as total_material_rp
      FROM input_material GROUP BY validasi_id
    ) m ON v.id = m.validasi_id
    LEFT JOIN (
      SELECT validasi_id, COUNT(*) as eviden_kurang_count
      FROM eviden_kurang GROUP BY validasi_id
    ) e ON v.id = e.validasi_id;

    DROP VIEW IF EXISTS v_dashboard_summary;
    CREATE VIEW v_dashboard_summary AS
    SELECT
      COUNT(*) AS total_pekerjaan,
      COALESCE(SUM(CASE WHEN status_validasi = 'valid' THEN 1 ELSE 0 END), 0) AS total_valid,
      COALESCE(SUM(CASE WHEN status_validasi = 'invalid' THEN 1 ELSE 0 END), 0) AS total_invalid,
      COALESCE(SUM(CASE WHEN status_validasi = 'pending' THEN 1 ELSE 0 END), 0) AS total_pending,
      COALESCE(SUM(CASE WHEN status_validasi = 'revisi' THEN 1 ELSE 0 END), 0) AS total_revisi,
      COALESCE(SUM(CASE WHEN (bast_generated = 1 OR (bast_url IS NOT NULL AND bast_url != '')) THEN 1 ELSE 0 END), 0) AS total_bast,
      COALESCE(SUM(CASE WHEN (bast_generated = 0 AND (bast_url IS NULL OR bast_url = '')) THEN 1 ELSE 0 END), 0) AS belum_bast
    FROM validasi_pekerjaan;
  `);
}

module.exports = { initSchema };
