const { Pool } = require('pg');
const postgresConnection = require('./postgresConnection');

// Cria um único pool
const pool = new Pool(postgresConnection);

// Captura erro inesperado de conexão
pool.on('error', (err) => {
  console.error('Erro inesperado no pool de conexões', err);
  process.exit(-1);
});

module.exports = pool;
