require('dotenv').config();
const nodemailer = require('nodemailer');
const fs = require('fs');

async function enviarRelatorioPorEmail(destinatario, caminhoDoArquivo) {
  try {
    const transporter = nodemailer.createTransport({
      host: 'smtp.kinghost.net',
      port: 465,
      secure: true,
      auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS,
      },
    });

    const conteudoRelatorio = fs.readFileSync(caminhoDoArquivo, 'utf8');

    // Data/hora no assunto para o Gmail não agrupar alertas diferentes na mesma conversa
    const dataHoraEnvio = new Date().toLocaleString('pt-BR', {
      timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', year: 'numeric',
      hour: '2-digit', minute: '2-digit'
    });

    const mailOptions = {
      from: `"Relatórios Logicbox" <${process.env.EMAIL_USER}>`,
      to: destinatario,
      subject: `Relatório de Tickets com Avaliação Baixa - ${dataHoraEnvio}`,
      text: conteudoRelatorio,
      attachments: [
        {
          filename: 'relatorio.txt',
          path: caminhoDoArquivo,
        },
      ],
    };

    await transporter.sendMail(mailOptions);
    console.log(`✅ E-mail enviado com sucesso para ${destinatario}`);
    return true;
  } catch (error) {
    console.error('❌ Erro ao enviar e-mail:', error.message);
    return false;
  }
}

module.exports = { enviarRelatorioPorEmail };
