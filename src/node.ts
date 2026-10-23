import { createServer as createHttpServer } from 'node:http'

import { toNodeHandler } from '@modelcontextprotocol/node'
import { localhostAllowedHostnames, localhostAllowedOrigins } from '@modelcontextprotocol/server'

import type { CliOptions } from './config.js'
import { createFetchHandler } from './http.js'

/** SDK 的 localhost 名单用于匹配 Host 头；`::1` 是 `server.listen` 的裸 IPv6 绑定形式。 */
const LOCALHOST_HOSTNAMES = new Set([...localhostAllowedHostnames(), '::1'])

/**
 * 启动 Node HTTP 服务。
 *
 * 仅在 `--transport http` 时被 `cli.ts` 动态加载，避免 stdio 模式引入
 * Node HTTP 适配器。
 *
 * Host/Origin 校验统一由 `createFetchHandler` 完成：显式配置的 allowlist 原样生效，
 * 绑定 localhost 且未配置时降级为 SDK 的 localhost 默认 allowlist。
 */
export function startHttpServer(options: CliOptions): ReturnType<typeof createHttpServer> {
  const isLocalhost = LOCALHOST_HOSTNAMES.has(options.host)

  if (options.allowedHosts === undefined && !isLocalhost) {
    console.warn(
      `未配置 MCP_ALLOWED_HOSTS，且绑定地址 ${options.host} 不是 localhost；Host 校验已禁用，请自行确保反向代理安全。`,
    )
  }

  if (options.allowedOrigins === undefined && !isLocalhost) {
    console.warn(
      `未配置 MCP_ALLOWED_ORIGINS，且绑定地址 ${options.host} 不是 localhost；Origin 校验已禁用。`,
    )
  }

  const handler = createFetchHandler({
    path: options.path,
    allowedHosts: options.allowedHosts ?? (isLocalhost ? localhostAllowedHostnames() : undefined),
    allowedOrigins: options.allowedOrigins ?? (isLocalhost ? localhostAllowedOrigins() : undefined),
  })

  const nodeHandler = toNodeHandler(handler, {
    onerror: (error) => {
      console.error('MCP 请求处理失败：', error)
    },
  })

  const server = createHttpServer((req, res) => {
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
