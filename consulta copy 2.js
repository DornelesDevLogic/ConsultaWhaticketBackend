const conectarMySQL = require('./mysqlConnection');

async function testeBanco() {
    try {
      // Conexão com o banco de dados MySQL
      const mysqlConnection = await conectarMySQL();
      const [rows] = await mysqlConnection.execute('SELECT * FROM contacts');
      await mysqlConnection.end();
  
      return rows; // Retorna os resultados da consulta
  
    } catch (error) {
      console.error(error);
      throw new Error('Erro ao conectar ao banco de dados MySQL.');
    }
  }

async function consultacontacts() {
  try {
    // Conexão com o banco de dados MySQL
    const mysqlConnection = await conectarMySQL();
    const [rows] = await mysqlConnection.execute(`
    SELECT
    T.id AGENDA_TICKET,
    M.createdAt,
    C.name CLIENTE_NOME,
    U.name USUARIO_NOME,
    if((COALESCE(M.body,'') = '' AND M.mediaType <> 'chat'),M.mediaUrl,M.body) MENSAGEM,
     U.id USUARIO_CODIGO,
    U.name USUARIO_NOME,	
    W.id,
    W.name CONEXAO,
     if(POSITION(' - ' IN C.name) > 0,SUBSTRING(C.name FROM POSITION(' - ' IN C.name)+3),0)+0 COD_CLI,
    C.number CEL_CLIENTE,
    W.number CEL_ATENDENTE
      
    FROM Messages M
    LEFT OUTER JOIN Contacts C ON C.id = M.contactId
    LEFT OUTER JOIN Tickets T ON T.id = M.ticketId
    LEFT OUTER JOIN Users U ON U.id = T.userId
    LEFT OUTER JOIN Whatsapps W ON W.id = T.whatsappId
    
    WHERE 1 = 1
    AND DAY(M.createdAt) = 3
    AND MONTH(M.createdAt) = 7
    AND YEAR(M.createdAt) = 2023
    AND T.status = 'closed'
    
      `);
            
    await mysqlConnection.end();

    return rows; // Retorna os resultados da consulta

  } catch (error) {
    console.error(error);
    throw new Error('Erro ao conectar ao banco de dados MySQL.');
  }
}

module.exports = {
    testeBanco,
    consultacontacts
};
