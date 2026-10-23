import {
  createMcpHandler,
  hostHeaderValidationResponse,
  originValidationResponse,
  type McpHttpHandler,
} from '@modelcontextprotocol/server'

import { createServer } from './server.js'

export interface FetchHandlerOptions {
  /** MCP 端点路径，必须以 `/` 开头。 */
  path?: string
  /** 允许的 Host 主机名（不含端口）；未配置时跳过校验。 */
  allowedHosts?: string[]
  /** 允许的 Origin 主机名；未配置时跳过校验。 */
  allowedOrigins?: string[]
}

/**
 * 与 SDK 的 `McpHttpHandler` 对齐，保留 `notify` / `bus`，以便后续启用
 * `subscriptions/listen` 服务端推送能力。
 */
export type FetchHandler = Pick<McpHttpHandler, 'fetch' | 'close' | 'notify' | 'bus'>

const DEFAULT_PATH = '/mcp'

const mcpHandler = createMcpHandler(createServer)

/**
 * 创建 web-standard 的 MCP 请求处理器，可同时用于 Node 与 Cloudflare Workers。
 *
 * Host/Origin 校验在此统一完成，Node 与 Worker 两侧不重复实现；SDK 的
 * `createMcpHandler` 本身刻意不做校验，因此这里是唯一的校验层。
 */
export function createFetchHandler(options: FetchHandlerOptions = {}): FetchHandler {
  const path = options.path ?? DEFAULT_PATH
  const { allowedHosts, allowedOrigins } = options

  return {
    async fetch(request, requestOptions) {
      const url = new URL(request.url)

      if (request.method === 'GET' && url.pathname === '/health') {
        return Response.json({ status: 'ok' })
      }

      if (url.pathname !== path) {
        return new Response('Not Found', { status: 404 })
      }

      if (allowedHosts !== undefined && allowedHosts.length > 0) {
        const rejection = hostHeaderValidationResponse(request, allowedHosts)
        if (rejection !== undefined) {
          return rejection
        }
      }

      if (allowedOrigins !== undefined && allowedOrigins.length > 0) {
        const rejection = originValidationResponse(request, allowedOrigins)
        if (rejection !== undefined) {
          return rejection
        }
      }

      return mcpHandler.fetch(request, requestOptions)
    },
    close: () => mcpHandler.close(),
    notify: mcpHandler.notify,
    bus: mcpHandler.bus,
  }
}
