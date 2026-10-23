import type { McpServer } from '@modelcontextprotocol/server'
import { z } from 'zod'

import { apiRequest, fetchStaticJson, toQuery } from '../sb6657/client.js'
import { formatTimestamp, singleLine, truncate } from '../sb6657/format.js'
import {
  pagingShape,
  readHasMore,
  readPageTotal,
  toInteger,
  type DejaVuReport,
  type RawImage,
  type RawPage,
  type RawShieldWord,
  type Top20Item,
  type WarriorsReport,
} from '../sb6657/types.js'

import { ok, run } from './register.js'

const galleryCommentSchema = z.object({
  user: z.string().nullable(),
  text: z.string(),
  createdAt: z.string().nullable(),
})

const galleryOutputSchema = z.object({
  page: z.number().int(),
  pageSize: z.number().int(),
  total: z.number().int(),
  hasMore: z.boolean(),
  items: z.array(
    z.object({
      id: z.number().int(),
      url: z.string(),
      caption: z.string().nullable(),
      commentCount: z.number().int(),
      comments: z.array(galleryCommentSchema),
    }),
  ),
})

const shieldOutputSchema = z.object({
  mode: z.enum(['dict', 'list']),
  words: z.array(z.string()).optional(),
  page: z.number().int().optional(),
  pageSize: z.number().int().optional(),
  total: z.number().int().optional(),
  hasMore: z.boolean().optional(),
  items: z
    .array(
      z.object({
        id: z.number().int(),
        word: z.string(),
        submitTime: z.string().nullable(),
        notWordNum: z.number().int().nullable(),
        isWordNum: z.number().int().nullable(),
        isShieldWord: z.boolean().nullable(),
      }),
    )
    .optional(),
})

const reportSchema = z.enum([
  'top20-2025',
  'top20-2024',
  'warriors-2026',
  'warriors-2025',
  'dejavu-niko',
])

const staticReportOutputSchema = z.object({
  report: reportSchema,
  title: z.string(),
  data: z.unknown(),
})

const REPORTS = {
  'top20-2025': { path: '/memeTop20_2025.json', title: '2025 年度烂梗 Top20' },
  'top20-2024': { path: '/memeTop20_2024.json', title: '2024 年度烂梗 Top20' },
  'warriors-2026': { path: '/15warriorsDonk_2026.json', title: '布雷德十五勇士战报 2026' },
  'warriors-2025': { path: '/15warriorsDonk_2025.json', title: '布雷德十五勇士战报 2025' },
  'dejavu-niko': { path: '/dejaVuNiko.json', title: '超级逮虾户战报' },
} as const

export function registerMiscTools(server: McpServer): void {
  server.registerTool(
    'get_gallery',
    {
      title: '时光相册',
      description: '分页获取 sb6657 时光相册的图片、说明文字与评论。',
      inputSchema: z.object(pagingShape),
      outputSchema: galleryOutputSchema,
      annotations: { readOnlyHint: true },
    },
    async (args) =>
      run(async () => {
        const raw = await apiRequest<RawPage<RawImage>>(
          `/machine/showImage${toQuery({ pageNum: args.page, pageSize: args.pageSize })}`,
        )
        const items = (raw.list ?? []).map((item) => {
          const comments = (item.comments ?? []).map((comment) => ({
            user: comment.douyuID ?? null,
            text: comment.commentname ?? '',
            createdAt: comment.createdAt ?? null,
          }))

          return {
            id: item.id,
            url: item.url,
            caption: item.date ?? null,
            commentCount: comments.length,
            comments,
          }
        })
        const page = {
          page: args.page,
          pageSize: args.pageSize,
          total: readPageTotal(raw),
          hasMore: readHasMore(raw, args.page, args.pageSize),
        }

        return ok({ ...page, items }, formatGallery(items, page))
      }),
  )

  server.registerTool(
    'get_shield_words',
    {
      title: '屏蔽词',
      description: '获取直播间屏蔽词字典，或分页浏览屏蔽词及其命中/误判统计。',
      inputSchema: z.object({
        mode: z.enum(['dict', 'list']).default('dict').describe('dict=屏蔽词字典；list=分页列表'),
        ...pagingShape,
      }),
      outputSchema: shieldOutputSchema,
      annotations: { readOnlyHint: true },
    },
    async (args) =>
      run(async () => {
        if (args.mode === 'dict') {
          const words = await apiRequest<string[]>('/machine/getShieldWordDict')
          const lines = [`# 屏蔽词字典（${String(words.length)} 个）`, '']
          for (const word of words) {
            lines.push(`- ${word}`)
          }

          return ok({ mode: args.mode, words }, lines.join('\n'))
        }

        const raw = await apiRequest<RawPage<RawShieldWord>>(
          `/machine/getShieldWordList${toQuery({
            pageNum: args.page,
            pageSize: args.pageSize,
          })}`,
        )
        const items = (raw.list ?? []).map((item) => ({
          id: item.id,
          word: item.shieldWord,
          submitTime: item.submitTime ?? null,
          notWordNum: toInteger(item.notWordNum),
          isWordNum: toInteger(item.isWordNum),
          isShieldWord:
            typeof item.isShieldWord === 'boolean'
              ? item.isShieldWord
              : item.isShieldWord === null || item.isShieldWord === undefined
                ? null
                : item.isShieldWord === 1,
        }))
        const page = {
          page: args.page,
          pageSize: args.pageSize,
          total: readPageTotal(raw),
          hasMore: readHasMore(raw, args.page, args.pageSize),
        }

        return ok({ mode: args.mode, ...page, items }, formatShieldList(items, page))
      }),
  )

  server.registerTool(
    'get_static_report',
    {
      title: '静态战报',
      description:
        '获取 sb6657 OSS 上的静态战报：年度烂梗 Top20（2024/2025）、布雷德十五勇士战报、' +
        '超级逮虾户战报。这些数据由静态 JSON 提供，不经过主 API。',
      inputSchema: z.object({
        report: reportSchema.describe('要获取的战报'),
      }),
      outputSchema: staticReportOutputSchema,
      annotations: { readOnlyHint: true },
    },
    async (args) =>
      run(async () => {
        const config = REPORTS[args.report]
        const data = await fetchStaticJson<unknown>(config.path)

        return ok(
          { report: args.report, title: config.title, data },
          formatReport(args.report, config.title, data),
        )
      }),
  )
}

function formatGallery(
  items: {
    id: number
    url: string
    caption: string | null
    commentCount: number
    comments: { user: string | null; text: string; createdAt: string | null }[]
  }[],
  page: { page: number; pageSize: number; total: number; hasMore: boolean },
): string {
  const lines = [
    '# 时光相册',
    '',
    `共 ${String(page.total)} 条 · 第 ${String(page.page)} 页 · 每页 ${String(page.pageSize)} 条` +
      (page.hasMore ? ' · 还有更多' : ''),
    '',
  ]

  if (items.length === 0) {
    lines.push('暂无图片。')
    return lines.join('\n')
  }

  items.forEach((item, index) => {
    lines.push(`${String(index + 1)}. ${item.caption ?? '（无说明）'} · ${item.url}`)
    for (const comment of item.comments) {
      lines.push(
        `   - ${comment.user ?? '匿名'}：${singleLine(truncate(comment.text, 100))}` +
          (comment.createdAt === null ? '' : `（${formatTimestamp(comment.createdAt)}）`),
      )
    }
  })

  return lines.join('\n')
}

function formatShieldList(
  items: {
    id: number
    word: string
    submitTime: string | null
    notWordNum: number | null
    isWordNum: number | null
    isShieldWord: boolean | null
  }[],
  page: { page: number; pageSize: number; total: number; hasMore: boolean },
): string {
  const lines = [
    '# 屏蔽词列表',
    '',
    `共 ${String(page.total)} 条 · 第 ${String(page.page)} 页 · 每页 ${String(page.pageSize)} 条` +
      (page.hasMore ? ' · 还有更多' : ''),
    '',
  ]

  if (items.length === 0) {
    lines.push('暂无屏蔽词。')
    return lines.join('\n')
  }

  items.forEach((item, index) => {
    const stats: string[] = []
    if (item.notWordNum !== null) {
      stats.push(`非屏蔽命中 ${String(item.notWordNum)}`)
    }
    if (item.isWordNum !== null) {
      stats.push(`屏蔽命中 ${String(item.isWordNum)}`)
    }
    if (item.submitTime !== null) {
      stats.push(`提交于 ${formatTimestamp(item.submitTime)}`)
    }

    lines.push(
      `${String(index + 1)}. ${item.word}` + (stats.length === 0 ? '' : ` · ${stats.join(' · ')}`),
    )
  })

  return lines.join('\n')
}

function formatReport(report: string, title: string, data: unknown): string {
  if (report.startsWith('top20-')) {
    return formatTop20(title, data)
  }
  if (report.startsWith('warriors-')) {
    return formatWarriors(title, data)
  }
  return formatDejaVu(title, data)
}

function formatTop20(title: string, data: unknown): string {
  const lines = [`# ${title}`, '']

  if (!Array.isArray(data)) {
    lines.push('数据格式异常。')
    return lines.join('\n')
  }

  const items = data as Top20Item[]
  lines.push(`共 ${String(items.length)} 条`, '')
  for (const item of items) {
    const award = item.award === undefined ? '' : ` · ${item.awardIcon ?? ''}${item.award}`
    lines.push(`${String(item.rank)}. ${singleLine(item.content)}${award}`)
  }

  return lines.join('\n')
}

function formatWarriors(title: string, data: unknown): string {
  const report = (typeof data === 'object' && data !== null ? data : {}) as WarriorsReport
  const lines = [`# ${title}`, '']

  if (report.match !== undefined) {
    lines.push(`比赛：${report.match.title ?? '未知'} · ${report.match.date ?? '未知日期'}`, '')
  }

  const updates = report.updates ?? []
  if (updates.length === 0) {
    lines.push('暂无选手数据。')
    return lines.join('\n')
  }

  lines.push('| 选手 | 队伍 | 击杀 | 死亡 | 地图 |', '| --- | --- | --- | --- | --- |')
  for (const update of updates.slice(0, 40)) {
    lines.push(
      `| ${update.player ?? '?'} | ${update.team ?? '?'} | ${String(update.kill?.after ?? 0)} | ` +
        `${String(update.death?.after ?? 0)} | ${String(update.maps ?? 0)} |`,
    )
  }
  if (updates.length > 40) {
    lines.push('', `（仅展示前 40 名，完整数据见 structuredContent）`)
  }

  return lines.join('\n')
}

function formatDejaVu(title: string, data: unknown): string {
  const report = (typeof data === 'object' && data !== null ? data : {}) as DejaVuReport
  const lines = [`# ${report.issueTitle ?? title}`, '']

  if (report.match !== undefined) {
    lines.push(`比赛：${report.match.title ?? '未知'} · ${report.match.date ?? '未知日期'}`, '')
  }
  if (report.briefing !== undefined) {
    lines.push(report.briefing, '')
  }

  const top30 = report.rankings?.top30 ?? []
  if (top30.length > 0) {
    lines.push('## Top 30', '')
    for (const player of top30) {
      lines.push(
        `${player.rank ?? '-'}. ${player.player ?? '?'}（${player.team ?? '?'}）` +
          ` ${player.emoji ?? ''} ${player.points ?? ''}`,
      )
    }
    lines.push('')
  }

  if (report.commentary !== undefined) {
    lines.push('## 评述', '', report.commentary)
  }

  return lines.join('\n')
}
