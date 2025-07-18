// Web SDK (前端使用)
export { TwattestSDK } from './web.js';

// Node SDK (後端使用)
export { TwattestVerifier } from './node.js';

// Shared Types
export type {
  UserPermissions,
  TwfidoAttestation,
  TwlandAttestation,
  AttestationStatus
} from './web.js';

// Web SDK Types
export type {
  TwattestSDKConfig,
  DataRequestConfig, 
  DataRequestSession
} from './web.js';

// Node SDK Types
export type {
  TwattestVerifierConfig,
  VerificationResult,
  ExtractedData,
  DataSchema
} from './node.js';