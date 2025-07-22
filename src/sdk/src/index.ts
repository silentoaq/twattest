export { TwattestSDK } from './client'
export * from './types'

import { TwattestSDK } from './client'
import { TwattestSDKConfig } from './types'

export function createTwattestSDK(config: TwattestSDKConfig) {
  return new TwattestSDK(config)
}