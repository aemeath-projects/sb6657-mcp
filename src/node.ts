import {
  createServer as createHttpServer,
  type IncomingMessage,
  type ServerResponse,
} from 'node:http'

import {
  hostHeaderValidation,
  localhostHostValidation,
  localhostOriginValidation,
  originValidation,
  toNodeHandler,
} from '@modelcontextprotocol/node'

import type { CliOptions } from './config.js'
import { createFetchHandler } from './http.js'

const LOCALHOST_HOSTNAMES = new Set(['127.0.0.1', 'localhost', '::1', '[::1]'])

/**
 * 启动 Node HTTP 服务。
 *
 * 仅在 `--transport http` 时被 `cli.ts` 动态加载，避免 stdio 模式引入
 * Node HTTP 适配器。
 */
export function startHttpServer(options: CliOptions): ReturnType<typeof createHttpServer> {
  const handler = createFetchHandler({
    path: options.path,
    allowedHosts: options.allowedHosts,
    allowedOrigins: options.allowedOrigins,
  })
  const nodeHandler = toNodeHandler(handler, {
    onerror: (error) => {
      console.error('MCP 请求处理失败：', error)
    },
  })

  const isLocalhost = LOCALHOST_HOSTNAMES.has(options.host)
  const hostGuard = createHostGuard(options, isLocalhost)
  const originGuard = createOriginGuard(options, isLocalhost)

  const server = createHttpServer((req, res) => {
    if (hostGuard !== undefined && !hostGuard(req, res)) {
      return
    }
    if (originGuard !== undefined && !originGuard(req, res)) {
      return
    }

    void nodeHandler(req, res)
  })

  server.on('error', (error) => {
    console.error('HTTP 服务错误：', error)
    process.exitCode = 1
  })

  server.listen(options.port, options.host, () => {
    const address = `http://${options.host}:${String(options.port)}${options.path}`
    console.error(`MCP HTTP 服务已启动：${address}`)
  })

  const shutdown = (): void => {
    console.error('正在关闭 HTTP 服务...')
    server.close()
    server.closeAllConnections()
    void handler.close().catch((error: unknown) => {
      console.error('关闭 MCP handler 失败：', error)
    })
  }

  process.once('SIGINT', shutdown)
  process.once('SIGTERM', shutdown)

  return server
}

type RequestGuard = (req: IncomingMessage, res: ServerResponse) => boolean

function createHostGuard(options: CliOptions, isLocalhost: boolean): RequestGuard | undefined {
  if (options.allowedHosts !== undefined && options.allowedHosts.length > 0) {
    return hostHeaderValidation(options.allowedHosts)
  }

  if (isLocalhost) {
    return localhostHostValidation()
  }

  console.warn(
    `未配置 MCP_ALLOWED_HOSTS，且绑定地址 ${options.host} 不是 localhost；Host 校验已禁用，请自行确保反向代理安全。`,
  )
  return undefined
}

function createOriginGuard(options: CliOptions, isLocalhost: boolean): RequestGuard | undefined {
  if (options.allowedOrigins !== undefined && options.allowedOrigins.length > 0) {
    return originValidation(options.allowedOrigins)
  }

  if (isLocalhost) {
    return localhostOriginValidation()
  }

  console.warn(
    `未配置 MCP_ALLOWED_ORIGINS，且绑定地址 ${options.host} 不是 localhost；Origin 校验已禁用。`,
  )
  return undefined
}
