const router = require('express').Router();
const { Sale, Product, Batch } = require('../models');
const { requireAuth, RANK } = require('../lib/auth');
const { normItems, priceCart } = require('../lib/pricing');
const { reserve, nextNumber, logMoves } = require('../lib/stock');
const { audit } = require('../lib/audit');
const { wrap, httpErr, r2, r3, isDate, dayStart, dayEnd } = require('../lib/util');

const isManager = (u) => RANK[u.role] >= RANK.manager;

// Ҳисоби нарх бо тахфифҳо (сервер ҳамеша ҳисоби дурустро медиҳад)
router.post('/price', requireAuth(), wrap(async (req, res) => {
  const pct = isManager(req.user) ? req.body.manualDiscountPct : 0;
  res.json(await priceCart(normItems(req.body.items), pct));
}));

router.post('/', requireAuth(), wrap(async (req, res) => {
  const pct = Number(req.body.manualDiscountPct) || 0;
  if (pct > 0 && !isManager(req.user)) throw httpErr(403, 'E_FORBIDDEN');
  const priced = await priceCart(normItems(req.body.items), pct);
  if (!(priced.total > 0)) throw httpErr(400, 'E_TOTAL_ZERO');
  const method = req.body.method === 'card' ? 'card' : 'cash';
  const paid = method === 'card' || req.body.paid == null || req.body.paid === '' ? priced.total : Number(req.body.paid);
  if (!(paid >= priced.total - 0.001)) throw httpErr(400, 'E_PAID_LESS');

  const { plans, undo } = await reserve(priced.lines);
  let sale;
  try {
    const number = await nextNumber('sale');
    sale = await Sale.create({
      number, type: 'sale', method, paid, change: r2(paid - priced.total),
      subtotal: priced.subtotal, promoDiscount: priced.promoDiscount, manualDiscount: priced.manualDiscount,
      manualPct: priced.manualPct, total: priced.total,
      cashier: req.user._id, cashierName: req.user.name || req.user.username,
      items: priced.lines.map((l, i) => ({ ...l, allocations: plans[i] })),
    });
  } catch (e) { await undo(); throw e; }

  const moves = [];
  for (let i = 0; i < priced.lines.length; i++) {
    const l = priced.lines[i];
    if (!l.trackStock) continue;
    await Product.updateOne({ _id: l.product }, { $inc: { stock: -l.qty } });
    for (const a of plans[i]) moves.push({ product: l.product, batch: a.batch, type: 'sale', qty: -a.qty, user: req.user._id, userName: req.user.username, ref: sale.number });
  }
  await logMoves(moves);
  res.status(201).json(sale);
}));

router.get('/', requireAuth('manager'), wrap(async (req, res) => {
  const q = {};
  if (req.query.number) q.number = Number(req.query.number);
  else {
    const range = {};
    if (isDate(req.query.from)) range.$gte = dayStart(req.query.from);
    if (isDate(req.query.to)) range.$lte = dayEnd(req.query.to);
    if (Object.keys(range).length) q.createdAt = range;
  }
  if (['sale', 'refund'].includes(req.query.type)) q.type = req.query.type;
  res.json(await Sale.find(q).sort({ number: -1 }).limit(300).lean());
}));

router.get('/:number', requireAuth(), wrap(async (req, res) => {
  const s = await Sale.findOne({ number: Number(req.params.number) }).lean();
  if (!s) throw httpErr(404, 'E_NOT_FOUND');
  res.json(s);
}));

// Бозгашт: пурра ё қисман, танҳо менеҷер/соҳиб
router.post('/:number/refund', requireAuth('manager'), wrap(async (req, res) => {
  const sale = await Sale.findOne({ number: Number(req.params.number), type: 'sale' });
  if (!sale) throw httpErr(404, 'E_NOT_FOUND');
  const asked = Array.isArray(req.body.items) ? req.body.items : [];
  const refundItems = [];
  let total = 0;
  const batchRestores = [];

  for (const a of asked) {
    const qty = r3(Number(a.qty));
    if (!(qty > 0)) continue;
    const line = sale.items[Number(a.index)];
    if (!line) throw httpErr(400, 'E_INVALID');
    const left = r3(line.qty - (line.refundedQty || 0));
    if (qty > left + 0.0004) throw httpErr(400, 'E_REFUND_QTY');
    const full = Math.abs(qty - left) < 0.0004;
    const amount = full ? r2(line.net - (line.refundedNet || 0)) : r2((line.net * qty) / line.qty);
    const ratio = qty / line.qty;
    line.refundedQty = r3((line.refundedQty || 0) + qty);
    line.refundedNet = r2((line.refundedNet || 0) + amount);
    total = r2(total + amount);

    if (line.trackStock) {
      let remaining = qty;
      for (const al of line.allocations) {
        const cap = r3(al.qty - (al.restored || 0));
        const give = r3(Math.min(cap, remaining));
        if (give <= 0) continue;
        al.restored = r3((al.restored || 0) + give);
        remaining = r3(remaining - give);
        batchRestores.push({ product: line.product, batch: al.batch, qty: give });
      }
      if (remaining > 0.0004) batchRestores.push({ product: line.product, batch: null, qty: remaining });
    }
    refundItems.push({
      product: line.product, barcode: line.barcode, name: line.name, unit: line.unit, qty: -qty, price: line.price, cost: line.cost,
      gross: -r2(line.gross * ratio), promoDiscount: -r2(line.promoDiscount * ratio), manualDiscount: -r2((line.manualDiscount || 0) * ratio),
      net: -amount, promo: line.promo, trackStock: line.trackStock,
    });
  }
  if (!refundItems.length) throw httpErr(400, 'E_INVALID');

  sale.markModified('items');
  await sale.save();

  const moves = [];
  for (const r of batchRestores) {
    let batchId = r.batch;
    const upd = batchId ? await Batch.updateOne({ _id: batchId }, { $inc: { qty: r.qty } }) : { matchedCount: 0 };
    if (!upd.matchedCount) {
      const nb = await Batch.create({ product: r.product, qty: r.qty, initialQty: r.qty, note: 'refund' });
      batchId = nb._id;
    }
    await Product.updateOne({ _id: r.product }, { $inc: { stock: r.qty } });
    moves.push({ product: r.product, batch: batchId, type: 'refund', qty: r.qty, user: req.user._id, userName: req.user.username, ref: sale.number });
  }
  await logMoves(moves);

  const number = await nextNumber('sale');
  const method = req.body.method === 'card' ? 'card' : sale.method;
  const refund = await Sale.create({
    number, type: 'refund', refOf: sale.number, method, items: refundItems,
    subtotal: -total, total: -total, paid: -total, change: 0,
    cashier: req.user._id, cashierName: req.user.name || req.user.username,
  });
  await audit(req, 'refund', 'sale', sale.number, { refundNumber: number, total, items: refundItems.map((i) => ({ name: i.name, qty: -i.qty })) });
  res.status(201).json(refund);
}));

module.exports = router;
