import axios, { AxiosInstance } from 'axios'
import {
  TwattestSDKConfig,
  AttestationStatus,
  DisclosureRequest,
  DisclosureRequestResponse,
  DisclosureStatus,
  TwattestSDKError
} from './types'

export class TwattestSDK {
  private client: AxiosInstance
  private config: TwattestSDKConfig

  constructor(config: TwattestSDKConfig) {
    this.config = config
    this.client = axios.create({
      baseURL: config.baseUrl,
      timeout: config.timeout || 30000,
      headers: {
        'X-API-Key': config.apiKey,
        'Content-Type': 'application/json'
      }
    })

    this.client.interceptors.response.use(
      response => response,
      error => {
        if (error.response) {
          throw new TwattestSDKError(
            error.response.data.error || 'API request failed',
            `HTTP_${error.response.status}`,
            error.response.data
          )
        } else if (error.request) {
          throw new TwattestSDKError(
            'Network error',
            'NETWORK_ERROR',
            error.message
          )
        } else {
          throw new TwattestSDKError(
            'Request error',
            'REQUEST_ERROR',
            error.message
          )
        }
      }
    )
  }

  async getAttestationStatus(did: string): Promise<AttestationStatus> {
    if (!did || !did.startsWith('did:')) {
      throw new TwattestSDKError(
        'Invalid DID format',
        'INVALID_DID',
        { did }
      )
    }

    try {
      const response = await this.client.get<AttestationStatus>(
        `/attestation/status/${encodeURIComponent(did)}`
      )
      return response.data
    } catch (error) {
      if (error instanceof TwattestSDKError) {
        throw error
      }
      throw new TwattestSDKError(
        'Failed to get attestation status',
        'ATTESTATION_STATUS_ERROR',
        error
      )
    }
  }

  async createDisclosureRequest<T = any>(
    params: DisclosureRequest<T>
  ): Promise<DisclosureRequestResponse> {
    try {
      const response = await this.client.post<DisclosureRequestResponse>(
        '/disclosure/request',
        params
      )
      return response.data
    } catch (error) {
      if (error instanceof TwattestSDKError) {
        throw error
      }
      throw new TwattestSDKError(
        'Failed to create disclosure request',
        'DISCLOSURE_REQUEST_ERROR',
        error
      )
    }
  }

  async getDisclosureStatus<T = any>(
    requestId: string
  ): Promise<DisclosureStatus<T>> {
    if (!requestId) {
      throw new TwattestSDKError(
        'Request ID is required',
        'INVALID_REQUEST_ID'
      )
    }

    try {
      const response = await this.client.get<DisclosureStatus<T>>(
        `/disclosure/status/${requestId}`
      )
      return response.data
    } catch (error) {
      if (error instanceof TwattestSDKError) {
        throw error
      }
      throw new TwattestSDKError(
        'Failed to get disclosure status',
        'DISCLOSURE_STATUS_ERROR',
        error
      )
    }
  }

  async waitForDisclosure<T = any>(
    requestId: string,
    options: {
      timeout?: number
      pollInterval?: number
    } = {}
  ): Promise<DisclosureStatus<T>> {
    const timeout = options.timeout || 300000 // 5 minutes
    const pollInterval = options.pollInterval || 2000 // 2 seconds
    const startTime = Date.now()

    while (Date.now() - startTime < timeout) {
      const status = await this.getDisclosureStatus<T>(requestId)
      
      if (status.status === 'completed' || status.status === 'expired') {
        return status
      }

      await new Promise(resolve => setTimeout(resolve, pollInterval))
    }

    throw new TwattestSDKError(
      'Disclosure request timeout',
      'TIMEOUT',
      { requestId, timeout }
    )
  }

  generateQRCodeUrl(vpRequestUri: string): string {
    const encoded = encodeURIComponent(vpRequestUri)
    return `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encoded}`
  }
}