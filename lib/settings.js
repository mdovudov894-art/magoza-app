const { Setting } = require('../models');
const DEFAULTS = {
  storeName: '', storeAddress: '', storePhone: '', receiptFooter: '', expiryWarnDays: 7,
  weightEnabled: true, weightPrefix: '2', weightItemLen: 5, weightValueStart: 7, weightValueLen: 5, weightMode: 'weight',
};
async function getSettings() {
  const s = await Setting.findOne({ key: 'main' }).lean();
  const out = { ...DEFAULTS };
  if (s) for (const k of Object.keys(DEFAULTS)) if (s[k] !== undefined && s[k] !== null) out[k] = s[k];
  return out;
}
module.exports = { getSettings, DEFAULTS };
