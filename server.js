const express = require('express');
const mongoose = require('mongoose');
const path = require('path');
const os = require('os');
const backup = require('./lib/backup');

const PORT = process.env.PORT || 3000;
const MONGO_URI = process.env.MONGO_URI || (process.env.VERCEL ? '' : 'mongodb://127.0.0.1:27017/product-scanner-barcode');

const app = express();
let mongoConnection;

function connectMongo() {
  if (!MONGO_URI) return Promise.reject(new Error('MONGO_URI is required when deployed on Vercel'));
  if (mongoose.connection.readyState === 1) return Promise.resolve();
  if (!mongoConnection) {
    mongoConnection = mongoose.connect(MONGO_URI, { maxPoolSize: 5 })
      .then(async () => {
        await Promise.all(Object.values(mongoose.models).map((m) => m.init().catch(() => {})));
      })
      .catch((err) => {
        mongoConnection = null;
        throw err;
      });
  }
  return mongoConnection;
}

app.disable('x-powered-by');
app.use(express.json({ limit: '25mb' })); // файли Excel ҳамчун base64 меояд

// Муҳофизат аз дархостҳои бегона: тағйирот танҳо бо JSON қабул мешавад
app.use('/api', (req, res, next) => {
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();
  if (!(req.headers['content-type'] || '').includes('application/json')) return res.status(415).json({ error: 'E_INVALID' });
  next();
});

app.use('/api', (req, res, next) => {
  connectMongo().then(() => next(), next);
});

app.use(express.static(path.join(__dirname, 'public')));

app.use('/api/auth', require('./routes/auth'));
app.use('/api/users', require('./routes/users'));
app.use('/api/settings', require('./routes/settings'));
app.use('/api/products', require('./routes/products'));
app.use('/api/import', require('./routes/import'));
app.use('/api/promotions', require('./routes/promotions'));
app.use('/api/stock', require('./routes/stock'));
app.use('/api/sales', require('./routes/sales'));
app.use('/api/reports', require('./routes/reports'));
app.use('/api/audit', require('./routes/audit'));
app.use('/api/backup', require('./routes/backup'));

app.use('/api', (req, res) => res.status(404).json({ error: 'E_NOT_FOUND' }));

// Хатогиҳо ҳамеша ҳамчун JSON бармегарданд (калид, на матн: забонро браузер интихоб мекунад)
app.use((err, req, res, next) => {
  if (err.status) return res.status(err.status).json({ error: err.key, ...(err.extra || {}) });
  if (err.code === 11000) {
    const field = Object.keys(err.keyPattern || err.keyValue || {})[0];
    return res.status(409).json({ error: field ? `E_DUPLICATE_${field}` : 'E_DUPLICATE' });
  }
  if (err.name === 'CastError' || err.name === 'ValidationError') return res.status(400).json({ error: 'E_INVALID' });
  if (err.type === 'entity.too.large') return res.status(413).json({ error: 'E_TOO_LARGE' });
  console.error(err);
  res.status(500).json({ error: 'E_SERVER' });
});

function lanAddresses() {
  const out = [];
  for (const list of Object.values(os.networkInterfaces()))
    for (const i of list || []) if (i.family === 'IPv4' && !i.internal) out.push(i.address);
  return out;
}

if (require.main === module) {
  connectMongo()
    .then(() => {
      console.log('MongoDB пайваст шуд');
      app.listen(PORT, '0.0.0.0', () => {
        console.log(`Сервер кор мекунад: http://localhost:${PORT}`);
        lanAddresses().forEach((ip) => console.log(`Барои кассаҳои дигар дар шабака: http://${ip}:${PORT}`));
      });
      backup.startScheduler();
    })
    .catch((err) => {
      console.error('Ба MongoDB пайваст нашуд:', err.message);
      process.exit(1);
    });
}

module.exports = app;
