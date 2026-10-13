const { Pool } = require('pg');
const postgresConnection = require('./postgresConnection');
const { consultaMensagensPorIntervalo } = require('./ConsultaMSGsLogic');
const { consultaTicketsEncerradosAgrupado } = require('./ConsultaMSGsLogicEncerrados');
const pool = require('./db');

async function conectarPostgreSQL() {
  const pool = new Pool(postgresConnection);
  return pool;
}

// Função para formatar a diferença de tempo em horas, minutos e segundos
function formatarTempo(milissegundos) {
  if (!milissegundos || milissegundos <= 0) return "Não disponível";

  const horas = Math.floor(milissegundos / 3600000);
  const minutos = Math.floor((milissegundos % 3600000) / 60000);
  const segundos = Math.floor((milissegundos % 60000) / 1000);

  return `${horas}h ${minutos}m ${segundos}s`;
}

async function consultaDesempenhoAtendentes(dataInicio, dataFim) {
  try {
    // 1. Consultar mensagens por intervalo
    const mensagens = await consultaMensagensPorIntervalo(dataInicio, dataFim);
    
    // 2. Consultar tickets encerrados por técnico
    const ticketsEncerradosPorTecnico = await consultaTicketsEncerradosAgrupado({
      dataInicio: dataInicio.split(' ')[0],
      dataFim: dataFim.split(' ')[0]
    });
    
    // 3. Consultar todos os tickets com dados de abertura e encerramento
    const queryTickets = `
      SELECT 
        tt.*,
        u."name" AS tecnico
      FROM 
        "TicketTraking" tt
      JOIN 
        "Users" u ON tt."userId" = u."id"
      WHERE 
        DATE(tt."startedAt") BETWEEN $1 AND $2 OR DATE(tt."finishedAt") BETWEEN $1 AND $2
    `;
    
    const resultTickets = await pool.query(queryTickets, [
      dataInicio.split(' ')[0],
      dataFim.split(' ')[0]
    ]);
    
    const tickets = resultTickets.rows;
    
    // 4. Agrupar mensagens por atendente
    const mensagensPorAtendente = mensagens.reduce((acc, msg) => {
      const nomeAtendente = msg.nome_usuario;
      if (!acc[nomeAtendente]) {
        acc[nomeAtendente] = {
          total_mensagens: 0,
          total_caracteres: 0,
          tickets: new Set()
        };
      }
      acc[nomeAtendente].total_mensagens++;
      acc[nomeAtendente].total_caracteres += (msg.corpo_mensagem || '').length;
      acc[nomeAtendente].tickets.add(msg.ticketId);
      return acc;
    }, {});
    
    // 5. Agrupar tickets por atendente
    const ticketsPorAtendente = tickets.reduce((acc, ticket) => {
      const nomeAtendente = ticket.tecnico;
      if (!acc[nomeAtendente]) {
        acc[nomeAtendente] = {
          total_chamados: 0,
          chamados_encerrados: 0,
          duracoes: []
        };
      }
      acc[nomeAtendente].total_chamados++;
      if (ticket.finishedAt) {
        acc[nomeAtendente].chamados_encerrados++;
        const duracao = new Date(ticket.finishedAt) - new Date(ticket.startedAt);
        acc[nomeAtendente].duracoes.push(duracao);
      }
      return acc;
    }, {});
    
    // 6. Consolidar todas as métricas
    const desempenhoAtendentes = [];
    const todosAtendentes = new Set([
      ...Object.keys(mensagensPorAtendente),
      ...Object.keys(ticketsPorAtendente),
      ...ticketsEncerradosPorTecnico.map(item => item.tecnico)
    ]);
    
    todosAtendentes.forEach(atendente => {
      const dadosMensagens = mensagensPorAtendente[atendente] || {
        total_mensagens: 0,
        total_caracteres: 0,
        tickets: new Set()
      };
      
      const dadosTickets = ticketsPorAtendente[atendente] || {
        total_chamados: 0,
        chamados_encerrados: 0,
        duracoes: []
      };
      
      const dadosEncerrados = ticketsEncerradosPorTecnico.find(item => item.tecnico === atendente) || {
        tickets_encerrados: 0
      };
      
      // Converter chamados_encerrados para número
      const chamadosEncerrados = parseInt(dadosEncerrados.tickets_encerrados, 10) || 0;
      
      // Calcular média de duração (em milissegundos)
      const mediaDuracao = dadosTickets.duracoes.length > 0 
        ? dadosTickets.duracoes.reduce((a, b) => a + b, 0) / dadosTickets.duracoes.length 
        : 0;
      
      // Calcular métricas adicionais
      const totalTickets = dadosTickets.total_chamados;
      const ticketsEncerrados = chamadosEncerrados;
      const ticketsAbertos = totalTickets - ticketsEncerrados;
      const taxaEncerramento = totalTickets > 0 ? parseFloat(((ticketsEncerrados / totalTickets) * 100).toFixed(2)) : 0;
      const mediaMensagensPorTicket = totalTickets > 0 ? parseFloat((dadosMensagens.total_mensagens / totalTickets).toFixed(2)) : 0;
      const mediaCaracteresPorMensagem = dadosMensagens.total_mensagens > 0 ? parseFloat((dadosMensagens.total_caracteres / dadosMensagens.total_mensagens).toFixed(2)) : 0;
      const totalTicketsUnicos = dadosMensagens.tickets.size;

      desempenhoAtendentes.push({
        atendente,
        total_chamados: totalTickets,
        chamados_encerrados: ticketsEncerrados,
        chamados_abertos: ticketsAbertos,
        taxa_encerramento: taxaEncerramento,
        media_duracao: mediaDuracao,
        media_duracao_formatada: formatarTempo(mediaDuracao),
        total_mensagens: dadosMensagens.total_mensagens,
        media_mensagens_por_ticket: mediaMensagensPorTicket,
        total_caracteres: dadosMensagens.total_caracteres,
        media_caracteres_por_mensagem: mediaCaracteresPorMensagem,
        total_tickets_unicos: totalTicketsUnicos
      });
    });
    
    // 7. Ordenar por total de chamados
    desempenhoAtendentes.sort((a, b) => b.total_chamados - a.total_chamados);
    
    return desempenhoAtendentes;
    
  } catch (error) {
    console.error('Erro ao consultar desempenho de atendentes:', error);
    throw error;
  }
}

module.exports = { consultaDesempenhoAtendentes };