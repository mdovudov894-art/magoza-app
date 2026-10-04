const mongoose = require('mongoose');
const { Schema } = mongoose;
const { ObjectId } = Schema.Types;
const Product = require('./Product');

const User = mongoose.model('User', new Schema({
  username: { type: String, required: true, unique: true, lowercase: true, trim: true },
  name: { type: String, default: '', trim: true },
  role: { type: String, enum: ['cashier', 'manager', 'owner'], default: 'cashier' },
  salt: String,
  hash: String,
  active: { type: Boolean, default: true },
}, { timestamps: true }));

const Session = mongoose.model('Session', new Schema({
  tokenHash: { type: String, required: true, unique: true },
  user: { type: ObjectId, ref: 'User' },
  expiresAt: { type: Date, index: { expires: 0 } },
}, { timestamps: true }));

const Setting = mongoose.model('Setting', new Schema({
  key: { type: String, default: 'main', unique: true },
  storeName: { type: String, default: '' },
  storeAddress: { type: String, default: '' },
  storePhone: { type: String, default: '' },
  receiptFooter: { type: String, default: '' },
  expiryWarnDays: { type: Number, default: 7 },
  weightEnabled: { type: Boolean, default: true },
  weightPrefix: { type: String, default: '2' },
  weightItemLen: { type: Number, default: 5 },
  weightValueStart: { type: Number, default: 7 },
  weightValueLen: { type: Number, default: 5 },
  weightMode: { type: String, enum: ['weight', 'price'], default: 'weight' },
}));

const Batch = mongoose.model('Batch', new Schema({
  product: { type: ObjectId, ref: 'Product', required: true, index: true },
  batchNo: { type: String, default: '' },
  qty: { type: Number, required: true },
  initialQty: { type: Number, default: 0 },
  expiry: { type: Date, default: null },
  supplier: { type: String, default: '' },
  cost: { type: Number, default: 0 },
  note: { type: String, default: '' },
  receivedAt: { type: Date, default: Date.now },
}));

const StockMove = mongoose.model('StockMove', new Schema({
  product: { type: ObjectId, ref: 'Product', index: true },
  batch: { type: ObjectId },
  type: { type: String, enum: ['receive', 'sale', 'refund', 'writeoff', 'adjust'] },
  qty: Number,
  user: { type: ObjectId },
  userName: String,
  ref: Number,
  note: { type: String, default: '' },
  at: { type: Date, default: Date.now },
}));

const Promotion = mongoose.model('Promotion', new Schema({
  name: { type: String, required: true, trim: true },
  type: { type: String, enum: ['percent', 'fixed'], required: true },
  value: { type: Number, required: true, min: 0 },
  scope: { type: String, enum: ['all', 'product', 'category'], default: 'product' },
  product: { type: ObjectId, ref: 'Product', default: null },
  category: { type: String, default: '' },
  startsAt: { type: Date, default: null },
  endsAt: { type: Date, default: null },
  active: { type: Boolean, default: true },
}, { timestamps: true }));

const SaleItem = new Schema({
  product: ObjectId,
  barcode: String,
  name: String,
  unit: String,
  qty: Number,
  price: Number,
  cost: { type: Number, default: 0 },
  gross: Number,
  promoDiscount: { type: Number, default: 0 },
  manualDiscount: { type: Number, default: 0 },
  net: Number,
  promo: { type: String, default: '' },
  trackStock: { type: Boolean, default: false },
  refundedQty: { type: Number, default: 0 },
  refundedNet: { type: Number, default: 0 },
  allocations: [new Schema({ batch: ObjectId, qty: Number, restored: { type: Number, default: 0 } }, { _id: false })],
}, { _id: false });

const Sale = mongoose.model('Sale', new Schema({
  number: { type: Number, required: true, unique: true },
  type: { type: String, enum: ['sale', 'refund'], default: 'sale', index: true },
  refOf: { type: Number, default: null },
  items: [SaleItem],
  subtotal: Number,
  promoDiscount: { type: Number, default: 0 },
  manualDiscount: { type: Number, default: 0 },
  manualPct: { type: Number, default: 0 },
  total: Number,
  paid: Number,
  change: { type: Number, default: 0 },
  method: { type: String, enum: ['cash', 'card'], default: 'cash' },
  cashier: { type: ObjectId, ref: 'User' },
  cashierName: String,
}, { timestamps: true }));

const Counter = mongoose.model('Counter', new Schema({ key: { type: String, unique: true }, seq: { type: Number, default: 0 } }));

const AuditLog = mongoose.model('AuditLog', new Schema({
  at: { type: Date, default: Date.now, index: true },
  user: ObjectId,
  userName: String,
  action: String,
  entity: String,
  entityId: String,
  details: Schema.Types.Mixed,
  ip: String,
}));

module.exports = { Product, User, Session, Setting, Batch, StockMove, Promotion, Sale, Counter, AuditLog };
