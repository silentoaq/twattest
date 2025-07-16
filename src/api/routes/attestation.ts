import express from 'express';
import { getAttestationStatus } from '../services/sas.js';

const router = express.Router();

// 查詢用戶的 attestation 狀態
router.get('/status/:holderDid', async (req, res) => {
  try {
    const { holderDid } = req.params;
    const status = await getAttestationStatus(holderDid);
    res.json(status);
  } catch (error) {
    res.status(500).json({ 
      error: error instanceof Error ? error.message : 'Unknown error' 
    });
  }
});

export default router;