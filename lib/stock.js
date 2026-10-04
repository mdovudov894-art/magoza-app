const { Batch, Product, StockMove, Counter } = require('../models');
const { r3, httpErr, startOfToday } = require('./util');

// Аз ҷузъҳои муҳлаташ наздиктар аввал мебарем (FEFO), ҷузъҳои муҳлаташ гузашта намераванд
async function planAllocation(productId, qty) {
  const today = startOfToday();
  const batches = (await Batch.find({ product: productId, qty: { $gt: 0 } })).filter((b) => !b.expiry || b.expiry >= today);
  batches.sort((a, b) => (a.expiry ? a.expiry.getTime() : Infinity) - (b.expiry ? b.expiry.getTime() : Infinity));
  let need = qty;
  const plan = [];
  for (const b of batches) {
    if (need <= 0.0004) break;
    const take = r3(Math.min(b.qty, need));
    plan.push({ batch: b._id, qty: take, restored: 0 });
    need = r3(need - take);
  }
  return need > 0.0004 ? null : plan;
}

// Ду марҳила: аввал ҳамаро месанҷем, баъд кам мекунем
async function reserve(lines) {
  const plans = [];
  const bad = [];
  for (const l of lines) {
    if (!l.trackStock) { plans.push([]); continue; }
    const plan = await planAllocation(l.product, l.qty);
    if (!plan) bad.push(l.name);
    plans.push(plan || []);
  }
  if (bad.length) throw httpErr(409, 'E_STOCK', { items: bad });

  const done = [];
  const undo = async () => { for (const d of done) await Batch.updateOne({ _id: d.batch }, { $inc: { qty: d.qty } }); };
  try {
    for (let i = 0; i < lines.length; i++) {
      for (const a of plans[i]) {
        const r = await Batch.findOneAndUpdate({ _id: a.batch, qty: { $gte: a.qty - 0.0005 } }, { $inc: { qty: -a.qty } });
        if (!r) throw httpErr(409, 'E_STOCK', { items: [lines[i].name] });
        done.push(a);
      }
    }
  } catch (e) { await undo(); throw e; }
  return { plans, undo };
}

async function nextNumber(key) {
  const c = await Counter.findOneAndUpdate({ key }, { $inc: { seq: 1 } }, { returnDocument: 'after', upsert: true });
  return c.seq;
}

async function logMoves(moves) {
  if (moves.length) await StockMove.insertMany(moves);
}

module.exports = { planAllocation, reserve, nextNumber, logMoves };
