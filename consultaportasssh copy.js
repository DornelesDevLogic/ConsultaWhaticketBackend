const net = require('net');

function consultaportasssh(){
    function verificarPorta(host, porta) {
        return new Promise((resolve) => {
          const socket = new net.Socket();
      
          socket.setTimeout(1000); // Defina um tempo limite para a conexão
      
          socket.on('connect', () => {
            socket.destroy();
            resolve(true);
          });
      
          socket.on('timeout', () => {
            socket.destroy();
            resolve(false);
          });
      
          socket.on('error', () => {
            socket.destroy();
            resolve(false);
          });
      
          socket.connect(porta, host);
        });
      }
      
      const host = 'ssh.mine.nu';
      const repeticoesMaximas = 5; // Altere conforme necessário
      const intervaloDeRepeticao = 5000; // Intervalo em milissegundos entre repetições
      
      async function testarPortas() {
        console.log("entrou na função testarportas")
        let totalRepeticoes = 0;
        let portasAbertasTotal = 0;
        const contagemPortasAbertas = {}; // Objeto para rastrear contagem de portas abertas
      
        while (totalRepeticoes < repeticoesMaximas) {
          let portasAbertas = 0;
          let portasFechadas = 0;
          const portasAbertasCiclo = []; // Array para armazenar portas abertas durante o ciclo
      
          const portasIniciais = 5000;
          const portasFinais = 5010;
      
          for (let porta = portasIniciais; porta <= portasFinais; porta++) {
            const result = await verificarPorta(host, porta);
      
            if (result) {
              portasAbertas++;
      
              if (!contagemPortasAbertas[porta]) {
                contagemPortasAbertas[porta] = 1;
              } else {
                contagemPortasAbertas[porta]++;
              }
      
              portasAbertasTotal++;
              portasAbertasCiclo.push(porta);
            } else {
              portasFechadas++;
            }
          }
      
          console.log(`\nResultados da repetição ${totalRepeticoes + 1}:`);
          console.log(`Portas Abertas: ${portasAbertas}`);
          console.log(`Portas Fechadas: ${portasFechadas}`);
      
          // Exibir as portas abertas durante o ciclo
          if (portasAbertasCiclo.length > 0) {
            console.log(`Portas Abertas no Ciclo: ${portasAbertasCiclo.join(', ')}`);
          } else {
            console.log('Nenhuma porta aberta no ciclo.');
          }
      
          totalRepeticoes++;
      
          if (totalRepeticoes < repeticoesMaximas) {
            console.log(`\nAguardando ${intervaloDeRepeticao / 1000} segundos antes da próxima repetição...\n`);
            await new Promise((resolve) => setTimeout(resolve, intervaloDeRepeticao));
          }
        }
      
        console.log(`\nTotal de Repetições: ${totalRepeticoes}`);
        console.log(`Total de Portas Abertas: ${portasAbertasTotal}`);
        console.log('Contagem de Portas Abertas por Porta:');
      
        // Exibir a contagem de portas abertas
        Object.keys(contagemPortasAbertas).forEach((porta) => {
          console.log(`A porta ${porta} em ${host}(${contagemPortasAbertas[porta]}) está aberta para o mundo.`);
        });
      }
      
      testarPortas().catch((err) => {
        console.error(`Erro ao testar portas: ${err.message}`);
      });
}

const portasAbertasTotal = JSON.stringify

module.exports = consultaportasssh;