import { parseArgs } from 'node:util'

import { parseList } from './env.js'

export type Transport = 'stdio' | 'http'

export interface CliOptions {
  transport: Transport
  host: string
  port: number
  path: string
  allowedHosts?: string[]
  allowedOrigins?: string[]
  help: boolean
  version: boolean
}

const DEFAULT_HOST = '127.0.0.1'
const DEFAULT_PORT = 3000
const DEFAULT_PATH = '/mcp'

/**
 * 解析 CLI 参数与环境变量。优先级：CLI > 环境变量 > 默认值。
 *
 * 未知参数会由 `parseArgs` 直接抛出异常。
 */
export function parseCliOptions(
  argv: string[],
  env: Record<string, string | undefined>,
): CliOptions {
  const { values } = parseArgs({
    args: argv,
    options: {
      transport: { type: 'string' },
      host: { type: 'string' },
      port: { type: 'string' },
      path: { type: 'string' },
      help: { type: 'boolean', short: 'h' },
      version: { type: 'boolean', short: 'v' },
    },
    allowPositionals: false,
  })

  const transport = values.transport ?? env.MCP_TRANSPORT ?? 'stdio'
  if (transport !== 'stdio' && transport !== 'http') {
    throw new Error(`无效的 transport "${transport}"，应为 "stdio" 或 "http"`)
  }

  const path = values.path ?? env.MCP_PATH ?? DEFAULT_PATH
  if (!path.startsWith('/')) {
    throw new Error(`无效的 path "${path}"，必须以 "/" 开头`)
  }

  return {
    transport,
    host: values.host ?? env.MCP_HOST ?? DEFAULT_HOST,
    port: parsePort(values.port ?? env.MCP_PORT),
    path,
    allowedHosts: parseList(env.MCP_ALLOWED_HOSTS),
    allowedOrigins: parseList(env.MCP_ALLOWED_ORIGINS),
    help: values.help === true,
    version: values.version === true,
  }
}

function parsePort(value: string | undefined): number {
  if (value === undefined) {
    return DEFAULT_PORT
  }

  const port = Number(value)
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error(`无效的 port "${value}"，应为 1-65535 之间的整数`)
  }

  return port
}
