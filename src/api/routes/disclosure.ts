import express from 'express';
import crypto from 'crypto';

const router = express.Router();

// 儲存揭露請求
const disclosureRequests = new Map<string, {
  request: any
  status: 'pending' | 'completed' | 'expired'
  disclosedData?: any
  createdAt: number
  completedAt?: number
}>();

// 清理過期請求
setInterval(() => {
  const now = Date.now();
  for (const [id, data] of disclosureRequests.entries()) {
    if (now - data.createdAt > 10 * 60 * 1000) { // 10 minutes
      data.status = 'expired';
      setTimeout(() => disclosureRequests.delete(id), 60000);
    }
  }
}, 60000);

// 創建揭露請求
router.post('/request', async (req, res) => {
  try {
    const { holderDid, credentialType, requiredFields, purpose, callbackUrl, credentialId } = req.body;
    
    if (!holderDid || !credentialType || !requiredFields || !purpose) {
      return res.status(400).json({ error: 'Missing required parameters' });
    }
    
    const requestId = crypto.randomUUID();
    const nonce = crypto.randomUUID();
    const state = crypto.randomUUID();
    
    // 構建 OID4VP 請求
    const vpRequest = {
      presentation_definition: {
        id: `twattest-disclosure-${requestId}`,
        input_descriptors: [
          {
            id: "selective-disclosure",
            name: credentialType === 'PropertyCredential' ? '房產憑證' : '自然人憑證',
            purpose: purpose,
            constraints: {
              limit_disclosure: "required",
              fields: [
                {
                  path: ["$.vc.type"],
                  filter: {
                    type: "array",
                    contains: {
                      type: "string",
                      pattern: credentialType
                    }
                  }
                },
                {
                  path: ["$.iss"],
                  filter: {
                    type: "string",
                    pattern: credentialType === 'CitizenCredential' 
                      ? "did:web:twfido.ddns.net"
                      : "did:web:twland.ddns.net"
                  }
                },
                {
                  path: ["$.sub"],
                  filter: {
                    type: "string",
                    const: holderDid
                  }
                }
              ]
            }
          }
        ],
        submission_requirements: [
          {
            name: "選擇性揭露要求",
            rule: "pick",
            count: 1,
            from: "selective-disclosure"
          }
        ]
      },
      response_type: "vp_token",
      response_mode: "direct_post",
      client_id: process.env.ISSUER_DID,
      nonce: nonce,
      state: state,
      response_uri: `https://${process.env.DOMAIN}/api/disclosure/callback/${requestId}`,
      required_fields: requiredFields,
      credential_id: credentialId
    };
    
    // 儲存請求
    disclosureRequests.set(requestId, {
      request: {
        ...vpRequest,
        holderDid,
        callbackUrl,
        requiredFields
      },
      status: 'pending',
      createdAt: Date.now()
    });
    
    const vpRequestUri = `https://${process.env.DOMAIN}/api/disclosure/vp-request/${requestId}`;
    
    res.json({
      requestId,
      vpRequestUri,
      expiresAt: Date.now() + 10 * 60 * 1000 // 10 minutes
    });
  } catch (error) {
    console.error('Failed to create disclosure request:', error);
    res.status(500).json({ 
      error: error instanceof Error ? error.message : 'Unknown error' 
    });
  }
});

// 提供 VP 請求內容
router.get('/vp-request/:requestId', async (req, res) => {
  try {
    const { requestId } = req.params;
    const requestData = disclosureRequests.get(requestId);
    
    if (!requestData || requestData.status === 'expired') {
      return res.status(404).json({ error: 'Request not found or expired' });
    }
    
    res.json(requestData.request);
  } catch (error) {
    res.status(500).json({ 
      error: error instanceof Error ? error.message : 'Unknown error' 
    });
  }
});

// 接收 VP 回應
router.post('/callback/:requestId', async (req, res) => {
  try {
    const { requestId } = req.params;
    const requestData = disclosureRequests.get(requestId);
    
    if (!requestData || requestData.status !== 'pending') {
      return res.status(404).json({ error: 'Invalid request' });
    }
    
    const { vp_token, state } = req.body;
    
    if (!vp_token || state !== requestData.request.state) {
      return res.status(400).json({ error: 'Invalid response' });
    }
    
    const disclosedData = await validateAndExtractDisclosure(
      vp_token,
      requestData.request.requiredFields,
      requestData.request.credential_id
    );
    
    // 更新狀態
    requestData.status = 'completed';
    requestData.disclosedData = disclosedData;
    requestData.completedAt = Date.now();
    
    if (requestData.request.callbackUrl) {
      fetch(requestData.request.callbackUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          requestId,
          status: 'completed',
          disclosedData
        })
      }).catch(console.error);
    }
    
    res.json({ success: true });
  } catch (error) {
    console.error('Callback handling failed:', error);
    res.status(500).json({ 
      error: error instanceof Error ? error.message : 'Unknown error' 
    });
  }
});

// 查詢揭露狀態
router.get('/status/:requestId', async (req, res) => {
  try {
    const { requestId } = req.params;
    const requestData = disclosureRequests.get(requestId);
    
    if (!requestData) {
      return res.status(404).json({ error: 'Request not found' });
    }
    
    res.json({
      status: requestData.status,
      disclosedData: requestData.disclosedData,
      completedAt: requestData.completedAt
    });
  } catch (error) {
    res.status(500).json({ 
      error: error instanceof Error ? error.message : 'Unknown error' 
    });
  }
});

async function validateAndExtractDisclosure(
  vpToken: string,
  requiredFields: string[],
  expectedCredentialId?: string
): Promise<any> {
  const { validateAndExtractDisclosure: validate } = await import('../services/sd-jwt-validator.js');
  
  const result = await validate(vpToken, requiredFields, expectedCredentialId);
  
  if (!result.isValid) {
    throw new Error(result.error || 'Validation failed');
  }
  
  return result.disclosedData;
}

export default router;