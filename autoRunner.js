console.log('Arquivo autoRunner.js carregado.');

const { consultacontacts } = require('./consulta');
const fs = require('fs');
const path = require('path');

let intervalId = null; // Armazena o ID do intervalo para controle
const lastRunFilePath = path.join(__dirname, 'lastRun.json');

// Função para iniciar o modo automático (desabilitada temporariamente)
function startAutoRunner(day, month, year) {
  console.log('startAutoRunner está desabilitado temporariamente.');
  // Código original foi desabilitado
}

// Função para parar o modo automático
function stopAutoRunner() {
  console.log('stopAutoRunner chamado.');
  if (!intervalId) {
    console.log('O modo automático não está em execução.');
    return;
  }

  clearInterval(intervalId);
  intervalId = null;
  console.log('Modo automático parado.');
}

// Exemplo de fetch (pode ser removido se não for necessário)
fetch('http://localhost:5000/api/start-auto-runner', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
 // body: JSON.stringify({ day: 24, month: 4, year: 2025 }),
}).then(response => response.json())
  .then(data => console.log(data.message))
  .catch(error => console.error('Erro:', error));

module.exports = {
  startAutoRunner,
  stopAutoRunner,
};