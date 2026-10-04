const router = require('express').Router();
const backup = require('../lib/backup');
const { requireAuth } = require('../lib/auth');
const { audit } = require('../lib/audit');
const { wrap, httpErr } = require('../lib/util');

router.use(requireAuth('owner'), (req, res, next) => {
  if (process.env.VERCEL) return res.status(501).json({ error: 'E_BACKUP_UNAVAILABLE' });
  next();
});

router.get('/', (req, res) => res.json({ dir: backup.DIR, files: backup.list() }));

router.post('/', wrap(async (req, res) => {
  const name = await backup.createBackup('manual');
  await audit(req, 'backup_create', 'backup', name, {});
  res.status(201).json({ name });
}));

router.get('/:name/download', (req, res) => {
  const p = backup.filePath(req.params.name);
  if (!p) return res.status(404).json({ error: 'E_NOT_FOUND' });
  res.download(p);
});

router.post('/:name/restore', wrap(async (req, res) => {
  if (!backup.filePath(req.params.name)) throw httpErr(404, 'E_NOT_FOUND');
  if (req.body.confirm !== 'RESTORE') throw httpErr(400, 'E_INVALID');
  const pre = await backup.createBackup('before-restore');
  await backup.restoreBackup(req.params.name);
  console.log('Барқарорсозӣ аз', req.params.name, '(нусхаи пешина:', pre + ')');
  res.json({ ok: true, previous: pre });
}));

module.exports = router;
