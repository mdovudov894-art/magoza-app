const mongoose = require('mongoose');

const ProductSchema = new mongoose.Schema(
  {
    barcode: { type: String, required: true, unique: true, trim: true },
    plu: { type: String, trim: true, unique: true, sparse: true }, // рамзи маҳсулоти вазнӣ (барои баркоди тарозу)
    name: { type: String, required: true, trim: true },
    price: { type: Number, required: true, min: 0 },
    cost: { type: Number, default: 0, min: 0 }, // нархи харид
    unit: { type: String, default: 'pcs' },
    category: { type: String, default: '', trim: true },
    note: { type: String, default: '', trim: true },
    photo: { type: String, default: '' },
    minStock: { type: Number, default: 0, min: 0 },
    trackStock: { type: Boolean, default: false },
    stock: { type: Number, default: 0 },
  },
  { timestamps: true }
);

module.exports = mongoose.model('Product', ProductSchema);
