import crypto from 'crypto';
import { VerificationRequest, VerificationResponse, SDJWTVerificationResult, SUPPORTED_ISSUERS } from '../types.js';
import { parseSDJWT, verifySDJWTSignature, calculateMerkleRoot } from './merkle.js';
import { createAttestation } from './sas.js';

// 儲存進行中的驗證請求
const pendingVerifications = new Map<string, VerificationRequest>();

export async function startVerification(holderDid: string): Promise<VerificationResponse> {
  try {
    const requestId = crypto.randomUUID();
    
    // 儲存驗證請求
    pendingVerifications.set(requestId, {
      holderDid,
      requestId
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

export async function handleCallback(requestId: string, vpData: any): Promise<any> {
  try {
    const request = pendingVerifications.get(requestId);
    if (!request) {
      throw new Error('Invalid or expired request');
    }
    
    // 驗證 SD-JWT
    const verificationResult = await verifySDJWT(vpData.vp_token);
    if (!verificationResult.isValid) {
      throw new Error('Invalid SD-JWT');
    }
    
    // 檢查 holder DID 是否匹配
    if (verificationResult.holderDid !== request.holderDid) {
      throw new Error('Holder DID mismatch');
    }
    
    // 創建 SAS attestation
    await createAttestation(verificationResult);
    
    // 清理請求
    pendingVerifications.delete(requestId);
    
    return {
      success: true,
      message: 'Verification completed and attestation created'
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Verification failed'
    };
  }
}

async function verifySDJWT(sdJwtToken: string): Promise<SDJWTVerificationResult> {
  try {
    // 解析 SD-JWT
    const parsed = parseSDJWT(sdJwtToken);
    
    // 驗證簽名 (這裡需要實作 JWT 簽名驗證)
    const isSignatureValid = await verifySDJWTSignature(parsed.jwt, parsed.issuerDid);
    if (!isSignatureValid) {
      throw new Error('Invalid JWT signature');
    }
    
    // 檢查發行者是否受支援
    if (!Object.values(SUPPORTED_ISSUERS).includes(parsed.issuerDid as any)) {
      throw new Error('Unsupported issuer');
    }
    
    // 計算 Merkle Root
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