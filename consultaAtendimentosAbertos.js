const { Pool } = require('pg');
const postgresConnection = require('./postgresConnection');

async function conectarPostgreSQL() {
  const pool = new Pool({
    ...postgresConnection,
    connectionTimeoutMillis: 5000,
    idleTimeoutMillis: 30000,
    max: 10
  });
  
  // Tratar erros de conexão
  pool.on('error', (err) => {
    console.error('Erro no pool de conexões PostgreSQL:', err);
  });
  
  return pool;
}


async function consultaAtendimentosAbertos() {
  const dataHoraAtual = new Date();
  console.log("Chegou na consulta de Atendimentos em andamento  às", dataHoraAtual);
  console.log("Arquivo  consultaAtendimentosAbertos.js");

  try {
    // Conexão com o banco de dados PostgreSQL
    const pool = await conectarPostgreSQL();
    
    // Executar a consulta SQL
    const result = await pool.query(`
      SELECT "Tickets".*, "Users".name AS "UserName", "Contacts".name AS "ClientName", 
             "Messages".body AS "Message", "Messages"."updatedAt" AS "HorarioMensagem"
      FROM "Tickets"
      JOIN "Users" ON "Tickets"."userId" = "Users".id
      JOIN "Contacts" ON "Tickets"."contactId" = "Contacts".id
      LEFT JOIN "Messages" ON "Tickets".id = "Messages"."ticketId"
      WHERE "Tickets".status = 'open'
      ORDER BY "HorarioMensagem";
    `);

    await pool.end(); // Encerrar a conexão com o pool

    return result.rows; // Retorna os resultados da consulta
  } catch (error) {
    console.error('Erro em consultaAtendimentosAbertos:', error.message);
    return []; // Retorna array vazio em caso de erro
  }
}

async function consultaAtendimentosAbertosHoje() {
  const dataHoraAtual = new Date();
  console.log("Chegou na consulta de Atendimentos em andamento de hoje às", dataHoraAtual);
  console.log("Arquivo consultaAtendimentosAbertos.js");

  try {
    // Conexão com o banco de dados PostgreSQL
    const pool = await conectarPostgreSQL();

    // Executar a consulta SQL para tickets abertos agrupados por técnico
    const result = await pool.query(`
      SELECT "Users".name AS "UserName",
             COUNT("Tickets".id) AS "totalChamados",
             STRING_AGG("Contacts".name, ', ') AS "clientesAtendendo"
      FROM "Tickets"
      JOIN "Users" ON "Tickets"."userId" = "Users".id
      JOIN "Contacts" ON "Tickets"."contactId" = "Contacts".id
      WHERE "Tickets".status = 'open'
      GROUP BY "Users".id, "Users".name
      ORDER BY "totalChamados" DESC;
    `);

    await pool.end(); // Encerrar a conexão com o pool

    return result.rows; // Retorna os resultados da consulta
  } catch (error) {
    console.error('Erro em consultaAtendimentosAbertosHoje:', error.message);
    return []; // Retorna array vazio em caso de erro
  }
}

module.exports = {
  consultaAtendimentosAbertos,
  consultaAtendimentosAbertosHoje,
};
