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
  validatedDisclosures: Array<{salt: string, claim: string, value: any}>;
}

export function parseSDJWT(sdJwtToken: string): ParsedSDJWT {
  const parts = sdJwtToken.split('~');
  const jwt = parts[0];
  const disclosures = parts.slice(1);

  const payload = JSON.parse(Buffer.from(jwt.split('.')[1], 'base64url').toString());

  const holderDid = payload.sub;
  const issuerDid = payload.iss;
  const credentialId = payload.vc?.id || '';
  const sdHashes = payload.vc?.credentialSubject?._sd || [];
  const expiry = payload.exp;

  const validatedDisclosures = validateDisclosures(disclosures, sdHashes);

  return {
    jwt,
    disclosures,
    holderDid,
    issuerDid,
    credentialId,
    sdHashes,
    expiry,
    validatedDisclosures
  };
}

function validateDisclosures(disclosures: string[], sdHashes: string[]): Array<{salt: string, claim: string, value: any}> {
  if (disclosures.length !== sdHashes.length) {
    throw new Error(`Must provide all disclosures: expected ${sdHashes.length}, got ${disclosures.length}`);
  }
  
  const validatedClaims = [];
  const foundHashes = new Set<string>();
  
  for (const disclosure of disclosures) {
    try {
      const disclosureBytes = Buffer.from(disclosure, 'base64url');
      const hash = crypto.createHash('sha256').update(disclosureBytes).digest();
      const hashBase64Url = hash.toString('base64url');
      const sdHash = `sha-256:${hashBase64Url}`;
      
      if (!sdHashes.includes(sdHash)) {
        throw new Error(`Invalid disclosure: hash ${sdHash} not found in _sd array`);
      }
      
      if (foundHashes.has(sdHash)) {
        throw new Error(`Duplicate disclosure for hash ${sdHash}`);
      }
      foundHashes.add(sdHash);
      
      const decoded = JSON.parse(Buffer.from(disclosure, 'base64url').toString());
      if (!Array.isArray(decoded) || decoded.length !== 3) {
        throw new Error('Invalid disclosure format');
      }
      
      const [salt, claim, value] = decoded;
      validatedClaims.push({ salt, claim, value });
      
    } catch (error) {
      console.error('Error validating disclosure:', error);
      throw error;
    }
  }
  
  if (validatedClaims.length !== sdHashes.length) {
    throw new Error(`Disclosure validation failed: only ${validatedClaims.length} of ${sdHashes.length} required disclosures are valid`);
  }
  
  return validatedClaims;
}

export function parseSelectiveSDJWT(sdJwtToken: string): ParsedSDJWT {
  const parts = sdJwtToken.split('~');
  const jwt = parts[0];
  const disclosures = parts.slice(1).filter(d => d.length > 0);

  const payload = JSON.parse(Buffer.from(jwt.split('.')[1], 'base64url').toString());

  const holderDid = payload.sub;
  const issuerDid = payload.iss;
  const credentialId = payload.vc?.id || '';
  const sdHashes = payload.vc?.credentialSubject?._sd || [];
  const expiry = payload.exp;

  const validatedDisclosures = validateSelectiveDisclosures(disclosures, sdHashes);

  return {
    jwt,
    disclosures,
    holderDid,
    issuerDid,
    credentialId,
    sdHashes,
    expiry,
    validatedDisclosures
  };
}

function validateSelectiveDisclosures(disclosures: string[], sdHashes: string[]): Array<{salt: string, claim: string, value: any}> {
  const validatedClaims = [];
  const disclosureHashMap = new Map<string, string>();
  
  for (const disclosure of disclosures) {
    try {
      const disclosureBytes = Buffer.from(disclosure, 'base64url');
      const hash = crypto.createHash('sha256').update(disclosureBytes).digest();
      const hashBase64Url = hash.toString('base64url');
      const sdHash = `sha-256:${hashBase64Url}`;
      
      if (!sdHashes.includes(sdHash)) {
        throw new Error(`Invalid disclosure: hash ${sdHash} not found in _sd array`);
      }
      
      if (disclosureHashMap.has(sdHash)) {
        throw new Error(`Duplicate disclosure for hash ${sdHash}`);
      }
      disclosureHashMap.set(sdHash, disclosure);
      
      const decoded = JSON.parse(Buffer.from(disclosure, 'base64url').toString());
      if (!Array.isArray(decoded) || decoded.length !== 3) {
        throw new Error('Invalid disclosure format');
      }
      
      const [salt, claim, value] = decoded;
      validatedClaims.push({ salt, claim, value });
      
    } catch (error) {
      console.error('Error validating disclosure:', error);
      throw error;
    }
  }
  
  return validatedClaims;
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

    const headerData = JSON.parse(Buffer.from(header, 'base64url').toString());
    const payloadData = JSON.parse(Buffer.from(payload, 'base64url').toString());

    if (headerData.alg !== 'ES256') {
      console.error(`Unsupported algorithm: ${headerData.alg}`);
      return false;
    }

    if (payloadData.exp && Date.now() / 1000 > payloadData.exp) {
      console.error('JWT has expired');
      return false;
    }

    if (payloadData.iat && Date.now() / 1000 < payloadData.iat) {
      console.error('JWT issued in the future');
      return false;
    }

    if (payloadData.iss !== issuerDid) {
      console.error(`Issuer mismatch: expected ${issuerDid}, got ${payloadData.iss}`);
      return false;
    }

    const didDoc = await fetchDIDDocument(issuerDid);

    if (!didDoc.verificationMethod || didDoc.verificationMethod.length === 0) {
      console.error('No verification methods found in DID document');
      return false;
    }

    let verificationMethod = null;

    if (headerData.kid) {
      verificationMethod = didDoc.verificationMethod.find(vm =>
        vm.id === headerData.kid || vm.id.endsWith(headerData.kid)
      );
    }

    if (!verificationMethod && didDoc.assertionMethod && didDoc.assertionMethod.length > 0) {
      const assertionMethodId = didDoc.assertionMethod[0];
      verificationMethod = didDoc.verificationMethod.find(vm => vm.id === assertionMethodId);
    }

    if (!verificationMethod) {
      verificationMethod = didDoc.verificationMethod[0];
    }

    if (!verificationMethod || !verificationMethod.publicKeyJwk) {
      console.error('No suitable verification method with publicKeyJwk found');
      return false;
    }

    const publicKey = importJWKToPublicKey(verificationMethod.publicKeyJwk);

    const signatureData = Buffer.from(signature, 'base64url');
    const signedData = Buffer.from(`${header}.${payload}`);

    const isValid = crypto.verify('sha256', signedData, {
      key: publicKey,
      dsaEncoding: 'ieee-p1363'
    }, signatureData);

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

  let currentLevel = sdHashes.map(hash => Buffer.from(hash.replace('sha-256:', ''), 'base64url'));

  while (currentLevel.length > 1) {
    const nextLevel: Buffer[] = [];

    for (let i = 0; i < currentLevel.length; i += 2) {
      if (i + 1 < currentLevel.length) {
        const combined = Buffer.concat([currentLevel[i], currentLevel[i + 1]]);
        const hash = crypto.createHash('sha256').update(combined).digest();
        nextLevel.push(hash);
      } else {
        nextLevel.push(currentLevel[i]);
      }
    }

    currentLevel = nextLevel;
  }

  return currentLevel[0].toString('hex');
}