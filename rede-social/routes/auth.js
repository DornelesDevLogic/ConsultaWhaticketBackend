const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const db = require('../db');
const { JWT_SECRET } = require('../middleware/auth');

const router = express.Router();

function toPublicUser(user) {
  return {
    id: user.id,
    username: user.username,
    email: user.email,
    displayName: user.display_name,
    bio: user.bio,
    createdAt: user.created_at,
  };
}

router.post('/register', (req, res) => {
  const { username, email, password, displayName } = req.body || {};

  if (!username || !email || !password || !displayName) {
    return res.status(400).json({ error: 'username, email, password e displayName são obrigatórios.' });
  }

  const existing = db
    .prepare('SELECT id FROM users WHERE username = ? OR email = ?')
    .get(username, email);

  if (existing) {
    return res.status(409).json({ error: 'Usuário ou email já cadastrado.' });
  }

  const passwordHash = bcrypt.hashSync(password, 10);

  const result = db
    .prepare(
      'INSERT INTO users (username, email, password_hash, display_name, bio) VALUES (?, ?, ?, ?, ?)',
    )
    .run(username, email, passwordHash, displayName, '');

  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(result.lastInsertRowid);
  const token = jwt.sign({ userId: user.id }, JWT_SECRET, { expiresIn: '30d' });

  res.status(201).json({ token, user: toPublicUser(user) });
});

router.post('/login', (req, res) => {
  const { username, password } = req.body || {};

  if (!username || !password) {
    return res.status(400).json({ error: 'username e password são obrigatórios.' });
  }

  const user = db
    .prepare('SELECT * FROM users WHERE username = ? OR email = ?')
    .get(username, username);

  if (!user || !bcrypt.compareSync(password, user.password_hash)) {
    return res.status(401).json({ error: 'Usuário ou senha inválidos.' });
  }

  const token = jwt.sign({ userId: user.id }, JWT_SECRET, { expiresIn: '30d' });

  res.json({ token, user: toPublicUser(user) });
});

module.exports = router;
