export interface TwattestSDKConfig {
  baseUrl: string
  apiKey: string
  timeout?: number
}

export interface AttestationStatus {
  twfido?: {
    exists: boolean
    address: string
    data: {
      merkleRoot: string
      credentialReference: string
    } | null
    expiry: number | null
  }
  twland?: {
    exists: boolean
    attestations: Array<{
      address: string
      data: {
        merkleRoot: string
        credentialReference: string
      }
      expiry: number
    }>
    count: number
  }
}

export interface DisclosureRequest<T = any> {
  holderDid: string
  credentialType: 'PropertyCredential' | 'CitizenCredential'
  credentialId?: string
  requiredFields: (keyof T)[]
  purpose: string
  callbackUrl?: string
}

export interface DisclosureRequestResponse {
  requestId: string
  vpRequestUri: string
  expiresAt: number
}

export interface DisclosureStatus<T = any> {
  status: 'pending' | 'completed' | 'expired'
  disclosedData?: T
  error?: string
  completedAt?: number
}

export interface ValidationResult<T = any> {
  isValid: boolean
  disclosedData?: T
  merkleRoot?: string
  error?: string
}

export interface ParsedSDJWT {
  jwt: string
  disclosures: string[]
  holderDid: string
  issuerDid: string
  credentialId: string
  sdHashes: string[]
  expiry?: number
}

export interface DecodedDisclosure {
  salt: string
  key: string
  value: any
}

export type CredentialType = 'PropertyCredential' | 'CitizenCredential'

export const SUPPORTED_ISSUERS = {
  TWFIDO: 'did:web:twfido.ddns.net',
  TWLAND: 'did:web:twland.ddns.net'
} as const

export class TwattestSDKError extends Error {
  constructor(
    message: string,
    public code: string,
    public details?: any
  ) {
    super(message)
    this.name = 'TwattestSDKError'
  }
}