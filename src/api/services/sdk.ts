import crypto from 'crypto';
import { getAttestationStatus } from './sas.js';
import { getVPRequest, handleCallback } from './oid4vp.js';
import { parseSDJWT } from './merkle.js';

export interface UserPermissions {
  hasCitizenCredential: boolean;
  hasPropertyCredential: boolean;
  propertyCount: number;
}

export interface DataRequestConfig {
  credentialType: 'CitizenCredential' | 'PropertyCredential';
  requiredFields: string[];
  purpose: string;
  dappDomain: string;
}

export interface DataRequestSession {
  requestId: string;
  vpRequestUri: string;
  expiresIn: number;
}

export interface ExtractedData {
  fields: Record<string, any>;
  attestationRef: string;
  credentialId: string;
  verificationTimestamp: number;
}

interface DataRequestSessionInternal extends DataRequestConfig {
  requestId: string;
  createdAt: number;
  nonce: string;
  state: string;
}

// 儲存進行中的資料請求
const pendingDataRequests = new Map<string, DataRequestSessionInternal>();

// 清理過期請求 (5分鐘過期)
setInterval(() => {
  const now = Date.now();
  for (const [requestId, request] of pendingDataRequests.entries()) {
    if (now - request.createdAt > 5 * 60 * 1000) {
      pendingDataRequests.delete(requestId);
    }
  }
}, 60 * 1000);

export async function checkUserPermissions(holderDid: string): Promise<UserPermissions> {
  try {
    const status = await getAttestationStatus(holderDid);
    
    return {
      hasCitizenCredential: status.twfido?.exists || false,
      hasPropertyCredential: status.twland?.exists || false,
      propertyCount: status.twland?.count || 0,
    };
  } catch (error) {
    console.error('Error checking user permissions:', error);
    return {
      hasCitizenCredential: false,
      hasPropertyCredential: false,
      propertyCount: 0,
    };
  }
}

export async function requestCredentialData(config: DataRequestConfig): Promise<DataRequestSession> {
  try {
    const requestId = crypto.randomUUID();
    const nonce = crypto.randomUUID();
    const state = crypto.randomUUID();
    
    // 儲存資料請求 session
    pendingDataRequests.set(requestId, {
      ...config,
      requestId,
      createdAt: Date.now(),
      nonce,
      state
    });
    
    // 生成 OID4VP 請求 URI
    const vpRequestUri = `https://${process.env.DOMAIN}/api/sdk/data-request/${requestId}`;
    
    return {
      requestId,
      vpRequestUri,
      expiresIn: 300 // 5分鐘
    };
  } catch (error) {
    console.error('Error creating data request:', error);
    throw error;
  }
}

export async function getDataRequest(requestId: string): Promise<any> {
  const request = pendingDataRequests.get(requestId);
  if (!request) {
    return null;
  }

  return {
    presentation_definition: {
      id: `twattest-data-request-${requestId}`,
      input_descriptors: [
        {
          id: "credential-data",
          name: `${request.credentialType === 'CitizenCredential' ? '自然人憑證' : '產權憑證'}資料`,
          purpose: request.purpose,
          constraints: {
            fields: [
              {
                path: ["$.vc.type"],
                filter: {
                  type: "array",
                  contains: {
                    type: "string",
                    pattern: request.credentialType
                  }
                }
              },
              ...request.requiredFields.map((field: string) => ({
                path: [`$.vc.credentialSubject.${field}`],
                filter: {
                  type: "string"
                }
              }))
            ]
          }
        }
      ]
    },
    response_type: "vp_token",
    response_mode: "direct_post",
    client_id: request.dappDomain,
    nonce: request.nonce,
    state: request.state,
    redirect_uri: `https://${process.env.DOMAIN}/api/sdk/callback/${requestId}`,
    response_uri: `https://${process.env.DOMAIN}/api/sdk/data/${requestId}`
  };
}

export async function extractDataFromVP(requestId: string, vpData: any): Promise<ExtractedData> {
  try {
    const request = pendingDataRequests.get(requestId);
    if (!request) {
      throw new Error('Invalid or expired request');
    }

    if (vpData.state !== request.state) {
      throw new Error('Invalid state parameter');
    }
    
    const parsed = parseSDJWT(vpData.vp_token);
    
    // 提取所需欄位
    const fields: Record<string, any> = {};
    
    // 從 JWT payload 中提取基本欄位
    if (parsed.jwt) {
      const payload = JSON.parse(Buffer.from(parsed.jwt.split('.')[1], 'base64url').toString());
      const credentialSubject = payload.vc?.credentialSubject || {};
      
      for (const fieldName of request.requiredFields) {
        if (credentialSubject[fieldName]) {
          fields[fieldName] = credentialSubject[fieldName];
        }
      }
    }
    
    // 從 disclosures 中提取選擇性揭露的欄位
    for (const disclosure of parsed.disclosures || []) {
      try {
        const padded = disclosure + '='.repeat(-disclosure.length % 4);
        const decoded = JSON.parse(Buffer.from(padded, 'base64url').toString());
        const [salt, key, value] = decoded;
        
        if (request.requiredFields.includes(key)) {
          fields[key] = value;
        }
      } catch (e) {
        continue;
      }
    }
    
    // 立即清除 session
    pendingDataRequests.delete(requestId);
    
    return {
      fields,
      attestationRef: '', // 可以從 SAS 查詢獲取
      credentialId: parsed.credentialId || '',
      verificationTimestamp: Date.now()
    };
  } catch (error) {
    console.error('Error extracting data from VP:', error);
    throw error;
  }
}