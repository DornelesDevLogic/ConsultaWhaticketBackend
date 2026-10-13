const { Pool } = require('pg');
const postgresConnection = require('./postgresConnection');

async function conectarPostgreSQL() {
  const pool = new Pool(postgresConnection);
  return pool;
}

function formatSeconds(totalSeconds) {
  if (totalSeconds === null || isNaN(totalSeconds)) {
    return "00h 00m 00s";
  }
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = Math.floor(totalSeconds % 60);

  return `${String(hours).padStart(2, '0')}h ${String(minutes).padStart(2, '0')}m ${String(seconds).padStart(2, '0')}s`;
}

async function consultaMediaTempoFila() {
  const dataHoraRequisicao = new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' });
  console.log(`[consultaMediaTempoFila] Consulta realizada em: ${dataHoraRequisicao}`);

  try {
    const pool = await conectarPostgreSQL();
    const query = `
      SELECT
          COUNT(*) as total_atendimentos,
          AVG(EXTRACT(EPOCH FROM (tt."startedAt" - tt."queuedAt"))) as avg_wait_time_seconds,
          PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY EXTRACT(EPOCH FROM (tt."startedAt" - tt."queuedAt"))) as median_wait_time_seconds
      FROM "TicketTraking" tt
      WHERE
          tt."startedAt" IS NOT NULL
          AND tt."queuedAt" IS NOT NULL
          AND tt."startedAt" > tt."queuedAt"
          AND tt."queuedAt" >= (CURRENT_DATE::timestamp AT TIME ZONE 'America/Sao_Paulo');
    `;

    const result = await pool.query(query);
    await pool.end();

    const stats = result.rows[0];
    const totalAtendimentos = parseInt(stats.total_atendimentos, 10);

    console.log("Consulta de média de tempo de fila (TicketTraking) concluída.");

    if (totalAtendimentos === 0) {
      return {
        message: "Nenhum atendimento foi iniciado hoje.",
        total_atendimentos: 0,
        media_tempo_fila: "00h 00m 00s",
        mediana_tempo_fila: "00h 00m 00s"
      };
    }

    return {
      total_atendimentos: totalAtendimentos,
      media_tempo_fila: formatSeconds(stats.avg_wait_time_seconds),
      mediana_tempo_fila: formatSeconds(stats.median_wait_time_seconds),
      raw_seconds: {
        average: stats.avg_wait_time_seconds,
        median: stats.median_wait_time_seconds
      }
    };
  } catch (error) {
    console.error("Erro ao consultar a média de tempo de fila:", error.message);
    throw new Error("Erro ao conectar ao banco de dados Postgres.");
  }
}

// Função para salvar a média de tempo de fila na tabela tempomediofila
async function salvarMediaTempoFila() {
  const dataHoraRequisicao = new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' });
  console.log(`[salvarMediaTempoFila] Iniciando salvamento em: ${dataHoraRequisicao}`);

  try {
    // Consultar a média de tempo de fila
    const dados = await consultaMediaTempoFila();
    
    // Se não houver dados para salvar, sair da função
    if (dados.total_atendimentos === 0) {
      console.log(`[salvarMediaTempoFila] Nenhum atendimento para salvar em ${dataHoraRequisicao}`);
      return { success: false, message: "Nenhum atendimento para salvar" };
    }

    const pool = await conectarPostgreSQL();
    
    // Converter segundos para intervalo PostgreSQL
    const tempomedioSegundos = Math.floor(parseFloat(dados.raw_seconds.average));
    const medianaSegundos = Math.floor(parseFloat(dados.raw_seconds.median));
    
    const tempomedioInterval = `'${tempomedioSegundos} seconds'::interval`;
    const medianaInterval = `'${medianaSegundos} seconds'::interval`;

    console.log('Valores para inserção:');
    console.log('tempomedioSegundos:', tempomedioSegundos);
    console.log('medianaSegundos:', medianaSegundos);
    console.log('tempomedioInterval:', tempomedioInterval);
    console.log('medianaInterval:', medianaInterval);

    // Query para inserir os dados na tabela tempomediofila (atualiza se já existir)
    const insertQuery = `
      INSERT INTO tempomediofila (data, tempomedio, mediana)
      VALUES (CURRENT_DATE::date, ${tempomedioInterval}, ${medianaInterval})
      ON CONFLICT (data) 
      DO UPDATE SET 
        tempomedio = EXCLUDED.tempomedio,
        mediana = EXCLUDED.mediana
    `;

    console.log('Query de inserção:', insertQuery);

    const result = await pool.query(insertQuery);
    await pool.end();

    console.log('Resultado da inserção:', result);

    console.log(`[salvarMediaTempoFila] Dados salvos com sucesso para a data ${new Date().toISOString().split('T')[0]}`);
    return { success: true, message: "Dados salvos com sucesso" };

  } catch (error) {
    console.error("Erro ao salvar a média de tempo de fila:", error.message);
    throw new Error("Erro ao salvar a média de tempo de fila no banco de dados.");
  }
}

// Função para consultar dados históricos da tabela tempomediofila
async function consultaHistoricoTempoFila(dataInicio = null, dataFim = null) {
  const dataHoraRequisicao = new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' });
  console.log(`[consultaHistoricoTempoFila] Consulta realizada em: ${dataHoraRequisicao}`);

  try {
    const pool = await conectarPostgreSQL();
    
    let query = `
      SELECT 
        data,
        tempomedio,
        mediana
      FROM tempomediofila
    `;

    const params = [];
    if (dataInicio && dataFim) {
      query += ` WHERE data BETWEEN $1 AND $2`;
      params.push(dataInicio, dataFim);
    }

    query += ` ORDER BY data DESC`;

    const result = await pool.query(query, params);
    await pool.end();

    console.log(`[consultaHistoricoTempoFila] Consulta concluída. ${result.rows.length} registros encontrados.`);

    // Formatar os dados para retorno
    const dadosFormatados = result.rows.map(row => {
      // Calcular segundos totais a partir de hours, minutes, seconds
      const tempomedioSeconds = (row.tempomedio?.hours || 0) * 3600 + (row.tempomedio?.minutes || 0) * 60 + (row.tempomedio?.seconds || 0);
      const medianaSeconds = (row.mediana?.hours || 0) * 3600 + (row.mediana?.minutes || 0) * 60 + (row.mediana?.seconds || 0);
      
      return {
        data: row.data.toISOString().split('T')[0],
        tempomedio: formatSeconds(tempomedioSeconds),
        mediana: formatSeconds(medianaSeconds),
        raw_seconds: {
          tempomedio: tempomedioSeconds,
          mediana: medianaSeconds
        }
      };
    });

    return dadosFormatados;

  } catch (error) {
    console.error("Erro ao consultar histórico de tempo de fila:", error.message);
    throw new Error("Erro ao consultar histórico de tempo de fila.");
  }
}

module.exports = {
  consultaMediaTempoFila,
  salvarMediaTempoFila,
  consultaHistoricoTempoFila
};
