const { Pool } = require('pg');
const postgresConnection = require('./postgresConnection');
const fs = require('fs');
const path = require('path');

// Caminho para o arquivo JSON
const lastRunFilePath = path.join(__dirname, 'lastRun.json');

// Função para ler o horário da última execução
function getLastRunTime() {
  if (fs.existsSync(lastRunFilePath)) {
    const data = fs.readFileSync(lastRunFilePath, 'utf8');
    const json = JSON.parse(data);
    return json.lastRun ? new Date(json.lastRun) : null;
  }
  return null;
}

// Função para atualizar o horário da última execução
function updateLastRunTime() {
  const now = new Date();
  const offset = now.getTimezoneOffset() * 60000; // Deslocamento em milissegundos
  const localTime = new Date(now.getTime() - offset).toISOString(); // Ajusta para o horário local
  const data = { lastRun: localTime };
  fs.writeFileSync(lastRunFilePath, JSON.stringify(data, null, 2), 'utf8');
}

async function conectarPostgreSQL() {
  const pool = new Pool(postgresConnection);
  return pool;
}

async function testeBanco() {
  try {
    // Conexão com o banco de dados PostgreSQL
    const pool = await conectarPostgreSQL();
    const client = await pool.connect();
    const res = await client.query('SELECT * FROM contacts');
    //console.log("Resultado do SELECT (JSON):", JSON.stringify(res.rows, null, 2)); // Exibe o resultado como JSON formatado
    client.release();

    console.log("Encerrando o trabalho do arquivo consulta.js");
    return res.rows; // Retorna os resultados da consulta

  } catch (error) {
    console.error(error);
    throw new Error('Erro ao conectar ao banco de dados PostgreSQL.');
  }
}

async function consultacontacts(day, month, year, enviarUltimos300Caracteres = 'N') {
  try {
    const pool = await conectarPostgreSQL();
    const client = await pool.connect();

    const query = `
      WITH ultimos_fechamentos AS (
        SELECT
          "ticketId",
          MAX("finishedAt") AS ultimo_fechamento
        FROM "TicketTraking"
        WHERE DATE("finishedAt") = DATE($1 || '-' || $2 || '-' || $3)
        GROUP BY "ticketId"
      ),
      penultimos_fechamentos AS (
        SELECT
          t1."ticketId",
          MAX(t1."finishedAt") AS penultimo_fechamento
        FROM "TicketTraking" t1
        JOIN ultimos_fechamentos t2
          ON t1."ticketId" = t2."ticketId"
         AND t1."finishedAt" < t2.ultimo_fechamento
        GROUP BY t1."ticketId"
      ),
      fechamentos_hoje AS (
        SELECT
          u."ticketId",
          p.penultimo_fechamento,
          u.ultimo_fechamento
        FROM ultimos_fechamentos u
        JOIN penultimos_fechamentos p ON u."ticketId" = p."ticketId"
      )
      SELECT
        T.id AS AGENDA_TICKET,
        M."createdAt" AS "createdAt", -- Adicionado alias para garantir o nome correto
        C.name AS CLIENTE_NOME,
        U.name AS USUARIO_NOME,
        CASE 
          WHEN COALESCE(M.body, '') = '' AND M."mediaType" <> 'chat' 
          THEN M."mediaUrl" ELSE M.body 
        END AS MENSAGEM,
        U.id AS USUARIO_CODIGO,
        W.id AS WHATSAPP_ID,
        W.name AS CONEXAO,
        CASE 
          WHEN POSITION(' - ' IN C.name) > 0 
            AND SUBSTRING(C.name FROM POSITION(' - ' IN C.name) + 3) ~ '^[0-9]+$' 
          THEN SUBSTRING(C.name FROM POSITION(' - ' IN C.name) + 3)::INTEGER
          ELSE 0 
        END AS COD_CLI,
        C.number AS CEL_CLIENTE,
        W.number AS CEL_ATENDENTE,
        f.penultimo_fechamento,
        f.ultimo_fechamento
      FROM "Messages" M
      JOIN fechamentos_hoje f ON M."ticketId" = f."ticketId"
      LEFT OUTER JOIN "Contacts" C ON C.id = M."contactId"
      LEFT OUTER JOIN "Tickets" T ON T.id = M."ticketId"
      LEFT OUTER JOIN "Users" U ON U.id = T."userId"
      LEFT OUTER JOIN "Whatsapps" W ON W.id = T."whatsappId"
      WHERE M."createdAt" > f.penultimo_fechamento
        AND M."createdAt" <= f.ultimo_fechamento
      ORDER BY M."createdAt" ASC;
    `;

    const res = await client.query(query, [year, month, day]);

    const groupedResults = res.rows.reduce((acc, row) => {
      const ticketId = row.agenda_ticket;

      if (!acc[ticketId]) {
        acc[ticketId] = {
          agenda_ticket: ticketId,
          createdAt: row.createdAt, // Agora acessa o campo com o nome correto
          cliente_nome: row.cliente_nome,
          usuario_nome: row.usuario_nome,
          usuario_codigo: row.usuario_codigo,
          conexao: row.conexao,
          cod_cli: row.cod_cli,
          cel_cliente: row.cel_cliente,
          cel_atendente: row.cel_atendente,
          mensagens: [],
          penultimo_fechamento: row.penultimo_fechamento,
          ultimo_fechamento: row.ultimo_fechamento
        };
      }

      acc[ticketId].mensagens.push(
        row.mensagem
          ? (enviarUltimos300Caracteres === 'N'
              ? row.mensagem.slice(-300) // Pega os últimos 300 caracteres
              : row.mensagem) // Envia a mensagem completa
          : 'Mensagem não disponível' // Valor padrão para mensagens indefinidas
      );

      return acc;
    }, {});

    const resultArray = Object.values(groupedResults);

    client.release();

    // Adicionando o log do JSON gerado
    console.log("JSON gerado:", JSON.stringify(resultArray, null, 2)); // Exibe o JSON formatado no console

    console.log(`Total de agendas lidas: ${resultArray.length}`);
    return resultArray;

  } catch (error) {
    console.error(error);
    throw new Error('Erro ao conectar ao banco de dados PostgreSQL.');
  }
}

async function consultacontactsRTM(day, month, year) {
  console.log("Chegou no consultacontactsRTM");
  console.log(day, month, year);

  try {
    // Conexão com o banco de dados PostgreSQL
    const pool = await conectarPostgreSQL();
    const client = await pool.connect();
    const res = await client.query(`
      SELECT
      T.id AS AGENDA_TICKET,
      M."createdAt", 
      C.name AS CLIENTE_NOME,
      U.name AS USUARIO_NOME,
      CASE WHEN COALESCE(M.body, '') = '' AND M."mediaType" <> 'chat' THEN M."mediaUrl" ELSE M.body END AS MENSAGEM,
      U.id AS USUARIO_CODIGO,
      U.name AS USUARIO_NOME,
      W.id,
      W.name AS CONEXAO,
      CASE WHEN POSITION(' - ' IN C.name) > 0 THEN SUBSTRING(C.name FROM POSITION(' - ' IN C.name) + 3) ELSE '0' END::INTEGER AS COD_CLI,
      C.number AS CEL_CLIENTE,
      W.number AS CEL_ATENDENTE 
      FROM "Messages" M
      LEFT OUTER JOIN "Contacts" C ON C.id = M."contactId"
      LEFT OUTER JOIN "Tickets" T ON T.id = M."ticketId"
      LEFT OUTER JOIN "Users" U ON U.id = T."userId"
      LEFT OUTER JOIN "Whatsapps" W ON W.id = T."whatsappId"
      WHERE 1 = 1
      AND EXTRACT(DAY FROM M."createdAt") = $1
      AND EXTRACT(MONTH FROM M."createdAt") = $2
      AND EXTRACT(YEAR FROM M."createdAt") = $3
      AND T.status = 'closed'
    `, [day, month, year]);
    client.release();

    console.log("Encerrando o trabalho do arquivo consulta.js");
    return res.rows; // Retorna os resultados da consulta

  } catch (error) {
    console.error(error);
    throw new Error('Erro ao conectar ao banco de dados PostgreSQL.');
  }
}

// Função para calcular a diferença de tempo em horas, minutos e segundos
function calcularDiferencaTempo(dataInicio, dataFim) {
  const inicio = new Date(dataInicio);
  const fim = new Date(dataFim);
  const diferencaMs = fim - inicio;

  const horas = Math.floor(diferencaMs / (1000 * 60 * 60));
  const minutos = Math.floor((diferencaMs % (1000 * 60 * 60)) / (1000 * 60));
  const segundos = Math.floor((diferencaMs % (1000 * 60)) / 1000);

  return `${horas}h ${minutos}m ${segundos}s`;
}

module.exports = {
  testeBanco,
  consultacontacts,
  consultacontactsRTM
};
