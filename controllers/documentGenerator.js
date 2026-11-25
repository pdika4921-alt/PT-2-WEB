const fs = require('fs');
const path = require('path');
const ExcelJS = require('exceljs');
const docx = require('docx');
const archiver = require('archiver');
const https = require('https');
const http = require('http');
const db = require('../db/connection');

// Shared Puppeteer browser — puppeteer v25 ESM-only, jadi wajib dynamic import.
// Browser dipakai ulang (di-cache) agar generate banyak gambar cepat.
let _browserPromise = null;
async function getSharedBrowser() {
  if (_browserPromise) {
    try {
      const b = await _browserPromise;
      if (b && b.connected) return b;
    } catch (e) { /* lanjut relaunch */ }
    _browserPromise = null;
  }
  _browserPromise = (async () => {
    const puppeteer = (await import('puppeteer')).default;
    return puppeteer.launch({
      headless: 'new',
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--disable-gpu']
    });
  })();
  try {
    return await _browserPromise;
  } catch (e) {
    _browserPromise = null;
    throw e;
  }
}

// Helper to download image as buffer
function fetchImageBuffer(url, maxRedirects = 5) {
  return new Promise((resolve) => {
    if (!url || typeof url !== 'string') {
      return resolve(null);
    }

    // Path lokal uploads (mancore_image dsb.)
    if (url.startsWith('/uploads/')) {
      try {
        const p = require('path').join(__dirname, '..', 'uploads', require('path').basename(url));
        return resolve(require('fs').readFileSync(p));
      } catch (e) {
        return resolve(null);
      }
    }

    if (!url.startsWith('http')) {
      return resolve(null);
    }

    // Google Drive: /d/ID atau open?id=ID → lh3 direct
    let targetUrl = url;
    if (url.includes('drive.google.com')) {
      let fileId = null;
      const m1 = url.match(/\/d\/([a-zA-Z0-9_-]+)/);
      const m2 = url.match(/[?&]id=([a-zA-Z0-9_-]+)/);
      if (m1 && m1[1]) fileId = m1[1];
      else if (m2 && m2[1]) fileId = m2[1];
      if (fileId) targetUrl = `https://lh3.googleusercontent.com/d/${fileId}`;
    }

    const client = targetUrl.startsWith('https') ? https : http;
    const req = client.get(targetUrl, { headers: { 'User-Agent': 'Mozilla/5.0' } }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location && maxRedirects > 0) {
        return fetchImageBuffer(res.headers.location, maxRedirects - 1).then(resolve);
      }
      if (res.statusCode !== 200) {
        return resolve(null);
      }
      const chunks = [];
      res.on('data', chunk => chunks.push(chunk));
      res.on('end', () => resolve(Buffer.concat(chunks)));
    });
    req.on('error', () => resolve(null));
    req.setTimeout(20000, () => { req.destroy(); resolve(null); });
  });
}

/**
 * 1) VALID4 PDF GENERATION
 */
async function generateValid4Html(items, skipImages = false) {
  const rowsHtml = items.map((item, idx) => {
    const bgClass = idx % 2 === 1 ? 'background-color:#f8f8f8;' : 'background-color:#ffffff;';
    
    let evidenHtml = '';
    if (skipImages) {
      evidenHtml = `<span style="color:#28a745; font-weight:bold; font-size:10px;">${item.evidenCount || 4} foto</span>`;
    } else {
      const thumbs = [
        item.eviden_odp_terbuka,
        item.eviden_odp_tertutup,
        item.eviden_closure,
        item.eviden_foto_lengkap,
        item.eviden_spliter,
        item.eviden_opm1
      ].filter(Boolean);

      if (thumbs.length > 0) {
        evidenHtml = thumbs.map(u => 
          `<img src="${u}" style="width:50px; height:36px; object-fit:cover; border-radius:3px; margin:1px; border:1px solid #ddd;" onerror="this.style.display='none'" />`
        ).join('');
      } else {
        evidenHtml = `<span style="color:#999; font-size:9px;">Tidak ada</span>`;
      }
    }

    return `
      <tr style="${bgClass} font-size:10px; border-bottom:1px solid #e0e0e0; text-align:center;">
        <td style="padding:4px; border:1px solid #ddd;">${idx + 1}</td>
        <td style="padding:4px; border:1px solid #ddd;">${item.sto || '-'}</td>
        <td style="padding:4px; border:1px solid #ddd; font-family:monospace;">${item.ip_olt || '-'}</td>
        <td style="padding:4px; border:1px solid #ddd;">${item.slot_olt || '-'}</td>
        <td style="padding:4px; border:1px solid #ddd;">${item.port_olt || '-'}</td>
        <td style="padding:4px; border:1px solid #ddd;">${item.ea_ftm || '-'}</td>
        <td style="padding:4px; border:1px solid #ddd;">${item.oa_ftm || '-'}</td>
        <td style="padding:4px; border:1px solid #ddd;">${item.slot_out || '1:4'}</td>
        <td style="padding:4px; border:1px solid #ddd; font-weight:bold;">${item.nama_odp || '-'}</td>
        <td style="padding:4px; border:1px solid #ddd;">${item.core_feeder || item.core_distribusi || '-'}</td>
        <td style="padding:4px; border:1px solid #ddd;">${item.kapasitas_kabel || '24'}</td>
        <td style="padding:4px; border:1px solid #ddd;">${item.distribusi || 'DS-01'}</td>
        <td style="padding:4px; border:1px solid #ddd;">${item.core_distribusi || '1'}</td>
        <td style="padding:4px; border:1px solid #ddd;">${item.tipe_splitter || '-'}</td>
        <td style="padding:4px; border:1px solid #ddd;">${item.latitude || '-'}</td>
        <td style="padding:4px; border:1px solid #ddd;">${item.longitude || '-'}</td>
        <td style="padding:4px; border:1px solid #ddd; font-family:monospace;">${item.id_valins || '-'}</td>
        <td style="padding:4px; border:1px solid #ddd; max-width:180px; text-align:center;">${evidenHtml}</td>
      </tr>
    `;
  }).join('');

  const firstItem = items[0] || {};

  return `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <title>VALID 4 - MANAGEMENT CORE FO</title>
      <style>
        @page { size: A4 landscape; margin: 8mm; }
        body { font-family: 'Helvetica Neue', Arial, sans-serif; font-size: 11px; margin: 0; padding: 10px; color: #333; }
        .header-title { font-size: 16px; font-weight: bold; color: #1b2233; text-align: center; margin-bottom: 12px; }
        .project-table { width: 100%; border-collapse: collapse; margin-bottom: 12px; font-size: 10px; }
        .project-table td { padding: 4px 8px; border: 1px solid #ccc; }
        .main-table { width: 100%; border-collapse: collapse; font-size: 9px; }
        .main-table th { padding: 5px 3px; border: 1px solid #bbb; text-align: center; font-weight: 600; }
        .th-group { background-color: #d4edda; color: #155724; font-size: 10px; }
        .th-sub { background-color: #e8f4fd; color: #0c5460; font-size: 9px; }
        .footer-sign { margin-top: 30px; display: flex; justify-content: space-between; padding: 0 40px; }
        .sign-box { text-align: center; width: 180px; }
        .sign-line { margin-top: 50px; border-top: 1px solid #333; }
      </style>
    </head>
    <body>
      <div class="header-title">MANAGEMENT CORE FO</div>
      
      <table class="project-table">
        <tr>
          <td style="width: 15%; background: #f0f3f6; font-weight: bold;">PROJECT</td>
          <td style="width: 35%;">PENGADAAN DAN PEMASANGAN OUT SIDE PLAN FIBER TO THE HOME (OSP - HEM)</td>
          <td style="width: 15%; background: #f0f3f6; font-weight: bold;">WITEL / STO</td>
          <td style="width: 35%;">${firstItem.sto || 'REGIONAL 2'}</td>
        </tr>
        <tr>
          <td style="background: #f0f3f6; font-weight: bold;">LOKASI</td>
          <td>${firstItem.hsa_area || 'OSP AREA'}</td>
          <td style="background: #f0f3f6; font-weight: bold;">ODC / ALAMAT</td>
          <td>ODC-${firstItem.sto || 'STO'}-01 / Area OSP</td>
        </tr>
        <tr>
          <td style="background: #f0f3f6; font-weight: bold;">KORDINAT</td>
          <td>${firstItem.latitude || '-'}, ${firstItem.longitude || '-'}</td>
          <td style="background: #f0f3f6; font-weight: bold;">TANGGAL</td>
          <td>${new Date().toLocaleDateString('id-ID', { day:'numeric', month:'long', year:'numeric' })}</td>
        </tr>
      </table>

      <table class="main-table">
        <thead>
          <tr class="th-group">
            <th rowspan="2" style="width:25px;">No</th>
            <th colspan="1">MDF STO</th>
            <th colspan="3">GPON</th>
            <th colspan="2">FTM</th>
            <th colspan="1">DISTRIBUSI</th>
            <th colspan="6">ODP</th>
            <th colspan="2">KORDINAT</th>
            <th rowspan="2">VALINS</th>
            <th rowspan="2" style="width:140px;">EVIDEN</th>
          </tr>
          <tr class="th-sub">
            <th>STO</th>
            <th>IP OLT</th>
            <th>SLOT</th>
            <th>PORT</th>
            <th>EA</th>
            <th>OA</th>
            <th>SLOT OUT</th>
            <th>LABEL ODP</th>
            <th>CORE FEEDER ODC</th>
            <th>KAP</th>
            <th>DS</th>
            <th>CORE</th>
            <th>PASSIVE</th>
            <th>LAT</th>
            <th>LONG</th>
          </tr>
        </thead>
        <tbody>
          ${rowsHtml}
        </tbody>
      </table>

      <div class="footer-sign">
        <div class="sign-box">
          <div>Dibuat Oleh,</div>
          <div style="font-size:9px; color:#666;">Teknisi Pelaksana</div>
          <div class="sign-line">${firstItem.teknisi || 'Teknisi OSP'}</div>
        </div>
        <div class="sign-box">
          <div>Diketahui Oleh,</div>
          <div style="font-size:9px; color:#666;">Pengawas Lapangan / PIC</div>
          <div class="sign-line">Supervisor PT 2 KONS</div>
        </div>
      </div>
    </body>
    </html>
  `;
}

async function generateValid4Pdf(items, skipImages = false) {
  const html = await generateValid4Html(items, skipImages);
  
  try {
    const browser = await getSharedBrowser();
    const page = await browser.newPage();
    // networkidle0 menunggu semua foto Google Drive selesai (ratusan request) dan sering timeout.
    // networkidle2 jauh lebih cepat dan tetap menunggu gambar utama termuat.
    await page.setContent(html, { waitUntil: 'networkidle2', timeout: 20000 });
    const pdfBuffer = await page.pdf({
      format: 'A4',
      landscape: true,
      margin: { top: '8mm', bottom: '8mm', left: '8mm', right: '8mm' },
      printBackground: true
    });
    await page.close();
    return { buffer: Buffer.from(pdfBuffer), type: 'application/pdf' };
  } catch (err) {
    console.warn('Puppeteer launch failed or unavailable in container, returning printable HTML:', err.message);
    // Return HTML document with print auto-trigger as reliable fallback
    const printableHtml = html.replace('</body>', '<script>window.onload = function() { window.print(); }</script></body>');
    return { buffer: Buffer.from(printableHtml, 'utf-8'), type: 'text/html' };
  }
}

/**
 * 2) VALID4 EXCEL GENERATION (exceljs)
 */
async function generateValid4Excel(items, skipImages = false, tableOnly = false) {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'PT 2 KONS Monitoring';
  workbook.created = new Date();

  // Sheet 1: MANCORE
  const wsMancore = workbook.addWorksheet('MANCORE');

  // Title rows (baris 1-7 warna merah FFDC2626)
  wsMancore.mergeCells('A1:U1');
  const title1 = wsMancore.getCell('A1');
  title1.value = 'MANAGEMENT CORE FO (OSP - HEM)';
  title1.font = { name: 'Arial', size: 14, bold: true, color: { argb: 'FFFFFFFF' } };
  title1.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFDC2626' } };
  title1.alignment = { horizontal: 'center', vertical: 'middle' };

  wsMancore.mergeCells('A2:U2');
  const title2 = wsMancore.getCell('A2');
  title2.value = 'PT 2 KONS MONITORING - VALIDASI PEKERJAAN';
  title2.font = { name: 'Arial', size: 11, bold: true, color: { argb: 'FFFFFFFF' } };
  title2.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFDC2626' } };
  title2.alignment = { horizontal: 'center', vertical: 'middle' };

  // Baris 3-7 info
  const first = items[0] || {};
  const metaRows = [
    ['PROJECT', 'PENGADAAN DAN PEMASANGAN OUT SIDE PLAN FIBER TO THE HOME (OSP - HEM)', '', 'WITEL/STO', first.sto || 'REGIONAL 2'],
    ['LOKASI', first.hsa_area || 'OSP AREA', '', 'ODC / ALAMAT', 'ODC-' + (first.sto || 'STO') + '-01'],
    ['KORDINAT', `${first.latitude || '-'}, ${first.longitude || '-'}`, '', 'TANGGAL', new Date().toLocaleDateString('id-ID')],
    ['', '', '', '', ''],
    ['', '', '', '', '']
  ];

  metaRows.forEach((r, idx) => {
    const rowNum = idx + 3;
    const row = wsMancore.getRow(rowNum);
    row.values = r;
    row.font = { name: 'Arial', size: 8, color: { argb: 'FF1F2937' } };
  });

  // Header grup row 8 (#D4EDDA)
  const groupRow = wsMancore.getRow(8);
  groupRow.values = [
    'No', 'MDF STO', '', 'GPON', '', '', 'FTM', '', 'DISTRIBUSI', 'ODP', '', '', '', '', '', 'KORDINAT', '', 'VALINS', 'STATUS', 'MITRA', 'TEKNISI', 'EVIDEN'
  ];
  groupRow.font = { name: 'Arial', size: 8, bold: true, color: { argb: 'FF155724' } };
  groupRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFD4EDDA' } };
  groupRow.alignment = { horizontal: 'center', vertical: 'middle' };

  // Sub-header row 9 (#E8F4FD)
  const subRow = wsMancore.getRow(9);
  subRow.values = [
    'No', 'STO', 'IP OLT', 'SLOT', 'PORT', 'EA', 'OA', 'SLOT OUT', 'LABEL ODP', 'CORE FEEDER', 'KAP', 'DS', 'CORE', 'PASIVE', 'LAT', 'LONG', 'ID VALINS', 'STATUS', 'MITRA', 'TEKNISI', 'RINGKASAN EVIDEN'
  ];
  subRow.font = { name: 'Arial', size: 8, bold: true, color: { argb: 'FF0C5460' } };
  subRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE8F4FD' } };
  subRow.alignment = { horizontal: 'center', vertical: 'middle' };

  // Column widths: 5,4,10,4,14,8,8,6,6,10, 22,14,8,8,8,12,12,12,14,40
  const colWidths = [5, 6, 12, 6, 6, 8, 8, 9, 22, 10, 6, 6, 6, 10, 12, 12, 14, 10, 14, 14, 35];
  colWidths.forEach((w, i) => {
    wsMancore.getColumn(i + 1).width = w;
  });

  // Add data rows
  items.forEach((item, idx) => {
    const rowNum = idx + 10;
    const r = wsMancore.getRow(rowNum);
    r.values = [
      idx + 1,
      item.sto || '',
      item.ip_olt || '',
      item.slot_olt || '',
      item.port_olt || '',
      item.ea_ftm || '',
      item.oa_ftm || '',
      item.slot_out || '1:4',
      item.nama_odp || '',
      item.core_feeder || item.core_distribusi || '',
      item.kapasitas_kabel || '24',
      item.distribusi || 'DS-01',
      item.core_distribusi || '1',
      item.tipe_splitter || '',
      item.latitude || '',
      item.longitude || '',
      item.id_valins || '',
      item.status_validasi || 'valid',
      item.mitra || '',
      item.teknisi || '',
      item.url_foto_eviden ? 'Ada Eviden' : 'Tidak Ada'
    ];

    r.font = { name: 'Arial', size: 8 };
    r.alignment = { horizontal: 'center', vertical: 'middle' };

    if (idx % 2 === 1) {
      r.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF8FAFC' } };
    }

    // Border thin
    r.eachCell(cell => {
      cell.border = {
        top: { style: 'thin', color: { argb: 'FFD1D5DB' } },
        left: { style: 'thin', color: { argb: 'FFD1D5DB' } },
        bottom: { style: 'thin', color: { argb: 'FFD1D5DB' } },
        right: { style: 'thin', color: { argb: 'FFD1D5DB' } }
      };
    });
  });

  // Sheet 2: EVIDEN per ODP (if not tableOnly)
  if (!tableOnly) {
    const wsEviden = workbook.addWorksheet('EVIDEN');
    let currentRow = 1;

    for (const item of items) {
      // Baris merah
      const rHeader = wsEviden.getRow(currentRow);
      rHeader.values = ['NAMA LOKASI', 'SPLITER 1:4', 'SPLITER 1:8', 'PATCHCORE 20M', 'SPLITER 1:16', 'ODP Solid-8-Lengkap'];
      rHeader.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFDC2626' } };
      rHeader.font = { name: 'Arial', size: 9, bold: true, color: { argb: 'FFFFFFFF' } };
      rHeader.alignment = { horizontal: 'center', vertical: 'middle' };

      // Baris nilai
      const rVal = wsEviden.getRow(currentRow + 1);
      rVal.values = [
        item.nama_odp || '',
        '<<PS 1:4>>',
        '<<PS 1:8>>',
        '<<PATCHCORE 20M>>',
        '<<PS 1:16>>',
        '<<ODP-Solid-8-Lengkap>>'
      ];
      rVal.font = { name: 'Arial', size: 9 };
      rVal.alignment = { horizontal: 'center', vertical: 'middle' };

      // Header kuning FDE68A
      const rSub1 = wsEviden.getRow(currentRow + 3);
      rSub1.getCell(1).value = 'EVIDEN ODP';
      rSub1.getCell(4).value = 'EVIDEN CLOSUR DAN ODP LENGKAP';
      rSub1.font = { name: 'Arial', size: 9, bold: true, color: { argb: 'FF78350F' } };
      rSub1.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFDE68A' } };

      const rSub2 = wsEviden.getRow(currentRow + 5);
      rSub2.getCell(1).value = 'EVIDEN UKUR OPM';
      rSub2.getCell(4).value = 'EVIDEN PASIF SPLITTER';
      rSub2.font = { name: 'Arial', size: 9, bold: true, color: { argb: 'FF78350F' } };
      rSub2.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFDE68A' } };

      currentRow += 8;
    }
  }

  const buffer = await workbook.xlsx.writeBuffer();
  return buffer;
}

/**
 * 3) MANCORE IMAGE GENERATION
 */
async function generateMancoreImage(item) {
  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <style>
        * { box-sizing: border-box; }
        body { font-family: Arial, Helvetica, sans-serif; background: #ffffff; margin: 0; padding: 14px; width: 1240px; }
        .doc-title { background: #DC2626; color: #fff; font-weight: bold; font-size: 15px; padding: 10px 14px; text-align: center; }
        .doc-sub { background: #DC2626; color: #fff; font-weight: bold; font-size: 12px; padding: 6px 14px 10px; text-align: center; }
        table.mancore { border-collapse: collapse; width: 100%; margin-top: 0; table-layout: fixed; }
        table.mancore th, table.mancore td {
          border: 1px solid #D1D5DB;
          text-align: center;
          vertical-align: middle;
          font-size: 11px;
          padding: 7px 4px;
          color: #1F2937;
        }
        table.mancore thead tr.group th { background: #D4EDDA; color: #155724; font-weight: bold; }
        table.mancore thead tr.sub th { background: #E8F4FD; color: #0C5460; font-weight: bold; font-size: 10.5px; }
        table.mancore tbody td { background: #FFFFFF; font-weight: 600; }
        table.mancore tbody td.num { font-weight: 700; }
        .foot { margin-top: 10px; font-size: 10px; color: #9CA3AF; text-align: right; }
        col.c-no{width:34px} col.c-sto{width:60px} col.c-ip{width:110px} col.c-slot{width:52px} col.c-port{width:52px}
        col.c-ea{width:56px} col.c-oa{width:56px} col.c-slotout{width:70px} col.c-odp{width:170px} col.c-feeder{width:96px}
        col.c-kap{width:48px} col.c-ds{width:44px} col.c-core{width:52px} col.c-passive{width:66px}
        col.c-lat{width:86px} col.c-long{width:86px} col.c-valins{width:90px}
      </style>
    </head>
    <body>
      <div class="doc-title">MANAGEMENT CORE FO (OSP - HEM)</div>
      <div class="doc-sub">PT 2 KONS MONITORING - VALIDASI PEKERJAAN</div>
      <table class="mancore">
        <colgroup>
          <col class="c-no"><col class="c-sto"><col class="c-ip"><col class="c-slot"><col class="c-port">
          <col class="c-ea"><col class="c-oa"><col class="c-slotout"><col class="c-odp"><col class="c-feeder">
          <col class="c-kap"><col class="c-ds"><col class="c-core"><col class="c-passive">
          <col class="c-lat"><col class="c-long"><col class="c-valins">
        </colgroup>
        <thead>
          <tr class="group">
            <th rowspan="2">No.</th>
            <th colspan="1">MDF STO</th>
            <th colspan="3">GPON</th>
            <th colspan="2">FTM</th>
            <th colspan="1">DISTRIBUSI</th>
            <th colspan="6">ODP</th>
            <th colspan="2">KORDINAT</th>
            <th colspan="1">VALINS</th>
          </tr>
          <tr class="sub">
            <th>STO</th>
            <th>IP OLT</th>
            <th>SLOT</th>
            <th>PORT</th>
            <th>EA</th>
            <th>OA</th>
            <th>SLOT OUT</th>
            <th>LABEL ODP</th>
            <th>CORE FEEDER ODC</th>
            <th>KAP</th>
            <th>DS</th>
            <th>CORE</th>
            <th>PASSIVE</th>
            <th>LAT</th>
            <th>LONG</th>
            <th>ID VALINS</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td class="num">1</td>
            <td>${item.sto || '-'}</td>
            <td>${item.ip_olt || '-'}</td>
            <td>${item.slot_olt || '-'}</td>
            <td>${item.port_olt || '-'}</td>
            <td>${item.ea_ftm || '-'}</td>
            <td>${item.oa_ftm || '-'}</td>
            <td>${item.slot_out || '1:4'}</td>
            <td>${item.nama_odp || '-'}</td>
            <td>${item.core_feeder || item.core_distribusi || '-'}</td>
            <td>${item.kapasitas_kabel || '24'}</td>
            <td>${item.distribusi || '-'}</td>
            <td>${item.core_distribusi || '-'}</td>
            <td>${item.tipe_splitter || '-'}</td>
            <td>${item.latitude || '-'}</td>
            <td>${item.longitude || '-'}</td>
            <td>${item.id_valins || '-'}</td>
          </tr>
        </tbody>
      </table>
      <div class="foot">Dibuat otomatis oleh PT 2 KONS Monitoring — ${new Date().toLocaleString('id-ID')}</div>
    </body>
    </html>
  `;

  try {
    const browser = await getSharedBrowser();
    const page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 400 });
    await page.setContent(html, { waitUntil: 'networkidle0' });
    const buffer = await page.screenshot({ type: 'jpeg', quality: 92, fullPage: true });
    await page.close();
    return { buffer: Buffer.from(buffer), mime: 'image/jpeg', ext: 'jpg' };
  } catch (err) {
    console.warn('Puppeteer unavailable for screenshot, falling back to SVG/mock image buffer:', err.message);
    const svg = `
      <svg width="1240" height="230" xmlns="http://www.w3.org/2000/svg">
        <rect width="1240" height="40" fill="#DC2626"/>
        <text x="620" y="26" text-anchor="middle" font-family="sans-serif" font-size="15" font-weight="bold" fill="#ffffff">MANAGEMENT CORE FO (OSP - HEM)</text>
        <rect y="40" width="1240" height="30" fill="#DC2626"/>
        <text x="620" y="60" text-anchor="middle" font-family="sans-serif" font-size="12" font-weight="bold" fill="#ffffff">PT 2 KONS MONITORING - VALIDASI PEKERJAAN</text>
        <g font-family="sans-serif" font-size="11">
          <rect x="0" y="70" width="34" height="34" fill="#D4EDDA" stroke="#D1D5DB"/>
          <text x="17" y="91" text-anchor="middle" font-weight="bold" fill="#155724">No.</text>
          <rect x="34" y="70" width="60" height="34" fill="#D4EDDA" stroke="#D1D5DB"/>
          <text x="64" y="91" text-anchor="middle" font-weight="bold" fill="#155724">MDF STO</text>
          <rect x="94" y="70" width="214" height="34" fill="#D4EDDA" stroke="#D1D5DB"/>
          <text x="201" y="91" text-anchor="middle" font-weight="bold" fill="#155724">GPON</text>
          <rect x="308" y="70" width="112" height="34" fill="#D4EDDA" stroke="#D1D5DB"/>
          <text x="364" y="91" text-anchor="middle" font-weight="bold" fill="#155724">FTM</text>
          <rect x="420" y="70" width="70" height="34" fill="#D4EDDA" stroke="#D1D5DB"/>
          <text x="455" y="91" text-anchor="middle" font-weight="bold" fill="#155724">DISTRIBUSI</text>
          <rect x="490" y="70" width="490" height="34" fill="#D4EDDA" stroke="#D1D5DB"/>
          <text x="735" y="91" text-anchor="middle" font-weight="bold" fill="#155724">ODP</text>
          <rect x="980" y="70" width="172" height="34" fill="#D4EDDA" stroke="#D1D5DB"/>
          <text x="1066" y="91" text-anchor="middle" font-weight="bold" fill="#155724">KORDINAT</text>
          <rect x="1152" y="70" width="88" height="34" fill="#D4EDDA" stroke="#D1D5DB"/>
          <text x="1196" y="91" text-anchor="middle" font-weight="bold" fill="#155724">VALINS</text>
          <g fill="#E8F4FD" stroke="#D1D5DB">
            <rect x="0" y="104" width="1240" height="30"/>
          </g>
          <g fill="#0C5460" font-weight="bold" font-size="10" text-anchor="middle">
            <text x="17" y="123">STO</text>
            <text x="144" y="123">IP OLT</text>
            <text x="248" y="123">SLOT</text>
            <text x="288" y="123">PORT</text>
            <text x="336" y="123">EA</text>
            <text x="392" y="123">OA</text>
            <text x="455" y="123">SLOT OUT</text>
            <text x="580" y="123">LABEL ODP</text>
            <text x="735" y="123">CORE FEEDER ODC</text>
            <text x="838" y="123">KAP</text>
            <text x="876" y="123">DS</text>
            <text x="912" y="123">CORE</text>
            <text x="962" y="123">PASSIVE</text>
            <text x="1022" y="123">LAT</text>
            <text x="1110" y="123">LONG</text>
            <text x="1196" y="123">ID VALINS</text>
          </g>
          <g fill="#FFFFFF" stroke="#D1D5DB">
            <rect x="0" y="134" width="1240" height="34"/>
          </g>
          <g fill="#1F2937" font-weight="bold" text-anchor="middle">
            <text x="17" y="155">1</text>
            <text x="64" y="155">${item.sto || '-'}</text>
            <text x="144" y="155">${item.ip_olt || '-'}</text>
            <text x="248" y="155">${item.slot_olt || '-'}</text>
            <text x="288" y="155">${item.port_olt || '-'}</text>
            <text x="336" y="155">${item.ea_ftm || '-'}</text>
            <text x="392" y="155">${item.oa_ftm || '-'}</text>
            <text x="455" y="155">${item.tipe_splitter || '1:4'}</text>
            <text x="580" y="155">${item.nama_odp || '-'}</text>
            <text x="735" y="155">${item.core_feeder || item.core_distribusi || '-'}</text>
            <text x="838" y="155">${item.kapasitas_kabel || '24'}</text>
            <text x="876" y="155">${item.distribusi || '-'}</text>
            <text x="912" y="155">${item.core_distribusi || '-'}</text>
            <text x="962" y="155">${item.pasive || item.passive || item.tipe_splitter || '-'}</text>
            <text x="1022" y="155">${item.latitude || '-'}</text>
            <text x="1110" y="155">${item.longitude || '-'}</text>
            <text x="1196" y="155">${item.id_valins || '-'}</text>
          </g>
          <text x="1240" y="195" text-anchor="end" font-size="10" fill="#9CA3AF">Dibuat otomatis oleh PT 2 KONS Monitoring</text>
        </g>
      </svg>
    `;
    // Fallback: kembalikan SVG (bukan JPEG palsu) agar tidak "Image corrupted"
    return { buffer: Buffer.from(svg, 'utf-8'), mime: 'image/svg+xml', ext: 'svg' };
  }
}

/**
 * 4) BAST PDF GENERATION
 */
async function generateBastHtml(v, materials = []) {
  const grandTotal = materials.reduce((acc, m) => acc + (m.total_harga || 0), 0);
  
  let materialTableHtml = '';
  if (materials.length > 0) {
    materialTableHtml = `
      <table style="width:100%; border-collapse:collapse; margin-top:10px; font-size:10px;">
        <thead>
          <tr style="background:#f3f4f6;">
            <th style="border:1px solid #ddd; padding:4px;">No</th>
            <th style="border:1px solid #ddd; padding:4px;">Nama Material</th>
            <th style="border:1px solid #ddd; padding:4px;">Satuan</th>
            <th style="border:1px solid #ddd; padding:4px;">Qty</th>
            <th style="border:1px solid #ddd; padding:4px;">Harga Satuan (Rp)</th>
            <th style="border:1px solid #ddd; padding:4px;">Total Harga (Rp)</th>
          </tr>
        </thead>
        <tbody>
          ${materials.map((m, idx) => `
            <tr>
              <td style="border:1px solid #ddd; padding:4px; text-align:center;">${idx + 1}</td>
              <td style="border:1px solid #ddd; padding:4px;">${m.nama_material}</td>
              <td style="border:1px solid #ddd; padding:4px; text-align:center;">${m.satuan || '-'}</td>
              <td style="border:1px solid #ddd; padding:4px; text-align:center;">${m.qty}</td>
              <td style="border:1px solid #ddd; padding:4px; text-align:right;">${m.harga_satuan ? Number(m.harga_satuan).toLocaleString('id-ID') : 0}</td>
              <td style="border:1px solid #ddd; padding:4px; text-align:right; font-weight:bold;">${Number(m.total_harga).toLocaleString('id-ID')}</td>
            </tr>
          `).join('')}
          <tr style="background:#f9fafb; font-weight:bold;">
            <td colspan="5" style="border:1px solid #ddd; padding:6px; text-align:right;">GRAND TOTAL:</td>
            <td style="border:1px solid #ddd; padding:6px; text-align:right; color:#1b2233;">Rp ${grandTotal.toLocaleString('id-ID')}</td>
          </tr>
        </tbody>
      </table>
    `;
  } else {
    materialTableHtml = `<div style="font-style:italic; color:#666; padding:8px 0;">Tidak ada data material</div>`;
  }

  const fotoHtml = v.url_foto_eviden
    ? `<img src="${v.url_foto_eviden}" style="max-width:400px; max-height:220px; object-fit:contain; border:1px solid #ddd; border-radius:6px; display:block; margin:6px 0;" />`
    : `<div style="color:#d64545; font-size:11px; font-weight:bold; padding:8px 0;">Foto Eviden belum diunggah</div>`;

  return `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <title>BAST — ${v.nama_odp}</title>
      <style>
        @page { size: A4 portrait; margin: 20mm 15mm; }
        body { font-family: 'Helvetica Neue', Arial, sans-serif; font-size: 11px; color: #1b1f2a; line-height: 1.4; padding: 10px; }
        .title { text-align: center; font-size: 16px; font-weight: bold; margin-bottom: 4px; color: #1b2233; }
        .sub-title { text-align: center; font-size: 12px; color: #555; margin-bottom: 20px; }
        .info-table { width: 100%; border-collapse: collapse; margin-bottom: 14px; }
        .info-table td { padding: 4px 6px; font-size: 10.5px; border-bottom: 1px solid #eee; }
        .info-table td.lbl { width: 28%; font-weight: 600; color: #555; }
        .section-h { font-size: 12px; font-weight: bold; margin-top: 14px; margin-bottom: 6px; border-bottom: 1px solid #ccc; padding-bottom: 3px; }
        .sign-wrap { display: flex; justify-content: space-between; margin-top: 40px; padding: 0 40px; }
        .sign-box { text-align: center; width: 180px; }
        .sign-line { margin-top: 60px; border-top: 1px solid #333; font-weight: bold; }
      </style>
    </head>
    <body>
      <div class="title">BERITA ACARA SERAH TERIMA (BAST)</div>
      <div class="sub-title">Pekerjaan Validasi Fiber Optic — ${v.sto || 'REGIONAL 2'}</div>

      <div class="section-h">1. INFORMASI PEKERJAAN</div>
      <table class="info-table">
        <tr><td class="lbl">Nama ODP</td><td>: <b>${v.nama_odp}</b></td></tr>
        <tr><td class="lbl">STO / Area</td><td>: ${v.sto} / ${v.hsa_area || '-'}</td></tr>
        <tr><td class="lbl">ID Valins</td><td>: ${v.id_valins || '-'}</td></tr>
        <tr><td class="lbl">Teknisi Pelaksana</td><td>: ${v.teknisi || '-'}</td></tr>
        <tr><td class="lbl">Mitra Pelaksana</td><td>: ${v.mitra || '-'}</td></tr>
        <tr><td class="lbl">No. Order / Klasifikasi</td><td>: ${v.no_order || '-'} (${v.klasifikasi_order || 'Reguler'})</td></tr>
        <tr><td class="lbl">Tanggal Selesai</td><td>: ${v.tanggal || '-'}</td></tr>
        <tr><td class="lbl">IP OLT / Slot / Port</td><td>: ${v.ip_olt || '-'} / ${v.slot_olt || '-'} / ${v.port_olt || '-'}</td></tr>
        <tr><td class="lbl">Kapasitas / Splitter</td><td>: ${v.kapasitas_kabel || '24 Core'} / ${v.tipe_splitter || '1:4'}</td></tr>
        <tr><td class="lbl">Status Validasi</td><td>: <b>${(v.status_validasi || 'pending').toUpperCase()}</b></td></tr>
      </table>

      <div class="section-h">2. FOTO EVIDEN PEKERJAAN</div>
      ${fotoHtml}

      <div class="section-h">3. RINCIAN MATERIAL TERPAKAI</div>
      ${materialTableHtml}

      <div class="sign-wrap">
        <div class="sign-box">
          <div>Diserahkan Oleh:</div>
          <div style="font-size:10px; color:#666;">Teknisi</div>
          <div class="sign-line">${v.teknisi || 'Teknisi'}</div>
        </div>
        <div class="sign-box">
          <div>Diterima Oleh:</div>
          <div style="font-size:10px; color:#666;">Supervisor / PIC</div>
          <div class="sign-line">Supervisor / PIC</div>
        </div>
      </div>
    </body>
    </html>
  `;
}

async function generateBastPdf(validasiId) {
  const v = db.prepare('SELECT * FROM validasi_pekerjaan WHERE id = ?').get(validasiId);
  if (!v) throw new Error('Data validasi tidak ditemukan');

  const safeOdp = String(v.nama_odp || 'odp').replace(/[\\/:*?"<>|]+/g, '-');
  const materials = db.prepare('SELECT * FROM input_material WHERE validasi_id = ?').all(validasiId);
  const html = await generateBastHtml(v, materials);

  try {
    const browser = await getSharedBrowser();
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: 'networkidle0', timeout: 30000 });
    const buffer = await page.pdf({
      format: 'A4',
      margin: { top: '20mm', bottom: '15mm', left: '15mm', right: '15mm' },
      printBackground: true
    });
    await page.close();
    return { buffer: Buffer.from(buffer), type: 'application/pdf', filename: `BAST_${safeOdp}_${validasiId}.pdf` };
  } catch (err) {
    console.warn('Puppeteer launch failed for BAST, providing printable HTML:', err.message);
    const printableHtml = html.replace('</body>', '<script>window.onload = function() { window.print(); }</script></body>');
    return { buffer: Buffer.from(printableHtml, 'utf-8'), type: 'text/html', filename: `BAST_${safeOdp}_${validasiId}.html` };
  }
}

/**
 * 5) REKON WORD (docx) — mengikuti template templates/masterpt2.docx
 *
 * - Judul, label 12 kolom, lebar kolom, ukuran halaman, dan margin dibaca langsung
 *   dari templates/masterpt2.docx (fallback ke nilai bawaan bila template gagal dibaca).
 * - Baris header tabel diulang otomatis di setiap halaman (tblHeader).
 * - Judul juga dipasang sebagai header berjalan untuk halaman 2 dst., sehingga
 *   setiap halaman selalu memiliki header yang sesuai (halaman 1 memakai judul di
 *   body, tampil persis seperti master).
 * - Foto disisipkan dengan rasio asli (muat pada lebar kolom), sel kosong diisi "-".
 */

const REKON_TEMPLATE_PATH = path.join(__dirname, '..', 'templates', 'masterpt2.docx');

// Nilai bawaan = salinan persis isi templates/masterpt2.docx (dipakai bila template tak terbaca)
const REKON_DEFAULT_TEMPLATE = {
  title: 'EVIDENCE PEKERJAAN PT2 FBB 2026 BOGOR',
  headers: [
    'No',
    'NAMA LOP',
    'BRANCH – STO',
    'Nama ODP (Tgl Go Live)',
    'Foto ODP Tampak Luar',
    'Foto ODP Tampak Dalam',
    'Foto Joint Closure',
    'Foto PS 1:4 (jika pasang splitter baru)',
    'Foto Lengkap (Closure + ODP + pipa cooker)',
    'Foto UFO / OPM + Rx Ibooster',
    'FOTO SIIS/UIM',
    'Mancore'
  ],
  columnWidths: [709, 2693, 2156, 1985, 2884, 2801, 2302, 2268, 2268, 3118, 3759, 3157],
  tableWidth: 30100,
  page: { width: 31639, height: 23814, orientation: 'landscape' },
  margins: { top: 1440, right: 1440, bottom: 1440, left: 1440, header: 709, footer: 709 }
};

// 4 kolom teks + 8 kolom foto = 12 kolom (urutan persis seperti header master)
const REKON_PHOTO_FIELDS = [
  'foto_odp_luar',
  'foto_odp_dalam',
  'foto_joint_closure',
  'foto_ps_1_4',
  'foto_lengkap',
  'foto_ufo_opm',
  'foto_sivdum',
  'foto_mancore'
];

const REKON_FONT = 'Arial';
const REKON_TEXT_SIZE = 24;   // 12pt — sesuai gaya Normal (sz=24) di masterpt2.docx
const REKON_TITLE_SIZE = 48;  // 24pt — judul menonjol seperti contoh output
const REKON_MAX_IMG_H = 150;  // px @96dpi (≈1.56") — tinggi maksimal foto per sel

function decodeXmlEntities(s) {
  return String(s)
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&');
}

function extractDocxText(fragment) {
  const re = /<w:t(?:\s[^>]*)?>([\s\S]*?)<\/w:t>/g;
  let out = '';
  let m;
  while ((m = re.exec(fragment))) out += decodeXmlEntities(m[1]);
  return out.trim();
}

function xmlAttr(tag, name) {
  const m = String(tag || '').match(new RegExp(name + '="([^"]*)"'));
  return m ? m[1] : null;
}

function xmlIntAttr(tag, name) {
  const v = xmlAttr(tag, name);
  return v === null || v === '' ? null : parseInt(v, 10);
}

let _rekonTemplatePromise = null;
let _rekonTemplateMtime = -1;
/** Baca judul, label kolom, lebar kolom, halaman & margin dari masterpt2.docx.
 *  Otomatis dibaca ulang bila file template-nya diedit. */
function loadRekonTemplate() {
  let mtime = -1;
  try {
    mtime = fs.statSync(REKON_TEMPLATE_PATH).mtimeMs;
  } catch (err) {
    mtime = -1;
  }
  if (_rekonTemplatePromise && mtime === _rekonTemplateMtime) return _rekonTemplatePromise;
  _rekonTemplateMtime = mtime;
  _rekonTemplatePromise = (async () => {
    const tpl = JSON.parse(JSON.stringify(REKON_DEFAULT_TEMPLATE));
    try {
      const JSZipLib = require('jszip');
      const zip = await JSZipLib.loadAsync(fs.readFileSync(REKON_TEMPLATE_PATH));
      const part = zip.file('word/document.xml');
      if (!part) throw new Error('word/document.xml tidak ditemukan');
      const xml = await part.async('string');

      const title = extractDocxText((xml.split('<w:tbl>')[0].match(/<w:p[\s\S]*?<\/w:p>/) || [''])[0]);
      const tbl = (xml.match(/<w:tbl>[\s\S]*?<\/w:tbl>/) || [''])[0];
      const rows = tbl.match(/<w:tr[\s\S]*?<\/w:tr>/g) || [];
      const headerCells = rows.length > 0 ? (rows[0].match(/<w:tc>[\s\S]*?<\/w:tc>/g) || []) : [];
      const headers = headerCells.map(extractDocxText);
      const columnWidths = (tbl.match(/<w:gridCol w:w="(\d+)"\s*\/>/g) || [])
        .map(t => xmlIntAttr(t, 'w:w'))
        .filter(v => v > 0);

      const pgSz = (xml.match(/<w:pgSz[^>]*>/) || [''])[0];
      const pgMar = (xml.match(/<w:pgMar[^>]*>/) || [''])[0];
      const tblW = xmlIntAttr((tbl.match(/<w:tblW[^>]*>/) || [''])[0], 'w:w');

      if (title) tpl.title = title;
      if (headers.length === REKON_DEFAULT_TEMPLATE.headers.length) tpl.headers = headers;
      if (columnWidths.length === tpl.headers.length) tpl.columnWidths = columnWidths;
      if (tblW) tpl.tableWidth = tblW;

      const pw = xmlIntAttr(pgSz, 'w:w');
      const ph = xmlIntAttr(pgSz, 'w:h');
      if (pw && ph) {
        tpl.page = { width: pw, height: ph, orientation: xmlAttr(pgSz, 'w:orient') || 'landscape' };
      }
      const mar = {};
      ['top', 'right', 'bottom', 'left', 'header', 'footer'].forEach(k => {
        const v = xmlIntAttr(pgMar, 'w:' + k);
        if (v !== null) mar[k] = v;
      });
      if (Object.keys(mar).length > 0) tpl.margins = { ...tpl.margins, ...mar };
    } catch (err) {
      console.warn('masterpt2.docx gagal dibaca, memakai pengaturan bawaan:', err.message);
    }
    return tpl;
  })();
  return _rekonTemplatePromise;
}

/** Deteksi format + dimensi asli sebuah gambar dari buffer-nya. */
function detectImageBuffer(buf) {
  if (!buf || buf.length < 24) return null;
  // PNG
  if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) {
    return { type: 'png', width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
  }
  // JPEG (cari SOF0-SOF12)
  if (buf[0] === 0xff && buf[1] === 0xd8) {
    let i = 2;
    while (i + 9 < buf.length) {
      if (buf[i] !== 0xff) { i += 1; continue; }
      const marker = buf[i + 1];
      if (marker === 0xff) { i += 1; continue; }
      if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd9)) { i += 2; continue; }
      const len = buf.readUInt16BE(i + 2);
      const isSOF = marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc;
      if (isSOF) {
        return { type: 'jpg', height: buf.readUInt16BE(i + 5), width: buf.readUInt16BE(i + 7) };
      }
      if (len < 2) break;
      i += 2 + len;
    }
    return { type: 'jpg', width: 0, height: 0 };
  }
  // GIF
  if (buf.slice(0, 4).toString('ascii') === 'GIF8') {
    return { type: 'gif', width: buf.readUInt16LE(6), height: buf.readUInt16LE(8) };
  }
  // BMP
  if (buf[0] === 0x42 && buf[1] === 0x4d) {
    return { type: 'bmp', width: buf.readInt32LE(18), height: Math.abs(buf.readInt32LE(22)) };
  }
  // SVG
  if (/<svg[\s>]/i.test(buf.slice(0, 4096).toString('utf8'))) {
    return { type: 'svg', width: 0, height: 0 };
  }
  return null;
}

function svgSize(text) {
  const w = parseFloat(((text.match(/\bwidth\s*=\s*"([\d.]+)/i) || [])[1]) || '0');
  const h = parseFloat(((text.match(/\bheight\s*=\s*"([\d.]+)/i) || [])[1]) || '0');
  const vb = (text.match(/viewBox\s*=\s*"([^"]+)"/i) || [])[1];
  let width = w;
  let height = h;
  if ((!width || !height) && vb) {
    const p = vb.split(/[\s,]+/).map(Number);
    if (p.length === 4 && p[2] > 0 && p[3] > 0) {
      width = width || p[2];
      height = height || p[3];
    }
  }
  return { width: Math.round(width) || 800, height: Math.round(height) || 600 };
}

/** SVG hanya bisa dipakai di Word bila ada raster fallback → dijadikan PNG dulu. */
async function rasterizeSvgBuffer(buf) {
  try {
    const browser = await getSharedBrowser();
    const page = await browser.newPage();
    const size = svgSize(buf.toString('utf8'));
    const width = Math.min(2000, Math.max(120, size.width));
    const height = Math.min(2000, Math.max(120, size.height));
    await page.setViewport({ width, height });
    await page.setContent(
      `<html><body style="margin:0;padding:0;background:#ffffff;">${buf.toString('utf8')}</body></html>`,
      { waitUntil: 'load' }
    );
    const png = await page.screenshot({ type: 'png', clip: { x: 0, y: 0, width, height } });
    await page.close();
    return Buffer.from(png);
  } catch (e) {
    return null;
  }
}

let _compressPagePromise = null;
async function getCompressionPage() {
  if (_compressPagePromise) {
    try {
      const page = await _compressPagePromise;
      if (page && !page.isClosed()) return page;
    } catch (_) { /* lanjut buat baru */ }
  }
  _compressPagePromise = (async () => {
    const browser = await getSharedBrowser();
    return browser.newPage();
  })();
  try {
    return await _compressPagePromise;
  } catch (e) {
    _compressPagePromise = null;
    throw e;
  }
}

// Satu halaman Chromium dipakai bergantian. Antrean ini mencegah beberapa
// worker fetch mengirim evaluate bersamaan ke halaman yang sama.
let _compressChain = Promise.resolve();
function runOnCompressionPage(fn) {
  const result = _compressChain.then(fn, fn);
  _compressChain = result.catch(() => {});
  return result;
}

/** Kecilkan byte foto sebelum disisipkan ke DOCX.
 *  Tampilan di tabel tetap diatur oleh transformation; ini hanya mencegah DOCX
 *  membengkak menjadi puluhan MB sehingga sering terpotong saat diunduh. */
async function compressRekonImageBuffer(buf, maxDim = 1000, quality = 0.72) {
  if (!buf || buf.length < 100 * 1024) return buf;
  const meta = detectImageBuffer(buf);
  if (!meta || meta.type === 'svg') return buf;

  return runOnCompressionPage(async () => {
    try {
      const page = await getCompressionPage();
      const mime = meta.type === 'png' ? 'image/png'
        : meta.type === 'gif' ? 'image/gif'
        : meta.type === 'bmp' ? 'image/bmp'
        : 'image/jpeg';
      const b64 = buf.toString('base64');
      const compressedB64 = await page.evaluate(async ({ b64, mime, maxDim, quality }) => {
        const img = new Image();
        img.src = `data:${mime};base64,${b64}`;
        await img.decode();
        const scale = Math.min(1, maxDim / Math.max(img.naturalWidth || 1, img.naturalHeight || 1));
        const width = Math.max(1, Math.round((img.naturalWidth || 1) * scale));
        const height = Math.max(1, Math.round((img.naturalHeight || 1) * scale));
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, width, height);
        ctx.drawImage(img, 0, 0, width, height);
        return canvas.toDataURL('image/jpeg', quality).split(',')[1] || '';
      }, { b64, mime, maxDim, quality });

      if (!compressedB64) return buf;
      const out = Buffer.from(compressedB64, 'base64');
      return out.length > 0 && out.length < buf.length ? out : buf;
    } catch (e) {
      return buf;
    }
  });
}

async function mapLimit(items, limit, worker) {
  const results = new Array(items.length);
  let cursor = 0;
  const runners = Array.from({ length: Math.max(1, Math.min(limit, items.length)) }, async () => {
    while (cursor < items.length) {
      const idx = cursor;
      cursor += 1;
      results[idx] = await worker(items[idx], idx);
    }
  });
  await Promise.all(runners);
  return results;
}

/** Unduh semua foto (paralel) sekali jalan, hasilnya dipakai ulang untuk tiap baris. */
async function fetchRekonImageMap(urls, limit = 8) {
  const map = new Map();
  const unique = [...new Set(urls.filter(Boolean))];
  await mapLimit(unique, limit, async (url) => {
    let buf = await fetchImageBuffer(url);
    if (buf && buf.length > 0) {
      const meta = detectImageBuffer(buf);
      if (meta && meta.type === 'svg') {
        const png = await rasterizeSvgBuffer(buf);
        if (png && png.length > 0) buf = png;
      }
      buf = await compressRekonImageBuffer(buf);
    }
    map.set(url, buf && buf.length > 0 ? buf : null);
  });
  return map;
}

/** Ukuran gambar (px @96dpi) agar muat rapi di kolomnya, rasio asli tetap terjaga. */
function fitImageIntoColumn(meta, columnWidthTwips) {
  if (!meta) return null;
  const maxW = Math.max(48, Math.round((columnWidthTwips / 1440) * 96) - 16);
  const maxH = REKON_MAX_IMG_H;
  if (meta.width > 0 && meta.height > 0) {
    const scale = Math.min(maxW / meta.width, maxH / meta.height, 1);
    return {
      width: Math.max(24, Math.round(meta.width * scale)),
      height: Math.max(24, Math.round(meta.height * scale))
    };
  }
  // dimensi tak terbaca → asumsi 4:3 agar tetap rapi
  return { width: maxW, height: Math.max(24, Math.min(maxH, Math.round(maxW * 0.75))) };
}

/** Ukuran halaman sesuai master. Catatan: docx menukar w/h saat orientasi landscape. */
function buildDocxPageSize(page) {
  const isPortrait = String((page && page.orientation) || 'landscape').toLowerCase() === 'portrait';
  const w = Number(page && page.width) || REKON_DEFAULT_TEMPLATE.page.width;
  const h = Number(page && page.height) || REKON_DEFAULT_TEMPLATE.page.height;
  const shortSide = Math.min(w, h);
  const longSide = Math.max(w, h);
  return isPortrait
    ? { width: shortSide, height: longSide, orientation: docx.PageOrientation.PORTRAIT }
    : { width: shortSide, height: longSide, orientation: docx.PageOrientation.LANDSCAPE };
}

async function generateRekonWord(odpList = [], options = {}) {
  if (!Array.isArray(odpList)) odpList = [];
  const MAX_ODP = 100;
  if (odpList.length > MAX_ODP) {
    console.warn(`generateRekonWord: ${odpList.length} ODP diterima, dibatasi ${MAX_ODP}.`);
    odpList = odpList.slice(0, MAX_ODP);
  }

  const {
    Document, Packer, Paragraph, Table, TableRow, TableCell, TextRun,
    WidthType, AlignmentType, ImageRun, BorderStyle, HeightRule,
    VerticalAlign, TableLayoutType, Header
  } = docx;

  const tpl = await loadRekonTemplate();
  const title = String(options.title || tpl.title || REKON_DEFAULT_TEMPLATE.title).trim();

  // Sumber data: merge rekon_pt2 (upload manual) + validasi_pekerjaan (sheet RESPON VALID 4)
  const rekonMap = new Map(db.prepare('SELECT * FROM rekon_pt2').all().map(r => [r.odp_name, r]));
  let valRows;
  if (odpList.length > 0) {
    const placeholders = odpList.map(() => '?').join(',');
    valRows = db.prepare(`SELECT * FROM validasi_pekerjaan WHERE nama_odp IN (${placeholders})`).all(...odpList);
  } else {
    valRows = db.prepare('SELECT * FROM validasi_pekerjaan LIMIT 100').all();
  }
  const valMap = new Map(valRows.map(r => [r.nama_odp, r]));

  // Nama LOP / ID IHLD / area / STO dari database_pt2
  const lopCols = 'odp_name, nama_lop, id_ihld, sto, area';
  let lopRows;
  if (odpList.length > 0) {
    const placeholders = odpList.map(() => '?').join(',');
    lopRows = db.prepare(`SELECT ${lopCols} FROM database_pt2 WHERE odp_name IN (${placeholders})`).all(...odpList);
  } else {
    lopRows = db.prepare(`SELECT ${lopCols} FROM database_pt2`).all();
  }
  const lopMap = new Map(lopRows.map(r => [r.odp_name, r]));

  // Susun item sesuai urutan odpList (atau gabungan unik)
  const seen = new Set();
  const queryItems = [];
  const names = odpList.length > 0
    ? odpList
    : [...new Set([...rekonMap.keys(), ...valMap.keys()])];
  for (const name of names) {
    if (!name || seen.has(name)) continue;
    seen.add(name);
    const rk = rekonMap.get(name) || {};
    const vl = valMap.get(name) || {};
    const lop = lopMap.get(name) || {};

    // BRANCH – STO → "BOGOR-LWL" (area/district + kode STO), fallback ke sumber lama
    const branch = lop.area || vl.district || '';
    const stoCode = lop.sto || '';
    const branchSto = (branch && stoCode)
      ? `${branch}-${stoCode}`
      : (rk.witel_sto || vl.sto || stoCode || branch || '-');

    queryItems.push({
      odp_name: name,
      // Kolom "NAMA LOP": prioritaskan Nama LOP (lokasi), sama seperti tampilan tabel saat load
      id_nama_lop: rk.id_nama_lop || lop.nama_lop || lop.id_ihld || name,
      witel_sto: branchSto,
      // Sheet RESPON VALID 4: "Eviden ODP Tertutup" = foto tampak LUAR,
      // "Eviden ODP Terbuka" = foto tampak DALAM (ODP dibuka).
      foto_odp_luar: rk.foto_odp_luar || vl.eviden_odp_tertutup || '',
      foto_odp_dalam: rk.foto_odp_dalam || vl.eviden_odp_terbuka || '',
      foto_joint_closure: rk.foto_joint_closure || vl.eviden_closure || '',
      foto_ps_1_4: rk.foto_ps_1_4 || vl.eviden_spliter || '',
      foto_lengkap: rk.foto_lengkap || vl.eviden_foto_lengkap || '',
      foto_ufo_opm: rk.foto_ufo_opm || vl.eviden_opm1 || '',
      foto_sivdum: rk.foto_sivdum || vl.eviden_opm2 || '',
      foto_mancore: rk.foto_mancore || vl.mancore_image || ''
    });
  }

  // Pastikan struktur kolom konsisten dengan master (12 kolom)
  let headers = tpl.headers;
  let colWidths = tpl.columnWidths;
  if (!Array.isArray(headers) || !Array.isArray(colWidths) || headers.length !== colWidths.length) {
    headers = REKON_DEFAULT_TEMPLATE.headers;
    colWidths = REKON_DEFAULT_TEMPLATE.columnWidths;
  }
  // Kolom ke-2 selalu berlabel "NAMA LOP" (lokasi), sesuai permintaan —
  // tidak peduli label lama "ID IHLD / Nama Lop" di dalam masterpt2.docx
  if (Array.isArray(headers) && headers.length > 1) headers[1] = 'NAMA LOP';
  const tableWidth = tpl.tableWidth || colWidths.reduce((a, b) => a + b, 0);

  // Unduh semua foto lebih dulu (paralel), lalu dipakai ulang untuk tiap baris
  const photoUrls = [];
  queryItems.forEach(it => {
    REKON_PHOTO_FIELDS.forEach(f => {
      const u = it[f];
      if (u && (u.startsWith('http') || u.startsWith('/uploads/'))) photoUrls.push(u);
    });
  });
  const imageMap = await fetchRekonImageMap(photoUrls);

  // Garis hitam 0.5pt + jarak sel — persis masterpt2.docx
  const line = { style: BorderStyle.SINGLE, size: 4, color: '000000', space: 0 };
  const cellBorders = { top: line, left: line, bottom: line, right: line };
  const cellMargins = { top: 80, left: 108, bottom: 80, right: 108 };

  const textCell = (text, colIndex, align, valign) => new TableCell({
    width: { size: colWidths[colIndex], type: WidthType.DXA },
    verticalAlign: valign || VerticalAlign.TOP,
    margins: cellMargins,
    borders: cellBorders,
    children: [
      new Paragraph({
        alignment: align || AlignmentType.LEFT,
        spacing: { before: 0, after: 0 },
        children: [new TextRun({ text: text || '-', font: REKON_FONT, size: REKON_TEXT_SIZE })]
      })
    ]
  });

  const photoCell = (url, colIndex) => {
    const buf = url ? imageMap.get(url) : null;
    const meta = buf ? detectImageBuffer(buf) : null;
    if (!buf || !meta || meta.type === 'svg') {
      return textCell('-', colIndex, AlignmentType.CENTER, VerticalAlign.CENTER);
    }
    const box = fitImageIntoColumn(meta, colWidths[colIndex]);
    return new TableCell({
      width: { size: colWidths[colIndex], type: WidthType.DXA },
      verticalAlign: VerticalAlign.CENTER,
      margins: cellMargins,
      borders: cellBorders,
      children: [
        new Paragraph({
          alignment: AlignmentType.CENTER,
          spacing: { before: 0, after: 0 },
          children: [
            new ImageRun({
              data: buf,
              type: meta.type,
              transformation: { width: box.width, height: box.height }
            })
          ]
        })
      ]
    });
  };

  // Baris judul kolom: diulang otomatis di setiap halaman (tblHeader)
  const headerRow = new TableRow({
    tableHeader: true,
    height: { value: 300, rule: HeightRule.ATLEAST },
    children: headers.map((h, i) => new TableCell({
      width: { size: colWidths[i], type: WidthType.DXA },
      verticalAlign: VerticalAlign.CENTER,
      margins: cellMargins,
      borders: cellBorders,
      children: [
        new Paragraph({
          alignment: AlignmentType.CENTER,
          spacing: { before: 0, after: 0 },
          children: [new TextRun({ text: h, bold: true, font: REKON_FONT, size: REKON_TEXT_SIZE })]
        })
      ]
    }))
  });

  const dataRows = [];
  let rowIdx = 1;
  for (const item of queryItems) {
    const cells = [
      textCell(String(rowIdx++), 0, AlignmentType.CENTER, VerticalAlign.CENTER),
      textCell(item.id_nama_lop, 1),
      textCell(item.witel_sto, 2, AlignmentType.CENTER, VerticalAlign.CENTER),
      textCell(item.odp_name, 3, AlignmentType.CENTER, VerticalAlign.CENTER)
    ];
    REKON_PHOTO_FIELDS.forEach((f, i) => cells.push(photoCell(item[f], 4 + i)));
    dataRows.push(new TableRow({
      height: { value: 474, rule: HeightRule.ATLEAST },
      children: cells
    }));
  }

  const table = new Table({
    width: { size: tableWidth, type: WidthType.DXA },
    columnWidths: colWidths,
    layout: TableLayoutType.FIXED,
    alignment: AlignmentType.CENTER,
    borders: { top: line, bottom: line, left: line, right: line, insideHorizontal: line, insideVertical: line },
    margins: cellMargins,
    rows: [headerRow, ...dataRows]
  });

  const titleParagraph = (spacingAfter) => new Paragraph({
    alignment: AlignmentType.CENTER,
    spacing: { before: 0, after: spacingAfter },
    children: [new TextRun({ text: title, bold: true, font: REKON_FONT, size: REKON_TITLE_SIZE })]
  });

  const doc = new Document({
    creator: 'PT 2 KONS Monitoring',
    title,
    sections: [
      {
        properties: {
          // Halaman 1: judul di body (seperti master). Halaman 2+: judul via header berjalan.
          titlePage: true,
          page: {
            size: buildDocxPageSize(tpl.page),
            margin: { ...tpl.margins }
          }
        },
        headers: {
          first: new Header({ children: [new Paragraph({ text: '' })] }),
          default: new Header({ children: [titleParagraph(0)] })
        },
        children: [
          titleParagraph(240),
          table
        ]
      }
    ]
  });

  const buffer = await Packer.toBuffer(doc);
  return Buffer.from(buffer);
}

module.exports = {
  generateValid4Pdf,
  generateValid4Excel,
  generateMancoreImage,
  generateBastPdf,
  generateRekonWord
};
