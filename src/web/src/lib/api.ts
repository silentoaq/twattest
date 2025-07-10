import axios from 'axios';

const api = axios.create({
  baseURL: '/api',
  timeout: 10000,
});

export interface VerificationStartResponse {
  success: boolean;
  requestId: string;
  vpRequestUri?: string;
  error?: string;
}

export interface TwfidoAttestation {
  exists: boolean;
  address: string;
  data: {
    merkleRoot: string;
    credentialReference: string;
  } | null;
  expiry: number | null;
}

export interface TwlandAttestation {
  exists: boolean;
  attestations: Array<{
    address: string;
    data: {
      merkleRoot: string;
      credentialReference: string;
    };
    expiry: number;
  }>;
  count: number;
}

export interface AttestationStatus {
  twfido?: TwfidoAttestation;
  twland?: TwlandAttestation;
}

export const apiService = {
  async startVerification(holderDid: string): Promise<VerificationStartResponse> {
    const response = await api.post('/verify/start', { holderDid });
    return response.data;
  },

  async getAttestationStatus(holderDid: string): Promise<AttestationStatus> {
    const response = await api.get(`/attestation/status/${holderDid}`);
    return response.data;
  },

  async healthCheck(): Promise<{ status: string; timestamp: string }> {
    const response = await api.get('/health');
    return response.data;
  },
};