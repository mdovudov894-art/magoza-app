const router = require('express').Router();
const ExcelJS = require('exceljs');
const { Product } = require('../models');
const { requireAuth, RANK } = require('../lib/auth');
const { getSettings } = require('../lib/settings');
const { lookupCode } = require('../lib/pricing');
const { audit } = require('../lib/audit');
const { wrap, httpErr, normUnit, escRe } = require('../lib/util');

const forRole = (p, role) => {
  const o = p.toObject ? p.toObject() : { ...p };
  if (RANK[role] < RANK.manager) delete o.cost;
  return o;
};

function readBody(b) {
  const f = {
    barcode: String(b.barcode || '').trim(),
    name: String(b.name || '').trim(),
    price: Number(b.price),
    cost: Number(b.cost || 0),
    unit: normUnit(b.unit),
    category: String(b.category || '').trim(),
    note: String(b.note || '').trim(),
    photo: String(b.photo || ''),
    minStock: Number(b.minStock || 0),
  };
  if (!f.barcode || !f.name || !isFinite(f.price) || f.price < 0) throw httpErr(400, 'E_PRODUCT_FIELDS');
  if (!isFinite(f.cost) || f.cost < 0) f.cost = 0;
  if (!isFinite(f.minStock) || f.minStock < 0) f.minStock = 0;
  if (f.photo.length > 400000) f.photo = '';
  return { f, plu: String(b.plu || '').trim() };
}

const TRACKED = ['barcode', 'plu', 'name', 'price', 'cost', 'unit', 'category', 'minStock'];

router.get('/', requireAuth('manager'), wrap(async (req, res) => {
  res.json(await Product.find().sort({ createdAt: -1 }));
}));

// Ҷустуҷӯ аз рӯи ном ё баркод (барои кассир, агар баркод хонда нашавад)
router.get('/search', requireAuth(), wrap(async (req, res) => {
  const q = String(req.query.q || '').trim();
  if (q.length < 1) return res.json([]);
  const re = new RegExp(escRe(q), 'i');
  const list = await Product.find({ $or: [{ name: re }, { barcode: re }] }).limit(20);
  res.json(list.map((p) => forRole(p, req.user.role)));
}));

router.get('/lookup/:code', requireAuth(), wrap(async (req, res) => {
  const r = await lookupCode(req.params.code, await getSettings());
  if (!r) throw httpErr(404, 'E_PRODUCT_NOT_FOUND');
  res.json({ product: forRole(r.product, req.user.role), qty: r.qty, weighed: r.weighed });
}));

async function sendWorkbook(res, filename, wb) {
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  await wb.xlsx.write(res);
  res.end();
}

const COLS = [
  { header: 'barcode', key: 'barcode', width: 18 }, { header: 'name', key: 'name', width: 34 },
  { header: 'price', key: 'price', width: 10 }, { header: 'cost', key: 'cost', width: 10 },
  { header: 'unit', key: 'unit', width: 8 }, { header: 'category', key: 'category', width: 18 },
  { header: 'plu', key: 'plu', width: 10 }, { header: 'minStock', key: 'minStock', width: 10 },
  { header: 'stock', key: 'stock', width: 10 },
];

router.get('/export.xlsx', requireAuth('manager'), wrap(async (req, res) => {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('products');
  ws.columns = COLS;
  ws.getRow(1).font = { bold: true };
  (await Product.find().sort({ name: 1 }).lean()).forEach((p) => ws.addRow({ ...p, stock: p.trackStock ? p.stock : '' }));
  ws.getColumn('barcode').numFmt = '@';
  await sendWorkbook(res, 'products.xlsx', wb);
}));

router.get('/template.xlsx', requireAuth('manager'), wrap(async (req, res) => {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('products');
  ws.columns = COLS;
  ws.getRow(1).font = { bold: true };
  ws.addRow({ barcode: '4600000000017', name: 'Namuna', price: 12.5, cost: 9, unit: 'pcs', category: 'Namuna', plu: '', minStock: 5, stock: 20 });
  ws.getColumn('barcode').numFmt = '@';
  await sendWorkbook(res, 'products-template.xlsx', wb);
}));

router.post('/', requireAuth('manager'), wrap(async (req, res) => {
  const { f, plu } = readBody(req.body);
  const p = await Product.create(plu ? { ...f, plu } : f);
  await audit(req, 'product_create', 'product', p._id, { barcode: p.barcode, name: p.name, price: p.price });
  res.status(201).json(p);
}));

router.put('/:id', requireAuth('manager'), wrap(async (req, res) => {
  const old = await Product.findById(req.params.id);
  if (!old) throw httpErr(404, 'E_NOT_FOUND');
  const { f, plu } = readBody(req.body);
  const update = { $set: plu ? { ...f, plu } : f };
  if (!plu) update.$unset = { plu: 1 };
  const p = await Product.findByIdAndUpdate(req.params.id, update, { returnDocument: 'after', runValidators: true });
  const changes = {};
  for (const k of TRACKED) {
    const a = old[k] == null ? '' : old[k], b = p[k] == null ? '' : p[k];
    if (a !== b) changes[k] = [a, b];
  }
  if (Object.keys(changes).length) await audit(req, 'product_update', 'product', p._id, { name: p.name, changes });
  res.json(p);
}));

router.delete('/:id', requireAuth('manager'), wrap(async (req, res) => {
  const p = await Product.findByIdAndDelete(req.params.id);
  if (p) await audit(req, 'product_delete', 'product', p._id, { barcode: p.barcode, name: p.name });
  res.json({ ok: true });
}));

module.exports = router;
