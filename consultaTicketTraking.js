const { Pool } = require('pg');
const postgresConnection = require('./postgresConnection');

async function conectarPostgreSQL() {
  const pool = new Pool(postgresConnection);
  return pool;
}

// Histórico de aceite/finalização de um ticket específico (tabela TicketTraking),
// indicando se o atendente respondeu (enviou alguma mensagem) durante o período em que
// ficou com o ticket. Ausência de resposta é um forte indício de "pegou e devolveu pra fila".
async function consultaTrakingPorTicket(idticket) {
  try {
    const pool = await conectarPostgreSQL();
    const result = await pool.query(
      `
      SELECT
        tt.id,
        u.name AS atendente,
        tt."createdAt",
        tt."startedAt",
        tt."finishedAt",
        tt."queuedAt",
        tt."ratingAt",
        tt.rated,
        CASE
          WHEN tt."startedAt" IS NOT NULL AND tt."finishedAt" IS NOT NULL
          THEN EXTRACT(EPOCH FROM (tt."finishedAt" - tt."startedAt"))
          ELSE NULL
        END AS "duracaoSegundos",
        CASE
          WHEN tt."startedAt" IS NULL OR tt."finishedAt" IS NULL THEN NULL
          ELSE EXISTS (
            SELECT 1 FROM "Messages" m
            WHERE m."ticketId" = tt."ticketId"
              AND m."fromMe" = true
              AND m."createdAt" BETWEEN tt."startedAt" AND tt."finishedAt"
          )
        END AS respondeu
      FROM "TicketTraking" tt
      LEFT JOIN "Users" u ON u.id = tt."userId"
      WHERE tt."ticketId" = $1
      ORDER BY tt."createdAt"
      `,
      [idticket],
    );
    await pool.end();
    return result.rows;
  } catch (error) {
    console.error(error);
    throw new Error('Erro ao consultar TicketTraking no PostgreSQL.');
  }
}

// Cache simples em memória (a consulta é pesada; este é um painel de checagem
// eventual, não precisa ser em tempo real). TTL de 10 minutos por combinação de filtros.
const CACHE_TTL_MS = 10 * 60 * 1000;
const rankingCache = new Map();

// Ranking de atendentes que mais aceitam e devolvem tickets pra fila sem responder,
// dentro de uma janela de dias. `duracaoMaximaSegundos` (opcional) restringe a contagem
// de "devolvidos" apenas aos casos de retorno rápido (evita falsos positivos de quem
// resolveu por outro canal e só fechou o ticket depois).
//
// Observação de performance: usar duas consultas simples (com NOT EXISTS na cláusula
// WHERE) é bem mais rápido do que uma única consulta com COUNT(*) FILTER (...) —
// o Postgres avalia mal o FILTER com subquery correlacionada nesse caso (~30s vs ~1s).
async function consultaRankingDevolucoes(dias = 30, duracaoMaximaSegundos = null) {
  const chave = `${dias}:${duracaoMaximaSegundos}`;
  const cacheado = rankingCache.get(chave);
  if (cacheado && Date.now() - cacheado.timestamp < CACHE_TTL_MS) {
    return cacheado.dados;
  }

  try {
    const pool = await conectarPostgreSQL();

    const filtroDuracao = duracaoMaximaSegundos
      ? `AND EXTRACT(EPOCH FROM (tt."finishedAt" - tt."startedAt")) <= ${Number(duracaoMaximaSegundos)}`
      : '';

    const [totais, devolvidos] = await Promise.all([
      pool.query(`
        SELECT u.name AS atendente, COUNT(*) AS total
        FROM "TicketTraking" tt
        JOIN "Users" u ON u.id = tt."userId"
        WHERE tt."createdAt" >= NOW() - INTERVAL '${Number(dias)} days'
          AND tt."startedAt" IS NOT NULL
        GROUP BY u.name;
      `),
      pool.query(`
        SELECT u.name AS atendente, COUNT(*) AS total
        FROM "TicketTraking" tt
        JOIN "Users" u ON u.id = tt."userId"
        WHERE tt."createdAt" >= NOW() - INTERVAL '${Number(dias)} days'
          AND tt."startedAt" IS NOT NULL
          AND tt."finishedAt" IS NOT NULL
          ${filtroDuracao}
          AND NOT EXISTS (
            SELECT 1 FROM "Messages" m
            WHERE m."ticketId" = tt."ticketId"
              AND m."fromMe" = true
              AND m."createdAt" BETWEEN tt."startedAt" AND tt."finishedAt"
          )
        GROUP BY u.name;
      `),
    ]);

    await pool.end();

    const totalPorAtendente = new Map(totais.rows.map((r) => [r.atendente, Number(r.total)]));
    const devolvidosPorAtendente = new Map(
      devolvidos.rows.map((r) => [r.atendente, Number(r.total)]),
    );

    const dados = [...totalPorAtendente.entries()]
      .map(([atendente, totalAceitos]) => {
        const devolvidosSemResponder = devolvidosPorAtendente.get(atendente) ?? 0;
        return {
          atendente,
          totalAceitos,
          devolvidosSemResponder,
          percentual:
            totalAceitos > 0 ? Math.round((devolvidosSemResponder / totalAceitos) * 1000) / 10 : 0,
        };
      })
      .filter((r) => r.devolvidosSemResponder > 0)
      .sort((a, b) => b.devolvidosSemResponder - a.devolvidosSemResponder);

    rankingCache.set(chave, { timestamp: Date.now(), dados });
    return dados;
  } catch (error) {
    console.error(error);
    throw new Error('Erro ao consultar ranking de devoluções no PostgreSQL.');
  }
}

// Lista bruta dos casos "devolvidos sem responder" (para detalhamento/drill-down na tela).
async function consultaDevolucoesDetalhe(dias = 30, duracaoMaximaSegundos = null) {
  try {
    const pool = await conectarPostgreSQL();

    const filtroDuracao = duracaoMaximaSegundos
      ? `AND EXTRACT(EPOCH FROM (tt."finishedAt" - tt."startedAt")) <= ${Number(duracaoMaximaSegundos)}`
      : '';

    const result = await pool.query(`
      SELECT
        tt."ticketId",
        u.name AS atendente,
        tt."startedAt",
        tt."finishedAt",
        EXTRACT(EPOCH FROM (tt."finishedAt" - tt."startedAt")) AS "duracaoSegundos"
      FROM "TicketTraking" tt
      JOIN "Users" u ON u.id = tt."userId"
      WHERE tt."createdAt" >= NOW() - INTERVAL '${Number(dias)} days'
        AND tt."startedAt" IS NOT NULL
        AND tt."finishedAt" IS NOT NULL
        ${filtroDuracao}
        AND NOT EXISTS (
          SELECT 1 FROM "Messages" m
          WHERE m."ticketId" = tt."ticketId"
            AND m."fromMe" = true
            AND m."createdAt" BETWEEN tt."startedAt" AND tt."finishedAt"
        )
      ORDER BY tt."startedAt" DESC
      LIMIT 500;
    `);

    await pool.end();
    return result.rows;
  } catch (error) {
    console.error(error);
    throw new Error('Erro ao consultar detalhe de devoluções no PostgreSQL.');
  }
}

module.exports = {
  consultaTrakingPorTicket,
  consultaRankingDevolucoes,
  consultaDevolucoesDetalhe,
};
