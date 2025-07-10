import crypto from 'crypto';
import { VerificationRequest, VerificationResponse, SDJWTVerificationResult, SUPPORTED_ISSUERS } from '../types.js';
import { parseSDJWT, verifySDJWTSignature, calculateMerkleRoot } from './merkle.js';
import { createAttestation } from './sas.js';

// 儲存進行中的驗證請求
const pendingVerifications = new Map<string, VerificationRequest & { 
  createdAt: number;
  nonce: string;
  state: string;
}>();

// 清理過期請求 (5分鐘過期)
setInterval(() => {
  const now = Date.now();
  for (const [requestId, request] of pendingVerifications.entries()) {
    if (now - request.createdAt > 5 * 60 * 1000) {
      pendingVerifications.delete(requestId);
    }
  }
}, 60 * 1000);

export async function startVerification(holderDid: string): Promise<VerificationResponse> {
  try {
    const requestId = crypto.randomUUID();
    const nonce = crypto.randomUUID();
    const state = crypto.randomUUID();
    
    // 儲存驗證請求
    pendingVerifications.set(requestId, {
      holderDid,
      requestId,
      createdAt: Date.now(),
      nonce,
      state
    });
    
    // 生成 OID4VP 請求 URI
    const vpRequestUri = `https://${process.env.DOMAIN}/api/verify/request/${requestId}`;
    
    return {
      success: true,
      requestId,
      vpRequestUri
    };
  } catch (error) {
    return {
      success: false,
      requestId: '',
      error: error instanceof Error ? error.message : 'Unknown error'
    };
  }
}

export async function getVPRequest(requestId: string): Promise<any> {
  const request = pendingVerifications.get(requestId);
  if (!request) {
    return null;
  }

  return {
    presentation_definition: {
      id: `twattest-vp-request-${requestId}`,
      input_descriptors: [
        {
          id: "supported-credential",
          name: "身份或房產憑證",
          purpose: "需要您的身份憑證以創建鏈上認證",
          constraints: {
            fields: [
              {
                path: ["$.vc.type"],
                filter: {
                  type: "array",
                  contains: {
                    type: "string",
                    pattern: "(CitizenCredential|PropertyCredential)"
                  }
                }
              },
              {
                path: ["$.iss"],
                filter: {
                  type: "string",
                  pattern: "(did:web:twfido.ddns.net|did:web:twland.ddns.net)"
                }
              }
            ]
          }
        }
      ]
    },
    response_type: "vp_token",
    response_mode: "direct_post",
    client_id: process.env.ISSUER_DID,
    nonce: request.nonce,
    state: request.state,
    redirect_uri: `https://${process.env.DOMAIN}/api/verify/callback/${requestId}`,
    response_uri: `https://${process.env.DOMAIN}/api/verify/presentation/${requestId}`
  };
}

export async function handleCallback(requestId: string, vpData: any): Promise<any> {
  try {
    const request = pendingVerifications.get(requestId);
    if (!request) {
      throw new Error('Invalid or expired request');
    }

    if (vpData.state !== request.state) {
      throw new Error('Invalid state parameter');
    }
    
    const verificationResult = await verifySDJWT(vpData.vp_token);
    if (!verificationResult.isValid) {
      throw new Error('Invalid SD-JWT');
    }
    
    if (verificationResult.holderDid !== request.holderDid) {
      throw new Error('Holder DID mismatch');
    }
    
    const signature = await createAttestation(verificationResult);
    
    pendingVerifications.delete(requestId);
    
    return {
      success: true,
      message: 'Verification completed and attestation created',
      signature
    };
  } catch (error) {
    console.error('Callback handling failed:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Verification failed'
    };
  }
}

async function verifySDJWT(sdJwtToken: string): Promise<SDJWTVerificationResult> {
  try {
    const parsed = parseSDJWT(sdJwtToken);
    
    const isSignatureValid = await verifySDJWTSignature(parsed.jwt, parsed.issuerDid);
    if (!isSignatureValid) {
      throw new Error('Invalid JWT signature');
    }
    
    if (!Object.values(SUPPORTED_ISSUERS).includes(parsed.issuerDid as any)) {
      throw new Error('Unsupported issuer');
    }
    
    const merkleRoot = calculateMerkleRoot(parsed.sdHashes);
    
    return {
      isValid: true,
      holderDid: parsed.holderDid,
      merkleRoot,
      credentialReference: parsed.credentialId,
      issuerDid: parsed.issuerDid,
      expiry: parsed.expiry || 0
    };
  } catch (error) {
    console.error('SD-JWT verification failed:', error);
    return {
      isValid: false,
      holderDid: '',
      merkleRoot: '',
      credentialReference: '',
      issuerDid: '',
      expiry: 0
    };
  }
}