const db = require('./connection');
const bcrypt = require('bcryptjs');
const { initSchema } = require('./schema');

initSchema();

console.log('Seeding initial data...');

// Seed admin user
const existingAdmin = db.prepare('SELECT id FROM users WHERE username = ?').get('admin');
if (!existingAdmin) {
  const hash = bcrypt.hashSync('admin123', 10);
  db.prepare('INSERT INTO users (username, password, nama, role) VALUES (?, ?, ?, ?)').run(
    'admin',
    hash,
    'Administrator PT2',
    'admin'
  );
  console.log('User admin created with password admin123');
}

// Check if database_pt2 has data, if not seed sample data matching the preview image and use cases
const countDbpt2 = db.prepare('SELECT COUNT(*) as cnt FROM database_pt2').get().cnt;
if (countDbpt2 === 0) {
  const insertPt2 = db.prepare(`
    INSERT INTO database_pt2 (
      no, area, nama_lop, tematik_project, sto, odp_name, jml_odp, jml_port, type_pt2,
      id_ihld, id_e_prop, datel_hsa, group_mitra, sub_mitra, progress_update, periode_order,
      tgl_golive, sp_pt2, prioritas, id_nimon, pid, id_sap, no_rfc, progress_terakhir,
      ket_lookup, jenis_olt, olt_tx, onu_rx, asumsi_onu_rx_cplus, ket, status_mapping, source_order_prioritas
    ) VALUES (
      ?, ?, ?, ?, ?, ?, ?, ?, ?,
      ?, ?, ?, ?, ?, ?, ?,
      ?, ?, ?, ?, ?, ?, ?, ?,
      ?, ?, ?, ?, ?, ?, ?, ?
    )
  `);

  const pt2Items = [
    {
      no: '1', area: 'Area 2', nama_lop: 'LOP-OSP-HEM-BKS-01', tematik: 'HEM BKS 2026', sto: 'BKS',
      odp: 'ODP-BKS-014', jml_odp: '1', jml_port: '8', type: 'PT2', ihld: 'IHLD-001', eprop: 'EPROP-001',
      datel: 'Bekasi', mitra: 'Telkom Bekasi', sub_mitra: 'PT Telkom Akses', progress: '05. GOLIVE',
      periode: '2026-Q1', golive: '2 Februari 2026', sp: 'SP-PT2-001', prioritas: 'P1', nimon: 'NIM-01',
      pid: 'PID-01', sap: 'SAP-01', rfc: 'RFC-01', terakhir: 'Done Golive', ket_look: 'OK',
      olt: 'ZTE C300', olt_tx: '4.5', onu_rx: '-19.2', asumsi: '-18.5', ket: 'Live OSP', mapping: 'Mapped', src: 'Prioritas 1'
    },
    {
      no: '2', area: 'Area 2', nama_lop: 'LOP-OSP-HEM-JTN-02', tematik: 'HEM JTN 2026', sto: 'JTN',
      odp: 'ODP-JTN-007', jml_odp: '1', jml_port: '8', type: 'PT2', ihld: 'IHLD-002', eprop: 'EPROP-002',
      datel: 'Jatinegara', mitra: 'Mitra Jaya', sub_mitra: 'PT Mitra Jaya Kom', progress: '05. GOLIVE',
      periode: '2026-Q1', golive: '15 Februari 2026', sp: 'SP-PT2-002', prioritas: 'P1', nimon: 'NIM-02',
      pid: 'PID-02', sap: 'SAP-02', rfc: 'RFC-02', terakhir: 'Done Golive', ket_look: 'OK',
      olt: 'Huawei MA5800', olt_tx: '5.1', onu_rx: '-20.1', asumsi: '-19.0', ket: 'Live OSP', mapping: 'Mapped', src: 'Prioritas 1'
    },
    {
      no: '3', area: 'Area 2', nama_lop: 'LOP-OSP-HEM-CKR-03', tematik: 'HEM CKR 2026', sto: 'CKR',
      odp: 'ODP-CKR-021', jml_odp: '1', jml_port: '8', type: 'PT2', ihld: 'IHLD-003', eprop: 'EPROP-003',
      datel: 'Cikarang', mitra: 'Mitra Jaya', sub_mitra: 'PT Mitra Jaya Kom', progress: '04. PROSES VALIDASI',
      periode: '2026-Q1', golive: '', sp: 'SP-PT2-003', prioritas: 'P2', nimon: 'NIM-03',
      pid: 'PID-03', sap: 'SAP-03', rfc: 'RFC-03', terakhir: 'Validasi', ket_look: 'Progress',
      olt: 'Fiberhome', olt_tx: '4.2', onu_rx: '-21.0', asumsi: '-20.0', ket: 'Menunggu Golive', mapping: 'Mapped', src: 'Prioritas 2'
    },
    {
      no: '4', area: 'Area 1', nama_lop: 'LOP-OSP-HEM-KBY-04', tematik: 'HEM KBY 2026', sto: 'KBY',
      odp: 'ODP-KBY-005', jml_odp: '1', jml_port: '8', type: 'PT2', ihld: 'IHLD-004', eprop: 'EPROP-004',
      datel: 'Kebayoran', mitra: 'Telkom Bekasi', sub_mitra: 'PT Telkom Akses', progress: '05. GOLIVE',
      periode: '2026-Q1', golive: '20 Februari 2026', sp: 'SP-PT2-004', prioritas: 'P1', nimon: 'NIM-04',
      pid: 'PID-04', sap: 'SAP-04', rfc: 'RFC-04', terakhir: 'Done Golive', ket_look: 'OK',
      olt: 'ZTE C300', olt_tx: '4.8', onu_rx: '-18.9', asumsi: '-18.0', ket: 'Live OSP', mapping: 'Mapped', src: 'Prioritas 1'
    },
    {
      no: '5', area: 'Area 3', nama_lop: 'LOP-OSP-HEM-BGR-05', tematik: 'HEM BGR 2026', sto: 'BGR',
      odp: 'ODP-BGR-012', jml_odp: '1', jml_port: '8', type: 'PT2', ihld: 'IHLD-005', eprop: 'EPROP-005',
      datel: 'Bogor', mitra: 'Mandor OSP Mandiri', sub_mitra: 'CV OSP Mandiri', progress: '05. GOLIVE',
      periode: '2026-Q1', golive: '28 Februari 2026', sp: 'SP-PT2-005', prioritas: 'P2', nimon: 'NIM-05',
      pid: 'PID-05', sap: 'SAP-05', rfc: 'RFC-05', terakhir: 'Done Golive', ket_look: 'OK',
      olt: 'Huawei MA5800', olt_tx: '5.0', onu_rx: '-19.8', asumsi: '-19.2', ket: 'Live OSP', mapping: 'Mapped', src: 'Prioritas 2'
    }
  ];

  const insertManyPt2 = db.transaction((items) => {
    for (const item of items) {
      insertPt2.run(
        item.no, item.area, item.nama_lop, item.tematik, item.sto, item.odp,
        item.jml_odp, item.jml_port, item.type, item.ihld, item.eprop, item.datel,
        item.mitra, item.sub_mitra, item.progress, item.periode, item.golive,
        item.sp, item.prioritas, item.nimon, item.pid, item.sap, item.rfc,
        item.terakhir, item.ket_look, item.olt, item.olt_tx, item.onu_rx,
        item.asumsi, item.ket, item.mapping, item.src
      );
    }
  });

  insertManyPt2(pt2Items);
  console.log(`Seeded ${pt2Items.length} rows into database_pt2`);
}

// Check validasi_pekerjaan
const countVal = db.prepare('SELECT COUNT(*) as cnt FROM validasi_pekerjaan').get().cnt;
if (countVal === 0) {
  const insertVal = db.prepare(`
    INSERT INTO validasi_pekerjaan (
      tanggal, teknisi, sto, hsa_area, tipe_splitter, nama_odp, ip_olt, slot_olt, port_olt,
      kapasitas_kabel, distribusi, core_distribusi, latitude, longitude, textarea_data,
      id_valins, district, klasifikasi_eksekutor, klasifikasi_order, no_order, mitra,
      eviden_odp_terbuka, eviden_odp_tertutup, eviden_closure, eviden_foto_lengkap,
      eviden_spliter, eviden_ftm_jumper, eviden_opm1, eviden_opm2, eviden_pengembalian_ps8,
      url_foto_eviden, keterangan, status_validasi, bast_generated, ea_ftm, oa_ftm
    ) VALUES (
      ?, ?, ?, ?, ?, ?, ?, ?, ?,
      ?, ?, ?, ?, ?, ?,
      ?, ?, ?, ?, ?, ?,
      ?, ?, ?, ?,
      ?, ?, ?, ?, ?,
      ?, ?, ?, ?, ?, ?
    )
  `);

  const sampleDate = '2026-10-10';
  const valItems = [
    {
      tanggal: '2026-10-10', teknisi: 'Budi Santoso', sto: 'BKS', hsa_area: 'HSA BKS UTARA',
      tipe_splitter: '1:4', nama_odp: 'ODP-BKS-014', ip_olt: '10.32.14.2', slot_olt: '1', port_olt: '4',
      kapasitas: '24 Core', distribusi: 'DIST-01', core_dist: 'Core 4', lat: '-6.2382', lng: '106.9756',
      textarea: 'ODP-BKS-014 / 8 Port / STO BKS', valins: 'VAL-BKS-001', district: 'Bekasi',
      eksekutor: 'Kemitraan', order_klas: 'Reguler', no_order: 'WO-BKS-2026-001', mitra: 'Telkom Bekasi',
      foto_terbuka: 'https://images.unsplash.com/photo-1544716278-ca5e3f4abd8c?auto=format&fit=crop&w=400&q=80',
      foto_tertutup: 'https://images.unsplash.com/photo-1544717302-de2939b7ef71?auto=format&fit=crop&w=400&q=80',
      closure: 'https://images.unsplash.com/photo-1581092160607-ee22621dd758?auto=format&fit=crop&w=400&q=80',
      lengkap: 'https://images.unsplash.com/photo-1581092335397-9583fe92d232?auto=format&fit=crop&w=400&q=80',
      spliter: 'https://images.unsplash.com/photo-1518770660439-4636190af475?auto=format&fit=crop&w=400&q=80',
      ftm: '', opm1: 'https://images.unsplash.com/photo-1581092160607-ee22621dd758?auto=format&fit=crop&w=400&q=80',
      opm2: '', ps8: '',
      url_eviden: 'https://images.unsplash.com/photo-1544716278-ca5e3f4abd8c?auto=format&fit=crop&w=400&q=80',
      ket: 'Validasi OSP Selesai Sesuai Standar', status: 'valid', bast: 1, ea: 'EA-01', oa: 'OA-01'
    },
    {
      tanggal: '2026-10-09', teknisi: 'Ahmad Fauzi', sto: 'JTN', hsa_area: 'HSA JTN TIMUR',
      tipe_splitter: '1:4', nama_odp: 'ODP-JTN-007', ip_olt: '10.32.18.5', slot_olt: '2', port_olt: '1',
      kapasitas: '12 Core', distribusi: 'DIST-02', core_dist: 'Core 2', lat: '-6.2255', lng: '106.8650',
      textarea: 'ODP-JTN-007 / 8 Port / STO JTN', valins: 'VAL-JTN-002', district: 'Jatinegara',
      eksekutor: 'Kemitraan', order_klas: 'Reguler', no_order: 'WO-JTN-2026-002', mitra: 'Mitra Jaya',
      foto_terbuka: 'https://images.unsplash.com/photo-1544716278-ca5e3f4abd8c?auto=format&fit=crop&w=400&q=80',
      foto_tertutup: 'https://images.unsplash.com/photo-1544717302-de2939b7ef71?auto=format&fit=crop&w=400&q=80',
      closure: 'https://images.unsplash.com/photo-1581092160607-ee22621dd758?auto=format&fit=crop&w=400&q=80',
      lengkap: 'https://images.unsplash.com/photo-1581092335397-9583fe92d232?auto=format&fit=crop&w=400&q=80',
      spliter: 'https://images.unsplash.com/photo-1518770660439-4636190af475?auto=format&fit=crop&w=400&q=80',
      ftm: '', opm1: 'https://images.unsplash.com/photo-1581092160607-ee22621dd758?auto=format&fit=crop&w=400&q=80',
      opm2: '', ps8: '',
      url_eviden: 'https://images.unsplash.com/photo-1544716278-ca5e3f4abd8c?auto=format&fit=crop&w=400&q=80',
      ket: 'Validasi Sukses', status: 'valid', bast: 1, ea: 'EA-02', oa: 'OA-02'
    },
    {
      tanggal: '2026-10-08', teknisi: 'Rian Pratama', sto: 'CKR', hsa_area: 'HSA CKR SELATAN',
      tipe_splitter: '1:8', nama_odp: 'ODP-CKR-021', ip_olt: '10.32.22.9', slot_olt: '3', port_olt: '6',
      kapasitas: '24 Core', distribusi: 'DIST-03', core_dist: 'Core 6', lat: '-6.3012', lng: '107.1350',
      textarea: 'ODP-CKR-021 / 8 Port / STO CKR', valins: 'VAL-CKR-003', district: 'Cikarang',
      eksekutor: 'Swakelola', order_klas: 'QE', no_order: 'WO-CKR-2026-003', mitra: 'Mitra Jaya',
      foto_terbuka: '', foto_tertutup: '', closure: '', lengkap: '', spliter: '',
      ftm: '', opm1: '', opm2: '', ps8: '',
      url_eviden: '',
      ket: 'Eviden belum lengkap foto OPM', status: 'pending', bast: 0, ea: 'EA-03', oa: 'OA-03'
    },
    {
      tanggal: '2026-10-07', teknisi: 'Dedi Kurniawan', sto: 'KBY', hsa_area: 'HSA KBY BARAT',
      tipe_splitter: '1:4', nama_odp: 'ODP-KBY-005', ip_olt: '10.32.11.4', slot_olt: '1', port_olt: '2',
      kapasitas: '12 Core', distribusi: 'DIST-04', core_dist: 'Core 1', lat: '-6.2410', lng: '106.7980',
      textarea: 'ODP-KBY-005 / 8 Port / STO KBY', valins: 'VAL-KBY-004', district: 'Kebayoran',
      eksekutor: 'Kemitraan', order_klas: 'Reguler', no_order: 'WO-KBY-2026-004', mitra: 'Telkom Bekasi',
      foto_terbuka: 'https://images.unsplash.com/photo-1544716278-ca5e3f4abd8c?auto=format&fit=crop&w=400&q=80',
      foto_tertutup: 'https://images.unsplash.com/photo-1544717302-de2939b7ef71?auto=format&fit=crop&w=400&q=80',
      closure: 'https://images.unsplash.com/photo-1581092160607-ee22621dd758?auto=format&fit=crop&w=400&q=80',
      lengkap: 'https://images.unsplash.com/photo-1581092335397-9583fe92d232?auto=format&fit=crop&w=400&q=80',
      spliter: '', ftm: '', opm1: 'https://images.unsplash.com/photo-1581092160607-ee22621dd758?auto=format&fit=crop&w=400&q=80',
      opm2: '', ps8: '',
      url_eviden: 'https://images.unsplash.com/photo-1544716278-ca5e3f4abd8c?auto=format&fit=crop&w=400&q=80',
      ket: 'Validasi OSP Complete', status: 'valid', bast: 1, ea: 'EA-04', oa: 'OA-04'
    },
    {
      tanggal: '2026-10-06', teknisi: 'Siti Rahma', sto: 'BGR', hsa_area: 'HSA BGR UTARA',
      tipe_splitter: '1:4', nama_odp: 'ODP-BGR-012', ip_olt: '10.32.30.1', slot_olt: '2', port_olt: '7',
      kapasitas: '24 Core', distribusi: 'DIST-05', core_dist: 'Core 5', lat: '-6.5950', lng: '106.8166',
      textarea: 'ODP-BGR-012 / 8 Port / STO BGR', valins: 'VAL-BGR-005', district: 'Bogor',
      eksekutor: 'Swakelola', order_klas: 'Reguler', no_order: 'WO-BGR-2026-005', mitra: 'Mandor OSP Mandiri',
      foto_terbuka: 'https://images.unsplash.com/photo-1544716278-ca5e3f4abd8c?auto=format&fit=crop&w=400&q=80',
      foto_tertutup: 'https://images.unsplash.com/photo-1544717302-de2939b7ef71?auto=format&fit=crop&w=400&q=80',
      closure: 'https://images.unsplash.com/photo-1581092160607-ee22621dd758?auto=format&fit=crop&w=400&q=80',
      lengkap: 'https://images.unsplash.com/photo-1581092335397-9583fe92d232?auto=format&fit=crop&w=400&q=80',
      spliter: '', ftm: '', opm1: '', opm2: '', ps8: '',
      url_eviden: 'https://images.unsplash.com/photo-1544716278-ca5e3f4abd8c?auto=format&fit=crop&w=400&q=80',
      ket: 'Perlu revisi foto OPM', status: 'revisi', bast: 0, ea: 'EA-05', oa: 'OA-05'
    },
    {
      tanggal: '2026-10-05', teknisi: 'Budi Santoso', sto: 'BKS', hsa_area: 'HSA BKS BARAT',
      tipe_splitter: '1:4', nama_odp: 'ODP-BKS-019', ip_olt: '10.32.14.2', slot_olt: '1', port_olt: '8',
      kapasitas: '12 Core', distribusi: 'DIST-06', core_dist: 'Core 8', lat: '-6.2450', lng: '106.9850',
      textarea: 'ODP-BKS-019 / 8 Port', valins: 'VAL-BKS-006', district: 'Bekasi',
      eksekutor: 'Kemitraan', order_klas: 'Reguler', no_order: 'WO-BKS-2026-006', mitra: 'Telkom Bekasi',
      foto_terbuka: '', foto_tertutup: '', closure: '', lengkap: '', spliter: '',
      ftm: '', opm1: '', opm2: '', ps8: '',
      url_eviden: '',
      ket: 'Kabel distribusi putus, invalid', status: 'invalid', bast: 0, ea: 'EA-06', oa: 'OA-06'
    }
  ];

  const insertManyVal = db.transaction((items) => {
    for (const v of items) {
      const res = insertVal.run(
        v.tanggal, v.teknisi, v.sto, v.hsa_area, v.tipe_splitter, v.nama_odp,
        v.ip_olt, v.slot_olt, v.port_olt, v.kapasitas, v.distribusi, v.core_dist,
        v.lat, v.lng, v.textarea, v.valins, v.district, v.eksekutor, v.order_klas,
        v.no_order, v.mitra, v.foto_terbuka, v.foto_tertutup, v.closure, v.lengkap,
        v.spliter, v.ftm, v.opm1, v.opm2, v.ps8, v.url_eviden, v.ket, v.status,
        v.bast, v.ea, v.oa
      );

      const valId = res.lastInsertRowid;

      // Seed input_material
      db.prepare(`
        INSERT INTO input_material (validasi_id, nama_material, satuan, qty, harga_satuan)
        VALUES (?, ?, ?, ?, ?)
      `).run(valId, 'Kabel Dropcore 1 Core', 'Meter', 150, 2500);

      db.prepare(`
        INSERT INTO input_material (validasi_id, nama_material, satuan, qty, harga_satuan)
        VALUES (?, ?, ?, ?, ?)
      `).run(valId, 'Optical Termination Box (OTB)', 'Unit', 1, 85000);

      // Seed rekon_pt2
      db.prepare(`
        INSERT OR IGNORE INTO rekon_pt2 (odp_name, id_nama_lop, witel_sto, foto_odp_luar, foto_odp_dalam, foto_joint_closure, foto_ps_1_4, foto_lengkap, foto_ufo_opm, foto_sivdum, foto_mancore)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        v.nama_odp,
        'LOP-OSP-HEM-' + v.sto,
        v.sto,
        v.foto_terbuka,
        v.foto_tertutup,
        v.closure,
        v.spliter,
        v.lengkap,
        v.opm1,
        v.opm2,
        ''
      );

      if (v.status === 'pending' || !v.url_eviden) {
        db.prepare(`
          INSERT INTO eviden_kurang (validasi_id, jenis_eviden, catatan, status)
          VALUES (?, ?, ?, ?)
        `).run(valId, 'Foto OPM', 'Belum ada foto pengukuran redaman OPM', 'kurang');
      }
    }
  });

  insertManyVal(valItems);
  console.log(`Seeded ${valItems.length} rows into validasi_pekerjaan`);
}

console.log('Seeding completed.');
