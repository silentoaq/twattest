import crypto from 'crypto';

export interface ParsedSDJWT {
  jwt: string;
  disclosures: string[];
  holderDid: string;
  issuerDid: string;
  credentialId: string;
  sdHashes: string[];
  expiry?: number;
}

export function parseSDJWT(sdJwtToken: string): ParsedSDJWT {
  const parts = sdJwtToken.split('~');
  const jwt = parts[0];
  const disclosures = parts.slice(1);
  
  // 解析 JWT payload
  const payload = JSON.parse(Buffer.from(jwt.split('.')[1], 'base64url').toString());
  
  // 提取必要資訊
  const holderDid = payload.sub;
  const issuerDid = payload.iss;
  const credentialId = payload.vc?.id || '';
  const sdHashes = payload.vc?.credentialSubject?._sd || [];
  const expiry = payload.exp;
  
  return {
    jwt,
    disclosures,
    holderDid,
    issuerDid,
    credentialId,
    sdHashes,
    expiry
  };
}

export async function verifySDJWTSignature(jwt: string, issuerDid: string): Promise<boolean> {
  // TODO: 實作 JWT 簽名驗證
  // 這裡需要從 issuer DID 獲取公鑰並驗證簽名
  console.log('TODO: Verify JWT signature for issuer:', issuerDid);
  return true; // 暫時返回 true，後續實作
}

export function calculateMerkleRoot(sdHashes: string[]): string {
  if (sdHashes.length === 0) {
    return '';
  }
  
  if (sdHashes.length === 1) {
    return sdHashes[0];
  }
  
  // 簡單的 Merkle Tree 實作
  let currentLevel = sdHashes.map(hash => Buffer.from(hash.replace('sha-256:', ''), 'base64url'));
  
  while (currentLevel.length > 1) {
    const nextLevel: Buffer[] = [];
    
    for (let i = 0; i < currentLevel.length; i += 2) {
      if (i + 1 < currentLevel.length) {
        // 合併兩個雜湊
        const combined = Buffer.concat([currentLevel[i], currentLevel[i + 1]]);
        const hash = crypto.createHash('sha256').update(combined).digest();
        nextLevel.push(hash);
      } else {
        // 奇數個，直接提升到下一層
        nextLevel.push(currentLevel[i]);
      }
    }
    
    currentLevel = nextLevel;
  }
  
  return currentLevel[0].toString('hex');
}