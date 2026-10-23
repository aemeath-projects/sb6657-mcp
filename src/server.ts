import { McpServer } from '@modelcontextprotocol/server'
import { z } from 'zod'

import { registerAnalyticsTools } from './tools/analytics.js'
import { registerMatchTools } from './tools/matches.js'
import { registerMemeTools } from './tools/memes.js'
import { registerMiscTools } from './tools/misc.js'
import { SERVER_NAME, SERVER_VERSION } from './version.js'

const INSTRUCTIONS = `本服务器提供 sb6657「玩机器烂梗收集」站的只读数据。
- 搜索或分页浏览烂梗用 search_memes；热门/随机/词云用 get_hot_memes；单条详情用 get_meme_detail。
- 标签既可用编码也可用中文名，完整字典见 list_meme_tags。
- 日期筛选必须同时提供关键词（后端限制）。
- 榜单、赛事、生命周期、DNA、相册、屏蔽词与静态战报分别有对应的聚合工具。`

/**
 * 创建一个 MCP Server 实例。
 *
 * SDK 的 `McpServerFactory` 会把 `McpRequestContext` 作为第一个参数传入，
 * 因此这里刻意保持零参数，避免上下文被误认为配置项。
 */
export function createServer(): McpServer {
  const server = new McpServer(
    {
      name: SERVER_NAME,
      version: SERVER_VERSION,
    },
    { instructions: INSTRUCTIONS },
  )

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

  registerMemeTools(server)
  registerAnalyticsTools(server)
  registerMatchTools(server)
  registerMiscTools(server)

  return server
}
