const router = require('express').Router();
const { AuditLog } = require('../models');
const { requireAuth } = require('../lib/auth');
const { wrap, isDate, dayStart, dayEnd, escRe } = require('../lib/util');

router.get('/', requireAuth('manager'), wrap(async (req, res) => {
  const q = {};
  if (req.query.action) q.action = String(req.query.action);
  if (req.query.entity) q.entity = String(req.query.entity);
  if (req.query.entityId) q.entityId = String(req.query.entityId);
  if (req.query.user) q.userName = new RegExp('^' + escRe(String(req.query.user)), 'i');
  const range = {};
  if (isDate(req.query.from)) range.$gte = dayStart(req.query.from);
  if (isDate(req.query.to)) range.$lte = dayEnd(req.query.to);
  if (Object.keys(range).length) q.at = range;
  const limit = Math.min(500, Number(req.query.limit) || 200);
  res.json(await AuditLog.find(q).sort({ at: -1 }).limit(limit).lean());
}));

module.exports = router;
