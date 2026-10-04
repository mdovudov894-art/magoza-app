const day = (n) => { const d = new Date(); d.setDate(d.getDate() + n); return ymdLocal(d); };

function setRange(kind) {
  const d = new Date();
  const ranges = {
    today: [day(0), day(0)], yesterday: [day(-1), day(-1)], week: [day(-6), day(0)],
    month: [ymdLocal(new Date(d.getFullYear(), d.getMonth(), 1)), day(0)],
  };
  [$('#from').value, $('#to').value] = ranges[kind];
  load();
}

async function load() {
  const from = $('#from').value, to = $('#to').value;
  $('#xls').href = `/api/reports/export.xlsx?from=${from}&to=${to}`;
  try {
    const r = await api(`/api/reports/summary?from=${from}&to=${to}`);
    const T = r.totals;
    const max = Math.max(1, ...r.byDay.map((d) => Math.abs(d.net)));
    $('#out').innerHTML = `
      <div class="cards">
        <div class="stat hl"><small>${t('rep_net')}</small><b>${fmtMoney(T.net)}</b></div>
        <div class="stat"><small>${t('rep_receipts')}</small><b>${T.receipts}</b></div>
        <div class="stat"><small>${t('rep_avg')}</small><b>${fmtMoney(T.avg)}</b></div>
        <div class="stat"><small>${t('rep_sales')}</small><b>${fmtMoney(T.sales)}</b></div>
        <div class="stat"><small>${t('rep_refunds')} (${T.refundCount})</small><b>${fmtMoney(T.refunds)}</b></div>
        <div class="stat"><small>${t('rep_discount')}</small><b>${fmtMoney(T.discount)}</b></div>
        <div class="stat"><small>${t('method_cash')}</small><b>${fmtMoney(T.cash)}</b></div>
        <div class="stat"><small>${t('method_card')}</small><b>${fmtMoney(T.card)}</b></div>
        <div class="stat"><small>${t('rep_profit')}</small><b>${fmtMoney(T.profit)}</b></div>
      </div>
      <p class="hint mt">${t('rep_profit_hint')}</p>

      <section class="panel mt"><h2>${t('rep_by_day')}</h2><div class="bars">
        ${r.byDay.map((d) => `<div class="bar"><span>${fmtDate(d.date)}</span><span><i class="${d.net < 0 ? 'neg' : ''}" style="width:${(Math.abs(d.net) / max) * 100}%"></i></span><b>${fmtMoney(d.net)}</b></div>`).join('') || `<p class="hint">${t('none')}</p>`}
      </div></section>

      <section class="panel mt"><h2>${t('rep_by_cashier')}</h2><div class="tbl-wrap"><table class="tbl">
        <thead><tr><th>${t('cashier')}</th><th class="num">${t('rep_receipts')}</th><th class="num">${t('rep_net')}</th></tr></thead>
        <tbody>${r.byCashier.map((c) => `<tr><td>${esc(c.name)}</td><td class="num">${c.receipts}</td><td class="num">${fmtMoney(c.net)}</td></tr>`).join('')}</tbody></table></div></section>

      <section class="panel mt"><h2>${t('rep_top')}</h2><div class="tbl-wrap"><table class="tbl">
        <thead><tr><th>${t('name')}</th><th class="num">${t('qty')}</th><th class="num">${t('rep_revenue')}</th><th class="num">${t('rep_profit')}</th></tr></thead>
        <tbody>${r.topProducts.map((p) => `<tr><td>${esc(p.name)}</td><td class="num">${fmtQty(p.qty)} ${esc(unitLabel(p.unit))}</td><td class="num">${fmtMoney(p.revenue)}</td><td class="num">${p.profit ? fmtMoney(p.profit) : ''}</td></tr>`).join('')}</tbody></table></div></section>`;
  } catch (e) { fail(e); }
}

$('#range').addEventListener('submit', (e) => { e.preventDefault(); load(); });
$$('[data-r]').forEach((b) => b.addEventListener('click', () => setRange(b.dataset.r)));

(async () => {
  const me = await initPage('manager');
  if (!me) return;
  setRange('today');
})();
