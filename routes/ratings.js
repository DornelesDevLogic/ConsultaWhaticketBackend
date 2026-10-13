const express = require('express');
const { consultaAvaliacoesDoMes } = require('../consultaUserRatingsNew');

const router = express.Router();

router.get('/avaliacoes-mes', async (req, res) => {
  try {
    const { startDate, endDate, ticketId } = req.query;
    
    const result = await consultaAvaliacoesDoMes(startDate, endDate, ticketId);
    
    res.json({
      success: true,
      data: result,
      total: result.length
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

module.exports = router;