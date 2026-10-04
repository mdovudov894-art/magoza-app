const crypto = require('crypto');
const { User, Session } = require('../models');

const RANK = { cashier: 1, manager: 2, owner: 3 };
const COOKIE = 'sid';
const TTL = 12 * 3600 * 1000;
const secureCookie = process.env.VERCEL ? '; Secure' : '';

const scrypt = (pw, salt) =>
  new Promise((resolve, reject) => crypto.scrypt(pw, salt, 64, (e, k) => (e ? reject(e) : resolve(k.toString('hex')))));
const sha = (t) => crypto.createHash('sha256').update(t).digest('hex');

async function hashPassword(pw) {
  const salt = crypto.randomBytes(16).toString('hex');
  return { salt, hash: await scrypt(pw, salt) };
}
async function verifyPassword(pw, salt, hash) {
  const a = Buffer.from(await scrypt(pw, salt || ''), 'hex');
  const b = Buffer.from(hash || '', 'hex');
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

function parseCookies(req) {
  const out = {};
  (req.headers.cookie || '').split(';').forEach((p) => {
    const i = p.indexOf('=');
    if (i > 0) out[p.slice(0, i).trim()] = decodeURIComponent(p.slice(i + 1).trim());
  });
  return out;
}

async function createSession(res, user) {
  const token = crypto.randomBytes(32).toString('hex');
  await Session.create({ tokenHash: sha(token), user: user._id, expiresAt: new Date(Date.now() + TTL) });
  res.setHeader('Set-Cookie', `${COOKIE}=${token}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${TTL / 1000}${secureCookie}`);
}

async function destroySession(req, res) {
  const t = parseCookies(req)[COOKIE];
  if (t) await Session.deleteOne({ tokenHash: sha(t) });
  res.setHeader('Set-Cookie', `${COOKIE}=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0${secureCookie}`);
}

async function currentUser(req) {
  const t = parseCookies(req)[COOKIE];
  if (!t) return null;
  const s = await Session.findOne({ tokenHash: sha(t), expiresAt: { $gt: new Date() } });
  if (!s) return null;
  const u = await User.findById(s.user);
  return u && u.active ? u : null;
}

// requireAuth('manager') => менеҷер ва соҳиб иҷозат доранд
function requireAuth(minRole = 'cashier') {
  return async (req, res, next) => {
    try {
      const u = await currentUser(req);
      if (!u) return res.status(401).json({ error: 'E_AUTH' });
      if (RANK[u.role] < RANK[minRole]) return res.status(403).json({ error: 'E_FORBIDDEN' });
      req.user = u;
      next();
    } catch (e) { next(e); }
  };
}

const publicUser = (u) => ({ _id: u._id, username: u.username, name: u.name, role: u.role, active: u.active });

module.exports = { RANK, hashPassword, verifyPassword, createSession, destroySession, currentUser, requireAuth, publicUser };
