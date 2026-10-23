import type { McpServer } from '@modelcontextprotocol/server'
import { z } from 'zod'

import { Sb6657ApiError, apiRequest, postJson, toQuery } from '../sb6657/client.js'
import { formatMemeHeader, formatMemeList, formatTimestamp, truncate } from '../sb6657/format.js'
import { getTags, loadTagContext } from '../sb6657/tags.js'
import {
  normalizeMeme,
  pagingShape,
  readHasMore,
  readPageTotal,
  toNumber,
  type RawDnaGraph,
  type RawMeme,
  type RawPage,
  type RawWordCloudItem,
  memePageSchema,
  memeSchema,
  tagSchema,
} from '../sb6657/types.js'

import { ok, run } from './register.js'

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/

const hotScopeSchema = z.enum(['24h', '7d', 'random', 'wordcloud'])

const hotOutputSchema = z.object({
  scope: hotScopeSchema,
  items: z.array(memeSchema).optional(),
  meme: memeSchema.optional(),
  keywords: z.array(z.object({ name: z.string(), value: z.number() })).optional(),
})

const dnaSummarySchema = z.object({
  keywords: z.array(z.string()),
  template: z.string().nullable(),
  sentenceSkeleton: z.string().nullable(),
  fingerprint: z.string().nullable(),
  fixedParts: z.array(z.string()),
  slotCount: z.number().int(),
  nodeCount: z.number().int(),
  edgeCount: z.number().int(),
})

const detailOutputSchema = z.object({
  barrageId: z.string(),
  text: z.string(),
  copyCount: z.number().int().nullable(),
  dna: dnaSummarySchema.nullable(),
})

const tagListOutputSchema = z.object({
  items: z.array(tagSchema.extend({ iconUrl: z.string().optional() })),
})

export function registerMemeTools(server: McpServer): void {
  server.registerTool(
    'search_memes',
    {
      title: '搜索烂梗',
      description:
        '在 sb6657 玩机器烂梗库中搜索或分页浏览烂梗。支持关键词、标签（编码或中文名）、' +
        '日期范围（必须同时提供关键词）以及按复制次数排序。标签编码可先用 list_meme_tags 查询。',
      inputSchema: z.object({
        query: z.string().min(1).optional().describe('搜索关键词；不传则按标签或分页浏览'),
        tags: z
          .array(z.string())
          .optional()
          .describe('标签编码或中文名，可传多个；例如 ["06", "群魔乱舞"]'),
        startDate: z
          .string()
          .regex(DATE_PATTERN)
          .optional()
          .describe('起始日期 YYYY-MM-DD；必须与 endDate、query 同时提供'),
        endDate: z
          .string()
          .regex(DATE_PATTERN)
          .optional()
          .describe('结束日期 YYYY-MM-DD；必须与 startDate、query 同时提供'),
        sort: z
          .enum(['default', 'copies'])
          .default('default')
          .describe('default=默认排序；copies=按复制次数降序'),
        ...pagingShape,
      }),
      outputSchema: memePageSchema,
      annotations: { readOnlyHint: true },
    },
    async (args) =>
      run(async () => {
        const hasStart = args.startDate !== undefined
        const hasEnd = args.endDate !== undefined

        if (hasStart !== hasEnd) {
          throw new Sb6657ApiError(0, 'startDate 与 endDate 必须同时提供')
        }
        if (hasStart && args.query === undefined) {
          throw new Sb6657ApiError(0, '日期筛选必须同时提供关键词 query（后端限制）')
        }
        if (args.startDate !== undefined && args.endDate !== undefined) {
          if (args.startDate > args.endDate) {
            throw new Sb6657ApiError(0, 'startDate 不能晚于 endDate')
          }
        }

        const { lookup, codes } = await loadTagContext(args.tags ?? [])
        const tagParam = codes.join(',')

        let raw: RawPage<RawMeme> | null
        if (args.query !== undefined) {
          raw = await postJson<RawPage<RawMeme> | null>('/machine/pageSearch', {
            barrage: args.query,
            ...(codes.length > 0 ? { tags: tagParam } : {}),
            ...(args.startDate !== undefined && args.endDate !== undefined
              ? { submitTime: [args.startDate, args.endDate] }
              : {}),
            ...(args.sort === 'copies' ? { sort: 1 } : {}),
            pageNum: args.page,
            pageSize: args.pageSize,
          })
        } else {
          const path = args.sort === 'copies' ? '/machine/sortAllBarrage' : '/machine/Page'
          raw = await apiRequest<RawPage<RawMeme> | null>(
            `${path}${toQuery({
              pageNum: args.page,
              pageSize: args.pageSize,
              tags: tagParam,
            })}`,
          )
        }

        const items = (raw?.list ?? []).map((item) => normalizeMeme(item, lookup))
        const page = {
          page: args.page,
          pageSize: args.pageSize,
          total: readPageTotal(raw),
          hasMore: readHasMore(raw, args.page, args.pageSize),
        }

        const tagLabels = (args.tags ?? []).join(' / ')
        const titleParts = [
          args.query === undefined ? '烂梗列表' : `烂梗搜索：${truncate(args.query, 40)}`,
        ]
        if (tagLabels !== '') {
          titleParts.push(`标签：${tagLabels}`)
        }

        return ok(
          { ...page, items },
          formatMemeList(items, { title: titleParts.join(' · '), page }),
        )
      }),
  )

  server.registerTool(
    'get_hot_memes',
    {
      title: '热点发现',
      description: '获取当前热门烂梗：24 小时热榜、7 天热榜、随机一条，或首页关键词词云。',
      inputSchema: z.object({
        scope: hotScopeSchema
          .default('24h')
          .describe('24h=24 小时热榜；7d=7 天热榜；random=随机一条；wordcloud=关键词词云'),
      }),
      outputSchema: hotOutputSchema,
      annotations: { readOnlyHint: true },
    },
    async (args) =>
      run(async () => {
        const { lookup } = await loadTagContext()

        if (args.scope === 'wordcloud') {
          const raw = await apiRequest<RawWordCloudItem[]>('/machine/WordCloud')
          const keywords = raw
            .map((item) => ({ name: item.name, value: toNumber(item.value) }))
            .filter((item): item is { name: string; value: number } => item.value !== null)

          const lines = [`# 首页词云`, '', `共 ${String(keywords.length)} 个关键词`, '']
          keywords.forEach((item, index) => {
            lines.push(`${String(index + 1)}. ${item.name}（${String(item.value)}）`)
          })

          return ok({ scope: args.scope, keywords }, lines.join('\n'))
        }

        if (args.scope === 'random') {
          const raw = await apiRequest<RawMeme | null>('/machine/getRandOne')
          if (raw === null) {
            throw new Sb6657ApiError(0, '接口未返回随机烂梗')
          }
          const meme = normalizeMeme(raw, lookup)
          const markdown = ['# 随机烂梗', '', formatMemeHeader(meme), '', truncate(meme.text)].join(
            '\n',
          )
          return ok({ scope: args.scope, meme }, markdown)
        }

        const path = args.scope === '24h' ? '/machine/hotBarrageOf24H' : '/machine/hotBarrageOf7Day'
        const raw = await apiRequest<RawMeme[]>(path)
        const items = raw.map((item) => normalizeMeme(item, lookup))
        const title = args.scope === '24h' ? '24 小时热门烂梗' : '7 天热门烂梗'

        return ok({ scope: args.scope, items }, formatMemeList(items, { title }))
      }),
  )

  server.registerTool(
    'get_meme_detail',
    {
      title: '烂梗详情',
      description: '按烂梗 ID 获取原文与复制次数，可选返回梗 DNA 分析（关键词、模板、指纹）。',
      inputSchema: z.object({
        barrageId: z
          .string()
          .regex(/^\d+$/)
          .describe('烂梗 ID（纯数字），可从搜索结果或热门榜获得'),
        includeDna: z.boolean().default(true).describe('是否同时获取梗 DNA 分析'),
      }),
      outputSchema: detailOutputSchema,
      annotations: { readOnlyHint: true },
    },
    async (args) =>
      run(async () => {
        const info = await apiRequest<RawMeme | null>(`/machine/getBarrageInfo/${args.barrageId}`)
        if (info === null) {
          throw new Sb6657ApiError(0, `未找到烂梗 ${args.barrageId}`)
        }

        let dna: z.infer<typeof dnaSummarySchema> | null = null
        if (args.includeDna) {
          try {
            const graph = await apiRequest<RawDnaGraph>(`/machine/dna/v6/${args.barrageId}`)
            dna = summarizeDna(graph)
          } catch (error) {
            console.warn(`[sb6657] 获取烂梗 ${args.barrageId} 的 DNA 失败：`, error)
          }
        }

        const copyCount = toNumber(info.cnt)
        const meta: string[] = []
        if (copyCount !== null) {
          meta.push(`复制 ${String(Math.trunc(copyCount))} 次`)
        }
        if (info.submitTime !== null && info.submitTime !== undefined) {
          meta.push(formatTimestamp(info.submitTime))
        }

        const lines = [
          `# 烂梗详情 #${args.barrageId}`,
          '',
          meta.join(' · '),
          '',
          truncate(info.barrage),
        ]

        if (dna !== null) {
          lines.push('', '## 梗 DNA')
          if (dna.keywords.length > 0) {
            lines.push(`- 关键词：${dna.keywords.join('、')}`)
          }
          if (dna.template !== null) {
            lines.push(`- 模板：${dna.template}`)
          }
          if (dna.sentenceSkeleton !== null) {
            lines.push(`- 句子骨架：${dna.sentenceSkeleton}`)
          }
          if (dna.fixedParts.length > 0) {
            lines.push(`- 固定片段：${dna.fixedParts.join(' / ')}`)
          }
          if (dna.fingerprint !== null) {
            lines.push(`- 指纹：${dna.fingerprint.slice(0, 16)}…`)
          }
          lines.push(
            `- 结构：${String(dna.nodeCount)} 个节点 / ${String(dna.edgeCount)} 条边 / ${String(dna.slotCount)} 个槽位`,
          )
        }

        return ok(
          {
            barrageId: args.barrageId,
            text: info.barrage,
            copyCount: copyCount === null ? null : Math.trunc(copyCount),
            dna,
          },
          lines.join('\n'),
        )
      }),
  )

  server.registerTool(
    'list_meme_tags',
    {
      title: '标签字典',
      description: '列出烂梗库的全部标签编码与中文名，用于搜索时指定 tags。',
      inputSchema: z.object({}),
      outputSchema: tagListOutputSchema,
      annotations: { readOnlyHint: true },
    },
    async () =>
      run(async () => {
        const tags = await getTags()
        const lines = [`# 烂梗标签字典（${String(tags.length)} 个）`, '']
        for (const tag of tags) {
          lines.push(`- \`${tag.code}\` ${tag.label}`)
        }

        return ok({ items: tags }, lines.join('\n'))
      }),
  )
}

function summarizeDna(graph: RawDnaGraph): z.infer<typeof dnaSummarySchema> {
  const center = graph.center ?? null

  return {
    keywords: center?.keywords ?? [],
    template: center?.template ?? null,
    sentenceSkeleton: center?.sentenceSkeleton ?? null,
    fingerprint: center?.fingerprint ?? null,
    fixedParts: center?.fixedParts ?? [],
    slotCount: center?.slots?.length ?? 0,
    nodeCount: graph.nodes?.length ?? 0,
    edgeCount: graph.edges?.length ?? 0,
  }
}
