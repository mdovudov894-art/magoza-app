const router = require('express').Router();
const ExcelJS = require('exceljs');
const { Product, Batch, StockMove } = require('../models');
const { requireAuth } = require('../lib/auth');
const { audit } = require('../lib/audit');
const { wrap, httpErr, normUnit } = require('../lib/util');

router.use(requireAuth('manager'));

const SYN = {
  barcode: ['barcode', 'баркод', 'штрихкод', 'штрих-код', 'код'],
  name: ['name', 'ном', 'название', 'наименование'],
  price: ['price', 'нарх', 'цена'],
  cost: ['cost', 'нархихарид', 'закупка', 'себестоимость', 'закупочнаяцена'],
  unit: ['unit', 'воҳид', 'вохид', 'единица', 'ед'],
  category: ['category', 'гурӯҳ', 'гурух', 'категория'],
  plu: ['plu', 'плу'],
  minStock: ['minstock', 'камтарин', 'минимум', 'минимальныйостаток'],
  stock: ['stock', 'қолдиқ', 'колдик', 'остаток', 'количество'],
};
const normHead = (h) => String(h == null ? '' : h).toLowerCase().replace(/[\s_\-.]/g, '');
const HEAD_MAP = {};
for (const [k, arr] of Object.entries(SYN)) arr.forEach((a) => (HEAD_MAP[normHead(a)] = k));

function parseCsv(text) {
  const first = text.split(/\r?\n/)[0] || '';
  const delim = [',', ';', '\t'].map((d) => [d, first.split(d).length]).sort((a, b) => b[1] - a[1])[0][0];
  const rows = [];
  let row = [], cur = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) {
      if (c === '"' && text[i + 1] === '"') { cur += '"'; i++; }
      else if (c === '"') q = false;
      else cur += c;
    } else if (c === '"') q = true;
    else if (c === delim) { row.push(cur); cur = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(cur); cur = '';
      rows.push(row); row = [];
    } else cur += c;
  }
  if (cur !== '' || row.length) { row.push(cur); rows.push(row); }
  return rows;
}

const cellVal = (v) => {
  if (v == null) return '';
  if (typeof v === 'object') {
    if (v.result !== undefined) return cellVal(v.result);
    if (v.richText) return v.richText.map((t) => t.text).join('');
    if (v.text) return v.text;
    if (v instanceof Date) return v.toISOString();
  }
  return typeof v === 'number' ? String(v) : String(v).trim();
};

async function readMatrix(filename, buf) {
  if (/\.(csv|txt)$/i.test(filename)) return parseCsv(buf.toString('utf8').replace(/^\uFEFF/, ''));
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buf);
  const ws = wb.worksheets[0];
  if (!ws) return [];
  const out = [];
  ws.eachRow({ includeEmpty: false }, (row) => {
    const vals = [];
    row.eachCell({ includeEmpty: true }, (c, i) => (vals[i - 1] = cellVal(c.value)));
    out.push(Array.from(vals, (v) => (v === undefined ? '' : v)));
  });
  return out;
}

const toNum = (s) => {
  const n = Number(String(s).replace(/\s/g, '').replace(',', '.'));
  return isFinite(n) ? n : NaN;
};

function toRecords(matrix) {
  if (!matrix.length) throw httpErr(400, 'E_IMPORT_EMPTY');
  const head = matrix[0].map((h) => HEAD_MAP[normHead(h)] || null);
  if (!head.includes('barcode') || !head.includes('name') || !head.includes('price')) throw httpErr(400, 'E_IMPORT_HEADERS');
  const records = [], errors = [], seen = new Set();
  for (let i = 1; i < matrix.length; i++) {
    const cells = matrix[i];
    if (!cells.some((c) => String(c).trim() !== '')) continue;
    const r = { row: i + 1 };
    head.forEach((k, j) => { if (k && String(cells[j] ?? '').trim() !== '') r[k] = String(cells[j]).trim(); });
    const price = toNum(r.price);
    if (!r.barcode || !r.name || !isFinite(price) || price < 0) { errors.push({ row: r.row, error: 'E_PRODUCT_FIELDS' }); continue; }
    if (seen.has(r.barcode)) { errors.push({ row: r.row, error: 'E_IMPORT_DUP_IN_FILE' }); continue; }
    seen.add(r.barcode);
    r.price = price;
    if (r.cost !== undefined) r.cost = toNum(r.cost) >= 0 ? toNum(r.cost) : 0;
    if (r.minStock !== undefined) r.minStock = toNum(r.minStock) >= 0 ? toNum(r.minStock) : 0;
    if (r.stock !== undefined) r.stock = toNum(r.stock) > 0 ? toNum(r.stock) : 0;
    if (r.unit !== undefined) r.unit = normUnit(r.unit);
    records.push(r);
  }
  return { records, errors };
}

router.post('/', wrap(async (req, res) => {
  const { filename, data, apply } = req.body;
  if (!filename || !data) throw httpErr(400, 'E_IMPORT_EMPTY');
  let matrix;
  try { matrix = await readMatrix(String(filename), Buffer.from(String(data), 'base64')); }
  catch (e) { throw httpErr(400, 'E_IMPORT_READ'); }
  const { records, errors } = toRecords(matrix);

  const existing = new Map();
  for (let i = 0; i < records.length; i += 500) {
    const chunk = records.slice(i, i + 500).map((r) => r.barcode);
    (await Product.find({ barcode: { $in: chunk } })).forEach((p) => existing.set(p.barcode, p));
  }
  const willCreate = records.filter((r) => !existing.has(r.barcode)).length;
  const summary = { rows: records.length + errors.length, valid: records.length, willCreate, willUpdate: records.length - willCreate, errors: errors.slice(0, 50), errorCount: errors.length };
  if (!apply) return res.json({ ...summary, sample: records.slice(0, 8) });

  let created = 0, updated = 0;
  const failed = [...errors];
  const run = async (r) => {
    try {
      const old = existing.get(r.barcode);
      if (old) {
        const set = { name: r.name, price: r.price };
        for (const k of ['cost', 'unit', 'category', 'minStock']) if (r[k] !== undefined) set[k] = r[k];
        const upd = { $set: set };
        if (r.plu) set.plu = r.plu;
        await Product.updateOne({ _id: old._id }, upd);
        updated++;
      } else {
        const doc = { barcode: r.barcode, name: r.name, price: r.price };
        for (const k of ['cost', 'unit', 'category', 'minStock', 'plu']) if (r[k] !== undefined) doc[k] = r[k];
        const p = await Product.create(doc);
        if (r.stock > 0) {
          const b = await Batch.create({ product: p._id, qty: r.stock, initialQty: r.stock, note: 'import' });
          await Product.updateOne({ _id: p._id }, { $set: { trackStock: true, stock: r.stock } });
          await StockMove.create({ product: p._id, batch: b._id, type: 'receive', qty: r.stock, user: req.user._id, userName: req.user.username, note: 'import' });
        }
        created++;
      }
    } catch (e) {
      failed.push({ row: r.row, error: e.code === 11000 ? 'E_DUPLICATE' : 'E_INVALID' });
    }
  };
  for (let i = 0; i < records.length; i += 20) await Promise.all(records.slice(i, i + 20).map(run));
  await audit(req, 'import', 'product', '', { filename, created, updated, failed: failed.length });
  res.json({ ...summary, created, updated, errors: failed.slice(0, 50), errorCount: failed.length });
}));

module.exports = router;
