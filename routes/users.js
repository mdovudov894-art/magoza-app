const router = require('express').Router();
const { User, Session } = require('../models');
const { requireAuth, hashPassword, publicUser } = require('../lib/auth');
const { audit } = require('../lib/audit');
const { wrap, httpErr } = require('../lib/util');
const { okUsername, okPassword } = require('./auth');

router.use(requireAuth('owner'));
const ROLES = ['cashier', 'manager', 'owner'];

router.get('/', wrap(async (req, res) => {
  res.json((await User.find().sort({ createdAt: 1 })).map(publicUser));
}));

router.post('/', wrap(async (req, res) => {
  const username = String(req.body.username || '').trim().toLowerCase();
  if (!okUsername(username)) throw httpErr(400, 'E_USERNAME');
  if (!okPassword(req.body.password)) throw httpErr(400, 'E_PASSWORD_SHORT');
  if (!ROLES.includes(req.body.role)) throw httpErr(400, 'E_INVALID');
  const { salt, hash } = await hashPassword(req.body.password);
  const u = await User.create({ username, name: String(req.body.name || '').trim(), role: req.body.role, salt, hash });
  await audit(req, 'user_create', 'user', u._id, { username, role: u.role });
  res.status(201).json(publicUser(u));
}));

router.put('/:id', wrap(async (req, res) => {
  const u = await User.findById(req.params.id);
  if (!u) throw httpErr(404, 'E_NOT_FOUND');
  const changes = {};
  if (req.body.name !== undefined) u.name = String(req.body.name).trim();
  if (req.body.role !== undefined) {
    if (!ROLES.includes(req.body.role)) throw httpErr(400, 'E_INVALID');
    if (u.role !== req.body.role) changes.role = [u.role, req.body.role];
    u.role = req.body.role;
  }
  if (req.body.active !== undefined) {
    if (u.active !== !!req.body.active) changes.active = [u.active, !!req.body.active];
    u.active = !!req.body.active;
  }
  // Охирин соҳибро аз даст додан мумкин нест
  if (u.role !== 'owner' || !u.active) {
    const others = await User.countDocuments({ role: 'owner', active: true, _id: { $ne: u._id } });
    if (!others) throw httpErr(400, 'E_LAST_OWNER');
  }
  if (req.body.password) {
    if (!okPassword(req.body.password)) throw httpErr(400, 'E_PASSWORD_SHORT');
    Object.assign(u, await hashPassword(req.body.password));
    changes.password = true;
  }
  await u.save();
  if (!u.active || changes.password) await Session.deleteMany({ user: u._id });
  await audit(req, 'user_update', 'user', u._id, { username: u.username, changes });
  res.json(publicUser(u));
}));

module.exports = router;
