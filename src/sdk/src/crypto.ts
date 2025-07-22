import * as crypto from 'crypto';
import { DecodedDisclosure } from './types';

export class CryptoUtils {
  /**
   * 計算 disclosure 的 SHA-256 hash
   */
  static calculateDisclosureHash(disclosure: string): string {
    const disclosureBytes = Buffer.from(disclosure, 'base64url');
    const hash = crypto.createHash('sha256').update(disclosureBytes).digest();
    const hashBase64Url = hash.toString('base64url');
    return `sha-256:${hashBase64Url}`;
  }

  /**
   * 解碼 disclosure
   */
  static decodeDisclosure(disclosure: string): DecodedDisclosure {
    try {
      const decoded = JSON.parse(
        Buffer.from(disclosure, 'base64url').toString()
      );
      
      if (!Array.isArray(decoded) || decoded.length !== 3) {
        throw new Error('Invalid disclosure format');
      }
      
      const [salt, key, value] = decoded;
      return { salt, key, value };
    } catch (error) {
      throw new Error(`Failed to decode disclosure: ${error}`);
    }
  }

  /**
   * 計算 Merkle Root
   */
  static calculateMerkleRoot(sdHashes: string[]): string {
    if (sdHashes.length === 0) {
      return '';
    }

    if (sdHashes.length === 1) {
      return sdHashes[0].replace('sha-256:', '');
    }

    let currentLevel = sdHashes.map(hash => 
      Buffer.from(hash.replace('sha-256:', ''), 'base64url')
    );

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

  /**
   * 解析 JWT payload
   */
  static parseJwtPayload(jwt: string): any {
    const parts = jwt.split('.');
    if (parts.length !== 3) {
      throw new Error('Invalid JWT format');
    }
    
    return JSON.parse(
      Buffer.from(parts[1], 'base64url').toString()
    );
  }
}