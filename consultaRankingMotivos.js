const { Pool } = require('pg');
const postgresConnection = require('./postgresConnection');

async function conectarPostgreSQL() {
  const pool = new Pool(postgresConnection);
  return pool;
}

// Categorias de "motivo do chamado" por palavras-chave, baseadas em amostra real de
// conversas de julho/2026. Ajuste esta lista livremente conforme o vocabulário do
// negócio mudar — é a única coisa que precisa mudar para refinar a classificação.
// Um ticket pode pertencer a mais de uma categoria (ex.: fala de NFe E de estoque).
const CATEGORIAS = [
  {
    nome: 'TEF / Pagamento (cartão)',
    palavras: ['tef', 'maquininha', 'cartão de crédito', 'cartao de credito', 'administradora do tef'],
  },
  {
    nome: 'Impressora / Impressão',
    palavras: ['impressora', 'imprimir', 'impressão', 'impressao'],
  },
  {
    nome: 'Nota Fiscal / SPED / Fiscal',
    palavras: [
      'nfe', 'nf-e', 'nota fiscal', 'sped', 'cfop', 'icms', 'cofins',
      'imposto', 'tributa',
    ],
  },
  {
    nome: 'Estoque / Inventário',
    palavras: ['estoque', 'inventário', 'inventario', 'contagem de produto'],
  },
  {
    nome: 'Rede / Servidor / Conexão',
    palavras: ['servidor', 'sincroniz', 'não conecta', 'nao conecta', 'sem internet', 'wifi', 'roteador'],
  },
  {
    nome: 'Licença / Cadastro / Liberação',
    palavras: ['licença', 'licenca', 'liberar', 'liberação', 'liberacao'],
  },
  {
    nome: 'Coletor / Aplicativo Coletor',
    palavras: ['coletor', 'aplicativo coletor'],
  },
  {
    nome: 'Relatórios',
    palavras: ['relatório', 'relatorio'],
  },
  {
    nome: 'Backup / Instalação / Equipamento',
    palavras: ['backup', 'instala', 'formata', 'clonar', ' cpu ', 'trocar o computador', 'trocar computador'],
  },
  {
    nome: 'Boleto / Financeiro',
    palavras: ['boleto', 'financeiro'],
  },
  {
    nome: 'Acesso Remoto / Senha',
    palavras: ['suporte remoto', 'acesso remoto', 'esqueci a senha', 'redefinir senha'],
  },
  {
    nome: 'Promoção / Desconto / Preço',
    palavras: ['promoção', 'promocao', 'desconto', 'preço', 'preco'],
  },
];

const CACHE_TTL_MS = 30 * 60 * 1000;
const cache = new Map();

// Conta, para o período informado, quantos tickets tiveram pelo menos uma mensagem
// (de qualquer direção) contendo alguma palavra-chave de cada categoria.
async function consultaRankingMotivos(dataInicio, dataFim) {
  const chave = `${dataInicio}:${dataFim}`;
  const cacheado = cache.get(chave);
  if (cacheado && Date.now() - cacheado.timestamp < CACHE_TTL_MS) {
    return cacheado.dados;
  }

  try {
    const pool = await conectarPostgreSQL();
    const result = await pool.query(
      `
      SELECT "ticketId", string_agg(LOWER(body), ' ') AS texto
      FROM "Messages"
      WHERE "createdAt" >= $1 AND "createdAt" < $2
        AND body IS NOT NULL
      GROUP BY "ticketId";
      `,
      [dataInicio, dataFim],
    );
    await pool.end();

    const contagem = new Map(CATEGORIAS.map((c) => [c.nome, { tickets: 0, exemplos: [] }]));
    let semCategoria = 0;

    for (const row of result.rows) {
      const texto = row.texto ?? '';
      let bateuAlguma = false;
      for (const categoria of CATEGORIAS) {
        const bateu = categoria.palavras.some((p) => texto.includes(p));
        if (bateu) {
          bateuAlguma = true;
          const acc = contagem.get(categoria.nome);
          acc.tickets += 1;
          if (acc.exemplos.length < 5) acc.exemplos.push(row.ticketId);
        }
      }
      if (!bateuAlguma) semCategoria += 1;
    }

    const dados = {
      totalTickets: result.rows.length,
      semCategoria,
      ranking: [...contagem.entries()]
        .map(([motivo, v]) => ({ motivo, tickets: v.tickets, exemplos: v.exemplos }))
        .filter((r) => r.tickets > 0)
        .sort((a, b) => b.tickets - a.tickets),
    };

    cache.set(chave, { timestamp: Date.now(), dados });
    return dados;
  } catch (error) {
    console.error(error);
    throw new Error('Erro ao consultar ranking de motivos no PostgreSQL.');
  }
}

module.exports = { consultaRankingMotivos, CATEGORIAS };
