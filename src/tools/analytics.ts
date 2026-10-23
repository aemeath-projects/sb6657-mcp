import type { McpServer } from '@modelcontextprotocol/server'
import { z } from 'zod'

import { Sb6657ApiError, apiRequest, toQuery } from '../sb6657/client.js'
import { formatMemeList, formatPageSummary, singleLine, truncate } from '../sb6657/format.js'
import { loadTagContext } from '../sb6657/tags.js'
import {
  normalizeMeme,
  normalizeRankingMeme,
  pagingShape,
  readHasMore,
  readPageTotal,
  toInteger,
  toNumber,
  type RawArenaCurrent,
  type RawArenaWeek,
  type RawDnaGraph,
  type RawLifecycleDashboard,
  type RawMeme,
  type RawPage,
  arenaMatchSchema,
  arenaWeekSchema,
  memeSchema,
  rankingMemeSchema,
} from '../sb6657/types.js'

import { ok, run } from './register.js'

const rankingScopeSchema = z.enum(['stale', 'hot', 'arena-current', 'arena-weekly'])

const rankingOutputSchema = z.object({
  scope: rankingScopeSchema,
  page: z.number().int().optional(),
  pageSize: z.number().int().optional(),
  total: z.number().int().optional(),
  hasMore: z.boolean().optional(),
  items: z.array(rankingMemeSchema).optional(),
  arena: z
    .object({
      weekStart: z.string().nullable(),
      weekEnd: z.string().nullable(),
      todayPkDate: z.string().nullable(),
      weekRank: z.array(
        z.object({
          barrageId: z.string(),
          text: z.string(),
          totalVotes: z.number().int(),
        }),
      ),
      matches: z.array(arenaMatchSchema),
    })
    .optional(),
  weeks: z.array(arenaWeekSchema).optional(),
})

const LIFECYCLE_STAGES = ['BIRTH', 'BOOM', 'STALE', 'DEAD'] as const

const STAGE_LABELS: Partial<Record<string, string>> = {
  BIRTH: '新生期',
  BOOM: '爆发期',
  STALE: '沉寂期',
  DEAD: '已入土',
}

const lifecycleStageSchema = z.enum(LIFECYCLE_STAGES)

const lifecycleOutputSchema = z.object({
  stage: lifecycleStageSchema.nullable(),
  stages: z
    .array(
      z.object({
        stage: z.string(),
        stageName: z.string(),
        count: z.number().int(),
      }),
    )
    .optional(),
  page: z.number().int().optional(),
  pageSize: z.number().int().optional(),
  total: z.number().int().optional(),
  hasMore: z.boolean().optional(),
  items: z
    .array(
      memeSchema.extend({
        stage: z.string().nullable(),
        stageName: z.string().nullable(),
        trend7d: z.number().nullable(),
      }),
    )
    .optional(),
})

const dnaCenterSchema = z.object({
  id: z.number().int().nullable(),
  text: z.string(),
  normalizedText: z.string().optional(),
  template: z.string().optional(),
  sentenceSkeleton: z.string().optional(),
  fingerprint: z.string().optional(),
  fixedParts: z.array(z.string()).optional(),
  keywords: z.array(z.string()).optional(),
  slots: z
    .array(
      z.object({
        type: z.string(),
        value: z.string(),
        startIndex: z.number().int(),
        endIndex: z.number().int(),
      }),
    )
    .optional(),
})

const dnaOutputSchema = z.object({
  mode: z.enum(['v6', 'evolution', 'legacy']),
  center: dnaCenterSchema,
  nodes: z.array(z.object({ id: z.number().int().nullable(), text: z.string() })),
  edgeCount: z.number().int(),
})

export function registerAnalyticsTools(server: McpServer): void {
  server.registerTool(
    'get_meme_rankings',
    {
      title: '热度与 PK 排行',
      description:
        '获取烂梗热度榜单：烂度总榜（stale）、实时热度榜（hot）、今日 PK 与本周排行' +
        '（arena-current）、历史周榜或指定周详情（arena-weekly）。',
      inputSchema: z.object({
        scope: rankingScopeSchema.default('stale').describe('榜单类型'),
        weekStart: z
          .string()
          .regex(/^\d{4}-\d{2}-\d{2}$/)
          .optional()
          .describe('仅 arena-weekly 使用：指定周起始日期 YYYY-MM-DD，不传则返回历史周榜'),
        ...pagingShape,
      }),
      outputSchema: rankingOutputSchema,
      annotations: { readOnlyHint: true },
    },
    async (args) =>
      run(async () => {
        const { lookup } = await loadTagContext()

        if (args.scope === 'stale' || args.scope === 'hot') {
          const path = args.scope === 'stale' ? '/machine/stale/rank' : '/machine/stale/hot'
          const raw = await apiRequest<RawPage<RawMeme>>(
            `${path}${toQuery({ pageNum: args.page, pageSize: args.pageSize })}`,
          )
          const items = (raw.list ?? []).map((item) => normalizeRankingMeme(item, lookup))
          const page = {
            page: args.page,
            pageSize: args.pageSize,
            total: readPageTotal(raw),
            hasMore: readHasMore(raw, args.page, args.pageSize),
          }
          const title = args.scope === 'stale' ? '烂度总榜' : '实时热度榜'

          return ok({ scope: args.scope, ...page, items }, formatRankingList(title, items, page))
        }

        if (args.scope === 'arena-current') {
          const raw = await apiRequest<RawArenaCurrent>('/machine/arena/current')
          const weekRank = (raw.weekRank ?? []).map((item) => ({
            barrageId: String(item.barrageId),
            text: item.barrage,
            totalVotes: toInteger(item.totalVotes) ?? 0,
          }))
          const matches = (raw.matches ?? []).map((item) => ({
            id: item.id,
            barrageIdA:
              item.barrageIdA === undefined || item.barrageIdA === null
                ? null
                : String(item.barrageIdA),
            barrageA: item.barrageA,
            barrageIdB:
              item.barrageIdB === undefined || item.barrageIdB === null
                ? null
                : String(item.barrageIdB),
            barrageB: item.barrageB,
            voteA: toInteger(item.voteA),
            voteB: toInteger(item.voteB),
            status: item.status ?? null,
            pkDate: item.pkDate ?? null,
          }))
          const arena = {
            weekStart: raw.weekStart ?? null,
            weekEnd: raw.weekEnd ?? null,
            todayPkDate: raw.todayPkDate ?? null,
            weekRank,
            matches,
          }

          return ok({ scope: args.scope, arena }, formatArenaCurrent(arena))
        }

        const path =
          args.weekStart === undefined
            ? '/machine/arena/weekly'
            : `/machine/arena/weekly/${args.weekStart}`
        const raw = await apiRequest<RawArenaWeek[]>(path)
        const weeks = raw.map((item) => ({
          id: item.id,
          weekStart: item.weekStart,
          weekEnd: item.weekEnd,
          barrageId: String(item.barrageId),
          text: item.barrage,
          totalVotes: toInteger(item.totalVotes) ?? 0,
          rankNo: toInteger(item.rankNo),
          dailyResults: parseDailyResults(item.dailyResults),
        }))

        return ok(
          { scope: args.scope, weeks },
          formatArenaWeeks(weeks, args.weekStart !== undefined),
        )
      }),
  )

  server.registerTool(
    'get_meme_lifecycle',
    {
      title: '梗生命周期',
      description:
        '查看烂梗生命周期：不传 stage 返回各阶段数量看板；传 stage 返回该阶段的分页烂梗列表。',
      inputSchema: z.object({
        stage: lifecycleStageSchema
          .optional()
          .describe('BIRTH=新生期；BOOM=爆发期；STALE=沉寂期；DEAD=已入土'),
        ...pagingShape,
      }),
      outputSchema: lifecycleOutputSchema,
      annotations: { readOnlyHint: true },
    },
    async (args) =>
      run(async () => {
        const { lookup } = await loadTagContext()

        if (args.stage === undefined) {
          const raw = await apiRequest<RawLifecycleDashboard>('/machine/lifecycle/dashboard')
          const stages = (raw.stages ?? []).map((item) => ({
            stage: item.stage,
            stageName: STAGE_LABELS[item.stage] ?? item.stage,
            count: toInteger(item.cnt) ?? 0,
          }))
          const lines = ['# 梗生命周期看板', '']
          for (const item of stages) {
            lines.push(`- ${item.stageName}（${item.stage}）：${String(item.count)} 条`)
          }

          return ok({ stage: null, stages }, lines.join('\n'))
        }

        const raw = await apiRequest<RawPage<RawMeme>>(
          `/machine/lifecycle/stage/${args.stage}${toQuery({
            pageNum: args.page,
            pageSize: args.pageSize,
          })}`,
        )
        const items = (raw.list ?? []).map((item) => ({
          ...normalizeMeme(item, lookup),
          stage: item.stage ?? null,
          stageName: item.stageName ?? STAGE_LABELS[item.stage ?? ''] ?? null,
          trend7d: toNumber(item.trend7d),
        }))
        const page = {
          page: args.page,
          pageSize: args.pageSize,
          total: readPageTotal(raw),
          hasMore: readHasMore(raw, args.page, args.pageSize),
        }
        const stageName = STAGE_LABELS[args.stage] ?? args.stage

        return ok(
          { stage: args.stage, ...page, items },
          formatMemeList(items, { title: `${stageName}烂梗（${args.stage}）`, page }),
        )
      }),
  )

  server.registerTool(
    'get_meme_dna',
    {
      title: '梗 DNA 与衍生关系',
      description:
        '获取烂梗的结构化 DNA：关键词、固定片段、槽位、模板、指纹，以及关联节点与边。' +
        'mode 可选 v6（默认）、evolution（进化图谱）、legacy（旧版）。',
      inputSchema: z.object({
        memeId: z.string().regex(/^\d+$/).describe('烂梗 ID（纯数字）'),
        mode: z.enum(['v6', 'evolution', 'legacy']).default('v6').describe('DNA 接口版本'),
      }),
      outputSchema: dnaOutputSchema,
      annotations: { readOnlyHint: true },
    },
    async (args) =>
      run(async () => {
        const path =
          args.mode === 'legacy'
            ? `/machine/dna/${args.memeId}`
            : args.mode === 'evolution'
              ? `/machine/dna/v6/${args.memeId}/evolution`
              : `/machine/dna/v6/${args.memeId}`
        const raw = await apiRequest<RawDnaGraph | null>(path)
        const center = raw?.center ?? null
        if (center === null) {
          throw new Sb6657ApiError(0, `未找到烂梗 ${args.memeId} 的 DNA 数据`)
        }

        /** 上游缺失的可选字段直接省略，避免 structuredContent 堆积 null 与空数组。 */
        const normalizedCenter: z.infer<typeof dnaCenterSchema> = {
          id: toInteger(center.id),
          text: center.text,
          ...(center.normalizedText == null ? {} : { normalizedText: center.normalizedText }),
          ...(center.template == null ? {} : { template: center.template }),
          ...(center.sentenceSkeleton == null ? {} : { sentenceSkeleton: center.sentenceSkeleton }),
          ...(center.fingerprint == null ? {} : { fingerprint: center.fingerprint }),
          ...(center.fixedParts?.length ? { fixedParts: center.fixedParts } : {}),
          ...(center.keywords?.length ? { keywords: center.keywords } : {}),
          ...(center.slots?.length
            ? {
                slots: center.slots.map((slot) => ({
                  type: slot.type,
                  value: slot.value,
                  startIndex: slot.startIndex,
                  endIndex: slot.endIndex,
                })),
              }
            : {}),
        }
        const nodes = (raw?.nodes ?? []).map((node) => ({
          id: toInteger(node.id),
          text: node.text,
        }))

        return ok(
          {
            mode: args.mode,
            center: normalizedCenter,
            nodes,
            edgeCount: raw?.edges?.length ?? 0,
          },
          formatDna(args.mode, normalizedCenter, nodes, raw?.edges?.length ?? 0),
        )
      }),
  )
}

function formatRankingList(
  title: string,
  items: ReturnType<typeof normalizeRankingMeme>[],
  page: { page: number; pageSize: number; total: number; hasMore: boolean },
): string {
  const lines = [`# ${title}`, '', formatPageSummary(page), '']

  if (items.length === 0) {
    lines.push('暂无数据。')
    return lines.join('\n')
  }

  items.forEach((item, index) => {
    const parts = [`\`#${item.barrageId}\``]
    if (item.tags.length > 0) {
      parts.push(item.tags.map((tag) => tag.label).join(' / '))
    }
    if (item.copyCount !== null) {
      parts.push(`复制 ${String(item.copyCount)} 次`)
    }
    if (item.staleScore !== null) {
      parts.push(`烂度 ${item.staleScore.toFixed(2)}`)
    }
    if (item.hotScore !== null) {
      parts.push(`热度 ${item.hotScore.toFixed(2)}`)
    }
    if (item.voteCount !== null) {
      parts.push(`${String(item.voteCount)} 票`)
    }

    lines.push(`${String(index + 1)}. ${parts.join(' · ')}`)
    lines.push(`   ${singleLine(truncate(item.text))}`)
  })

  return lines.join('\n')
}

function formatArenaCurrent(arena: {
  weekStart: string | null
  weekEnd: string | null
  todayPkDate: string | null
  weekRank: { barrageId: string; text: string; totalVotes: number }[]
  matches: {
    id: number
    barrageIdA: string | null
    barrageA: string
    barrageIdB: string | null
    barrageB: string
    voteA: number | null
    voteB: number | null
    status: string | null
    pkDate: string | null
  }[]
}): string {
  const lines = ['# 烂梗擂台', '']
  lines.push(
    `本周：${arena.weekStart ?? '未知'} ~ ${arena.weekEnd ?? '未知'} · 今日 PK：${arena.todayPkDate ?? '无'}`,
    '',
    '## 本周排行',
    '',
  )

  if (arena.weekRank.length === 0) {
    lines.push('暂无排行数据。')
  } else {
    arena.weekRank.forEach((item, index) => {
      lines.push(`${String(index + 1)}. \`#${item.barrageId}\` · ${String(item.totalVotes)} 票`)
      lines.push(`   ${singleLine(truncate(item.text))}`)
    })
  }

  lines.push('', '## 今日 PK', '')
  if (arena.matches.length === 0) {
    lines.push('暂无进行中的 PK。')
  } else {
    arena.matches.forEach((item, index) => {
      lines.push(
        `${String(index + 1)}. \`#${item.barrageIdA ?? '?'}\` vs \`#${item.barrageIdB ?? '?'}\` · ` +
          `${String(item.voteA ?? 0)} : ${String(item.voteB ?? 0)} · ${item.status ?? '未知状态'}`,
      )
      lines.push(`   A：${singleLine(truncate(item.barrageA))}`)
      lines.push(`   B：${singleLine(truncate(item.barrageB))}`)
    })
  }

  return lines.join('\n')
}

function formatArenaWeeks(
  weeks: {
    id: number
    weekStart: string
    weekEnd: string
    barrageId: string
    text: string
    totalVotes: number
    rankNo: number | null
    dailyResults: {
      pkDate: string | null
      matchId: number | null
      opponent: string | null
      voteGot: number | null
      opponentVotes: number | null
      won: boolean | null
    }[]
  }[],
  isDetail: boolean,
): string {
  const lines = [isDetail ? '# 指定周 PK 排行' : '# 历史周 PK 排行', '']

  if (weeks.length === 0) {
    lines.push('暂无数据。')
    return lines.join('\n')
  }

  weeks.forEach((week, index) => {
    const rank = week.rankNo === null ? `${String(index + 1)}.` : `第 ${String(week.rankNo)} 名 ·`
    lines.push(
      `${rank} \`#${week.barrageId}\` · ${String(week.totalVotes)} 票 · ` +
        `${week.weekStart} ~ ${week.weekEnd}`,
    )
    lines.push(`   ${singleLine(truncate(week.text))}`)
    for (const result of week.dailyResults) {
      const outcome = result.won === null ? '' : result.won ? ' 胜' : ' 负'
      lines.push(
        `   - ${result.pkDate ?? '未知日期'} vs ${singleLine(truncate(result.opponent ?? '未知对手', 60))}` +
          `：${String(result.voteGot ?? 0)} : ${String(result.opponentVotes ?? 0)}${outcome}`,
      )
    }
  })

  return lines.join('\n')
}

function formatDna(
  mode: 'v6' | 'evolution' | 'legacy',
  center: z.infer<typeof dnaCenterSchema>,
  nodes: { id: number | null; text: string }[],
  edgeCount: number,
): string {
  const lines = [
    `# 梗 DNA · #${String(center.id ?? '?')}（${mode}）`,
    '',
    truncate(center.text),
    '',
  ]

  if (center.normalizedText !== undefined) {
    lines.push(`- 标准化文本：${center.normalizedText}`)
  }
  if (center.template !== undefined) {
    lines.push(`- 模板：${center.template}`)
  }
  if (center.sentenceSkeleton !== undefined) {
    lines.push(`- 句子骨架：${center.sentenceSkeleton}`)
  }
  if (center.fixedParts?.length) {
    lines.push(`- 固定片段：${center.fixedParts.join(' / ')}`)
  }
  if (center.keywords?.length) {
    lines.push(`- 关键词：${center.keywords.join('、')}`)
  }
  if (center.fingerprint !== undefined) {
    lines.push(`- 指纹：${center.fingerprint}`)
  }

  if (center.slots?.length) {
    lines.push('', '## 槽位', '')
    for (const slot of center.slots) {
      lines.push(
        `- ${slot.type}：${slot.value}（${String(slot.startIndex)}-${String(slot.endIndex)}）`,
      )
    }
  }

  lines.push('', `## 关联节点（${String(nodes.length)} 个节点 / ${String(edgeCount)} 条边）`, '')
  if (nodes.length === 0) {
    lines.push('暂无关联节点。')
  } else {
    nodes.forEach((node) => {
      lines.push(`- \`#${String(node.id ?? '?')}\` ${singleLine(truncate(node.text, 100))}`)
    })
  }

  return lines.join('\n')
}

function parseDailyResults(value: string | null | undefined): {
  pkDate: string | null
  matchId: number | null
  opponent: string | null
  voteGot: number | null
  opponentVotes: number | null
  won: boolean | null
}[] {
  if (value === null || value === undefined || value === '') {
    return []
  }

  try {
    const parsed: unknown = JSON.parse(value)
    if (!Array.isArray(parsed)) {
      return []
    }

    return parsed.map((entry) => {
      const item = (typeof entry === 'object' && entry !== null ? entry : {}) as Record<
        string,
        unknown
      >
      return {
        pkDate: typeof item.pkDate === 'string' ? item.pkDate : null,
        matchId:
          typeof item.matchId === 'number' || typeof item.matchId === 'string'
            ? toInteger(item.matchId)
            : null,
        opponent: typeof item.opponent === 'string' ? item.opponent : null,
        voteGot:
          typeof item.voteGot === 'number' || typeof item.voteGot === 'string'
            ? toInteger(item.voteGot)
            : null,
        opponentVotes:
          typeof item.opponentVotes === 'number' || typeof item.opponentVotes === 'string'
            ? toInteger(item.opponentVotes)
            : null,
        won: typeof item.won === 'boolean' ? item.won : null,
      }
    })
  } catch {
    return []
  }
}
