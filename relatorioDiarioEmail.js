require('dotenv').config();
const { Pool } = require('pg');
const postgresConnection = require('./postgresConnection');
const nodemailer = require('nodemailer');
const axios = require('axios');

async function conectarPostgreSQL() {
  const pool = new Pool({
    ...postgresConnection,
    connectionTimeoutMillis: 5000,
    idleTimeoutMillis: 30000,
    max: 10
  });
  
  pool.on('error', (err) => {
    console.error('Erro no pool PostgreSQL:', err.message);
  });
  
  return pool;
}

// Função para obter mensagens dos técnicos usando endpoint existente
async function obterMensagensTecnicos(data = null) {
  const dataConsulta = data || new Date().toISOString().split('T')[0];
  
  try {
    const url = `http://localhost:5000/api/consulta-mensagens-dia?data=${dataConsulta}`;
    const response = await axios.get(url);
    
    // Agrupar e contar mensagens por técnico
    const contadorMensagens = {};
    
    response.data.forEach(mensagem => {
      const nomeUsuario = mensagem.nome_usuario;
      if (!contadorMensagens[nomeUsuario]) {
        contadorMensagens[nomeUsuario] = 0;
      }
      contadorMensagens[nomeUsuario]++;
    });
    
    // Converter para formato esperado
    return Object.entries(contadorMensagens).map(([nome, count]) => ({
      tecnico_id: null,
      tecnico_nome: nome,
      mensagens_enviadas: count
    }));
  } catch (error) {
    console.error('Erro ao consultar endpoint de mensagens:', error.message);
    return [];
  }
}

// Função para obter chamados encerrados usando endpoint existente
async function obterChamadosEncerrados(data = null) {
  const dataConsulta = data || new Date().toISOString().split('T')[0];
  const dataInicio = `${dataConsulta}T00:00:00`;
  const dataFim = `${dataConsulta}T23:59:59`;
  
  try {
    const url = `http://localhost:5000/api/tickets-encerrados-por-tecnico?data_inicio=${dataInicio}&data_fim=${dataFim}`;
    const response = await axios.get(url);
    
    // Converter formato do endpoint para o formato esperado
    return response.data.map(item => ({
      tecnico_id: null, // Não temos ID no endpoint
      tecnico_nome: item.tecnico,
      chamados_encerrados: parseInt(item.tickets_encerrados)
    }));
  } catch (error) {
    console.error('Erro ao consultar endpoint de tickets encerrados:', error.message);
    return [];
  }
}

// Função para validar chamados encerrados usando SQL do exemplo
async function validarChamadosEncerrados(data = null) {
  const pool = await conectarPostgreSQL();
  const dataConsulta = data || new Date().toISOString().split('T')[0];
  const [year, month, day] = dataConsulta.split('-');
  
  try {
    const query = `
      SELECT
          U.id AS USUARIO_CODIGO,
          U.name AS USUARIO_NOME,
          COUNT(DISTINCT T.id) as total_tickets_encerrados
      FROM "Messages" M
      LEFT OUTER JOIN "Contacts" C ON C.id = M."contactId"
      LEFT OUTER JOIN "Tickets" T ON T.id = M."ticketId"
      LEFT OUTER JOIN "Users" U ON U.id = T."userId"
      LEFT OUTER JOIN "Whatsapps" W ON W.id = T."whatsappId"
      LEFT JOIN (
          SELECT DISTINCT ON ("ticketId") 
              "ticketId", 
              "finishedAt"
          FROM "TicketTraking"
          WHERE "finishedAt" IS NOT NULL
          ORDER BY "ticketId", "finishedAt" DESC
      ) TT ON TT."ticketId" = T.id
      WHERE 1 = 1
          AND T.status = 'closed'
          AND DATE(M."createdAt") = DATE($1 || '-' || $2 || '-' || $3)
          AND U.id IS NOT NULL
      GROUP BY U.id, U.name
      ORDER BY U.name;
    `;
    
    const result = await pool.query(query, [year, month, day]);
    return result.rows;
  } finally {
    await pool.end();
  }
}

// Função para obter chamados pendentes
async function obterChamadosPendentes() {
  const pool = await conectarPostgreSQL();
  
  try {
    const query = `
      SELECT 
        t.id as ticket_id,
        c.name as cliente_nome,
        u.name as tecnico_nome,
        t."createdAt" as data_abertura,
        t."updatedAt" as ultima_atualizacao,
        t.status,
        EXTRACT(EPOCH FROM (NOW() - t."updatedAt")) as segundos_aguardando
      FROM "Tickets" t
      JOIN "Contacts" c ON c.id = t."contactId"
      LEFT JOIN "Users" u ON u.id = t."userId"
      WHERE t.status = 'pending'
      ORDER BY t."createdAt" ASC;
    `;
    
    const result = await pool.query(query);
    return result.rows;
  } catch (error) {
    console.error('Erro ao obter chamados pendentes:', error.message);
    return [];
  } finally {
    if (pool) await pool.end();
  }
}

// Função principal para gerar relatório completo
async function gerarRelatorioDiario(data = null) {
  try {
    const dataRelatorio = data || new Date().toISOString().split('T')[0];
    
    console.log(`Gerando relatório para ${dataRelatorio}`);
    
    const [mensagensTecnicos, chamadosEncerrados, chamadosPendentes] = await Promise.all([
      obterMensagensTecnicos(dataRelatorio),
      obterChamadosEncerrados(dataRelatorio),
      obterChamadosPendentes()
    ]);
    
    // Combinar dados de mensagens e chamados encerrados
    const todosTecnicos = new Map();
    
    // Adicionar mensagens (usar nome como chave já que não temos ID)
    mensagensTecnicos.forEach(tecnico => {
      todosTecnicos.set(tecnico.tecnico_nome, {
        tecnico_id: null,
        tecnico_nome: tecnico.tecnico_nome,
        mensagens_enviadas: tecnico.mensagens_enviadas,
        chamados_encerrados: 0
      });
    });
    
    // Adicionar chamados encerrados
    chamadosEncerrados.forEach(tecnico => {
      if (todosTecnicos.has(tecnico.tecnico_nome)) {
        todosTecnicos.get(tecnico.tecnico_nome).chamados_encerrados = tecnico.chamados_encerrados;
      } else {
        todosTecnicos.set(tecnico.tecnico_nome, {
          tecnico_id: null,
          tecnico_nome: tecnico.tecnico_nome,
          mensagens_enviadas: 0,
          chamados_encerrados: tecnico.chamados_encerrados
        });
      }
    });
    
    const desempenhoTecnicos = Array.from(todosTecnicos.values())
      .filter(t => t.mensagens_enviadas > 0 || t.chamados_encerrados > 0)
      .sort((a, b) => b.mensagens_enviadas - a.mensagens_enviadas);
    
    const relatorio = {
      data: dataRelatorio,
      resumo: {
        total_tecnicos_ativos: desempenhoTecnicos.length,
        total_mensagens_dia: desempenhoTecnicos.reduce((sum, t) => sum + t.mensagens_enviadas, 0),
        total_chamados_encerrados: desempenhoTecnicos.reduce((sum, t) => sum + t.chamados_encerrados, 0),
        total_chamados_pendentes: chamadosPendentes.length
      },
      desempenho_tecnicos: desempenhoTecnicos,
      chamados_pendentes: chamadosPendentes.map(c => {
        const segundos = Math.floor(c.segundos_aguardando);
        const dias = Math.floor(segundos / 86400);
        const horas = Math.floor((segundos % 86400) / 3600);
        const minutos = Math.floor((segundos % 3600) / 60);
        const segs = segundos % 60;
        
        return {
          ...c,
          tempo_esperando: `${String(dias).padStart(2, '0')}d ${String(horas).padStart(2, '0')}h ${String(minutos).padStart(2, '0')}m ${String(segs).padStart(2, '0')}s`,
          ultima_atualizacao_formatada: new Date(c.ultima_atualizacao).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })
        };
      })
    };
    
    return relatorio;
  } catch (error) {
    console.error('Erro ao gerar relatório:', error);
    throw error;
  }
}

// Função para enviar email com relatório
async function enviarEmailRelatorio(relatorio) {
  const transporter = nodemailer.createTransport({
    host: 'smtp.kinghost.net',
    port: 465,
    secure: true,
    auth: {
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_PASS,
    },
  });

  const htmlContent = `
    <div style="font-family: Arial, sans-serif; max-width: 800px; margin: 0 auto; background: #f5f5f5; padding: 20px;">
      <div style="background: white; border-radius: 10px; padding: 30px; box-shadow: 0 4px 6px rgba(0,0,0,0.1);">
        <h1 style="color: #2c3e50; text-align: center; margin-bottom: 30px;">📊 Relatório Diário - ${relatorio.data}</h1>
        
        <div style="display: flex; justify-content: space-around; margin-bottom: 30px;">
          <div style="background: #3498db; color: white; padding: 20px; border-radius: 8px; text-align: center; min-width: 150px;">
            <h3 style="margin: 0; font-size: 14px;">👥 Técnicos</h3>
            <p style="margin: 10px 0 0 0; font-size: 24px; font-weight: bold;">${relatorio.resumo.total_tecnicos_ativos}</p>
          </div>
          <div style="background: #27ae60; color: white; padding: 20px; border-radius: 8px; text-align: center; min-width: 150px;">
            <h3 style="margin: 0; font-size: 14px;">💬 Mensagens</h3>
            <p style="margin: 10px 0 0 0; font-size: 24px; font-weight: bold;">${relatorio.resumo.total_mensagens_dia}</p>
          </div>
          <div style="background: #e74c3c; color: white; padding: 20px; border-radius: 8px; text-align: center; min-width: 150px;">
            <h3 style="margin: 0; font-size: 14px;">✅ Encerrados</h3>
            <p style="margin: 10px 0 0 0; font-size: 24px; font-weight: bold;">${relatorio.resumo.total_chamados_encerrados}</p>
          </div>
          <div style="background: #f39c12; color: white; padding: 20px; border-radius: 8px; text-align: center; min-width: 150px;">
            <h3 style="margin: 0; font-size: 14px;">⏳ Pendentes</h3>
            <p style="margin: 10px 0 0 0; font-size: 24px; font-weight: bold;">${relatorio.resumo.total_chamados_pendentes}</p>
          </div>
        </div>

        <h2 style="color: #2c3e50; border-bottom: 2px solid #ecf0f1; padding-bottom: 10px;">🎯 Desempenho dos Técnicos</h2>
        <table style="width: 100%; border-collapse: collapse; margin-bottom: 30px;">
          <thead>
            <tr style="background: #34495e; color: white;">
              <th style="padding: 12px; text-align: left;">Técnico</th>
              <th style="padding: 12px; text-align: center;">Mensagens</th>
              <th style="padding: 12px; text-align: center;">Encerrados</th>
            </tr>
          </thead>
          <tbody>
            ${relatorio.desempenho_tecnicos.map((tecnico, index) => `
              <tr style="background: ${index % 2 === 0 ? '#f8f9fa' : 'white'};">
                <td style="padding: 12px;">${tecnico.tecnico_nome}</td>
                <td style="padding: 12px; text-align: center; font-weight: bold; color: #27ae60;">${tecnico.mensagens_enviadas}</td>
                <td style="padding: 12px; text-align: center; font-weight: bold; color: #e74c3c;">${tecnico.chamados_encerrados}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>

        ${relatorio.chamados_pendentes.length > 0 ? `
        <h2 style="color: #2c3e50; border-bottom: 2px solid #ecf0f1; padding-bottom: 10px;">⏳ Chamados Pendentes (${relatorio.resumo.total_chamados_pendentes})</h2>
        <table style="width: 100%; border-collapse: collapse;">
          <thead>
            <tr style="background: #f39c12; color: white;">
              <th style="padding: 12px; text-align: left;">Cliente</th>
              <th style="padding: 12px; text-align: left;">Técnico</th>
              <th style="padding: 12px; text-align: center;">Tempo Esperando</th>
              <th style="padding: 12px; text-align: center;">Última Atualização</th>
            </tr>
          </thead>
          <tbody>
            ${relatorio.chamados_pendentes.map((chamado, index) => `
              <tr style="background: ${index % 2 === 0 ? '#f8f9fa' : 'white'};">
                <td style="padding: 12px;">${chamado.cliente_nome}</td>
                <td style="padding: 12px;">${chamado.tecnico_nome || 'Não atribuído'}</td>
                <td style="padding: 12px; text-align: center; font-weight: bold; color: #e74c3c;">${chamado.tempo_esperando}</td>
                <td style="padding: 12px; text-align: center; font-size: 12px;">${chamado.ultima_atualizacao_formatada}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
        ` : '<p style="text-align: center; color: #27ae60; font-size: 18px; margin: 20px 0;">🎉 Nenhum chamado pendente!</p>'}
        
        <div style="margin-top: 30px; padding: 20px; background: #ecf0f1; border-radius: 8px; text-align: center;">
          <p style="margin: 0; color: #7f8c8d; font-size: 12px;">Relatório gerado em ${new Date().toLocaleString('pt-BR')}</p>
        </div>
      </div>
    </div>
  `;

  const mailOptions = {
    from: '"Relatórios Logicbox" <dorneles@logicbox.com.br>',
    to: 'dorneles.logicbox@gmail.com, guilherme@logicbox.com.br',
    subject: `📊 Relatório Diário - ${relatorio.data}`,
    html: htmlContent
  };

  await transporter.sendMail(mailOptions);
  console.log('✅ Email enviado com sucesso!');
}

// Função principal com envio de email
async function gerarRelatorioDiarioComEmail(data = null) {
  const relatorio = await gerarRelatorioDiario(data);
  await enviarEmailRelatorio(relatorio);
  return relatorio;
}

module.exports = {
  obterMensagensTecnicos,
  obterChamadosEncerrados,
  obterChamadosPendentes,
  gerarRelatorioDiario,
  gerarRelatorioDiarioComEmail
};