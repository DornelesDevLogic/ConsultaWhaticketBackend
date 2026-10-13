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

  async function consultaAtendimentosDiarios(day, month, year) { // Adicione day, month e year como parâmetros
    console.log("Chegou no consultaAtendimentosDiarios")
    console.log (day, month, year)
   
    

    try {
      
      // Conexão com o banco de dados MySQL
      const mysqlConnection = await conectarMySQL();
      const [rows] = await mysqlConnection.execute(`
      SELECT 

      COUNT(M.id),
      U.name
        
    FROM messages M
    LEFT OUTER JOIN tickets T ON M.ticketId = T.id
    LEFT OUTER JOIN users U ON T.userId = U.id
    WHERE 1=1  
     AND DAY(M.createdAt) = 8
     AND MONTH(M.createdAt) = 11 
     AND YEAR(M.createdAt) = 2023
    GROUP BY 2 
    ORDER BY 1 DESC 
    
      `, [day, month, year]); // Passe day, month e year como valores substitutos
      
      await mysqlConnection.end();
  
      return rows; // Retorna os resultados da consulta
  
    } catch (error) {
      console.error(error);
      throw new Error('Erro ao conectar ao banco de dados MySQL.');
    }
  }

  
module.exports = {
    testeBanco,
    consultaAtendimentosDiarios
};



