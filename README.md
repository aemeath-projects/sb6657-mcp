# sb6657-mcp

基于 [MCP TypeScript SDK v2](https://github.com/modelcontextprotocol/typescript-sdk) 的 MCP Server 工程骨架。

同一套业务代码可同时以三种方式运行：

- **stdio**：由 Claude Desktop、Claude Code、MCP Inspector 等本地客户端拉起。
- **Streamable HTTP**：Node 原生 `node:http` + 官方 `@modelcontextprotocol/node` 适配器。
- **Cloudflare Workers**：直接导出 web-standard `fetch`，由 Cloudflare Workers Builds 自动构建部署。

当前仅包含一个 `ping` 占位工具，用于验证端到端链路；业务功能请在此基础上扩展。

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

# 调用 ping
curl -s -X POST http://127.0.0.1:3000/mcp \
  -H 'Content-Type: application/json' \
  -H 'Accept: application/json, text/event-stream' \
  -d '{"jsonrpc":"2.0","id":2,"method":"tools/call","params":{"name":"ping","arguments":{}}}'
```

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
├── server.ts    # McpServer 工厂与 ping 工具
├── version.ts   # 服务名与版本号
└── worker.ts    # Cloudflare Worker 入口
```

`http.ts`、`server.ts`、`worker.ts`、`env.ts`、`version.ts` 保持 Node-free，由 ESLint
`no-restricted-imports` 约束；Node 适配器 `node.ts` 仅在 HTTP 模式下动态加载。

## License

[MIT](./LICENSE)
