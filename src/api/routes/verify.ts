import express from 'express';
import { startVerification, handleCallback } from '../services/oid4vp.ts';

const router = express.Router();

// 開始驗證流程
router.post('/start', async (req, res) => {
  try {
    const { holderDid } = req.body;
    const result = await startVerification(holderDid);
    res.json(result);
  } catch (error) {
    res.status(500).json({ 
      success: false, 
      error: error instanceof Error ? error.message : 'Unknown error' 
    });
  }
});

// OID4VP 回調處理
router.post('/callback/:requestId', async (req, res) => {
  try {
    const { requestId } = req.params;
    const result = await handleCallback(requestId, req.body);
    res.json(result);
  } catch (error) {
    res.status(500).json({ 
      success: false, 
      error: error instanceof Error ? error.message : 'Unknown error' 
    });
  }
});

export default router;