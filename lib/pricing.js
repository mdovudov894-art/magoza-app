const { Product, Promotion } = require('../models');
const { r2, r3, httpErr } = require('./util');

// Баркоди тарозу: рамзи маҳсулот + вазн (ё нарх) дар дохили баркод
function parseWeighted(code, s) {
  if (!s.weightEnabled || !/^\d{13}$/.test(code) || !code.startsWith(s.weightPrefix)) return null;
  const item = code.substr(s.weightPrefix.length, s.weightItemLen);
  const value = parseInt(code.substr(s.weightValueStart, s.weightValueLen), 10);
  if (!item || !isFinite(value) || value <= 0) return null;
  return { item, value };
}

async function lookupCode(code, s) {
  code = String(code || '').trim();
  if (!code) return null;
  const w = parseWeighted(code, s);
  if (w) {
    const p = await Product.findOne({ plu: { $in: [w.item, w.item.replace(/^0+/, '')] } });
    if (p) {
      const qty = s.weightMode === 'weight' ? r3(w.value / 1000) : r3(w.value / 100 / (p.price || 1));
      return { product: p, qty, weighed: true };
    }
  }
  const p = await Product.findOne({ barcode: code });
  return p ? { product: p, qty: null, weighed: false } : null;
}

// Нормализатсияи сабад: маҳсулоти якхоларо якҷоя мекунем
function normItems(items) {
  if (!Array.isArray(items) || !items.length || items.length > 300) throw httpErr(400, 'E_CART_EMPTY');
  const map = new Map();
  for (const it of items) {
    const qty = r3(Number(it.qty));
    if (!it.productId || !(qty > 0)) throw httpErr(400, 'E_QTY');
    const k = String(it.productId);
    map.set(k, r3((map.get(k) || 0) + qty));
  }
  return [...map].map(([productId, qty]) => ({ productId, qty }));
}

function promoDiscountPerUnit(p, promo) {
  const d = promo.type === 'percent' ? (p.price * promo.value) / 100 : promo.value;
  return Math.max(0, Math.min(p.price, d));
}

function bestPromo(p, promos) {
  let best = null, bestD = 0;
  for (const pr of promos) {
    const match =
      pr.scope === 'all' ||
      (pr.scope === 'product' && pr.product && String(pr.product) === String(p._id)) ||
      (pr.scope === 'category' && p.category && pr.category && pr.category.toLowerCase() === p.category.toLowerCase());
    if (!match) continue;
    const d = promoDiscountPerUnit(p, pr);
    if (d > bestD) { best = pr; bestD = d; }
  }
  return { promo: best, unitDiscount: bestD };
}

async function activePromos() {
  const now = new Date();
  const all = await Promotion.find({ active: true }).lean();
  return all.filter((p) => (!p.startsAt || p.startsAt <= now) && (!p.endsAt || p.endsAt >= now));
}

async function priceCart(items, manualPct = 0) {
  const products = await Product.find({ _id: { $in: items.map((i) => i.productId) } });
  const map = new Map(products.map((p) => [String(p._id), p]));
  const promos = await activePromos();
  const lines = items.map((it) => {
    const p = map.get(String(it.productId));
    if (!p) throw httpErr(404, 'E_PRODUCT_NOT_FOUND');
    const { promo, unitDiscount } = bestPromo(p, promos);
    const gross = r2(p.price * it.qty);
    const promoDiscount = Math.min(gross, r2(unitDiscount * it.qty));
    return {
      product: p._id, barcode: p.barcode, name: p.name, unit: p.unit, qty: it.qty, price: p.price, cost: p.cost || 0,
      gross, promoDiscount, manualDiscount: 0, promo: promo ? promo.name : '',
      net: r2(gross - promoDiscount), trackStock: !!p.trackStock,
    };
  });
  const subtotal = r2(lines.reduce((s, l) => s + l.gross, 0));
  const promoTotal = r2(lines.reduce((s, l) => s + l.promoDiscount, 0));
  const base = r2(subtotal - promoTotal);
  const pct = Math.min(100, Math.max(0, Number(manualPct) || 0));
  const manual = r2((base * pct) / 100);
  if (manual > 0 && base > 0) {
    let left = manual;
    lines.forEach((l, i) => {
      const share = i === lines.length - 1 ? left : r2((manual * l.net) / base);
      l.manualDiscount = share;
      l.net = r2(l.net - share);
      left = r2(left - share);
    });
  }
  return { lines, subtotal, promoDiscount: promoTotal, manualDiscount: manual, manualPct: pct, total: r2(base - manual) };
}

module.exports = { parseWeighted, lookupCode, normItems, priceCart };
