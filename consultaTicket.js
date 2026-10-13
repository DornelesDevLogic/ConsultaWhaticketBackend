const { Pool } = require('pg');
const postgresConnection = require('./postgresConnection');

async function conectarPostgreSQL() {
  const pool = new Pool(postgresConnection);
  return pool;
}

async function consultaTicket(idticket) {
  const dataHoraAtual = new Date();
  console.log("Chegou na consulta do ticket as", dataHoraAtual);
  console.log("Numero do ticket", idticket);

  try {
    const pool = await conectarPostgreSQL();
    const result = await pool.query(
      `
      SELECT
        c.name AS cliente,
        u.name AS atendente,
        m.body AS "lastMessage",
        m."createdAt",
        m."updatedAt",
        t.status
      FROM "Messages" m
      JOIN "Tickets" t ON t.id = m."ticketId"
      LEFT JOIN "Users" u ON u.id = t."userId"
      LEFT JOIN "Contacts" c ON c.id = t."contactId"
      WHERE m."ticketId" = $1
      ORDER BY m."createdAt"
      `,
      [idticket],
    );
    await pool.end();

    return result.rows;
  } catch (error) {
    console.error(error);
    throw new Error('Erro ao conectar ao banco de dados PostgreSQL.');
  }
}

module.exports = {
  consultaTicket,
};
