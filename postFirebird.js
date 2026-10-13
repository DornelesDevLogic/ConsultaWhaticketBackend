const axios = require('axios');
const Firebird = require('node-firebird');
const iconv = require('iconv-lite');
const options = require('./firebirdConnectionOptions');

function concatenateMessagesByTicket(messages) {
  const messagesMap = new Map();

  for (const message of messages) {
    const ticket = message.AGENDA_TICKET;
    const currentMessage = message.MENSAGEM;

    if (messagesMap.has(ticket)) {
      messagesMap.get(ticket).push(currentMessage);
    } else {
      messagesMap.set(ticket, [currentMessage]);
    }
  }

  return messagesMap;
}

const connectionNameToCodeMap = {
  'Celular-Paiva': 1,
  'Celular-Vitor': 2,
  'Celular-Viviana': 3,
  'Celular-Rodrigues': 33,
  // Adicione outras associações de nome para código aqui
};

const userToCodeMap = {
  'Oliveira': 155,
  'Rodrigues': 229,
  'Rafael Dorneles': 206,
  'Deyvid': 208,
  'Paulo': 174,
  'Santos': 211,
  'Anderson Souza':219,
  'Marcelo': 225,
  'Anderson Paiva':210,
  'Gabriel Rosa':202,
  'Morales':104,
  'Vitor':222,
  'Vitor Silveira': 230,
  'Leandra':224,
  // Adicione outros usuários e seus códigos aqui
};

function consolidateClientCode(data) {
  const clientCodeMap = new Map();
  
  for (const message of data) {
    const ticket = message.AGENDA_TICKET;
    const codCli = message.COD_CLI;
    if (codCli && codCli !== 0) {
      clientCodeMap.set(ticket, codCli);
    }
  }

  return clientCodeMap;
}

function extractClientCode(clienteNome) {
  if (!clienteNome || typeof clienteNome !== 'string') {
    return 0;
  }
  const match = clienteNome.match(/\d{4,5}/);
  return match ? parseInt(match[0], 10) : 0;
}

async function insertDataToFirebird(day, month, year) {
  console.log("Entrou na função insertDataToFirebird");
  console.log("Data recebida:", { day, month, year });

  try {
    // Obter dados da API
    const response = await axios.get(`http://localhost:5000/api/consultacontacts?day=${day}&month=${month}&year=${year}`);
    const dataFromJSON = response.data;

    if (!dataFromJSON || dataFromJSON.length === 0) {
      console.log("Nenhum dado encontrado para inserir.");
      return;
    }

    let agendasInseridas = 0;

    Firebird.attach(options, async function (err, db) {
      if (err) {
        console.error('Erro ao conectar ao banco de dados Firebird:', err.message);
        return;
      }

      for (const ticketData of dataFromJSON) {
        try {
          // Verifica duplicidade por ticket e horário de criação
          const exists = await new Promise((resolve, reject) => {
            db.query(
              'SELECT COUNT(*) AS TOTAL FROM TBLATENDIM WHERE PROTOCOLO_ATEND = ? AND DATA_ATENDIM = ?',
              [ticketData.agenda_ticket, ticketData.createdAt],
              function (err, result) {
                if (err) {
                  console.error(`Erro ao verificar duplicidade para o ticket ${ticketData.agenda_ticket}:`, err.message);
                  reject(err);
                } else {
                  resolve(result[0].TOTAL > 0);
                }
              }
            );
          });

          if (exists) {
            continue;
          }

          // Obter próximo valor do generator
          const result = await new Promise((resolve, reject) => {
            db.query('SELECT GEN_ID(GENERATOR_ATEND, 1) FROM RDB$DATABASE', [], function (err, result) {
              if (err) {
                console.error(`Erro ao obter o próximo valor do gerador para o ticket ${ticketData.agenda_ticket}:`, err.message);
                reject(err);
              } else {
                resolve(result);
              }
            });
          });

          const nextGeneratorValue = result[0].GEN_ID;

          // Extrair o código do cliente do nome
          const codCli = extractClientCode(ticketData.cliente_nome);

          // Query de inserção
          const insertQuery = `
            INSERT INTO TBLATENDIM (
              ID_ATENDIM, 
              DEFEITO, 
              SOLUCAO, 
              GERA_ATENDIM, 
              PROTOCOLO_ATEND, 
              TIPO_ATEND, 
              STATUS_ATENDIM, 
              COD_FUNC, 
              COD_CONTATO,
              DATA_PREVISAO, 
              DATA_ATENDIM, 
              HORA_ATEND, 
              VISTO, 
              DATA_TERMINO, 
              VENDEDOR, 
              ANDAMENTO, 
              COD_ENTIDADE, 
              FILIAL_ENTIDADE, 
              QUEM, 
              ENTIDADE, 
              STATUS_PARTICULAR, 
              DATA_LIGACAO, 
              HORA_PREVISAOINICIO, 
              HORA_PREVISAOFIM, 
              ID_CONTATO_CLI, 
              PERMITE_EDITAR,
              GERADA_AUTO
            ) 
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);
          `;

          const values = [
            nextGeneratorValue, // ID_ATENDIM
            ticketData.mensagens.join('\n') + `\n\n[TICKET: ${ticketData.agenda_ticket}]`, // DEFEITO
            'Solução exemplo', // SOLUCAO
            2, // GERA_ATENDIM
            ticketData.agenda_ticket, // PROTOCOLO_ATEND
            4, // TIPO_ATEND
            'PENDENTE', // STATUS_ATENDIM
            userToCodeMap[ticketData.usuario_nome] || 0, // COD_FUNC
            connectionNameToCodeMap[ticketData.conexao] || 0, // COD_CONTATO
            ticketData.createdAt, // DATA_PREVISAO
            ticketData.createdAt, // DATA_ATENDIM
            new Date(ticketData.createdAt).toISOString().split('T')[1].split('.')[0], // HORA_ATEND
            'SIM', // VISTO
            ticketData.createdAt, // DATA_TERMINO
            null, // VENDEDOR
            null, // ANDAMENTO
            codCli, // COD_ENTIDADE
            1, // FILIAL_ENTIDADE
            'Cliente', // QUEM
            ticketData.cliente_nome || 'Cliente não cadastrado', // ENTIDADE
            0, // STATUS_PARTICULAR
            null, // DATA_LIGACAO
            new Date(ticketData.penultimo_fechamento).toISOString().split('T')[1].split('.')[0], // HORA_PREVISAOINICIO
            new Date(ticketData.ultimo_fechamento).toISOString().split('T')[1].split('.')[0], // HORA_PREVISAOFIM
            null, // ID_CONTATO_CLI
            1, // PERMITE_EDITAR
            null, // GERADA_AUTO
          ];

          await new Promise((resolve, reject) => {
            db.query(insertQuery, values, function (err, result) {
              if (err) {
                console.error(`Erro ao inserir dados para o ticket ${ticketData.agenda_ticket}:`, err.message);
                reject(err);
              } else {
                agendasInseridas++;
                resolve(result);
              }
            });
          });

        } catch (error) {
          console.error('Erro ao processar ticket:', error.message);
        }
      }

      db.detach(function (err) {
        if (err) {
          console.error('Erro ao desconectar do banco de dados Firebird:', err.message);
        }
        console.log(`Total de agendas inseridas: ${agendasInseridas}`);
      });
    });

  } catch (error) {
    console.error('Erro ao obter dados do servidor ou ao processar:', error.message);
  }
}

module.exports = insertDataToFirebird;

