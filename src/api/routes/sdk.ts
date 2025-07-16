import express from 'express';
import { checkUserPermissions, requestCredentialData, getDataRequest, extractDataFromVP } from '../services/sdk';

const router = express.Router();

// 查詢用戶憑證權限
router.get('/permissions/:holderDid', async (req, res) => {
  try {
    const { holderDid } = req.params;
    const permissions = await checkUserPermissions(holderDid);
    res.json(permissions);
  } catch (error) {
    res.status(500).json({ 
      error: error instanceof Error ? error.message : 'Unknown error' 
    });
  }
});

// 建立資料請求
router.post('/data-request', async (req, res) => {
  try {
    const config = req.body;
    const session = await requestCredentialData(config);
    res.json(session);
  } catch (error) {
    res.status(500).json({ 
      error: error instanceof Error ? error.message : 'Unknown error' 
    });
  }
});

// 提供資料請求定義 (OID4VP)
router.get('/data-request/:requestId', async (req, res) => {
  try {
    const { requestId } = req.params;
    const dataRequest = await getDataRequest(requestId);
    
    if (!dataRequest) {
      return res.status(404).json({ error: 'Request not found or expired' });
    }
    
    res.json(dataRequest);
  } catch (error) {
    res.status(500).json({ 
      error: error instanceof Error ? error.message : 'Unknown error' 
    });
  }
});

// 資料提取端點
router.post('/data/:requestId', async (req, res) => {
  try {
    const { requestId } = req.params;
    const extractedData = await extractDataFromVP(requestId, req.body);
    res.json(extractedData);
  } catch (error) {
    res.status(500).json({ 
      error: error instanceof Error ? error.message : 'Unknown error' 
    });
  }
});

// 回調端點 (相容性)
router.post('/callback/:requestId', async (req, res) => {
  try {
    const { requestId } = req.params;
    const extractedData = await extractDataFromVP(requestId, req.body);
    res.json({ 
      success: true, 
      data: extractedData 
    });
  } catch (error) {
    res.status(500).json({ 
      success: false, 
      error: error instanceof Error ? error.message : 'Unknown error' 
    });
  }
});

export default router;