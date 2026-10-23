import {
  createMcpHandler,
  hostHeaderValidationResponse,
  originValidationResponse,
  type McpHandlerRequestOptions,
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

export interface FetchHandler {
  fetch: (request: Request, options?: McpHandlerRequestOptions) => Promise<Response>
  close: () => Promise<void>
}

const DEFAULT_PATH = '/mcp'

const mcpHandler = createMcpHandler(createServer)

/**
 * 创建 web-standard 的 MCP 请求处理器，可同时用于 Node 与 Cloudflare Workers。
 *
 * Node 侧的 socket 级 Host/Origin 校验由 `src/node.ts` 完成；这里只处理
 * HTTP 层可见的校验，因此可直接运行在 Worker 运行时。
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
  }
}
