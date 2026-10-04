const router = require('express').Router();
const ExcelJS = require('exceljs');
const { Sale } = require('../models');
const { requireAuth } = require('../lib/auth');
const { wrap, httpErr, r2, r3, isDate, dayStart, dayEnd, ymd } = require('../lib/util');

router.use(requireAuth('manager'));

async function build(from, to) {
  if (!isDate(from) || !isDate(to)) throw httpErr(400, 'E_INVALID');
  const sales = await Sale.find({ createdAt: { $gte: dayStart(from), $lte: dayEnd(to) } }).lean();
  const t = { receipts: 0, sales: 0, refundCount: 0, refunds: 0, discount: 0, net: 0, profit: 0, cash: 0, card: 0 };
  const days = new Map(), cashiers = new Map(), products = new Map();
  for (const s of sales) {
    const isSale = s.type === 'sale';
    if (isSale) { t.receipts++; t.sales += s.total; } else { t.refundCount++; t.refunds += -s.total; }
    t.net += s.total;
    t.discount += (s.promoDiscount || 0) + (s.manualDiscount || 0);
    t[s.method] += s.total;
    const dk = ymd(new Date(s.createdAt));
    const d = days.get(dk) || { date: dk, receipts: 0, net: 0 };
    if (isSale) d.receipts++;
    d.net += s.total;
    days.set(dk, d);
    const ck = s.cashierName || '-';
    const c = cashiers.get(ck) || { name: ck, receipts: 0, net: 0 };
    if (isSale) c.receipts++;
    c.net += s.total;
    cashiers.set(ck, c);
    for (const it of s.items) {
      const p = products.get(it.name) || { name: it.name, barcode: it.barcode, unit: it.unit, qty: 0, revenue: 0, profit: 0 };
      p.qty += it.qty;
      p.revenue += it.net;
      if (it.cost > 0) { const pr = it.net - it.cost * it.qty; p.profit += pr; t.profit += pr; }
      products.set(it.name, p);
    }
  }
  const fix = (o) => { for (const k of Object.keys(o)) if (typeof o[k] === 'number') o[k] = k === 'qty' ? r3(o[k]) : r2(o[k]); return o; };
  const avg = t.receipts ? r2(t.sales / t.receipts) : 0;
  return {
    range: { from, to },
    totals: { ...fix(t), avg },
    byDay: [...days.values()].sort((a, b) => a.date.localeCompare(b.date)).map(fix),
    byCashier: [...cashiers.values()].sort((a, b) => b.net - a.net).map(fix),
    topProducts: [...products.values()].sort((a, b) => b.revenue - a.revenue).slice(0, 50).map(fix),
  };
}

router.get('/summary', wrap(async (req, res) => res.json(await build(req.query.from, req.query.to))));

router.get('/export.xlsx', wrap(async (req, res) => {
  const r = await build(req.query.from, req.query.to);
  const wb = new ExcelJS.Workbook();
  const sheet = (name, cols, rows) => {
    const ws = wb.addWorksheet(name);
    ws.columns = cols.map((c) => ({ header: c[0], key: c[1], width: c[2] || 16 }));
    ws.getRow(1).font = { bold: true };
    rows.forEach((x) => ws.addRow(x));
  };
  sheet('Summary', [['key', 'k', 22], ['value', 'v', 16]], Object.entries(r.totals).map(([k, v]) => ({ k, v })).concat([{ k: 'from', v: r.range.from }, { k: 'to', v: r.range.to }]));
  sheet('Days', [['date', 'date'], ['receipts', 'receipts'], ['net', 'net']], r.byDay);
  sheet('Cashiers', [['cashier', 'name', 24], ['receipts', 'receipts'], ['net', 'net']], r.byCashier);
  sheet('Products', [['name', 'name', 34], ['barcode', 'barcode', 18], ['unit', 'unit', 8], ['qty', 'qty'], ['revenue', 'revenue'], ['profit', 'profit']], r.topProducts);
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename="report-${r.range.from}_${r.range.to}.xlsx"`);
  await wb.xlsx.write(res);
  res.end();
}));

module.exports = router;
