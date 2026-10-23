import { McpServer } from '@modelcontextprotocol/server'
import { z } from 'zod'

import { SERVER_NAME, SERVER_VERSION } from './version.js'

/**
 * 创建一个 MCP Server 实例。
 *
 * SDK 的 `McpServerFactory` 会把 `McpRequestContext` 作为第一个参数传入，
 * 因此这里刻意保持零参数，避免上下文被误认为配置项。
 */
export function createServer(): McpServer {
  const server = new McpServer({
    name: SERVER_NAME,
    version: SERVER_VERSION,
  })

  server.registerTool(
    'ping',
    {
      title: 'Ping',
      description: '健康检查工具，始终返回 pong。',
      inputSchema: z.object({}),
    },
    () => ({
      content: [{ type: 'text', text: 'pong' }],
    }),
  )

  return server
}
