const { Pool } = require('pg');
const postgresConnection = require('./postgresConnection');
const fs = require('fs');
const path = require('path');

async function conectarPostgreSQL() {
  const pool = new Pool(postgresConnection);
  return pool;
}

async function calcularDiferencaTempo(inicio, encerramento) {
  const diferencaEmMilissegundos = new Date(encerramento) - new Date(inicio);
  const diferencaEmMinutos = Math.round(diferencaEmMilissegundos / (1000 * 60));
  return diferencaEmMinutos;
}

function getLastRunTime() {
  const lastRunFilePath = path.join(__dirname, 'lastRun.json');
  if (fs.existsSync(lastRunFilePath)) {
    const data = fs.readFileSync(lastRunFilePath, 'utf8');
    const json = JSON.parse(data);
    return json.lastRun ? new Date(json.lastRun) : null;
  }
  return null;
}

async function testeBanco() {
  try {
    const pool = await conectarPostgreSQL();
    const query = 'SELECT * FROM "Contacts"';
    const result = await pool.query(query);
    await pool.end();
    return result.rows;
    
  } catch (error) {
    console.error(error);
    throw new Error("Erro ao conectar ao banco de dados Postgres.");
  }
}

async function consultaAtendimentosEncerrados(day, month, year) {
  const dataHoraAtual = new Date();
  console.log("Chegou na consulta de atendimentos encerrados às", dataHoraAtual);
  console.log(day, month, year);

  try {
    const pool = await conectarPostgreSQL();

    // Obter o horário da última execução (simula o lastRunTime)
    const lastRunTime = getLastRunTime(); // Certifique-se de que essa função está implementada

    const query = `
      SELECT
          T.id AS AGENDA_TICKET,
          M."createdAt",
          C.name AS CLIENTE_NOME,
          U.name AS USUARIO_NOME,
          CASE 
              WHEN COALESCE(M.body, '') = '' AND M."mediaType" <> 'chat' 
              THEN M."mediaUrl" ELSE M.body 
          END AS MENSAGEM,
          U.id AS USUARIO_CODIGO,
          U.name AS USUARIO_NOME,
          W.id,
          W.name AS CONEXAO,
          CASE 
              WHEN POSITION(' - ' IN C.name) > 0 
                AND SUBSTRING(C.name FROM POSITION(' - ' IN C.name) + 3) ~ '^[0-9]+$' 
              THEN SUBSTRING(C.name FROM POSITION(' - ' IN C.name) + 3)::INTEGER
              ELSE 0 
          END AS COD_CLI,
          C.number AS CEL_CLIENTE,
          W.number AS CEL_ATENDENTE,
          T."updatedAt" AS UPDATED_AT,
          TT."finishedAt" AS TICKET_ENCERRADO_EM
      FROM "Messages" M
      LEFT OUTER JOIN "Contacts" C ON C.id = M."contactId"
      LEFT OUTER JOIN "Tickets" T ON T.id = M."ticketId"
      LEFT OUTER JOIN "Users" U ON U.id = T."userId"
      LEFT OUTER JOIN "Whatsapps" W ON W.id = T."whatsappId"
      LEFT JOIN (
          SELECT DISTINCT ON ("ticketId") 
              "ticketId", 
              "finishedAt"
          FROM "TicketTraking"
          WHERE "finishedAt" IS NOT NULL
          ORDER BY "ticketId", "finishedAt" DESC
      ) TT ON TT."ticketId" = T.id
      WHERE 1 = 1
          AND T.status = 'closed'
          AND DATE(M."createdAt") = DATE($1 || '-' || $2 || '-' || $3)
          ${lastRunTime ? `AND M."createdAt" > '${lastRunTime.toISOString()}'` : ''}
      ORDER BY M."createdAt" ASC;
    `;

    console.log("Consulta SQL:", query);

    const result = await pool.query(query, [year, month, day]);

    const ticketsComDiferenca = result.rows.map((ticket) => {
      return {
        ...ticket,
        diferencaTempo: calcularDiferencaTempo(ticket.createdAt, ticket.updatedAt),
      };
    });

    await pool.end();
    console.log("Resultados encontrados:", ticketsComDiferenca);
    return ticketsComDiferenca;
  } catch (error) {
    console.error("Erro ao conectar ao banco de dados Postgres:", error.message);
    throw new Error("Erro ao conectar ao banco de dados Postgres.");
  }
}

module.exports = {
  calcularDiferencaTempo,
  testeBanco,
  consultaAtendimentosEncerrados,
};
