import { API_BASE } from './api.js'
import { createTryOnClient } from './tryon2dClient.js'

export const tryOnClient = createTryOnClient(API_BASE)
