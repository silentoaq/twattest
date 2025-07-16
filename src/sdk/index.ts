// Web SDK (前端使用)
export { TwattestSDK } from './web.js';

// Node SDK (後端使用)
export { TwattestVerifier } from './node.js';

// Types
export type {
  TwattestSDKConfig,
  UserPermissions,
  DataRequestConfig, 
  DataRequestSession
} from './web.js';

export type {
  TwattestVerifierConfig,
  VerificationResult,
  ExtractedData,
  DataSchema
} from './node.js';