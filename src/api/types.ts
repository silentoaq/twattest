export interface VerificationRequest {
  holderDid: string;
  requestId: string;
}

export interface VerificationResponse {
  success: boolean;
  requestId: string;
  vpRequestUri?: string;
  error?: string;
}

export interface AttestationData {
  merkleRoot: string;
  credentialReference: string;
}

export interface SDJWTVerificationResult {
  isValid: boolean;
  holderDid: string;
  merkleRoot: string;
  credentialReference: string;
  issuerDid: string;
  expiry: number;
}

export const SUPPORTED_ISSUERS = {
  TWFIDO: 'did:web:twfido.ddns.net',
  TWLAND: 'did:web:twland.ddns.net'
} as const;

export const SCHEMA_NAMES = {
  TWFIDO: 'Twfido Identity Verification',
  TWLAND: 'Twland Property Verification'
} as const;

export const API_ENDPOINTS = {
  VERIFY_START: '/api/verify/start',
  VERIFY_CALLBACK: '/api/verify/callback',
  ATTESTATION_STATUS: '/api/attestation/status'
} as const;