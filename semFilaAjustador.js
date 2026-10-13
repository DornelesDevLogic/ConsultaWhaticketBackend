const pool = require('./db'); // agora usamos o pool global

function calcularTempoEsperaMinutos(updatedAt) {
  const agora = new Date();
  const atualizado = new Date(updatedAt);
  return Math.floor((agora - atualizado) / 60000);
}

function calcularTempoEsperaFormatado(updatedAt) {
  const minutos = calcularTempoEsperaMinutos(updatedAt);
  const horas = Math.floor(minutos / 60);
  const min = minutos % 60;
  return `${horas}h ${min}m`;
}

async function buscarTicketsSemFila() {
  console.log('CHEGOU NO buscarTicketsSemFila');

  // Agora usamos pool.query direto, sem precisar client.release()
  const query = `
    SELECT * 
    FROM "Tickets" t 
    WHERE t.status = 'pending' AND t."queueId" IS NULL
  `;
  const result = await pool.query(query);

  const ticketsComTempo = result.rows.map(ticket => ({
    ...ticket,
    tempo_espera: calcularTempoEsperaFormatado(ticket.updatedAt),
    tempo_espera_minutos: calcularTempoEsperaMinutos(ticket.updatedAt)
  }));

  const ticketsMais20min = ticketsComTempo.filter(t => t.tempo_espera_minutos > 20);

  if (ticketsMais20min.length > 0) {
    const ids = ticketsMais20min.map(t => t.id);
    await pool.query(`
      UPDATE "Tickets"
      SET "queueId" = 2
      WHERE id = ANY($1)
    `, [ids]);
    console.log(`Atualizados para fila 2: ${ids.length} tickets (IDs: ${ids.join(', ')})`);
  }

  return ticketsComTempo.map(({ tempo_espera_minutos, ...rest }) => rest);
}

module.exports = { buscarTicketsSemFila };
