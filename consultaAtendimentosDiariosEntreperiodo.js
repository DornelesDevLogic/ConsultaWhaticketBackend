const conectarMySQL = require("./mysqlConnection");

async function testeBanco() {
  try {
    // Conexão com o banco de dados MySQL
    const mysqlConnection = await conectarMySQL();
    const [rows] = await mysqlConnection.execute("SELECT * FROM contacts");
    await mysqlConnection.end();

    return rows; // Retorna os resultados da consulta
  } catch (error) {
    console.error(error);
    throw new Error("Erro ao conectar ao banco de dados MySQL.");
  }
}
async function consultaAtendimentosDiariosEntreperiodo(
  startday,
  startmonth,
  startyear,
  endday,
  endmonth,
  endyear
) {
  // Adicione day, month e year como parâmetros
  const dataHoraAtual = new Date();
  console.log("Chegou no consultaAtendimentosDiarios as ", dataHoraAtual);

  console.log(startday, startmonth, startyear);
  console.log(endday, endmonth, endyear);

  try {
    // Conexão com o banco de dados MySQL
    const mysqlConnection = await conectarMySQL();
    const [rows] = await mysqlConnection.execute(
      `
      SELECT
    U.name AS userName,
    COUNT(HT.id) AS totalMessages
  FROM
    HistoricTickets HT
  LEFT OUTER JOIN
    Users U ON HT.userId = U.id
  WHERE
    HT.lastMessage LIKE '%🢅%'
    AND HT.updatedAt BETWEEN ? AND ?
  GROUP BY
    U.name
  ORDER BY
    totalMessages DESC;
    `,
      [
        `${startyear}-${startmonth}-${startday} 00:00:00`,
        `${endyear}-${endmonth}-${endday} 23:59:59`,
      ]
    );

    await mysqlConnection.end();

    return rows; // Retorna os resultados da consulta
  } catch (error) {
    console.error(error);
    throw new Error("Erro ao conectar ao banco de dados MySQL.");
  }
}

module.exports = {
  testeBanco,
  consultaAtendimentosDiariosEntreperiodo,
};
