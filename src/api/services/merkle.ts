import crypto from 'crypto';
import { createSolanaRpc } from '@solana/kit';

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

interface DIDDocument {
  id: string;
  verificationMethod: Array<{
    id: string;
    type: string;
    controller: string;
    publicKeyJwk: {
      kty: string;
      crv: string;
      x: string;
      y: string;
    };
  }>;
  assertionMethod: string[];
}

async function fetchDIDDocument(didUri: string): Promise<DIDDocument> {
  if (!didUri.startsWith('did:web:')) {
    throw new Error(`Unsupported DID method: ${didUri}`);
  }

  const domain = didUri.replace('did:web:', '');
  const didDocUrl = `https://${domain}/.well-known/did.json`;

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000);

    const response = await fetch(didDocUrl, {
      headers: {
        'Accept': 'application/json'
      },
      signal: controller.signal
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      throw new Error(`Failed to fetch DID document: ${response.status} ${response.statusText}`);
    }

    const didDoc = await response.json();
    return didDoc;
  } catch (error) {
    console.error(`Error fetching DID document for ${didUri}:`, error);
    throw new Error(`Unable to fetch DID document: ${error}`);
  }
}

function importJWKToPublicKey(jwk: any): crypto.KeyObject {
  try {
    // 對於 P-256 曲線的公鑰
    if (jwk.kty === 'EC' && jwk.crv === 'P-256') {
      const publicKey = crypto.createPublicKey({
        key: jwk,
        format: 'jwk'
      });
      return publicKey;
    }
    throw new Error(`Unsupported key type: ${jwk.kty} with curve: ${jwk.crv}`);
  } catch (error) {
    console.error('Error importing JWK to public key:', error);
    throw new Error(`Failed to import public key: ${error}`);
  }
}

export async function verifySDJWTSignature(jwt: string, issuerDid: string): Promise<boolean> {
  try {
    const [header, payload, signature] = jwt.split('.');

    if (!header || !payload || !signature) {
      console.error('Invalid JWT format');
      return false;
    }

    // 解析 JWT header
    const headerData = JSON.parse(Buffer.from(header, 'base64url').toString());
    const payloadData = JSON.parse(Buffer.from(payload, 'base64url').toString());

    console.log('JWT Header:', headerData);

    // 檢查基本 JWT 結構
    if (headerData.alg !== 'ES256') {
      console.error(`Unsupported algorithm: ${headerData.alg}`);
      return false;
    }

    // 檢查過期時間
    if (payloadData.exp && Date.now() / 1000 > payloadData.exp) {
      console.error('JWT has expired');
      return false;
    }

    // 檢查簽發時間
    if (payloadData.iat && Date.now() / 1000 < payloadData.iat) {
      console.error('JWT issued in the future');
      return false;
    }

    // 驗證 issuer
    if (payloadData.iss !== issuerDid) {
      console.error(`Issuer mismatch: expected ${issuerDid}, got ${payloadData.iss}`);
      return false;
    }

    // 獲取 DID 文件
    console.log(`Fetching DID document for issuer: ${issuerDid}`);
    const didDoc = await fetchDIDDocument(issuerDid);
    console.log('Available verification methods:', didDoc.verificationMethod);

    if (!didDoc.verificationMethod || didDoc.verificationMethod.length === 0) {
      console.error('No verification methods found in DID document');
      return false;
    }

    // 找到對應的驗證方法
    let verificationMethod = null;

    // 如果 header 中有 kid，使用指定的 key
    if (headerData.kid) {
      verificationMethod = didDoc.verificationMethod.find(vm =>
        vm.id === headerData.kid || vm.id.endsWith(headerData.kid)
      );
    }

    // 如果沒有 kid 或找不到，使用 assertionMethod 中的第一個
    if (!verificationMethod && didDoc.assertionMethod && didDoc.assertionMethod.length > 0) {
      const assertionMethodId = didDoc.assertionMethod[0];
      verificationMethod = didDoc.verificationMethod.find(vm => vm.id === assertionMethodId);
    }

    // 如果還是沒有，使用第一個驗證方法
    if (!verificationMethod) {
      verificationMethod = didDoc.verificationMethod[0];
    }

    if (!verificationMethod || !verificationMethod.publicKeyJwk) {
      console.error('No suitable verification method with publicKeyJwk found');
      return false;
    }

    console.log('Selected verification method:', verificationMethod);

    // 導入公鑰
    const publicKey = importJWKToPublicKey(verificationMethod.publicKeyJwk);

    // 驗證簽名 - 修正的部分
    const signatureData = Buffer.from(signature, 'base64url');
    const signedData = Buffer.from(`${header}.${payload}`);

    const isValid = crypto.verify('sha256', signedData, {
      key: publicKey,
      dsaEncoding: 'ieee-p1363'
    }, signatureData);

    console.log('Signed data length:', signedData.length);
    console.log('Signature data length:', signatureData.length);
    console.log('Public key type:', publicKey.asymmetricKeyType);
    console.log('Is valid:', isValid);

    if (isValid) {
      console.log(`JWT signature verified successfully for issuer: ${issuerDid}`);
    } else {
      console.error(`JWT signature verification failed for issuer: ${issuerDid}`);
    }

    return isValid;

  } catch (error) {
    console.error('JWT signature verification error:', error);
    return false;
  }
}

export function calculateMerkleRoot(sdHashes: string[]): string {
  if (sdHashes.length === 0) {
    return '';
  }

  if (sdHashes.length === 1) {
    return sdHashes[0].replace('sha-256:', '');
  }

  // 實現 Merkle Tree
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