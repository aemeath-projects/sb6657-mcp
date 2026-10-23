# sb6657-mcp

基于 [MCP TypeScript SDK v2](https://github.com/modelcontextprotocol/typescript-sdk) 的
「玩机器烂梗收集」（[sb6657.cn](https://sb6657.cn)）MCP Server。

同一套业务代码可同时以三种方式运行：

- **stdio**：由 Claude Desktop、Claude Code、MCP Inspector 等本地客户端拉起。
- **Streamable HTTP**：Node 原生 `node:http` + 官方 `@modelcontextprotocol/node` 适配器。
- **Cloudflare Workers**：直接导出 web-standard `fetch`，由 Cloudflare Workers Builds 自动构建部署。

所有工具均为**只读**：数据来自 sb6657 公开接口（`api.hguofichp.cn`）与 OSS 静态 JSON，
不包含投稿、点赞、投票等写操作。

## 环境要求

- Node.js `>= 24.0.0`
- pnpm `12.14.0`（通过 `packageManager` 固定）

## 安装与构建

```bash
pnpm install
pnpm build
```

构建产物输出到 `dist/`：

- `dist/index.js`：公共库入口
- `dist/http.js`：web-standard HTTP handler
- `dist/cli.js`：命令行入口（含 shebang）

## 工具

| 工具                 | 说明                                                      |
| -------------------- | --------------------------------------------------------- |
| `search_memes`       | 搜索或分页浏览烂梗，支持标签、日期范围、按复制次数排序    |
| `get_hot_memes`      | 24 小时 / 7 天热榜、随机一条、首页关键词词云              |
| `get_meme_detail`    | 烂梗详情，可选返回梗 DNA（关键词、模板、指纹）            |
| `list_meme_tags`     | 标签字典（编码 ↔ 中文名）                                 |
| `get_meme_rankings`  | 烂度总榜、实时热度榜、今日 PK、历史周榜                   |
| `get_meme_lifecycle` | 生命周期看板，或按 BIRTH / BOOM / STALE / DEAD 分阶段浏览 |
| `get_meme_dna`       | 梗 DNA v6、进化图谱与旧版关联关系                         |
| `get_matches`        | 进行中赛事、赛事列表、队伍池、赛事烂梗                    |
| `get_gallery`        | 时光相册图片与评论                                        |
| `get_shield_words`   | 屏蔽词字典或分页列表                                      |
| `get_static_report`  | 年度烂梗 Top20、布雷德十五勇士战报、超级逮虾户战报        |

每个业务工具同时返回 Markdown 文本和 `structuredContent`，并声明 `outputSchema`。
标签参数既接受编码（如 `06`），也接受中文名（如 `群魔乱舞`）；日期筛选必须与关键词同时使用。

## stdio 模式

```bash
node dist/cli.js
# 或
pnpm start
```

Claude Code / Claude Desktop 配置示例：

```json
{
  "mcpServers": {
    "sb6657": {
      "command": "node",
      "args": ["/absolute/path/to/sb6657-mcp/dist/cli.js"]
    }
  }
}
```

使用 MCP Inspector 调试：

```bash
pnpm inspect
```

## HTTP 模式

```bash
node dist/cli.js --transport http
# 或
pnpm start:http
```

默认监听 `http://127.0.0.1:3000/mcp`，健康检查位于 `/health`。

```bash
# 健康检查
curl -s http://127.0.0.1:3000/health

# 列出工具
curl -s -X POST http://127.0.0.1:3000/mcp \
  -H 'Content-Type: application/json' \
  -H 'Accept: application/json, text/event-stream' \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}'

# 协议层存活探测（不依赖任何工具）
curl -s -X POST http://127.0.0.1:3000/mcp \
  -H 'Content-Type: application/json' \
  -H 'Accept: application/json, text/event-stream' \
  -d '{"jsonrpc":"2.0","id":2,"method":"ping"}'

# 搜索烂梗
curl -s -X POST http://127.0.0.1:3000/mcp \
  -H 'Content-Type: application/json' \
  -H 'Accept: application/json, text/event-stream' \
  -d '{"jsonrpc":"2.0","id":3,"method":"tools/call","params":{"name":"search_memes","arguments":{"query":"原神","pageSize":3}}}'
```

响应为 SSE 格式，`result.structuredContent` 即结构化数据，`result.content` 为对应的
Markdown 文本。

Node 侧默认绑定 `127.0.0.1`，并启用 localhost 级别的 Host/Origin 校验。若需要监听
`0.0.0.0` 或通过反向代理暴露，请显式配置 `MCP_ALLOWED_HOSTS` 与 `MCP_ALLOWED_ORIGINS`。

## Cloudflare Workers

### 本地开发

```bash
pnpm worker:dev
```

默认地址为 `http://127.0.0.1:8787`，MCP 端点为 `/mcp`，健康检查为 `/health`。

```bash
pnpm worker:check   # 仅打包校验，不部署
```

### 通过 Cloudflare Workers Builds 自动部署

项目采用与 Pages 相同的「Cloudflare 侧 CI」模式：GitHub Actions 不执行部署，Cloudflare
在 `master` 分支有新提交时自动构建并发布。

1. 在 Cloudflare Dashboard → Workers & Pages 创建 Worker，选择 **Connect to Git**，绑定
   `aemeath-projects/sb6657-mcp`。
2. Production branch 设为 `master`。
3. Build command：`pnpm install --frozen-lockfile`。
4. Deploy command：`pnpm worker:deploy`。
5. Build 环境变量：
   - `PNPM_VERSION=12.14.0`（Workers Builds 默认版本低于本项目要求）
   - `NODE_VERSION=24`（可选，默认已满足要求）
6. 运行时变量 `ALLOWED_HOSTS`、`ALLOWED_ORIGINS` 在 Worker 的 Settings → Variables 中配置，
   也可写入 `wrangler.jsonc` 的 `vars`。

部署完成后：

- MCP 端点：`https://<worker-domain>/mcp`
- 健康检查：`https://<worker-domain>/health`

本地执行 `pnpm worker:deploy` 仅用于调试，日常发布以 Cloudflare Workers Builds 为准。

## 配置

CLI 参数优先级高于环境变量。

| CLI 参数                    | 环境变量            | 默认值      | 说明                         |
| --------------------------- | ------------------- | ----------- | ---------------------------- |
| `--transport <stdio\|http>` | `MCP_TRANSPORT`     | `stdio`     | 传输方式                     |
| `--host <host>`             | `MCP_HOST`          | `127.0.0.1` | HTTP 监听地址                |
| `--port <port>`             | `MCP_PORT`          | `3000`      | HTTP 监听端口                |
| `--path <path>`             | `MCP_PATH`          | `/mcp`      | MCP 端点路径                 |
| —                           | `MCP_ALLOWED_HOSTS` | 未设置      | 允许的 Host 主机名，逗号分隔 |
| `--help` / `-h`             | —                   | —           | 显示帮助                     |
| `--version` / `-v`          | —                   | —           | 显示版本                     |

Worker 运行时使用 `ALLOWED_HOSTS`、`ALLOWED_ORIGINS`（逗号分隔），空值表示不启用对应校验。

## 开发脚本

| 脚本                | 说明                          |
| ------------------- | ----------------------------- |
| `pnpm dev`          | tsup watch 构建               |
| `pnpm lint`         | ESLint 检查                   |
| `pnpm lint:fix`     | ESLint 自动修复               |
| `pnpm format`       | Prettier 检查                 |
| `pnpm format:fix`   | Prettier 格式化               |
| `pnpm type-check`   | TypeScript 类型检查           |
| `pnpm build`        | 构建 npm 产物                 |
| `pnpm worker:dev`   | 本地 Worker 开发              |
| `pnpm worker:check` | Worker 打包校验               |
| `pnpm bump`         | 版本号、CHANGELOG、tag 与提交 |
| `pnpm commit`       | Commitizen 交互式提交         |

## 目录结构

```text
src/
├── cli.ts       # bin 入口，stdio/http 分流
├── config.ts    # CLI 与环境变量解析
├── env.ts       # 列表环境变量解析（Worker 可用）
├── http.ts      # 共享 web-standard fetch handler
├── index.ts     # 公共库 barrel
├── node.ts      # node:http + toNodeHandler
├── server.ts    # McpServer 工厂与工具注册
├── version.ts   # 服务名与版本号
├── worker.ts    # Cloudflare Worker 入口
├── sb6657/      # 数据访问层
│   ├── client.ts    # API/OSS 请求、超时、包络解包与错误映射
│   ├── format.ts    # Markdown 渲染与分页摘要
│   ├── tags.ts      # 标签字典缓存与中英文解析
│   └── types.ts     # API 类型、归一化输出与公共 zod schema
└── tools/       # 工具域
    ├── analytics.ts # 榜单、生命周期、DNA
    ├── matches.ts   # 赛事与赛事烂梗
    ├── memes.ts     # 搜索、热门、详情、标签
    ├── misc.ts      # 相册、屏蔽词、静态战报
    └── register.ts  # 统一的成功/失败结果封装
```

`http.ts`、`server.ts`、`worker.ts`、`env.ts`、`version.ts` 保持 Node-free，由 ESLint
`no-restricted-imports` 约束；Node 适配器 `node.ts` 仅在 HTTP 模式下动态加载。

## License

[MIT](./LICENSE)
