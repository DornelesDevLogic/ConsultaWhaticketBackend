const { Pool } = require('pg');
const postgresConnection = require('./postgresConnection');

async function conectarPostgreSQL() {
  const pool = new Pool(postgresConnection);
  return pool;
}

async function consultaAtendimentosPendentes() {
  // Log com data e hora da requisição
  const dataHoraRequisicao = new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' });
  console.log(`[consultaAtendimentosPendentes] Consulta realizada em: ${dataHoraRequisicao}`);

  try {
    const pool = await conectarPostgreSQL();
    const query = `
      SELECT
        ROW_NUMBER() OVER (PARTITION BY (2) ORDER BY T."createdAt") n,
        COALESCE(
          (SELECT c.Name FROM "Contacts" c WHERE c.id = (SELECT m."contactId" FROM "Messages" m WHERE m."ticketId" = t.id ORDER BY m."updatedAt" DESC LIMIT 1)),
          (SELECT c.Name FROM "Contacts" c WHERE T."contactId" = c."id")
        ) AS Remetente,
        LPAD(CAST(LOCALTIMESTAMP::date - T."updatedAt"::date AS VARCHAR(2)), 2, '0') || 'd ' ||
        LPAD(CAST(ABS(DATE_PART('HOUR', T."updatedAt") - DATE_PART('HOUR', LOCALTIMESTAMP)) AS VARCHAR(2)), 2, '0') || 'h ' ||
        LPAD(CAST(ABS(DATE_PART('MINUTE', T."updatedAt") - DATE_PART('MINUTE', LOCALTIMESTAMP)) AS VARCHAR(2)), 2, '0') || 'm ' ||
        LPAD(REPLACE(CAST(ABS(DATE_PART('SECOND', T."updatedAt") - DATE_PART('SECOND', LOCALTIMESTAMP)) AS VARCHAR(2)), '.', ''), 2, '0') || 's ' AS esperando,
        CASE WHEN (T."isGroup" = true) THEN CONCAT('Grupo: ', C.name) ELSE 'Individual' END AS origem,
        CASE WHEN (LENGTH(C.number) = 18) THEN 'Grupo' ELSE C.number END AS numero,
        COALESCE(Q.name, 'Sem Fila') AS fila,
        W.name AS conexao,
        COALESCE(
          COALESCE(
            (SELECT CAST(w.number AS TEXT) FROM "Whatsapps" w WHERE w.id = (SELECT u."whatsappId" FROM "Users" u WHERE u.id = t."userId")),
            CAST('invalid user:' || t."userId" AS TEXT)
          ),
          'Sem atendente'
        ) AS conexao_num,
        T.id AS ticket,
        CAST(T."updatedAt" AS TIMESTAMP) AS ult_upd,
        T."lastMessage" AS ult_msg,
        CAST(T."createdAt" AS TIMESTAMP) AS tempo_t,
        LOCALTIMESTAMP AS Upd,
        LPAD(CAST(LOCALTIMESTAMP::date - T."createdAt"::date AS VARCHAR(2)), 2, '0') AS tempo_dtt_days,
        LPAD(CAST(ABS(DATE_PART('HOUR', T."createdAt") - DATE_PART('HOUR', LOCALTIMESTAMP)) AS VARCHAR(2)), 2, '0') AS tempo_dtt_hours,
        LPAD(CAST(ABS(DATE_PART('MINUTE', T."createdAt") - DATE_PART('MINUTE', LOCALTIMESTAMP)) AS VARCHAR(2)), 2, '0') AS tempo_dtt_minutes,
        LPAD(REPLACE(CAST(ABS(DATE_PART('SECOND', T."createdAt") - DATE_PART('SECOND', LOCALTIMESTAMP)) AS VARCHAR(2)), '.', ''), 2, '0') AS tempo_dtt_seconds,
        T."createdAt",
        T."status"
      FROM "Tickets" T
      LEFT OUTER JOIN "Contacts" C ON C."id" = T."contactId"
      LEFT OUTER JOIN "Users" U ON U."id" = T."userId"
      LEFT OUTER JOIN "Queues" Q ON Q."id" = T."queueId"
      LEFT OUTER JOIN "Whatsapps" W ON W."id" = T."whatsappId"
      WHERE 1 = 1
        AND T.status = 'pending'
        AND NOT C.name IN ('Grupo de Help Desk Suporte!', 'Grupo Suporte Logicbox', 'Programação Logicbox', 'Logicbox - Voip', 'Grupo Logicbox / Scanntech')
        AND NOT (
          (C.number = '555130763310') AND (Q.name = 'Programação') AND (W.name = 'Robô-3310')
        )
      ORDER BY T."createdAt", T."updatedAt";
    `;

    const result = await pool.query(query);
    await pool.end();

    console.log("Consulta de atendimentos pendentes concluída.");
    return result.rows; // Retorna os resultados da consulta
  } catch (error) {
    console.error("Erro ao consultar atendimentos pendentes:", error.message);
    throw new Error("Erro ao conectar ao banco de dados Postgres.");
  }
}

module.exports = {
  consultaAtendimentosPendentes,
};