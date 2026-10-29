const express = require('express');
const path = require('path');
const helmet = require('helmet');
const cors = require('cors');
const morgan = require('morgan');
const cookieParser = require('cookie-parser');
const cron = require('node-cron');
const config = require('./config');
const { initSchema } = require('./db/schema');
const { userContext } = require('./middleware/auth');
const { syncDatabasePt2 } = require('./db/sync-dbpt2');
const { syncValidasi } = require('./db/sync-validasi');

// Initialize database schema
initSchema();

const app = express();

// 1. helmet with contentSecurityPolicy: false
app.use(helmet({ contentSecurityPolicy: false }));

// 2. cors
app.use(cors());

// 3. morgan('combined')
app.use(morgan('combined'));

// 4. express.json & urlencoded with 5mb limit, cookie-parser
app.use(express.json({ limit: '5mb' }));
app.use(express.urlencoded({ extended: true, limit: '5mb' }));
app.use(cookieParser());
app.use(userContext);

// 5. static /public & /uploads
app.use(express.static(path.join(__dirname, 'public')));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// 6. View engine ejs (views=templates)
app.set('views', path.join(__dirname, 'templates'));
app.set('view engine', 'ejs');

// 7. Mount routes in exact order
app.use('/webhook', require('./routes/webhook'));
app.use('/dashboard', require('./routes/dashboard'));
app.use('/api/auth', require('./routes/auth'));
app.use('/api', require('./routes/proxy'));
// Gerbang password: VALID 4, Rekon PT 2, Rekon Freelance
const { requirePageAccess } = require('./middleware/gate');
app.use('/akses', require('./routes/akses'));
app.use('/valid4', requirePageAccess('valid4'));
app.use('/rekon', requirePageAccess('rekon'));
app.use('/rekon-freelance', requirePageAccess('rekon-freelance'));
app.use('/api/valid4', requirePageAccess('valid4'));
app.use('/api', require('./routes/api'));
app.use('/database', require('./routes/database'));
app.use('/valid4', require('./routes/valid4'));
app.use('/rekon', require('./routes/rekon'));
app.use('/rekon-freelance', require('./routes/rekon-freelance'));
app.use('/pengaturan', require('./routes/pengaturan'));
app.use('/dbpt2', require('./routes/dbpt2'));

// 8. GET /login
app.get('/login', (req, res) => {
  if (req.user) {
    return res.redirect('/dashboard');
  }
  res.render('login', { title: 'Login — PT 2 KONS MONITORING' });
});

// 9. GET / -> redirect /login
app.get('/', (req, res) => {
  if (req.user) {
    return res.redirect('/dashboard');
  }
  res.redirect('/login');
});

// 10. GET /health
app.get('/health', (req, res) => {
  res.json({ ok: true, ts: new Date().toISOString() });
});

// 11. 404 handler
app.use((req, res) => {
  if (req.accepts('html')) {
    return res.status(404).render('error', { message: 'Halaman tidak ditemukan (404)' });
  }
  res.status(404).json({ ok: false, error: 'Not Found' });
});

// 12. Error handler JSON
app.use((err, req, res, next) => {
  console.error('Unhandled server error:', err);
  if (req.accepts('html')) {
    return res.status(500).render('error', { message: err.message || 'Terjadi kesalahan internal server' });
  }
  res.status(500).json({ ok: false, error: err.message || 'Internal Server Error' });
});

// Start cron jobs if sheet URLs configured
if (config.DBPT2_SHEET_CSV_URL) {
  setTimeout(() => {
    console.log('Running initial database_pt2 sheet sync...');
    syncDatabasePt2(null, config.DBPT2_SHEET_CSV_URL);
    // every 30 minutes
    cron.schedule('*/30 * * * *', () => {
      console.log('Cron: syncing database_pt2...');
      syncDatabasePt2(null, config.DBPT2_SHEET_CSV_URL);
    });
  }, 5000);
}

if (config.VALIDASI_SHEET_CSV_URL) {
  setTimeout(() => {
    console.log('Running initial validasi_pekerjaan sheet sync...');
    syncValidasi(null, config.VALIDASI_SHEET_CSV_URL);
    // every 15 minutes
    cron.schedule('*/15 * * * *', () => {
      console.log('Cron: syncing validasi_pekerjaan...');
      syncValidasi(null, config.VALIDASI_SHEET_CSV_URL);
    });
  }, 8000);
}

const PORT = config.PORT || 3000;
app.listen(PORT, '0.0.0.0', () => {
  console.log(`[PT 2 KONS MONITORING] Server running on port ${PORT}`);
});
