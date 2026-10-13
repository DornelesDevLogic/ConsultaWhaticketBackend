const pool = require('./db'); // Usar o pool de conexões compartilhado

async function consultaUserRatings(maxRate = 3, startDate = null, endDate = null, ticketId = null) {
  try {
    let query = `
         WITH LowRatedTicketTracking AS (
          -- Seleciona os dados relevantes dos tickets com avaliação <= 3
          SELECT
            tt.id AS ticket_tracking_id,
            tt."ticketId" AS target_ticket_id,
            tt."createdAt" AS start_time,
            -- Se "finishedAt" for NULL, usa LOCALTIMESTAMP como end_time
            COALESCE(tt."finishedAt", LOCALTIMESTAMP) AS end_time,
            tt."userId" AS user_id, -- userId do atendente que lidou com o ticket de baixa avaliação
            urn.comment AS rating_comment, -- Adicionado: o comentário da avaliação
            urn.rate AS rating_rate, -- Adicionado: a nota da avaliação
            tt."queuedAt" AS queued_at, -- Adicionado: queuedAt do TicketTraking
            tt."startedAt" AS started_at, -- Adicionado: startedAt do TicketTraking
            tt."finishedAt" AS finished_at -- Adicionado: finishedAt do TicketTraking
          FROM "UserRatingsNew" urn
          JOIN "TicketTraking" tt ON urn."TicketTrakingId" = tt.id
          WHERE urn.rate <= $1`;
    
    let params = [maxRate];
    let paramIndex = 2;
    
    if (startDate && endDate) {
      query += ` AND (DATE(tt."startedAt") BETWEEN $${paramIndex} AND $${paramIndex + 1} OR DATE(tt."finishedAt") BETWEEN $${paramIndex} AND $${paramIndex + 1})`;
      params.push(startDate, endDate);
      paramIndex += 2;
    }
    
    if (ticketId) {
      query += ` AND tt."ticketId" = $${paramIndex}`;
      params.push(ticketId);
    }
    
    query += `
        )
        SELECT
          m.*, -- Seleciona todas as colunas da tabela "Messages"
          lrt.user_id, -- Adiciona o userId do TicketTraking (atendente)
          -- Tenta obter o nome do usuário de TicketTraking, senão da tabela Tickets, senão 'Sem Atendente'
          COALESCE(U_lrt.name, U_t.name, 'Sem Atendente') AS user_name,
          lrt.ticket_tracking_id, -- Adiciona o ID do registro TicketTraking que gerou a baixa avaliação
          lrt.rating_comment, -- Adicionado: o comentário da avaliação
          lrt.rating_rate, -- Adicionado: a nota da avaliação
          lrt.queued_at, -- Adicionado: queuedAt do TicketTraking
          lrt.started_at, -- Adicionado: startedAt do TicketTraking
          lrt.finished_at, -- Adicionado: finishedAt do TicketTraking
          m."updatedAt" ,-- Adicionado: updatedAt da mensagem
          C_msg.Name AS contact_name_message -- Adicionado: Nome do contato da mensagem
        FROM "Messages" m
        JOIN LowRatedTicketTracking lrt ON m."ticketId" = lrt.target_ticket_id
        LEFT JOIN "Tickets" T ON T.id = lrt.target_ticket_id -- JOIN para obter o userId do ticket
        LEFT JOIN "Users" U_lrt ON U_lrt.id = lrt.user_id -- JOIN para obter o nome do usuário do TicketTraking
        LEFT JOIN "Users" U_t ON U_t.id = T."userId" -- JOIN para obter o nome do usuário do Ticket
        LEFT JOIN "Contacts" C_msg ON C_msg.id = m."contactId" -- Novo JOIN para obter o nome do contato da mensagem
        WHERE m."createdAt" >= lrt.start_time
          AND m."createdAt" <= lrt.end_time
        ORDER BY lrt.target_ticket_id, m."createdAt"; -- Ordena para facilitar a visualização por ticket e cronologicamente
    `;
    
    console.log('Query final:', query);
    console.log('Parâmetros:', params);
    
    const result = await pool.query(query, params);
    
    console.log('Resultados encontrados:', result.rows.length);
    
    const groupedTickets = result.rows.reduce((acc, row) => {
      const {
        // Informações do ticket (de lrt e U)
        ticketId, // Este é m."ticketId"
        ticket_tracking_id,
        user_id,
        user_name,
        rating_comment,
        rating_rate,
        queued_at,
        started_at,
        finished_at,
        contact_name_message,

        // Informações da mensagem (de m.*)
        id: messageId,
        body,
        mediaUrl,
        mediaType,
        read,
        fromMe,
        createdAt,
        updatedAt,
        contactId,
        quotedMsgId
      } = row;

      // Agrupa por ticket_tracking_id (cada avaliação) e NÃO por ticketId: um mesmo ticket pode ser
      // reaberto e avaliado várias vezes, e agrupar por ticketId escondia as avaliações novas
      // dentro do registro mais antigo (o e-mail de nota baixa nunca saía para esses casos).
      if (!acc[ticket_tracking_id]) {
        acc[ticket_tracking_id] = {
          ticketId,
          ticket_tracking_id,
          user_id,
          user_name,
          rating_comment,
          rating_rate,
          queued_at,
          started_at,
          finished_at,
          contact_name: contact_name_message, // Define o nome do contato com base na primeira mensagem
          mensagens: [],
        };
      }
      // Se o nome do contato do ticket ainda for nulo (porque a primeira mensagem não o tinha),
      // tenta preencher com o nome do contato da mensagem atual, se ela tiver um.
      // Isso garante que peguemos o primeiro nome de contato disponível na conversa.
      else if (!acc[ticket_tracking_id].contact_name && contact_name_message) {
        acc[ticket_tracking_id].contact_name = contact_name_message;
      }

      // Se o nome do atendente do ticket ainda for 'Sem Atendente',
      // tenta extrair da mensagem atual se for do atendente.
      // Padrão esperado: "*Nome do Atendente:* ..."
      if (acc[ticket_tracking_id].user_name === 'Sem Atendente' && fromMe && body) {
        const match = body.match(/^\*([^:]+):\*?/);
        if (match && match[1]) {
          acc[ticket_tracking_id].user_name = match[1].trim();
        }
      }

      // A query já ordena as mensagens por data, então apenas as adicionamos.
      acc[ticket_tracking_id].mensagens.push({ id: messageId, body, mediaUrl, mediaType, read, fromMe, createdAt, updatedAt, contactId, quotedMsgId });

      return acc;
    }, {});

    return Object.values(groupedTickets);

  } catch (error) {
    console.error(error);
    throw new Error('Erro ao consultar o banco de dados.');
  }
}

async function consultaAvaliacoesDoMes(startDate = null, endDate = null, ticketId = null) {
  try {
    let query = `
         WITH LowRatedTicketTracking AS (
          SELECT
            tt.id AS ticket_tracking_id,
            tt."ticketId" AS target_ticket_id,
            tt."createdAt" AS start_time,
            COALESCE(tt."finishedAt", LOCALTIMESTAMP) AS end_time,
            tt."userId" AS user_id,
            urn.comment AS rating_comment,
            urn.rate AS rating_rate,
            tt."queuedAt" AS queued_at,
            tt."startedAt" AS started_at,
            tt."finishedAt" AS finished_at
          FROM "UserRatingsNew" urn
          JOIN "TicketTraking" tt ON urn."TicketTrakingId" = tt.id
          WHERE urn.rate <= 5`;

    const params = [];
    let paramIndex = 1;

    if (startDate && endDate) {
      query += ` AND (DATE(tt."startedAt") BETWEEN $${paramIndex} AND $${paramIndex + 1} OR DATE(tt."finishedAt") BETWEEN $${paramIndex} AND $${paramIndex + 1})`;
      params.push(startDate.split(' ')[0], endDate.split(' ')[0]);
      paramIndex += 2;
    } else {
      query += ` AND DATE_TRUNC('month', tt."finishedAt") = DATE_TRUNC('month', CURRENT_DATE)`;
    }

    if (ticketId) {
      query += ` AND tt."ticketId" = $${paramIndex}`;
      params.push(ticketId);
    }
    
    query += `
        )
        SELECT
          m.*,
          lrt.user_id,
          COALESCE(U_lrt.name, U_t.name, 'Sem Atendente') AS user_name,
          lrt.ticket_tracking_id,
          lrt.rating_comment,
          lrt.rating_rate,
          lrt.queued_at,
          lrt.started_at,
          lrt.finished_at,
          m."updatedAt",
          C_msg."name" AS contact_name_message
        FROM "Messages" m
        JOIN LowRatedTicketTracking lrt ON m."ticketId" = lrt.target_ticket_id
        LEFT JOIN "Tickets" T ON T.id = lrt.target_ticket_id
        LEFT JOIN "Users" U_lrt ON U_lrt.id = lrt.user_id
        LEFT JOIN "Users" U_t ON U_t.id = T."userId"
        LEFT JOIN "Contacts" C_msg ON C_msg.id = m."contactId"
        WHERE m."createdAt" >= lrt.start_time
          AND m."createdAt" <= lrt.end_time
        ORDER BY lrt.target_ticket_id, m."createdAt";
    `;
    
    console.log('Query final:', query);
    console.log('Parâmetros:', params);
    
    const result = await pool.query(query, params);
    
    console.log('Resultados encontrados:', result.rows.length);
    
    const groupedTickets = result.rows.reduce((acc, row) => {
      const {
        ticketId,
        ticket_tracking_id,
        user_id,
        user_name,
        rating_comment,
        rating_rate,
        queued_at,
        started_at,
        finished_at,
        contact_name_message,
        id: messageId,
        body,
        mediaUrl,
        mediaType,
        read,
        fromMe,
        createdAt,
        updatedAt,
        contactId,
        quotedMsgId
      } = row;

      if (!acc[ticket_tracking_id]) {
        acc[ticket_tracking_id] = {
          ticketId,
          ticket_tracking_id,
          user_id,
          user_name,
          rating_comment,
          rating_rate,
          queued_at,
          started_at,
          finished_at,
          contact_name: contact_name_message,
          mensagens: [],
        };
      }
      else if (!acc[ticket_tracking_id].contact_name && contact_name_message) {
        acc[ticket_tracking_id].contact_name = contact_name_message;
      }

      if (acc[ticket_tracking_id].user_name === 'Sem Atendente' && fromMe && body) {
        const match = body.match(/^\*([^:]+):\*?/);
        if (match && match[1]) {
          acc[ticket_tracking_id].user_name = match[1].trim();
        }
      }

      acc[ticket_tracking_id].mensagens.push({ id: messageId, body, mediaUrl, mediaType, read, fromMe, createdAt, updatedAt, contactId, quotedMsgId });

      return acc;
    }, {});

    return Object.values(groupedTickets);

  } catch (error) {
    console.error(error);
    throw new Error('Erro ao consultar o banco de dados.');
  }
}

async function consultaAvaliacoesRapida(startDate = null, endDate = null, ticketId = null) {
  try {
    let query = `
         WITH LowRatedTicketTracking AS (
          SELECT
            tt.id AS ticket_tracking_id,
            tt."ticketId" AS target_ticket_id,
            tt."userId" AS user_id,
            urn.comment AS rating_comment,
            urn.rate AS rating_rate,
            tt."queuedAt" AS queued_at,
            tt."startedAt" AS started_at,
            tt."finishedAt" AS finished_at
          FROM "UserRatingsNew" urn
          JOIN "TicketTraking" tt ON urn."TicketTrakingId" = tt.id
          WHERE urn.rate <= 5`;

    const params = [];
    let paramIndex = 1;

    if (startDate && endDate) {
      query += ` AND (DATE(tt."startedAt") BETWEEN $${paramIndex} AND $${paramIndex + 1} OR DATE(tt."finishedAt") BETWEEN $${paramIndex} AND $${paramIndex + 1})`;
      params.push(startDate.split(' ')[0], endDate.split(' ')[0]);
      paramIndex += 2;
    } else {
      query += ` AND DATE_TRUNC('month', tt."finishedAt") = DATE_TRUNC('month', CURRENT_DATE)`;
    }

    if (ticketId) {
      query += ` AND tt."ticketId" = $${paramIndex}`;
      params.push(ticketId);
    }
    
    query += `
        )
        SELECT
          lrt.target_ticket_id AS ticketId,
          lrt.ticket_tracking_id,
          lrt.user_id,
          COALESCE(U_lrt.name, U_t.name, 'Sem Atendente') AS user_name,
          lrt.rating_comment,
          lrt.rating_rate,
          lrt.queued_at,
          lrt.started_at,
          lrt.finished_at,
          C."name" AS contact_name
        FROM LowRatedTicketTracking lrt
        LEFT JOIN "Tickets" T ON T.id = lrt.target_ticket_id
        LEFT JOIN "Users" U_lrt ON U_lrt.id = lrt.user_id
        LEFT JOIN "Users" U_t ON U_t.id = T."userId"
        LEFT JOIN "Contacts" C ON C.id = T."contactId"
        ORDER BY lrt.ticket_tracking_id;
    `;
    
    const result = await pool.query(query, params);
    
    return result.rows;

  } catch (error) {
    console.error(error);
    throw new Error('Erro ao consultar o banco de dados.');
  }
}

module.exports = {
  consultaUserRatings,
  consultaAvaliacoesDoMes,
  consultaAvaliacoesRapida,
};
