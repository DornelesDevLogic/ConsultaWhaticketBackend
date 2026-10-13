const express = require('express');
const { testeBanco,consultacontacts } = require('./consulta');
const  insertDataToFirebird   = require('./postFirebird'); // Importe a função e a variável
const deleteAllDataFromTable = require('./deleteAllDataFromTable');
const consultaportassh = require ('./consultaportasSSH');
const {consultaAtendimentosDiarios}  = require ('./consultaAtendimentosDiarios');
const {consultaAtendimentosAbertos, consultaAtendimentosAbertosHoje}  = require ('./consultaAtendimentosAbertos');
const {consultaAtendimentosEncerrados} = require('./consultaAtendimentosEncerrados');
const {consultaAtendimentosDiariosEntreperiodo} = require('./consultaAtendimentosDiariosEntreperiodo');
const {consultaTicket} = require('./consultaTicket');
const { consultaAtendimentosPendentes } = require('./consultaAtendimentosPendentes');
const { consultaMediaTempoFila } = require('./consultaMediaTempoFila');
const { consultaUserRatings, consultaAvaliacoesDoMes, consultaAvaliacoesRapida } = require('./consultauserratingsnew');
const { gerarRelatorio } = require('./emailRelatorioUserRatingsNEW');
const { startAutoRunner, stopAutoRunner } = require('./autoRunner');
const { rotinaInsertFirebird } = require('./autoInsertFirebird');
const { buscarTicketsSemFila } = require('./semFilaAjustador');
const { chamadoEmAtendimento } = require('./dashboradWEb/chamadoEmAtendimento');
const { gerarRelatorioDiario, gerarRelatorioDiarioComEmail } = require('./relatorioDiarioEmail');
const { iniciarAgendadorRelatorio } = require('./agendadorRelatorio');

console.log('startAutoRunner:', typeof startAutoRunner);
console.log('stopAutoRunner:', typeof stopAutoRunner);

//Rafael Dorneles 28/10/2025
const cors = require('cors');


const app = express();
const port = 5000;
app.use(cors());
app.use(express.json());

// Tratamento de erros não capturados
process.on('uncaughtException', (error) => {
  console.error('❌ Erro não capturado:', error.message);
  console.error('Stack:', error.stack);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('❌ Promise rejeitada não tratada:', reason);
  console.error('Promise:', promise);
});


//===========================================================================================================================================================//

app.get('/api/testeBanco', async (req, res) => {
  try {
    const rows = await testeBanco();
    res.json(rows);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Erro ao consultar o banco de dados.' });
  }
});

//============================================================================================================================================================//

app.get('/api/consultacontacts', async (req, res) => {
  try {
    const { day, month, year } = req.query;
    if (!day || !month || !year) {
      return res.status(400).json({ error: 'Valores de data ausentes na consulta.' });
    }
    console.log("Entrou no Server.JS no Caminho de consulta contacts ");
    console.log("data no arquivo server", day, month, year);
    const rows = await consultacontacts(day, month, year);
    res.json(rows);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Erro ao consultar o banco de dados.' });
  }
});

//==========================================================================================================================================================//

app.get('/api/insertDataToFirebird', async (req, res) => {
  console.log("Requisição insertDataToFirebird recebida");

  const { day, month, year } = req.query;
  console.log("Data recebida no servidor:", day, month, year);

  if (!day || !month || !year) {
    return res.status(400).json({ error: 'Parâmetros inválidos.' });
  }

  try {
    const agendasInseridas = await insertDataToFirebird(day, month, year);
    res.status(200).json({ success: true, message: 'Dados inseridos com sucesso no Firebird.', agendasInseridas });
  } catch (error) {
    console.error('Erro ao inserir dados no Firebird:', error.message);
    res.status(500).json({ success: false, message: 'Erro ao inserir dados no Firebird', error: error.message });
  }
});

//============================================================================================================================================================//

app.get('/api/consultatickets', async (req, res) => {
  console.log("dentro da função nova ");

  const { day, month, year } = req.query;
  console.log("data no arquivo server", day, month, year);

  if (!day || !month || !year) {
    return res.status(400).json({ error: 'Parâmetros inválidos.' });
  }

  try {
    const agendasInseridas = await insertDataToFirebird(day, month, year, res);
    res.status(200).json({ success: true, message: 'Status: OK' });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Erro ao inserir dados no Firebird', error: error.message });
  }
});

//==============================================================================================================================================================//

app.get('/api/consultaAtendimentosDiarios', async (req, res) => {
  console.log("Entrou no Caminho Atendimentos Diarios");

  const { day, month, year } = req.query;

  if (!day || !month || !year) {
    return res.status(400).json({ error: 'Valores de data ausentes na consulta.' });
  }

  try {
    const rows = await consultaAtendimentosDiarios(day, month, year);
    res.json(rows);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Erro ao consultar o banco de dados.' });
  }
});

//===============================E=N=T=R=E====P=E=R=I=O=D=O==================================================================================================================//
app.get('/api/consultaAtendimentosDiariosEntreperiodo', async (req, res) => {
  console.log("Entrou no Caminho Atendimentos Diarios entre periodo");

  const { startday, startmonth, startyear, endday, endmonth, endyear } = req.query;

  if ((!startday || !startmonth || !startyear) || (!endday || !endmonth || !endyear)) {
    return res.status(400).json({ error: 'Valores de data ausentes na consulta.' });
  }

  try {
    const rows = await consultaAtendimentosDiariosEntreperiodo(startday, startmonth, startyear, endday, endmonth, endyear);
    res.json(rows);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Erro ao consultar o banco de dados.' });
  }
});

//================================================================================================================================================================//

app.get('/api/consultaAtendimentosAbertos', async (req, res) => {
  console.log("Entrou no endpoint consulta Atendimentos em Abertos ");
  try {
    const rows = await consultaAtendimentosAbertos();
    res.json(rows);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Erro ao consultar o banco de dados.' });
  }
});

// Novo endpoint para atendimentos abertos de hoje
app.get('/api/consultaAtendimentosAbertosHoje', async (req, res) => {
  console.log("Entrou no endpoint consulta Atendimentos em Abertos de Hoje ");
  try {
    const rows = await consultaAtendimentosAbertosHoje();
    res.json(rows);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Erro ao consultar o banco de dados.' });
  }
});

//===============================A=t=e=n=d=i=m=e=n=t=o=s====E=n=c=e=r=r=a=d=o=s=========================================================================================================//

app.get('/api/consultaAtendimentosEncerrados', async (req, res) => {
  console.log("Entrou no Caminho de consulta de atendiemntos encerrados");

  const { day, month, year } = req.query;

  if (!day || !month || !year) {
    return res.status(400).json({ error: 'Valores de data ausentes na consulta.' });
  }

  try {
    const rows = await consultaAtendimentosEncerrados(day, month, year);
    res.json(rows);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Erro ao consultar o banco de dados.' });
  }
});

//=============================================================================================================================//

app.get('/api/consultaticket', async (req, res) => {
  console.log("Entrou no Caminho de consulta consulta ticket");

  const { idticket } = req.query;

  if (!idticket) {
    return res.status(400).json({ error: 'Valores de data ausentes na consulta.' });
  }

  try {
    const rows = await consultaTicket(idticket);
    res.json(rows);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Erro ao consultar o banco de dados.' });
  }
});

//=============================================================================================================================//
// TicketTraking: histórico de aceite/finalização e ranking de devoluções pra fila sem resposta
const {
  consultaTrakingPorTicket,
  consultaRankingDevolucoes,
  consultaDevolucoesDetalhe,
} = require('./consultaTicketTraking');

app.get('/api/ticket-traking', async (req, res) => {
  const { idticket } = req.query;
  if (!idticket) {
    return res.status(400).json({ error: 'Informe o idticket.' });
  }
  try {
    const rows = await consultaTrakingPorTicket(idticket);
    res.json(rows);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Erro ao consultar o banco de dados.' });
  }
});

app.get('/api/ranking-devolucoes', async (req, res) => {
  const dias = req.query.dias ? Number(req.query.dias) : 30;
  const duracaoMaximaSegundos = req.query.duracaoMaximaSegundos
    ? Number(req.query.duracaoMaximaSegundos)
    : null;
  try {
    const rows = await consultaRankingDevolucoes(dias, duracaoMaximaSegundos);
    res.json(rows);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Erro ao consultar o banco de dados.' });
  }
});

app.get('/api/devolucoes-detalhe', async (req, res) => {
  const dias = req.query.dias ? Number(req.query.dias) : 30;
  const duracaoMaximaSegundos = req.query.duracaoMaximaSegundos
    ? Number(req.query.duracaoMaximaSegundos)
    : null;
  try {
    const rows = await consultaDevolucoesDetalhe(dias, duracaoMaximaSegundos);
    res.json(rows);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Erro ao consultar o banco de dados.' });
  }
});

//=============================================================================================================================//
// Ranking de motivos de chamado (classificação por palavras-chave nas conversas)
const { consultaRankingMotivos } = require('./consultaRankingMotivos');

app.get('/api/ranking-motivos', async (req, res) => {
  const hoje = new Date();
  const primeiroDiaMesAtual = new Date(Date.UTC(hoje.getUTCFullYear(), hoje.getUTCMonth(), 1));
  const primeiroDiaMesPassado = new Date(
    Date.UTC(hoje.getUTCFullYear(), hoje.getUTCMonth() - 1, 1),
  );

  const dataInicio = req.query.dataInicio || primeiroDiaMesPassado.toISOString().slice(0, 10);
  const dataFim = req.query.dataFim || primeiroDiaMesAtual.toISOString().slice(0, 10);

  try {
    const dados = await consultaRankingMotivos(dataInicio, dataFim);
    res.json({ ...dados, dataInicio, dataFim });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Erro ao consultar o banco de dados.' });
  }
});

//================================================================================================================================================================//

app.get('/api/deleteAllDataFromTable', async (req, res) => {
  console.log("Requisição deleteAllDataFromTable recebida");
  try {
    await deleteAllDataFromTable();
    console.log('Dados excluídos com sucesso.');
    res.status(200).json({ success: true, message: 'Dados excluídos com sucesso.' });
  } catch (error) {
    console.error('Erro ao excluir dados no Firebird', error);
    res.status(500).json({ success: false, message: 'Erro ao excluir dados no Firebird', error: error.message });
  }
});

app.get('/api/consultaportassh', async (req, res) => {
  try {
    const resultado = await consultaportassh();
    res.status(200).json({ success: true, message: 'Dados consultados com sucesso.', data: resultado });
  } catch (error) {
    console.error('Erro ao consultar dados', error);
    res.status(500).json({ success: false, message: 'Erro ao consultar dados', error: error.message });
  }
});

// Rota para consultar atendimentos pendentes
app.get('/api/atendimentos-pendentes', async (req, res) => {
  try {
    console.log("Requisição recebida para atendimentos pendentes.");
    const resultados = await consultaAtendimentosPendentes();
    res.status(200).json(resultados);
  } catch (error) {
    console.error("Erro ao processar a consulta de atendimentos pendentes:", error.message);
    res.status(500).json({ error: 'Erro ao consultar atendimentos pendentes.' });
  }
});

// Rota para consultar a média de tempo na fila
app.get('/api/media-tempo-fila', async (req, res) => {
  try {
    console.log("Requisição recebida para média de tempo na fila.");
    const resultado = await consultaMediaTempoFila();
    res.status(200).json(resultado);
  } catch (error) {
    console.error("Erro ao processar a consulta de média de tempo na fila:", error.message);
    res.status(500).json({ error: 'Erro ao consultar a média de tempo na fila.' });
  }
});

// Rota para consulta de mensagens do dia
const { consultaMensagensDoDia } = require('./ConsultaMSGsLogic');
app.get('/api/consulta-mensagens-dia', async (req, res) => {
  try {
    const { data } = req.query; // data no formato 'YYYY-MM-DD'
    const resultado = await consultaMensagensDoDia(data);
    res.json(resultado);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Rota para iniciar o modo automático
app.post('/api/start-auto-runner', (req, res) => {
  const { day, month, year } = req.body;
  console.log('Parâmetros recebidos no start-auto-runner:', { day, month, year });

  try {
    startAutoRunner(day, month, year);
    res.status(200).json({ message: 'Modo automático iniciado.' });
  } catch (error) {
    console.error('Erro ao iniciar o modo automático:', error.message);
    res.status(500).json({ error: 'Erro ao iniciar o modo automático.' });
  }
});

// Rota para parar o modo automático
app.post('/api/stop-auto-runner', (req, res) => {
  console.log('Chamando stopAutoRunner...');
  try {
    stopAutoRunner();
    res.status(200).json({ message: 'Modo automático parado.' });
  } catch (error) {
    console.error('Erro ao parar o modo automático:', error.message);
    res.status(500).json({ error: 'Erro ao parar o modo automático.' });
  }
});

// Rota para consulta de mensagens por intervalo
const { consultaMensagensPorIntervalo } = require('./ConsultaMSGsLogic');

app.get('/api/consulta-mensagens-intervalo', async (req, res) => {
  try {
    // Recebe os parâmetros do front-end
    const { data_inicio, data_fim } = req.query;

    // Monta as datas no formato completo para o SQL
    const inicio = data_inicio ? `${data_inicio} 00:00:00` : undefined;
    const fim = data_fim ? `${data_fim} 23:59:59` : undefined;

    const resultado = await consultaMensagensPorIntervalo(inicio, fim);
    res.json(resultado);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Adicione no seu server.js
const { consultaTicketsEncerradosHoje } = require('./ConsultaMSGsLogicEncerrados');

app.get('/api/tickets-encerrados-hoje', async (req, res) => {
  try {
    const resultado = await consultaTicketsEncerradosHoje();
    res.json(resultado);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Exemplo de rota para pesquisa por intervalo
const { consultaTicketsEncerrados } = require('./ConsultaMSGsLogicEncerrados');

app.get('/api/tickets-encerrados', async (req, res) => {
  try {
    const { data_inicio, data_fim } = req.query; // formato: YYYY-MM-DD
    const resultado = await consultaTicketsEncerrados({
      dataInicio: data_inicio,
      dataFim: data_fim
    });
    res.json(resultado);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Rota para consulta de tickets encerrados agrupados por técnico
const { consultaTicketsEncerradosAgrupado } = require('./ConsultaMSGsLogicEncerrados');

app.get('/api/tickets-encerrados-por-tecnico', async (req, res) => {
  try {
    const { data_inicio, data_fim } = req.query;
    const resultado = await consultaTicketsEncerradosAgrupado({
      dataInicio: data_inicio,
      dataFim: data_fim
    });
    res.json(resultado);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});


// ...
/////////////////////consultaUserRatings////////////////////////////////////////////////////////////////////////////////////

// Função para formatar a diferença de tempo em horas, minutos e segundos
function formatarTempo(dataInicio, dataFim) {
  if (!dataInicio || !dataFim) return "Não disponível";

  const inicio = new Date(dataInicio);
  const fim = new Date(dataFim);
  let diffMs = fim - inicio;

  if (diffMs < 0) {
    diffMs = 0;
  }

  const horas = Math.floor(diffMs / 3600000);
  const minutos = Math.floor((diffMs % 3600000) / 60000);
  const segundos = Math.floor((diffMs % 60000) / 1000);

  return `${horas} horas ${minutos} minutos ${segundos} segundos`;
}

app.get('/api/consultaUserRatings', async (req, res) => {
  try {
    // Aceita tanto 'rate' quanto 'maxRate' como parâmetros
    const { rate, maxRate, startDate, endDate, ticketId } = req.query;
    const rateValue = parseInt(rate || maxRate, 10) || 3;
    
    console.log('Parâmetros recebidos:', { rate, maxRate, startDate, endDate, ticketId, rateValue });
    
    const tickets = await consultaUserRatings(rateValue, startDate, endDate, ticketId);

    // Itera sobre cada ticket para calcular e adicionar o tempo de fila usando queued_at e started_at.
    const ticketsComTempoDeFila = tickets.map(ticket => {
      const tempoNaFila = formatarTempo(ticket.queued_at, ticket.started_at);
      
      // Retorna um novo objeto com os dados do ticket original mais o campo 'tempoNaFila'
      return {
        ...ticket,
        tempoNaFila: tempoNaFila
      };
    });

    res.json(ticketsComTempoDeFila);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Erro ao consultar o banco de dados.' });
  }
});

app.get('/api/avaliacoes-do-mes', async (req, res) => {
  try {
    const { startDate, endDate, ticketId } = req.query;
    
    // Formatar datas com horário completo
    const inicio = startDate ? `${startDate} 00:00:00` : null;
    const fim = endDate ? `${endDate} 23:59:59` : null;
    
    console.log('Buscando avaliações...', { startDate, endDate, ticketId, inicio, fim });
    
    const tickets = await consultaAvaliacoesDoMes(inicio, fim, ticketId);

    const ticketsComTempoDeFila = tickets.map(ticket => {
      const tempoNaFila = formatarTempo(ticket.queued_at, ticket.started_at);
      
      return {
        ...ticket,
        tempoNaFila: tempoNaFila
      };
    });

    res.json(ticketsComTempoDeFila);
  } catch (error) {
    console.error('Erro ao consultar avaliações do mês:', error);
    res.status(500).json({ error: 'Erro ao consultar o banco de dados para avaliações do mês.' });
  }
});

app.get('/api/avaliacoes-rapida', async (req, res) => {
  try {
    const { startDate, endDate, ticketId } = req.query;
    
    const inicio = startDate ? `${startDate} 00:00:00` : null;
    const fim = endDate ? `${endDate} 23:59:59` : null;
    
    const tickets = await consultaAvaliacoesRapida(inicio, fim, ticketId);

    const ticketsComTempoDeFila = tickets.map(ticket => {
      const tempoNaFila = formatarTempo(ticket.queued_at, ticket.started_at);
      
      return {
        ...ticket,
        tempoNaFila: tempoNaFila
      };
    });

    res.json(ticketsComTempoDeFila);
  } catch (error) {
    console.error('Erro ao consultar avaliações rápida:', error);
    res.status(500).json({ error: 'Erro ao consultar o banco de dados para avaliações rápida.' });
  }
});


//////////////Email Relatorio//////////////////////////////////////////////////////////////////////////////////////////

app.get('/api/gerar-relatorio', (req, res) => {
  gerarRelatorio();
  res.send('Relatório gerado com sucesso!');
});


// /////////////////////////////////////////////////////////////////////////////////////////////////////////////



app.get('/api/chamadoematendimento', async (req, res) => {
  try {
    let { data_inicio, data_fim } = req.query;

    // Se nenhuma data for fornecida, usa o dia atual
    const hoje = new Date();
    const yyyy = hoje.getFullYear();
    const mm = String(hoje.getMonth() + 1).padStart(2, '0');
    const dd = String(hoje.getDate()).padStart(2, '0');

    if (!data_inicio) {
      data_inicio = `${yyyy}-${mm}-${dd}`;
    }
    if (!data_fim) {
      data_fim = `${yyyy}-${mm}-${dd}`;
    }

    const inicio = `${data_inicio} 00:00:00`;
    const fim = `${data_fim} 23:59:59`;

    const resultado = await chamadoEmAtendimento(inicio, fim);

    res.json(resultado);
  } catch (error) {
    console.error('Erro no endpoint /api/chamadoematendimento:', error);
    res.status(500).json({ error: error.message });
  }
});



/////////////////////////////////////////////////////////////////////////////////////////////////////////////

app.get('/api/tickets-sem-fila', async (req, res) => {
  try {
    const tickets = await buscarTicketsSemFila();
    res.json({ total: tickets.length, tickets });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Rota para consulta de desempenho por atendente
const { consultaDesempenhoAtendentes } = require('./consultaDesempenhoAtendentes');

app.get('/api/desempenho-atendentes', async (req, res) => {
  try {
    const { data_inicio, data_fim } = req.query;

    if (!data_inicio || !data_fim) {
      return res.status(400).json({ error: 'Parâmetros data_inicio e data_fim são obrigatórios (formato: YYYY-MM-DD)' });
    }

    const inicio = `${data_inicio} 00:00:00`;
    const fim = `${data_fim} 23:59:59`;

    const resultado = await consultaDesempenhoAtendentes(inicio, fim);
    res.json(resultado);
  } catch (error) {
    console.error('Erro ao consultar desempenho de atendentes:', error);
    res.status(500).json({ error: error.message });
  }
});

// Rota para salvar a média de tempo de fila na tabela tempomediofila
const { salvarMediaTempoFila, consultaHistoricoTempoFila } = require('./consultaMediaTempoFila');

app.post('/api/salvar-media-tempo-fila', async (req, res) => {
  try {
    console.log("Requisição recebida para salvar média de tempo de fila.");
    const resultado = await salvarMediaTempoFila();
    res.status(200).json(resultado);
  } catch (error) {
    console.error("Erro ao salvar média de tempo de fila:", error.message);
    res.status(500).json({ error: error.message });
  }
});

// Rota para consultar o histórico de média de tempo de fila
app.get('/api/historico-tempo-fila', async (req, res) => {
  try {
    console.log("Requisição recebida para consultar histórico de tempo de fila.");
    const { data_inicio, data_fim } = req.query;
    const resultado = await consultaHistoricoTempoFila(data_inicio, data_fim);
    res.status(200).json(resultado);
  } catch (error) {
    console.error("Erro ao consultar histórico de tempo de fila:", error.message);
    res.status(500).json({ error: error.message });
  }
});

// Rota para relatório diário de desempenho
app.get('/api/relatorio-diario', async (req, res) => {
  try {
    const { data } = req.query; // formato: YYYY-MM-DD (opcional)
    const relatorio = await gerarRelatorioDiarioComEmail(data);
    res.json({ message: 'Relatório gerado e enviado por email com sucesso!', relatorio });
  } catch (error) {
    console.error('Erro ao gerar relatório diário:', error);
    res.status(500).json({ error: 'Erro ao gerar relatório diário.' });
  }
});

// Inicialização do servidor
app.listen(port, () => {
  console.log(`Servidor rodando em http://localhost:${port}`);
  rotinaInsertFirebird();
  iniciarAgendadorRelatorio();
});
