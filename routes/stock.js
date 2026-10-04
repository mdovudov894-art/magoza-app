const router = require('express').Router();
const { Product, Batch, StockMove } = require('../models');
const { requireAuth } = require('../lib/auth');
const { getSettings } = require('../lib/settings');
const { audit } = require('../lib/audit');
const { wrap, httpErr, r3, startOfToday, isDate, dayStart } = require('../lib/util');

router.use(requireAuth('manager'));

const move = (req, o) => StockMove.create({ user: req.user._id, userName: req.user.username, ...o });

// Ҳушдорҳо: муҳлаташ гузашта, муҳлаташ наздик, захира кам
router.get('/overview', wrap(async (req, res) => {
  const s = await getSettings();
  const today = startOfToday();
  const soon = new Date(today.getTime() + s.expiryWarnDays * 86400000);
  const batches = await Batch.find({ qty: { $gt: 0 }, expiry: { $ne: null } }).populate('product', 'name barcode unit').lean();
  const live = batches.filter((b) => b.product);
  const sorted = (a) => a.sort((x, y) => x.expiry - y.expiry);
  const low = (await Product.find({ trackStock: true }).select('name barcode unit stock minStock').lean()).filter((p) => p.stock <= p.minStock);
  res.json({
    warnDays: s.expiryWarnDays,
    expired: sorted(live.filter((b) => b.expiry < today)),
    expiring: sorted(live.filter((b) => b.expiry >= today && b.expiry <= soon)),
    low: low.sort((a, b) => a.stock - b.stock),
  });
}));

router.get('/batches/:productId', wrap(async (req, res) => {
  const p = await Product.findById(req.params.productId).lean();
  if (!p) throw httpErr(404, 'E_NOT_FOUND');
  const batches = await Batch.find({ product: p._id }).sort({ receivedAt: -1 }).lean();
  const moves = await StockMove.find({ product: p._id }).sort({ at: -1 }).limit(50).lean();
  res.json({ product: p, batches, moves });
}));

router.post('/receive', wrap(async (req, res) => {
  const b = req.body;
  const qty = r3(Number(b.qty));
  const p = await Product.findById(b.productId);
  if (!p) throw httpErr(404, 'E_PRODUCT_NOT_FOUND');
  if (!(qty > 0)) throw httpErr(400, 'E_QTY');
  const cost = Number(b.cost) > 0 ? Number(b.cost) : 0;
  const batch = await Batch.create({
    product: p._id, qty, initialQty: qty, batchNo: String(b.batchNo || '').trim(), supplier: String(b.supplier || '').trim(),
    cost, expiry: isDate(b.expiry) ? dayStart(b.expiry) : null, note: String(b.note || '').trim(),
  });
  const set = { trackStock: true };
  if (cost > 0) set.cost = cost;
  await Product.updateOne({ _id: p._id }, { $inc: { stock: qty }, $set: set });
  await move(req, { product: p._id, batch: batch._id, type: 'receive', qty, note: batch.batchNo });
  await audit(req, 'stock_receive', 'product', p._id, { name: p.name, qty, expiry: b.expiry || null, batchNo: batch.batchNo });
  res.status(201).json(batch);
}));

router.post('/writeoff', wrap(async (req, res) => {
  const batch = await Batch.findById(req.body.batchId);
  if (!batch) throw httpErr(404, 'E_NOT_FOUND');
  const qty = req.body.qty === undefined || req.body.qty === '' ? batch.qty : r3(Number(req.body.qty));
  if (!(qty > 0) || qty > batch.qty + 0.0005) throw httpErr(400, 'E_QTY');
  const r = await Batch.findOneAndUpdate({ _id: batch._id, qty: { $gte: qty - 0.0005 } }, { $inc: { qty: -qty } });
  if (!r) throw httpErr(409, 'E_STOCK');
  await Product.updateOne({ _id: batch.product }, { $inc: { stock: -qty } });
  const reason = String(req.body.reason || '').trim();
  await move(req, { product: batch.product, batch: batch._id, type: 'writeoff', qty: -qty, note: reason });
  await audit(req, 'stock_writeoff', 'product', batch.product, { batchId: batch._id, qty, reason });
  res.json({ ok: true });
}));

router.post('/adjust', wrap(async (req, res) => {
  const batch = await Batch.findById(req.body.batchId);
  if (!batch) throw httpErr(404, 'E_NOT_FOUND');
  const newQty = r3(Number(req.body.newQty));
  if (!(newQty >= 0)) throw httpErr(400, 'E_QTY');
  const delta = r3(newQty - batch.qty);
  await Batch.updateOne({ _id: batch._id }, { $set: { qty: newQty } });
  await Product.updateOne({ _id: batch.product }, { $inc: { stock: delta } });
  const note = String(req.body.note || '').trim();
  await move(req, { product: batch.product, batch: batch._id, type: 'adjust', qty: delta, note });
  await audit(req, 'stock_adjust', 'product', batch.product, { batchId: batch._id, from: batch.qty, to: newQty, note });
  res.json({ ok: true });
}));

module.exports = router;
