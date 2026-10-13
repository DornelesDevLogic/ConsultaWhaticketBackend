const { Pool } = require('pg');
const postgresConnection = require('./postgresConnection');

async function conectarPostgreSQL() {
  const pool = new Pool(postgresConnection);
  return pool;
}

async function consultaAtendimentosDiarios(day, month, year) {
  const dataHoraAtual = new Date();
  console.log("Chegou no consultaAtendimentosDiarios as", dataHoraAtual)
  console.log(day, month, year)

  try {
    const pool = await conectarPostgreSQL();
    const client = await pool.connect();

    const query = `
      SELECT
        U.name AS "userName",
        COUNT(HT.id) AS "totalMessages"
      FROM "HistoricTickets" HT
      LEFT OUTER JOIN "Users" U ON HT."userId" = U.id
      WHERE
        HT."lastMessage" LIKE '%🢅%'
        AND EXTRACT(DAY FROM HT."updatedAt") = $1
        AND EXTRACT(MONTH FROM HT."updatedAt") = $2
        AND EXTRACT(YEAR FROM HT."updatedAt") = $3
      GROUP BY U.name
      ORDER BY "totalMessages" DESC;
    `;

    const result = await client.query(query, [day, month, year]);
    client.release();

    return result.rows;
  } catch (error) {
    console.error(error);
    throw new Error('Erro ao conectar ao banco de dados PostgreSQL.');
  }
}

module.exports = {
  consultaAtendimentosDiarios
};



