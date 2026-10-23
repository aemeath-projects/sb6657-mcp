import { parseList } from './env.js'
import { createFetchHandler, type FetchHandler } from './http.js'

export interface Env {
  ALLOWED_HOSTS?: string
  ALLOWED_ORIGINS?: string
}

export function createWorkerHandler(env: Env): FetchHandler {
  return createFetchHandler({
    allowedHosts: parseList(env.ALLOWED_HOSTS),
    allowedOrigins: parseList(env.ALLOWED_ORIGINS),
  })
}

let cachedHandler: FetchHandler | undefined

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    cachedHandler ??= createWorkerHandler(env)
    return cachedHandler.fetch(request)
  },
}
