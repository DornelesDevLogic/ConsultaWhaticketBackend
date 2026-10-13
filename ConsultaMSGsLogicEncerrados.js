const { Pool } = require('pg');
const postgresConnection = require('./postgresConnection');

async function consultaTicketsEncerrados({ dataInicio, dataFim }) {
  const pool = new Pool(postgresConnection);
  const client = await pool.connect();

  let query = `
    SELECT 
      tt.*,
      u."name" AS tecnico
    FROM 
      "TicketTraking" tt
    JOIN 
      "Users" u ON tt."userId" = u."id"
    WHERE 1=1
  `;
  const params = [];

  if (dataInicio) {
    params.push(dataInicio);
    query += ` AND tt."finishedAt"::date >= $${params.length}`;
  }
  if (dataFim) {
    params.push(dataFim);
    query += ` AND tt."finishedAt"::date <= $${params.length}`;
  }
  if (!dataInicio && !dataFim) {
    query += ` AND tt."finishedAt"::date = CURRENT_DATE`;
  }

  try {
    const result = await client.query(query, params);
    client.release();
    return result.rows;
  } catch (error) {
    client.release();
    throw error;
  }
}

async function consultaTicketsEncerradosAgrupado({ dataInicio, dataFim }) {
  const pool = new Pool(postgresConnection);
  const client = await pool.connect();

  let query = `
    SELECT 
      u."name" AS tecnico,
      COUNT(*) AS tickets_encerrados
    FROM 
      "TicketTraking" tt
    JOIN 
      "Users" u ON tt."userId" = u."id"
    WHERE 1=1
  `;
  const params = [];

  if (dataInicio) {
    params.push(dataInicio);
    query += ` AND tt."finishedAt"::date >= $${params.length}`;
  }
  if (dataFim) {
    params.push(dataFim);
    query += ` AND tt."finishedAt"::date <= $${params.length}`;
  }
  if (!dataInicio && !dataFim) {
    query += ` AND tt."finishedAt"::date = CURRENT_DATE`;
  }

  query += ` GROUP BY u."name" ORDER BY tickets_encerrados DESC`;

  try {
    const result = await client.query(query, params);
    client.release();
    return result.rows;
  } catch (error) {
    client.release();
    throw error;
  }
}

module.exports = {
  consultaTicketsEncerradosAgrupado,
};