const pool = require('../db'); // usamos o pool global criado em db.js

async function chamadoEmAtendimento(data_inicio, data_fim) {
  const dataHoraAtual = new Date();
  console.log("Chegou na consulta de Atendimentos em andamento às", dataHoraAtual);
  console.log("Arquivo chamadoEmAtendimento.js");
  console.log("Período recebido:", data_inicio, "até", data_fim);

  try {
    const query = `
      SELECT 
        u."id",	
        u."name",
        COUNT(t.*) AS quantidade
      FROM "Tickets" t
      JOIN "Users" u ON t."userId" = u.id     
      WHERE t.status = 'open'
      AND t."updatedAt" BETWEEN $1 AND $2
      GROUP BY u."id", u."name"
      ORDER BY quantidade DESC
    `;

    const result = await pool.query(query, [data_inicio, data_fim]);
    return result.rows;

  } catch (error) {
    console.error("Erro na função chamadoEmAtendimento:", error);
    throw new Error("Erro ao conectar ao banco de dados PostgreSQL.");
  }
}

module.exports = { chamadoEmAtendimento };
