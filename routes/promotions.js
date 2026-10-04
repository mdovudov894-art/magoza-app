const router = require('express').Router();
const { Promotion, Product } = require('../models');
const { requireAuth } = require('../lib/auth');
const { audit } = require('../lib/audit');
const { wrap, httpErr, isDate, dayStart, dayEnd } = require('../lib/util');

router.use(requireAuth('manager'));

async function readBody(b) {
  const f = {
    name: String(b.name || '').trim(),
    type: b.type,
    value: Number(b.value),
    scope: b.scope,
    category: String(b.category || '').trim(),
    active: b.active !== false,
    product: null,
    startsAt: isDate(b.startsAt) ? dayStart(b.startsAt) : null,
    endsAt: isDate(b.endsAt) ? dayEnd(b.endsAt) : null,
  };
  if (!f.name || !['percent', 'fixed'].includes(f.type) || !['all', 'product', 'category'].includes(f.scope)) throw httpErr(400, 'E_INVALID');
  if (!(f.value > 0) || (f.type === 'percent' && f.value > 100)) throw httpErr(400, 'E_INVALID');
  if (f.scope === 'product') {
    if (!b.product || !(await Product.exists({ _id: b.product }))) throw httpErr(400, 'E_PRODUCT_NOT_FOUND');
    f.product = b.product;
  }
  if (f.scope === 'category' && !f.category) throw httpErr(400, 'E_INVALID');
  if (f.startsAt && f.endsAt && f.endsAt < f.startsAt) throw httpErr(400, 'E_INVALID');
  return f;
}

router.get('/', wrap(async (req, res) => {
  const list = await Promotion.find().sort({ createdAt: -1 }).populate('product', 'name barcode').lean();
  res.json(list);
}));

router.post('/', wrap(async (req, res) => {
  const p = await Promotion.create(await readBody(req.body));
  await audit(req, 'promo_create', 'promotion', p._id, { name: p.name, type: p.type, value: p.value });
  res.status(201).json(p);
}));

router.put('/:id', wrap(async (req, res) => {
  const p = await Promotion.findByIdAndUpdate(req.params.id, await readBody(req.body), { returnDocument: 'after' });
  if (!p) throw httpErr(404, 'E_NOT_FOUND');
  await audit(req, 'promo_update', 'promotion', p._id, { name: p.name, type: p.type, value: p.value, active: p.active });
  res.json(p);
}));

router.delete('/:id', wrap(async (req, res) => {
  const p = await Promotion.findByIdAndDelete(req.params.id);
  if (p) await audit(req, 'promo_delete', 'promotion', p._id, { name: p.name });
  res.json({ ok: true });
}));

module.exports = router;
