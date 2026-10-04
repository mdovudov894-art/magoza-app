const router = require('express').Router();
const { Setting } = require('../models');
const { requireAuth } = require('../lib/auth');
const { getSettings } = require('../lib/settings');
const { audit } = require('../lib/audit');
const { wrap, httpErr } = require('../lib/util');

router.get('/', requireAuth(), wrap(async (req, res) => res.json(await getSettings())));

router.put('/', requireAuth('owner'), wrap(async (req, res) => {
  const b = req.body, s = {};
  for (const k of ['storeName', 'storeAddress', 'storePhone', 'receiptFooter']) if (b[k] !== undefined) s[k] = String(b[k]).slice(0, 300);
  const ints = { expiryWarnDays: [0, 365], weightItemLen: [1, 8], weightValueStart: [0, 12], weightValueLen: [1, 8] };
  for (const [k, [lo, hi]] of Object.entries(ints)) {
    if (b[k] === undefined) continue;
    const n = parseInt(b[k], 10);
    if (!isFinite(n) || n < lo || n > hi) throw httpErr(400, 'E_INVALID');
    s[k] = n;
  }
  if (b.weightEnabled !== undefined) s.weightEnabled = !!b.weightEnabled;
  if (b.weightPrefix !== undefined) {
    if (!/^\d{1,3}$/.test(String(b.weightPrefix))) throw httpErr(400, 'E_INVALID');
    s.weightPrefix = String(b.weightPrefix);
  }
  if (b.weightMode !== undefined) {
    if (!['weight', 'price'].includes(b.weightMode)) throw httpErr(400, 'E_INVALID');
    s.weightMode = b.weightMode;
  }
  await Setting.findOneAndUpdate({ key: 'main' }, { $set: s }, { upsert: true });
  await audit(req, 'settings_update', 'settings', 'main', s);
  res.json(await getSettings());
}));

module.exports = router;
