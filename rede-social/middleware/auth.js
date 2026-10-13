const jwt = require('jsonwebtoken');

// A chave NÃO pode ficar no código: defina JWT_SECRET no ambiente (ex.: JWT_SECRET=uma-chave-longa-e-aleatoria)
const JWT_SECRET = process.env.JWT_SECRET;

if (!JWT_SECRET) {
  throw new Error('JWT_SECRET não definido. Defina a variável de ambiente JWT_SECRET antes de iniciar a rede-social.');
}

function requireAuth(req, res, next) {
  const header = req.headers.authorization || '';
  const [, token] = header.split(' ');

  if (!token) {
    return res.status(401).json({ error: 'Token não informado.' });
  }

  try {
    const payload = jwt.verify(token, JWT_SECRET);
    req.userId = payload.userId;
    next();
  } catch (error) {
    return res.status(401).json({ error: 'Token inválido ou expirado.' });
  }
}

module.exports = { requireAuth, JWT_SECRET };
