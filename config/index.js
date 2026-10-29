require('dotenv').config();
const path = require('path');

module.exports = {
  PORT: 3000,
  JWT_SECRET: process.env.JWT_SECRET || 'pt2kons_secret_key_2026',
  WEBHOOK_SECRET: process.env.WEBHOOK_SECRET || 'pt2_webhook_secret_key',
  ACCESS_PASSWORD: process.env.ACCESS_PASSWORD || 'akses2026',
  DBPT2_SHEET_CSV_URL: process.env.DBPT2_SHEET_CSV_URL || '',
  VALIDASI_SHEET_CSV_URL: process.env.VALIDASI_SHEET_CSV_URL || '',
  DB_PATH: path.join(__dirname, '..', 'data', 'pt2monitoring.db'),
  UPLOAD_PATH: path.join(__dirname, '..', 'uploads')
};
