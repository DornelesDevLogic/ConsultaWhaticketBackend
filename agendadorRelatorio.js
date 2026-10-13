const cron = require('node-cron');
const { gerarRelatorioDiarioComEmail } = require('./relatorioDiarioEmail');
const { salvarMediaTempoFila } = require('./consultaMediaTempoFila');
const { gerarRelatorio } = require('./emailRelatorioUserRatingsNEW');

// Agendar para rodar todos os dias às 17:50
function iniciarAgendadorRelatorio() {
  // Formato: minuto hora dia mês dia-da-semana
  // 50 17 * * * = 17:50 todos os dias
  cron.schedule('10 18 * * *', async () => {
    try {
      console.log('🕐 Executando relatório diário automático às 17:50...');
      await gerarRelatorioDiarioComEmail();
      console.log('✅ Relatório diário enviado automaticamente!');
    } catch (error) {
      console.error('❌ Erro ao enviar relatório automático:', error);
    }
  }, {
    scheduled: true,
    timezone: "America/Sao_Paulo"
  });

  // Agendar para salvar média de tempo de fila todos os dias às 20:00
  cron.schedule('0 20 * * *', async () => {
    try {
      console.log('🕐 Executando salvamento de média de tempo de fila às 20:00...');
      const resultado = await salvarMediaTempoFila();
      console.log('✅ Média de tempo de fila salva automaticamente!', resultado);
    } catch (error) {
      console.error('❌ Erro ao salvar média de tempo de fila:', error);
    }
  }, {
    scheduled: true,
    timezone: "America/Sao_Paulo"
  });

  // Verificar avaliações baixas (≤ 3) a cada 5 minutos e enviar e-mail se houver novas.
  // Antes isso era disparado pelo frontend a cada atualização da tela, o que gerava e-mails duplicados.
  cron.schedule('*/5 * * * *', async () => {
    await gerarRelatorio();
  }, {
    scheduled: true,
    timezone: "America/Sao_Paulo"
  });

  console.log('📅 Agendador de avaliações baixas iniciado - Verificará a cada 5 minutos');
  console.log('📅 Agendador de relatório iniciado - Enviará email todos os dias às 18:10');
  console.log('📅 Agendador de média de tempo de fila iniciado - Salvará dados todos os dias às 20:00');
}

module.exports = { iniciarAgendadorRelatorio };
