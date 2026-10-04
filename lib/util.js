const r2 = (n) => Math.round((n + Number.EPSILON) * 100) / 100;
const r3 = (n) => Math.round((n + Number.EPSILON) * 1000) / 1000;
const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
const httpErr = (status, key, extra) => Object.assign(new Error(key), { status, key, extra });
const startOfToday = () => { const d = new Date(); d.setHours(0, 0, 0, 0); return d; };
const isDate = (s) => /^\d{4}-\d{2}-\d{2}$/.test(s || '');
const dayStart = (s) => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d, 0, 0, 0, 0); };
const dayEnd = (s) => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d, 23, 59, 59, 999); };
const ymd = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const escRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// Воҳидҳо дар база бо калидҳои ягона нигоҳ дошта мешаванд: pcs, kg, l, pack
const UNIT_MAP = {
  pcs: 'pcs', 'дона': 'pcs', 'шт': 'pcs', 'штука': 'pcs',
  kg: 'kg', 'кг': 'kg', 'килограмм': 'kg',
  l: 'l', 'л': 'l', 'литр': 'l',
  pack: 'pack', 'баста': 'pack', 'уп': 'pack', 'упаковка': 'pack',
};
const normUnit = (u) => UNIT_MAP[String(u || '').trim().toLowerCase()] || 'pcs';

module.exports = { r2, r3, wrap, httpErr, startOfToday, isDate, dayStart, dayEnd, ymd, escRe, normUnit };
