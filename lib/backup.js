const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');
const { EJSON } = mongoose.mongo.BSON;

const DIR = process.env.BACKUP_DIR || path.join(__dirname, '..', 'backups');
const KEEP = 40;
const pad = (n) => String(n).padStart(2, '0');
const stamp = () => { const d = new Date(); return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`; };
const OK_NAME = /^backup-[\w.-]+\.json$/;

function list() {
  if (!fs.existsSync(DIR)) return [];
  return fs.readdirSync(DIR).filter((f) => OK_NAME.test(f)).map((name) => {
    const st = fs.statSync(path.join(DIR, name));
    return { name, size: st.size, mtime: st.mtime };
  }).sort((a, b) => b.mtime - a.mtime);
}

function prune() {
  list().slice(KEEP).forEach((f) => { try { fs.unlinkSync(path.join(DIR, f.name)); } catch (e) {} });
}

async function createBackup(tag = 'auto') {
  fs.mkdirSync(DIR, { recursive: true });
  const db = mongoose.connection.db;
  const data = {};
  for (const c of await db.listCollections().toArray()) {
    if (c.name === 'sessions' || c.name.startsWith('system.')) continue;
    data[c.name] = await db.collection(c.name).find({}).toArray();
  }
  const name = `backup-${stamp()}-${tag}.json`;
  fs.writeFileSync(path.join(DIR, name), EJSON.stringify({ version: 1, createdAt: new Date(), collections: data }, { relaxed: false }));
  prune();
  return name;
}

function filePath(name) {
  if (!OK_NAME.test(name)) return null;
  const p = path.join(DIR, name);
  return fs.existsSync(p) ? p : null;
}

async function restoreBackup(name) {
  const p = filePath(name);
  if (!p) throw new Error('not found');
  const doc = EJSON.parse(fs.readFileSync(p, 'utf8'));
  const db = mongoose.connection.db;
  for (const [col, docs] of Object.entries(doc.collections || {})) {
    if (col === 'sessions') continue;
    await db.collection(col).deleteMany({});
    if (docs.length) await db.collection(col).insertMany(docs);
  }
  await db.collection('sessions').deleteMany({});
}

// Ҳар рӯз як нусхаи худкор (агар дар 24 соати охир нусха набошад)
function startScheduler() {
  const check = async () => {
    try {
      const last = list()[0];
      if (!last || Date.now() - last.mtime.getTime() > 24 * 3600 * 1000) {
        const n = await createBackup('auto');
        console.log('Нусхаи захира сохта шуд:', n);
      }
    } catch (e) { console.error('Backup:', e.message); }
  };
  setTimeout(check, 15000);
  setInterval(check, 3600 * 1000);
}

module.exports = { DIR, list, createBackup, restoreBackup, filePath, startScheduler };
