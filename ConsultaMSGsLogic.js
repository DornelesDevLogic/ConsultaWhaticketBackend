const { Pool } = require('pg');
const postgresConnection = require('./postgresConnection');
const moment = require('moment-timezone');

async function conectarPostgreSQL() {
  const pool = new Pool(postgresConnection);
  return pool;
}

async function consultaMensagensPorIntervalo(dataInicio, dataFim) {
  const pool = await conectarPostgreSQL();
  const client = await pool.connect();

  // Log da requisição com data e hora
  const dataHoraRequisicao = new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' });
  console.log(`[consultaMensagensPorIntervalo] Requisição recebida em: ${dataHoraRequisicao} | De: ${dataInicio} Até: ${dataFim}`);

  // Função para normalizar datas
  function normalizaData(data, tipo) {
    if (!data) return null;
    if (data.length === 10 && !data.includes('T')) {
      return tipo === 'inicio' ? `${data} 00:00:00` : `${data} 23:59:59`;
    }
    if (data.length > 10 && data.includes('T')) {
      // já está em ISO, retorna só a data
      return data.split('T')[0] + (tipo === 'inicio' ? ' 00:00:00' : ' 23:59:59');
    }
    return data;
  }

  let inicio, fim;
  if (!dataInicio || !dataFim) {
    const hoje = moment().tz('America/Sao_Paulo');
    inicio = hoje.clone().startOf('day').utc().format('YYYY-MM-DD HH:mm:ss');
    fim = hoje.clone().endOf('day').utc().format('YYYY-MM-DD HH:mm:ss');
  } else {
    const inicioStr = normalizaData(dataInicio, 'inicio');
    const fimStr = normalizaData(dataFim, 'fim');
    inicio = moment.tz(inicioStr, 'America/Sao_Paulo').utc().format('YYYY-MM-DD HH:mm:ss');
    fim = moment.tz(fimStr, 'America/Sao_Paulo').utc().format('YYYY-MM-DD HH:mm:ss');
  }

  const query = `
    SELECT 
      u.name       AS nome_usuario,
      m.body       AS corpo_mensagem,
      m."ticketId", 
      m."createdAt" 
    FROM 
      "Users" u
    JOIN 
      "Messages" m
      ON m.body LIKE '*' || u.name || ':%'
    WHERE 
      m."createdAt" BETWEEN $1 AND $2
    ORDER BY 
      1, 4;
  `;

  try {
    const result = await client.query(query, [inicio, fim]);
    const rowsComDataBrasilia = result.rows.map(row => ({
      ...row,
      createdAt: new Date(row.createdAt).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })
    }));
    client.release();
    return rowsComDataBrasilia;
  } catch (error) {
    client.release();
    throw error;
  }
}

module.exports = {
  conectarPostgreSQL,
  consultaMensagensDoDia: async (dataPesquisa) => {
    // Mantém compatibilidade com a função antiga
    let dataBase;
    if (dataPesquisa) {
      dataBase = dataPesquisa;
    } else {
      const hoje = new Date();
      const ano = hoje.getFullYear();
      const mes = String(hoje.getMonth() + 1).padStart(2, '0');
      const dia = String(hoje.getDate()).padStart(2, '0');
      dataBase = `${ano}-${mes}-${dia}`;
    }
    const dataInicio = `${dataBase} 00:00:00`;
    const dataFim = `${dataBase} 23:59:59`;
    return consultaMensagensPorIntervalo(dataInicio, dataFim);
  },
  consultaMensagensPorIntervalo,
};