#!/usr/bin/env node
import { serveStdio } from '@modelcontextprotocol/server/stdio'

import { parseCliOptions } from './config.js'
import { createServer } from './server.js'
import { SERVER_NAME, SERVER_VERSION } from './version.js'

const HELP_TEXT = `用法：${SERVER_NAME} [选项]

选项：
  --transport <stdio|http>  传输方式（默认：stdio）
  --host <host>             HTTP 监听地址（默认：127.0.0.1）
  --port <port>             HTTP 监听端口（默认：3000）
  --path <path>             MCP 端点路径（默认：/mcp）
  -h, --help                显示帮助
  -v, --version             显示版本

环境变量：
  MCP_TRANSPORT             stdio | http
  MCP_HOST                  HTTP 监听地址
  MCP_PORT                  HTTP 监听端口
  MCP_PATH                  MCP 端点路径
  MCP_ALLOWED_HOSTS         允许的 Host 主机名，逗号分隔
  MCP_ALLOWED_ORIGINS       允许的 Origin 主机名，逗号分隔`

async function main(): Promise<void> {
  const options = parseCliOptions(process.argv.slice(2), process.env)

  if (options.help) {
    process.stdout.write(`${HELP_TEXT}\n`)
    return
  }

  if (options.version) {
    process.stdout.write(`${SERVER_VERSION}\n`)
    return
  }

  if (options.transport === 'stdio') {
    const handle = serveStdio(createServer)
    console.error(`${SERVER_NAME} ${SERVER_VERSION} 已启动（stdio）`)

    const shutdown = (): void => {
      void handle.close()
    }
    process.once('SIGINT', shutdown)
    process.once('SIGTERM', shutdown)
    return
  }

  const { startHttpServer } = await import('./node.js')
  startHttpServer(options)
}

void main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error))
  process.exitCode = 1
})
