const axios = require('axios');
const fs = require('fs');
const path = require('path');
const { enviarRelatorioPorEmail } = require('./enviaEmail');

const relatorioPath = 'relatorio.txt';
const historicoPath = path.join(__dirname, 'emailRelatorioUserRatingsNEW.json');

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

// Mensagem escrita por um atendente humano: fromMe + assinatura "*Nome:*" no início.
// O bot (menu de setor, "atendimento selecionado", aviso de inatividade, link de avaliação,
// "Mensagem Automática") também vem como fromMe, mas sem assinatura, e não pode contar como resposta.
function ehMensagemDeAtendente(m) {
  return !!(m.fromMe && m.body && /^\*[^*\n:]+:\*/.test(m.body) && !/Mensagem Autom[aá]tica/i.test(m.body));
}

// Calcula tempo na fila e tempo em atendimento de forma consistente.
// Não usa queued_at: ele é nulo em vários registros e, em outros, é sobrescrito com o horário do
// encerramento (queued_at == finished_at), então não representa o início da fila.
function calcularTempos(ticket) {
  const NAO_DISPONIVEL = 'Não disponível';
  const mensagens = [...(ticket.mensagens || [])].sort(
    (a, b) => new Date(a.createdAt) - new Date(b.createdAt)
  );

  // Início da fila: primeira mensagem do cliente (senão, a primeira mensagem do ticket)
  const primeiraCliente = mensagens.find(m => !m.fromMe) || mensagens[0];
  const inicio = primeiraCliente ? new Date(primeiraCliente.createdAt) : null;

  // Fim da fila = início do atendimento. Se started_at for anterior ao início da conversa
  // (valor "velho" de um atendimento anterior do mesmo ticket), usa a 1ª resposta assinada do atendente.
  let fim = null;
  if (ticket.started_at && inicio && new Date(ticket.started_at) >= inicio) {
    fim = new Date(ticket.started_at);
  } else if (inicio) {
    const resposta = mensagens.find(m => ehMensagemDeAtendente(m) && new Date(m.createdAt) >= inicio);
    if (resposta) fim = new Date(resposta.createdAt);
  }
  if (!fim && ticket.finished_at) fim = new Date(ticket.finished_at);

  const fila = inicio && fim && fim >= inicio ? formatarTempo(inicio, fim) : NAO_DISPONIVEL;
  const fimAtendimento = ticket.finished_at ? new Date(ticket.finished_at) : null;
  const atendimento = fim && fimAtendimento && fimAtendimento >= fim ? formatarTempo(fim, fimAtendimento) : NAO_DISPONIVEL;

  return { fila, atendimento };
}

// Função para obter a última data salva no JSON
function obterUltimaData() {
  if (!fs.existsSync(historicoPath)) return null;

  try {
    const json = fs.readFileSync(historicoPath, 'utf8');
    const data = JSON.parse(json);
    return data.ultimaData ? new Date(data.ultimaData) : null;
  } catch (err) {
    console.error("Erro ao ler o arquivo de histórico:", err.message);
    return null;
  }
}

// Função para salvar a nova última data
function salvarUltimaData(data) {
  const json = JSON.stringify({ ultimaData: data.toISOString() }, null, 2);
  fs.writeFileSync(historicoPath, json);
  console.log("🕒 Última data registrada (local):", data.toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' }));

}

// Evita execuções simultâneas: o frontend chama /api/gerar-relatorio a cada atualização,
// e várias telas abertas ao mesmo tempo faziam o mesmo relatório ser enviado várias vezes.
let emExecucao = false;

async function gerarRelatorio() {
  if (emExecucao) {
    console.log('⏳ Relatório já está sendo gerado/enviado. Chamada ignorada.');
    return;
  }
  emExecucao = true;

  const url = "http://10.1.4.194:5000/api/consultaUserRatings";

  console.log('Iniciando a geração do relatório...');

  try {
    const ultimaDataSalva = obterUltimaData();

    // Antes a consulta trazia TODO o histórico (todas as mensagens de todas as avaliações) a cada 5 min.
    // Agora limita ao período recente: a partir de 2 dias antes da última data enviada até amanhã
    // (margem de 1 dia para cobrir diferença de fuso entre o filtro DATE() do banco e o horário local).
    const params = {};
    if (ultimaDataSalva) {
      const fmt = d => d.toISOString().slice(0, 10);
      params.startDate = fmt(new Date(ultimaDataSalva.getTime() - 2 * 86400000));
      params.endDate = fmt(new Date(Date.now() + 86400000));
    }

    const response = await axios.get(url, { params });
    const data = response.data;

    if (!Array.isArray(data) || data.length === 0) {
      console.log("Nenhum dado retornado da API.");
      return;
    }

    // Verifica se há alguma nova avaliação com data maior que a salva
    const ticketsNovos = data.filter(ticket => {
      const dataFinal = ticket.finished_at; // Corrigido: A data agora está no objeto do ticket
      if (!dataFinal) return false;
      const dataTicket = new Date(dataFinal);
      return !ultimaDataSalva || dataTicket > ultimaDataSalva;
    });

    if (ticketsNovos.length === 0) {
      console.log("⏸️ Nenhuma nova avaliação encontrada desde a última verificação. Email não enviado.");
      return;
    }

    let conteudo = "### RELATÓRIO COMPLETO DE TICKETS (AVALIAÇÃO ≤ 3) ###\n\n";
    let maiorData = ultimaDataSalva;

    ticketsNovos.forEach((ticket) => {
      // As informações do ticket agora estão no objeto principal 'ticket'
      const dataFinal = new Date(ticket.finished_at);

      if (!maiorData || dataFinal > maiorData) {
        maiorData = dataFinal;
      }

      conteudo += `---\n`;
      conteudo += `👤CLIENTE: ${ticket.contact_name || 'Nome não disponível'}\n`;
      const dataFormatada = ticket.finished_at
        ? new Date(ticket.finished_at).toLocaleString('pt-BR', {
          timeZone: 'America/Sao_Paulo',
          day: '2-digit',
          month: '2-digit',
          year: 'numeric',
          hour: '2-digit',
          minute: '2-digit'
        })
        : 'Data não disponível';

      conteudo += `🗓️ DATA: ${dataFormatada}\n`;
      conteudo += `📌 Ticket #: ${ticket.ticketId}\n`;
      conteudo += `🆔 ID de Rastreamento: ${ticket.ticket_tracking_id}\n`;
      conteudo += `👤 Atendente: ${ticket.user_name || "Sem Atendente"}\n`;
      conteudo += `⭐ Avaliação: ${ticket.rating_rate} (${ticket.rating_comment || "sem comentário"})
`;

      const tempos = calcularTempos(ticket);
      conteudo += `⏱️ Tempo na fila: ${tempos.fila}\n`;
      conteudo += `🛠️ Tempo em atendimento: ${tempos.atendimento}\n\n`;
      conteudo += `📨 MENSAGENS (${ticket.mensagens.length}) - ORDEM CRONOLÓGICA:\n`;

      // A query já retorna as mensagens ordenadas, mas uma ordenação extra aqui não prejudica.
      const mensagensOrdenadas = ticket.mensagens;

      mensagensOrdenadas.forEach((msg, index) => {
        const remetente = msg.fromMe ? 'Atendente' : 'Cliente';
        const dataHora = new Date(msg.createdAt).toLocaleString('pt-BR', {
          timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', year: 'numeric',
          hour: '2-digit', minute: '2-digit', second: '2-digit'
        });

        let corpoMensagem = msg.body;
        if (msg.mediaType && !['chat', 'conversation', 'extendedTextMessage'].includes(msg.mediaType)) {
          corpoMensagem = `[Mídia: ${msg.mediaType}] ${msg.mediaUrl || ''}`;
        }

        conteudo += `\n[${index + 1}] (${remetente}) em ${dataHora}:\n${corpoMensagem}\n`;
      });

      conteudo += `\n`;
    });

    conteudo += `---\n📊 RESUMO: ${ticketsNovos.length} novos tickets analisados\n`;

    fs.writeFileSync(relatorioPath, conteudo);
    console.log('✅ Relatório gerado com sucesso em ' + relatorioPath);

    // Envia por email
    const enviado = await enviarRelatorioPorEmail(['rafael.bke@gmail.com', 'guilherme@logicbox.com.br', 'anderson.souza@logicbox.com.br','deyvid@logicbox.com.br'], relatorioPath);
    //await enviarRelatorioPorEmail('rafael.bke@gmail.com', relatorioPath);

    // Atualiza o histórico somente se o e-mail foi enviado (senão tenta de novo na próxima chamada)
    if (enviado && maiorData) {
      salvarUltimaData(maiorData);
      console.log("🕒 Última data registrada:", maiorData.toISOString());
    }

  } catch (error) {
    console.error('❌ Erro ao gerar ou enviar relatório:', error.message);
  } finally {
    emExecucao = false;
  }
}

module.exports = { gerarRelatorio, calcularTempos };
