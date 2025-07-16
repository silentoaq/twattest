import QRCode from 'qrcode';

export interface TwattestSDKConfig {
  baseUrl?: string;
  apiKey?: string;
}

export interface UserPermissions {
  hasCitizenCredential: boolean;
  hasPropertyCredential: boolean;
  propertyCount: number;
}

export interface DataRequestConfig {
  credentialType: 'CitizenCredential' | 'PropertyCredential';
  requiredFields: string[];
  purpose: string;
  dappDomain: string;
}

export interface DataRequestSession {
  requestId: string;
  vpRequestUri: string;
  expiresIn: number;
}

export class TwattestSDK {
  private baseUrl: string;
  private apiKey?: string;

  constructor(config: TwattestSDKConfig = {}) {
    this.baseUrl = config.baseUrl || 'https://twattest.ddns.net/api';
    this.apiKey = config.apiKey;
  }

  private async request(endpoint: string, options: RequestInit = {}): Promise<any> {
    const url = `${this.baseUrl}${endpoint}`;
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };

    if (this.apiKey) {
      headers['Authorization'] = `Bearer ${this.apiKey}`;
    }

    // 安全地合併 headers
    if (options.headers) {
      const optionHeaders = options.headers instanceof Headers 
        ? Object.fromEntries(options.headers.entries())
        : options.headers as Record<string, string>;
      
      Object.assign(headers, optionHeaders);
    }

    const response = await fetch(url, {
      ...options,
      headers,
    });

    if (!response.ok) {
      throw new Error(`API request failed: ${response.status} ${response.statusText}`);
    }

    return response.json();
  }

  async checkPermissions(userDid: string): Promise<UserPermissions> {
    return this.request(`/sdk/permissions/${userDid}`);
  }

  async requestData(config: DataRequestConfig): Promise<DataRequestSession> {
    return this.request('/sdk/data-request', {
      method: 'POST',
      body: JSON.stringify(config),
    });
  }

  async generateQRCode(vpRequestUri: string): Promise<string> {
    try {
      return await QRCode.toDataURL(vpRequestUri, {
        width: 256,
        margin: 2,
        color: {
          dark: '#000000',
          light: '#FFFFFF'
        }
      });
    } catch (error) {
      throw new Error(`QR code generation failed: ${error}`);
    }
  }
}