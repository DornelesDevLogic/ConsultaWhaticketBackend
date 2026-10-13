const express = require('express');
const fs = require('fs');
const path = require('path');
const multer = require('multer');
const db = require('../db');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

const PHOTOS_DIR = path.join(__dirname, '..', 'uploads', 'communities');

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, PHOTOS_DIR),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname) || '.jpg';
    cb(null, `community${req.params.id}-${Date.now()}${ext}`);
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

function memberCount(communityId) {
  return db
    .prepare('SELECT COUNT(*) AS total FROM community_members WHERE community_id = ?')
    .get(communityId).total;
}

function toPublicCommunity(community) {
  return {
    id: community.id,
    name: community.name,
    description: community.description,
    category: community.category,
    ownerId: community.owner_id,
    createdAt: community.created_at,
    membersCount: memberCount(community.id),
    photoUrl: community.photo_filename ? `/uploads/communities/${community.photo_filename}` : null,
  };
}

router.get('/', (req, res) => {
  const { search } = req.query;
  let communities;

  if (search) {
    communities = db
      .prepare('SELECT * FROM communities WHERE name LIKE ? ORDER BY created_at DESC')
      .all(`%${search}%`);
  } else {
    communities = db.prepare('SELECT * FROM communities ORDER BY created_at DESC').all();
  }

  res.json(communities.map(toPublicCommunity));
});

router.post('/', requireAuth, (req, res) => {
  const { name, description, category } = req.body || {};

  if (!name) {
    return res.status(400).json({ error: 'name é obrigatório.' });
  }

  const result = db
    .prepare('INSERT INTO communities (name, description, category, owner_id) VALUES (?, ?, ?, ?)')
    .run(name, description || '', category || '', req.userId);

  db.prepare('INSERT INTO community_members (community_id, user_id, role) VALUES (?, ?, ?)').run(
    result.lastInsertRowid,
    req.userId,
    'owner',
  );

  const community = db.prepare('SELECT * FROM communities WHERE id = ?').get(result.lastInsertRowid);
  res.status(201).json(toPublicCommunity(community));
});

router.get('/:id', (req, res) => {
  const community = db.prepare('SELECT * FROM communities WHERE id = ?').get(req.params.id);

  if (!community) {
    return res.status(404).json({ error: 'Comunidade não encontrada.' });
  }

  const members = db
    .prepare(
      `SELECT u.id, u.username, u.display_name AS displayName, cm.role
       FROM community_members cm
       JOIN users u ON u.id = cm.user_id
       WHERE cm.community_id = ?
       ORDER BY cm.joined_at ASC`,
    )
    .all(community.id)
    .map((member) => {
      const photo = db
        .prepare('SELECT filename FROM photos WHERE user_id = ? ORDER BY position ASC LIMIT 1')
        .get(member.id);
      return {
        ...member,
        photoUrl: photo ? `/uploads/photos/${photo.filename}` : null,
      };
    });

  res.json({ ...toPublicCommunity(community), members });
});

router.post('/:id/photo', requireAuth, upload.single('photo'), (req, res) => {
  const community = db.prepare('SELECT * FROM communities WHERE id = ?').get(req.params.id);

  if (!community) {
    if (req.file) fs.unlink(req.file.path, () => {});
    return res.status(404).json({ error: 'Comunidade não encontrada.' });
  }

  if (community.owner_id !== req.userId) {
    if (req.file) fs.unlink(req.file.path, () => {});
    return res.status(403).json({ error: 'Só o criador da comunidade pode alterar a foto.' });
  }

  if (!req.file) {
    return res.status(400).json({ error: 'Nenhuma imagem enviada.' });
  }

  if (community.photo_filename) {
    fs.unlink(path.join(PHOTOS_DIR, community.photo_filename), () => {});
  }

  db.prepare('UPDATE communities SET photo_filename = ? WHERE id = ?').run(
    req.file.filename,
    community.id,
  );

  const updated = db.prepare('SELECT * FROM communities WHERE id = ?').get(community.id);
  res.json(toPublicCommunity(updated));
});

router.post('/:id/join', requireAuth, (req, res) => {
  const community = db.prepare('SELECT * FROM communities WHERE id = ?').get(req.params.id);
  if (!community) {
    return res.status(404).json({ error: 'Comunidade não encontrada.' });
  }

  const existing = db
    .prepare('SELECT * FROM community_members WHERE community_id = ? AND user_id = ?')
    .get(community.id, req.userId);

  if (!existing) {
    db.prepare('INSERT INTO community_members (community_id, user_id, role) VALUES (?, ?, ?)').run(
      community.id,
      req.userId,
      'member',
    );
  }

  res.json(toPublicCommunity(community));
});

router.post('/:id/leave', requireAuth, (req, res) => {
  const community = db.prepare('SELECT * FROM communities WHERE id = ?').get(req.params.id);
  if (!community) {
    return res.status(404).json({ error: 'Comunidade não encontrada.' });
  }

  if (community.owner_id === req.userId) {
    return res.status(400).json({ error: 'O criador não pode saír da própria comunidade.' });
  }

  db.prepare('DELETE FROM community_members WHERE community_id = ? AND user_id = ?').run(
    community.id,
    req.userId,
  );

  res.json(toPublicCommunity(community));
});

router.get('/:id/posts', (req, res) => {
  const posts = db
    .prepare(
      `SELECT p.id, p.content, p.created_at AS createdAt, u.id AS authorId, u.display_name AS authorName
       FROM community_posts p
       JOIN users u ON u.id = p.author_id
       WHERE p.community_id = ?
       ORDER BY p.created_at DESC`,
    )
    .all(req.params.id);

  res.json(posts);
});

router.post('/:id/posts', requireAuth, (req, res) => {
  const { content } = req.body || {};

  if (!content || !content.trim()) {
    return res.status(400).json({ error: 'content é obrigatório.' });
  }

  const community = db.prepare('SELECT * FROM communities WHERE id = ?').get(req.params.id);
  if (!community) {
    return res.status(404).json({ error: 'Comunidade não encontrada.' });
  }

  const result = db
    .prepare('INSERT INTO community_posts (community_id, author_id, content) VALUES (?, ?, ?)')
    .run(community.id, req.userId, content.trim());

  const post = db
    .prepare(
      `SELECT p.id, p.content, p.created_at AS createdAt, u.id AS authorId, u.display_name AS authorName
       FROM community_posts p
       JOIN users u ON u.id = p.author_id
       WHERE p.id = ?`,
    )
    .get(result.lastInsertRowid);

  res.status(201).json(post);
});

module.exports = router;
