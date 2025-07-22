import crypto from 'crypto';
import { ParsedSDJWT, parseSDJWT, verifySDJWTSignature, calculateMerkleRoot } from './merkle.js';
import { getAttestationStatus } from './sas.js';
import { SUPPORTED_ISSUERS } from '../types.js';

export interface ValidatedDisclosure {
  isValid: boolean;
  disclosedData?: Record<string, any>;
  error?: string;
}

export async function validateAndExtractDisclosure(
  vpToken: string,
  requiredFields: string[],
  expectedCredentialId?: string,
  holderDid?: string
): Promise<ValidatedDisclosure> {
  try {
    // 1. 解析 SD-JWT
    const parsed = parseSDJWT(vpToken);
    
    // 2. 驗證持有者
    if (holderDid && parsed.holderDid !== holderDid) {
      return {
        isValid: false,
        error: `Holder DID mismatch: expected ${holderDid}, got ${parsed.holderDid}`
      };
    }
    
    //  驗證憑證 ID
    if (expectedCredentialId && parsed.credentialId !== expectedCredentialId) {
      return {
        isValid: false,
        error: `Credential ID mismatch: expected ${expectedCredentialId}, got ${parsed.credentialId}`
      };
    }
    
    //  驗證發行者
    if (!Object.values(SUPPORTED_ISSUERS).includes(parsed.issuerDid as any)) {
      return {
        isValid: false,
        error: `Unsupported issuer: ${parsed.issuerDid}`
      };
    }
    
    //  驗證 JWT 簽名
    const isSignatureValid = await verifySDJWTSignature(parsed.jwt, parsed.issuerDid);
    if (!isSignatureValid) {
      return {
        isValid: false,
        error: 'Invalid JWT signature'
      };
    }
    
    //  驗證過期時間
    if (parsed.expiry && Date.now() / 1000 > parsed.expiry) {
      return {
        isValid: false,
        error: 'Credential has expired'
      };
    }
    
    //  提取揭露的欄位
    const disclosedData: Record<string, any> = {};
    const foundFields: string[] = [];
    
    for (const disclosure of parsed.validatedDisclosures) {
      if (requiredFields.includes(disclosure.claim)) {
        disclosedData[disclosure.claim] = disclosure.value;
        foundFields.push(disclosure.claim);
      }
    }
    
    //  檢查是否所有必要欄位都已揭露
    const missingFields = requiredFields.filter(field => !foundFields.includes(field));
    if (missingFields.length > 0) {
      return {
        isValid: false,
        error: `Missing required fields: ${missingFields.join(', ')}`
      };
    }
    
    //  計算並驗證 Merkle root
    const calculatedRoot = calculateMerkleRoot(parsed.sdHashes);
    
    //  與鏈上資料比對
    const attestationStatus = await getAttestationStatus(parsed.holderDid);
    
    let chainVerified = false;
    
    if (parsed.issuerDid === SUPPORTED_ISSUERS.TWFIDO && attestationStatus.twfido?.exists) {
      if (attestationStatus.twfido.data?.merkleRoot === calculatedRoot) {
        chainVerified = true;
      }
    }
    
    if (parsed.issuerDid === SUPPORTED_ISSUERS.TWLAND && attestationStatus.twland?.exists) {
      for (const attestation of attestationStatus.twland.attestations) {
        if (attestation.data.credentialReference === parsed.credentialId &&
            attestation.data.merkleRoot === calculatedRoot) {
          chainVerified = true;
          break;
        }
      }
    }
    
    if (!chainVerified) {
      return {
        isValid: false,
        error: 'On-chain verification failed: merkle root mismatch or credential not found'
      };
    }
    
    return {
      isValid: true,
      disclosedData
    };
    
  } catch (error) {
    console.error('Disclosure validation error:', error);
    return {
      isValid: false,
      error: error instanceof Error ? error.message : 'Unknown validation error'
    };
  }
}

export function generateAttestationString(
  issuerDid: string,
  credentialId: string,
  attestationAddress: string
): string {
  const issuerType = issuerDid === SUPPORTED_ISSUERS.TWFIDO ? 'twfido' : 'twland';
  return `${issuerType}:verified:${attestationAddress}:${credentialId}`;
}