const path = require('path');
const express = require('express');
const cors = require('cors');

const authRoutes = require('./routes/auth');
const usersRoutes = require('./routes/users');
const communitiesRoutes = require('./routes/communities');

const app = express();
const port = process.env.PORT || 5050;

app.use(cors());
app.use(express.json());
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

app.use('/api/auth', authRoutes);
app.use('/api/users', usersRoutes);
app.use('/api/communities', communitiesRoutes);

app.use((err, req, res, next) => {
  console.error('Erro na Rede Social:', err.message);
  res.status(500).json({ error: err.message || 'Erro interno.' });
});

app.listen(port, () => {
  console.log(`Rede Social (backend de teste) rodando na porta ${port}`);
});
