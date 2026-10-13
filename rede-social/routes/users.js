const express = require('express');
const fs = require('fs');
const path = require('path');
const multer = require('multer');
const db = require('../db');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

const PHOTOS_DIR = path.join(__dirname, '..', 'uploads', 'photos');
const MAX_PHOTOS = 12;

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, PHOTOS_DIR),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname) || '.jpg';
    cb(null, `user${req.userId}-${Date.now()}${ext}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 8 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (!file.mimetype.startsWith('image/')) {
      return cb(new Error('Apenas arquivos de imagem são permitidos.'));
    }
    cb(null, true);
  },
});

function toPublicUser(user) {
  return {
    id: user.id,
    username: user.username,
    displayName: user.display_name,
    bio: user.bio,
    createdAt: user.created_at,
  };
}

function getPhotos(userId) {
  return db
    .prepare('SELECT id, filename, position FROM photos WHERE user_id = ? ORDER BY position ASC')
    .all(userId)
    .map((p) => ({ id: p.id, position: p.position, url: `/uploads/photos/${p.filename}` }));
}

function getCommunities(userId) {
  return db
    .prepare(
      `SELECT c.id, c.name, cm.role
       FROM community_members cm
       JOIN communities c ON c.id = cm.community_id
       WHERE cm.user_id = ?
       ORDER BY cm.joined_at DESC`,
    )
    .all(userId);
}

function getApprovedTestimonials(userId) {
  return db
    .prepare(
      `SELECT t.id, t.content, t.created_at AS createdAt, u.id AS authorId, u.display_name AS authorName
       FROM testimonials t
       JOIN users u ON u.id = t.author_id
       WHERE t.recipient_id = ? AND t.status = 'approved'
       ORDER BY t.created_at DESC`,
    )
    .all(userId);
}

router.get('/', (req, res) => {
  const users = db.prepare('SELECT * FROM users ORDER BY created_at DESC').all();
  res.json(
    users.map((u) => ({
      ...toPublicUser(u),
      photo: getPhotos(u.id)[0] || null,
    })),
  );
});

router.get('/:id', (req, res) => {
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.params.id);
  if (!user) {
    return res.status(404).json({ error: 'Usuário não encontrado.' });
  }
  res.json({
    ...toPublicUser(user),
    photos: getPhotos(user.id),
    communities: getCommunities(user.id),
    testimonials: getApprovedTestimonials(user.id),
  });
});

router.put('/me', requireAuth, (req, res) => {
  const { displayName, bio } = req.body || {};
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.userId);

  db.prepare('UPDATE users SET display_name = ?, bio = ? WHERE id = ?').run(
    displayName ?? user.display_name,
    bio ?? user.bio,
    req.userId,
  );

  const updated = db.prepare('SELECT * FROM users WHERE id = ?').get(req.userId);
  res.json(toPublicUser(updated));
});

router.post('/me/photos', requireAuth, upload.single('photo'), (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'Nenhuma imagem enviada.' });
  }

  const count = db
    .prepare('SELECT COUNT(*) AS total FROM photos WHERE user_id = ?')
    .get(req.userId).total;

  if (count >= MAX_PHOTOS) {
    fs.unlink(req.file.path, () => {});
    return res.status(400).json({ error: `Limite de ${MAX_PHOTOS} fotos atingido.` });
  }

  db.prepare('INSERT INTO photos (user_id, filename, position) VALUES (?, ?, ?)').run(
    req.userId,
    req.file.filename,
    count,
  );

  res.status(201).json({ photos: getPhotos(req.userId) });
});

router.delete('/me/photos/:photoId', requireAuth, (req, res) => {
  const photo = db
    .prepare('SELECT * FROM photos WHERE id = ? AND user_id = ?')
    .get(req.params.photoId, req.userId);

  if (!photo) {
    return res.status(404).json({ error: 'Foto não encontrada.' });
  }

  db.prepare('DELETE FROM photos WHERE id = ?').run(photo.id);
  fs.unlink(path.join(PHOTOS_DIR, photo.filename), () => {});

  res.json({ photos: getPhotos(req.userId) });
});

router.get('/me/testimonials/pending', requireAuth, (req, res) => {
  const pending = db
    .prepare(
      `SELECT t.id, t.content, t.created_at AS createdAt, u.id AS authorId, u.display_name AS authorName
       FROM testimonials t
       JOIN users u ON u.id = t.author_id
       WHERE t.recipient_id = ? AND t.status = 'pending'
       ORDER BY t.created_at DESC`,
    )
    .all(req.userId);

  res.json(pending);
});

router.post('/me/testimonials/:testimonialId/approve', requireAuth, (req, res) => {
  const testimonial = db
    .prepare('SELECT * FROM testimonials WHERE id = ? AND recipient_id = ?')
    .get(req.params.testimonialId, req.userId);

  if (!testimonial) {
    return res.status(404).json({ error: 'Depoimento não encontrado.' });
  }

  db.prepare("UPDATE testimonials SET status = 'approved' WHERE id = ?").run(testimonial.id);
  res.json({ ok: true });
});

router.post('/me/testimonials/:testimonialId/reject', requireAuth, (req, res) => {
  const testimonial = db
    .prepare('SELECT * FROM testimonials WHERE id = ? AND recipient_id = ?')
    .get(req.params.testimonialId, req.userId);

  if (!testimonial) {
    return res.status(404).json({ error: 'Depoimento não encontrado.' });
  }

  db.prepare('DELETE FROM testimonials WHERE id = ?').run(testimonial.id);
  res.json({ ok: true });
});

router.get('/me/feed', requireAuth, (req, res) => {
  const communityPosts = db
    .prepare(
      `SELECT p.id, p.content, p.created_at AS createdAt,
              u.id AS authorId, u.display_name AS authorName,
              c.id AS communityId, c.name AS communityName
       FROM community_posts p
       JOIN users u ON u.id = p.author_id
       JOIN communities c ON c.id = p.community_id
       WHERE p.community_id IN (
         SELECT community_id FROM community_members WHERE user_id = ?
       )
       ORDER BY p.created_at DESC
       LIMIT 20`,
    )
    .all(req.userId)
    .map((row) => ({ type: 'community_post', ...row }));

  const testimonials = db
    .prepare(
      `SELECT t.id, t.content, t.created_at AS createdAt, u.id AS authorId, u.display_name AS authorName
       FROM testimonials t
       JOIN users u ON u.id = t.author_id
       WHERE t.recipient_id = ? AND t.status = 'approved'
       ORDER BY t.created_at DESC
       LIMIT 20`,
    )
    .all(req.userId)
    .map((row) => ({ type: 'testimonial', ...row }));

  const feed = [...communityPosts, ...testimonials]
    .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))
    .slice(0, 20);

  res.json(feed);
});

router.post('/:id/testimonials', requireAuth, (req, res) => {
  const { content } = req.body || {};
  const recipientId = Number(req.params.id);

  if (!content || !content.trim()) {
    return res.status(400).json({ error: 'content é obrigatório.' });
  }

  if (recipientId === req.userId) {
    return res.status(400).json({ error: 'Você não pode escrever um depoimento para você mesmo.' });
  }

  const recipient = db.prepare('SELECT id FROM users WHERE id = ?').get(recipientId);
  if (!recipient) {
    return res.status(404).json({ error: 'Usuário não encontrado.' });
  }

  db.prepare(
    "INSERT INTO testimonials (author_id, recipient_id, content, status) VALUES (?, ?, ?, 'pending')",
  ).run(req.userId, recipientId, content.trim());

  res.status(201).json({ ok: true, message: 'Depoimento enviado e aguardando aprovação.' });
});

module.exports = router;
