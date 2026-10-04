const router = require('express').Router();
const { User, Session } = require('../models');
const { hashPassword, verifyPassword, createSession, destroySession, requireAuth, publicUser } = require('../lib/auth');
const { audit } = require('../lib/audit');
const { wrap, httpErr } = require('../lib/util');

const fails = new Map(); // ip|username -> {count, until}
const MAX_FAILS = 5, LOCK_MS = 5 * 1000;

const okUsername = (u) => /^[a-z0-9._-]{3,30}$/.test(u);
const okPassword = (p) => typeof p === 'string' && p.length >= 6 && p.length <= 100;

router.get('/status', wrap(async (req, res) => {
  res.json({ needsSetup: (await User.countDocuments()) === 0 });
}));

// Аввалин бор: сохтани аккаунти соҳиб
router.post('/setup', wrap(async (req, res) => {
  if ((await User.countDocuments()) > 0) throw httpErr(403, 'E_FORBIDDEN');
  const username = String(req.body.username || '').trim().toLowerCase();
  if (!okUsername(username)) throw httpErr(400, 'E_USERNAME');
  if (!okPassword(req.body.password)) throw httpErr(400, 'E_PASSWORD_SHORT');
  const { salt, hash } = await hashPassword(req.body.password);
  const u = await User.create({ username, name: String(req.body.name || '').trim(), role: 'owner', salt, hash });
  await createSession(res, u);
  req.user = u;
  await audit(req, 'setup', 'user', u._id, { username });
  res.status(201).json(publicUser(u));
}));

router.post('/login', wrap(async (req, res) => {
  const username = String(req.body.username || '').trim().toLowerCase();
  const key = req.ip + '|' + username;
  const f = fails.get(key);
  if (f && f.until > Date.now()) throw httpErr(429, 'E_LOCKED');
  const u = await User.findOne({ username, active: true });
  const ok = u && (await verifyPassword(String(req.body.password || ''), u.salt, u.hash));
  if (!ok) {
    const expired = f && f.until > 0 && f.until <= Date.now();
    const c = (f && !expired ? f.count : 0) + 1;
    fails.set(key, { count: c, until: c >= MAX_FAILS ? Date.now() + LOCK_MS : 0 });
    await audit(req, 'login_failed', 'user', '', { username }, username);
    throw httpErr(401, 'E_LOGIN');
  }
  fails.delete(key);
  await createSession(res, u);
  req.user = u;
  await audit(req, 'login', 'user', u._id, {});
  res.json(publicUser(u));
}));

router.get('/me', requireAuth(), (req, res) => res.json(publicUser(req.user)));

router.post('/logout', wrap(async (req, res) => {
  await destroySession(req, res);
  res.json({ ok: true });
}));

router.post('/password', requireAuth(), wrap(async (req, res) => {
  const { oldPassword, newPassword } = req.body;
  if (!(await verifyPassword(String(oldPassword || ''), req.user.salt, req.user.hash))) throw httpErr(400, 'E_OLD_PASSWORD');
  if (!okPassword(newPassword)) throw httpErr(400, 'E_PASSWORD_SHORT');
  const { salt, hash } = await hashPassword(newPassword);
  await User.updateOne({ _id: req.user._id }, { salt, hash });
  await audit(req, 'password_change', 'user', req.user._id, {});
  res.json({ ok: true });
}));

module.exports = router;
module.exports.okUsername = okUsername;
module.exports.okPassword = okPassword;
