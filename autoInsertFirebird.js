const axios = require('axios');
const fs = require('fs');
const path = require('path');

const lastRunPath = path.join(__dirname, 'lastRunFirebird.json');

function saveLastRun(date) {
  fs.writeFileSync(lastRunPath, JSON.stringify({ lastRun: date.toISOString() }, null, 2));
}

function getLastRun() {
  if (fs.existsSync(lastRunPath)) {
    const data = JSON.parse(fs.readFileSync(lastRunPath, 'utf8'));
    return new Date(data.lastRun);
  }
  return null;
}

function getNextInterval(now) {
  const hora = now.getHours();
  const min = now.getMinutes();

  // Das 08:00 às 18:30 -> 10 em 10 minutos
  if (
    (hora > 8 && hora < 18) ||
    (hora === 8 && min >= 0) ||
    (hora === 18 && min <= 30)
  ) {
    return 1;
  }
  // Das 18:30 às 23:00 -> 30 em 30 minutos
  if (
    (hora === 18 && min > 30) ||
    (hora > 18 && hora < 23) ||
    (hora === 23 && min === 0)
  ) {
    return 30;
  }
  // Fora desses horários, não roda
  return null;
}

async function rotinaInsertFirebird() {
  const now = new Date();
  const lastRun = getLastRun();
  const nextInterval = getNextInterval(now);

  if (nextInterval === null) {
    // Fora do horário, agenda para o próximo dia às 08:00
    const tomorrow = new Date(now);
    tomorrow.setDate(now.getDate() + 1);
    tomorrow.setHours(8, 0, 0, 0);
    const msToNext = tomorrow - now;
    setTimeout(rotinaInsertFirebird, msToNext);
    console.log('Fora do horário de execução. Próxima execução às 08:00.');
    return;
  }

  // Só executa se já passou o intervalo desde a última execução
  if (lastRun) {
    const diffMs = now - lastRun;
    const diffMin = diffMs / 100000 / 60;
    if (diffMin < nextInterval) {
      const msToNext = (nextInterval - diffMin) * 60 * 100000;
      console.log(`Aguardando ${Math.ceil(msToNext / 1000)} segundos para a próxima execução diminuir tempo depois para 1000 novamente.`);
      setTimeout(rotinaInsertFirebird, msToNext);
      return;
    }
  }

  // Usa o horário atual para a chamada
  const day = now.getDate();
  const month = now.getMonth() + 1;
  const year = now.getFullYear();

  try {
    const response = await axios.get(`http://localhost:5000/api/insertDataToFirebird?day=${day}&month=${month}&year=${year}`);
    console.log('Solicitação bem-sucedida', response.data);
    saveLastRun(now); // Atualiza o arquivo com o horário atual
  } catch (error) {
    console.error('Erro na solicitação', error);
  }

  // Agenda próxima execução
  setTimeout(rotinaInsertFirebird, nextInterval * 60 * 1000);
}

module.exports = { rotinaInsertFirebird };