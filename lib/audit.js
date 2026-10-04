const { AuditLog } = require('../models');

async function audit(req, action, entity, entityId, details, who) {
  try {
    await AuditLog.create({
      user: req.user ? req.user._id : undefined,
      userName: who || (req.user ? req.user.username : ''),
      action, entity,
      entityId: entityId == null ? '' : String(entityId),
      details, ip: req.ip,
    });
  } catch (e) { console.error('audit:', e.message); }
}
module.exports = { audit };
