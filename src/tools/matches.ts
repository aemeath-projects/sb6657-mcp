import type { McpServer } from '@modelcontextprotocol/server'
import { z } from 'zod'

import { Sb6657ApiError, apiRequest, toQuery } from '../sb6657/client.js'
import { formatMemeList } from '../sb6657/format.js'
import { loadTagContext } from '../sb6657/tags.js'
import {
  normalizeMeme,
  pagingShape,
  readHasMore,
  readPageTotal,
  toInteger,
  type RawMatch,
  type RawMeme,
  type RawPage,
  memeSchema,
} from '../sb6657/types.js'

import { ok, run } from './register.js'

const matchScopeSchema = z.enum(['in-progress', 'list', 'prediction', 'teams', 'memes'])

const matchInfoSchema = z.object({
  id: z.number().int(),
  name: z.string(),
  imageUrl: z.string().nullable(),
  location: z.string().nullable(),
  level: z.string().nullable(),
  startTime: z.string().nullable(),
  endTime: z.string().nullable(),
  barrageNum: z.number().int().nullable(),
})

const matchOutputSchema = z.object({
  scope: matchScopeSchema,
  page: z.number().int().optional(),
  pageSize: z.number().int().optional(),
  total: z.number().int().optional(),
  hasMore: z.boolean().optional(),
  matches: z.array(matchInfoSchema).optional(),
  items: z.array(memeSchema).optional(),
  teams: z.array(z.unknown()).optional(),
  inProgress: z.unknown().optional(),
  prediction: z.unknown().optional(),
})

export function registerMatchTools(server: McpServer): void {
  server.registerTool(
    'get_matches',
    {
      title: '赛事与赛事烂梗',
      description:
        '查询赛事数据：进行中的赛事、赛事分页列表、赛事预测阶段、赛事队伍池、某赛事下的烂梗。' +
        'teams 需要 matchId 与 phase；memes 需要 matchId。非赛事期可能返回空数据。',
      inputSchema: z.object({
        scope: matchScopeSchema
          .default('in-progress')
          .describe(
            'in-progress=进行中赛事；list=赛事分页；prediction=赛事预测阶段；teams=队伍池；memes=赛事烂梗',
          ),
        matchId: z.number().int().positive().optional().describe('赛事 ID，teams/memes 必填'),
        phase: z.string().min(1).optional().describe('队伍池阶段，teams 必填'),
        ...pagingShape,
      }),
      outputSchema: matchOutputSchema,
      annotations: { readOnlyHint: true },
    },
    async (args) =>
      run(async () => {
        if (args.scope === 'teams' && (args.matchId === undefined || args.phase === undefined)) {
          throw new Sb6657ApiError(0, 'scope=teams 需要同时提供 matchId 与 phase')
        }
        if (args.scope === 'memes' && args.matchId === undefined) {
          throw new Sb6657ApiError(0, 'scope=memes 需要提供 matchId')
        }

        if (args.scope === 'in-progress') {
          const raw = await apiRequest<unknown>('/machine/InProgressMatch')
          const hasData = raw !== null && raw !== undefined
          const markdown = hasData
            ? `# 进行中的赛事\n\n\`\`\`json\n${JSON.stringify(raw, null, 2)}\n\`\`\``
            : '# 进行中的赛事\n\n当前没有正在进行的赛事。'

          return ok({ scope: args.scope, inProgress: raw ?? null }, markdown)
        }

        if (args.scope === 'prediction') {
          const raw = await apiRequest<unknown>('/machine/matches')
          const hasData = Array.isArray(raw) ? raw.length > 0 : raw !== null
          const markdown = hasData
            ? `# 赛事预测阶段\n\n\`\`\`json\n${JSON.stringify(raw, null, 2)}\n\`\`\``
            : '# 赛事预测阶段\n\n当前没有赛事预测数据。'

          return ok({ scope: args.scope, prediction: raw }, markdown)
        }

        if (args.scope === 'teams') {
          const raw = await apiRequest<unknown[]>(
            `/machine/matches/${String(args.matchId)}/teams${toQuery({ phase: args.phase })}`,
          )
          const lines = [
            `# 赛事 #${String(args.matchId)} 队伍池（${args.phase ?? ''}）`,
            '',
            raw.length === 0 ? '当前没有队伍数据。' : `共 ${String(raw.length)} 支队伍：`,
          ]
          for (const team of raw) {
            lines.push(`- ${describeTeam(team)}`)
          }

          return ok({ scope: args.scope, teams: raw }, lines.join('\n'))
        }

        const { lookup } = await loadTagContext()

        if (args.scope === 'memes') {
          const raw = await apiRequest<RawPage<RawMeme>>(
            `/machine/matchPageList${toQuery({
              matchId: args.matchId,
              pageNum: args.page,
              pageSize: args.pageSize,
            })}`,
          )
          const items = (raw.list ?? []).map((item) => normalizeMeme(item, lookup))
          const page = {
            page: args.page,
            pageSize: args.pageSize,
            total: readPageTotal(raw),
            hasMore: readHasMore(raw, args.page, args.pageSize),
          }

          return ok(
            { scope: args.scope, ...page, items },
            formatMemeList(items, { title: `赛事 #${String(args.matchId)} 烂梗`, page }),
          )
        }

        const raw = await apiRequest<RawPage<RawMatch>>(
          `/machine/getMatchList${toQuery({ pageNum: args.page, pageSize: args.pageSize })}`,
        )
        const matches = (raw.list ?? []).map((item) => ({
          id: item.id,
          name: item.matchesName,
          imageUrl: item.matchesImg ?? null,
          location: item.matchesLocation ?? null,
          level: item.level ?? null,
          startTime: item.startTime ?? null,
          endTime: item.endTime ?? null,
          barrageNum: toInteger(item.barrageNum),
        }))
        const page = {
          page: args.page,
          pageSize: args.pageSize,
          total: readPageTotal(raw),
          hasMore: readHasMore(raw, args.page, args.pageSize),
        }

        return ok({ scope: args.scope, ...page, matches }, formatMatchList(matches, page))
      }),
  )
}

function formatMatchList(
  matches: z.infer<typeof matchInfoSchema>[],
  page: { page: number; pageSize: number; total: number; hasMore: boolean },
): string {
  const lines = [
    '# 赛事列表',
    '',
    `共 ${String(page.total)} 条 · 第 ${String(page.page)} 页 · 每页 ${String(page.pageSize)} 条` +
      (page.hasMore ? ' · 还有更多' : ''),
    '',
  ]

  if (matches.length === 0) {
    lines.push('暂无赛事数据。')
    return lines.join('\n')
  }

  matches.forEach((match, index) => {
    const parts = [`${String(index + 1)}. \`#${String(match.id)}\` ${match.name}`]
    if (match.level !== null) {
      parts.push(`等级 ${match.level}`)
    }
    lines.push(parts.join(' · '))
    const meta = [match.location, match.startTime, match.endTime].filter(
      (value): value is string => value !== null,
    )
    if (meta.length > 0) {
      lines.push(`   ${meta.join(' · ')}`)
    }
  })

  return lines.join('\n')
}

function describeTeam(team: unknown): string {
  if (typeof team === 'object' && team !== null) {
    const record = team as Record<string, unknown>
    for (const key of ['teamName', 'name', 'team']) {
      const value = record[key]
      if (typeof value === 'string' && value !== '') {
        return value
      }
    }
    return JSON.stringify(record)
  }

  return String(team)
}
