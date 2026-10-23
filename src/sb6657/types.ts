import { z } from 'zod'

/** 后端原始烂梗条目；不同接口字段略有差异，统一按可选字段处理。 */
export interface RawMeme {
  id?: number | null
  barrageId?: string | number | null
  barrage: string
  cnt?: string | number | null
  tags?: string | null
  submitTime?: string | null
  hotDateTime?: string | null
  staleScore?: number | null
  hotScore?: number | null
  voteCnt?: number | null
  likes?: number | null
  trend7d?: number | null
  stage?: string | null
  stageName?: string | null
}

export interface RawPage<T> {
  list?: T[] | null
  total?: number | null
  lastPage?: boolean | null
}

export interface RawTag {
  dictLabel: string
  dictValue: string
  iconUrl?: string | null
}

export interface RawWordCloudItem {
  name: string
  value: string | number
}

export interface RawArenaRank {
  barrageId: string | number
  barrage: string
  totalVotes: number
}

export interface RawArenaMatch {
  id: number
  barrageIdA?: string | number | null
  barrageA: string
  barrageIdB?: string | number | null
  barrageB: string
  voteA?: number | null
  voteB?: number | null
  status?: string | null
  winner?: number | null
  pkDate?: string | null
}

export interface RawArenaCurrent {
  weekStart?: string | null
  weekEnd?: string | null
  todayPkDate?: string | null
  weekRank?: RawArenaRank[] | null
  matches?: RawArenaMatch[] | null
}

export interface RawArenaWeek {
  id: number
  weekStart: string
  weekEnd: string
  barrageId: string | number
  barrage: string
  totalVotes: number
  rankNo?: number | null
  dailyResults?: string | null
  createTime?: string | null
}

export interface RawLifecycleDashboard {
  stages?: { stage: string; cnt: number }[] | null
}

export interface RawDnaSlot {
  type: string
  value: string
  startIndex: number
  endIndex: number
}

export interface RawDnaCenter {
  id: number
  text: string
  normalizedText?: string | null
  fixedParts?: string[] | null
  slots?: RawDnaSlot[] | null
  keywords?: string[] | null
  anchors?: string[] | null
  template?: string | null
  sentenceSkeleton?: string | null
  fingerprint?: string | null
  submitTime?: string | null
}

export interface RawDnaGraph {
  center?: RawDnaCenter | null
  nodes?: RawDnaCenter[] | null
  edges?: unknown[] | null
}

export interface RawMatch {
  id: number
  matchesName: string
  matchesImg?: string | null
  matchesLocation?: string | null
  level?: string | null
  startTime?: string | null
  endTime?: string | null
  barrageNum?: number | null
}

export interface RawImageComment {
  id: number
  douyuID?: string | null
  createdAt?: string | null
  commentname?: string | null
}

export interface RawImage {
  id: number
  url: string
  date?: string | null
  comments?: RawImageComment[] | null
  showComments?: boolean | null
}

export interface RawShieldWord {
  id: number
  shieldWord: string
  submitTime?: string | null
  notWordNum?: number | null
  isWordNum?: number | null
  isShieldWord?: number | boolean | null
}

export interface Top20Item {
  rank: number
  content: string
  award?: string
  awardIcon?: string
}

export interface WarriorsUpdate {
  player?: string
  team?: string
  kill?: { before?: number; added?: number; after?: number }
  death?: { before?: number; added?: number; after?: number }
  maps?: number
}

export interface WarriorsReport {
  match?: { title?: string; date?: string }
  updates?: WarriorsUpdate[]
}

export interface DejaVuPlayer {
  rank?: string
  player?: string
  team?: string
  emoji?: string
  points?: string
}

export interface DejaVuReport {
  issueTitle?: string
  match?: { title?: string; date?: string }
  briefing?: string
  rankings?: {
    top30?: DejaVuPlayer[]
    nonTop30?: unknown[]
    gout?: unknown[]
  }
  teamRatings?: unknown[]
  commentary?: string
}

export interface ArenaDailyResult {
  pkDate?: string
  matchId?: number
  opponent?: string
  voteGot?: number
  opponentVotes?: number
  won?: boolean
}

export type TagLookup = (code: string) => string

export const tagSchema = z.object({
  code: z.string(),
  label: z.string(),
})

export const memeSchema = z.object({
  barrageId: z.string(),
  text: z.string(),
  copyCount: z.number().int().nullable(),
  tags: z.array(tagSchema),
  submitTime: z.string().nullable(),
})

export const pageSchema = z.object({
  page: z.number().int(),
  pageSize: z.number().int(),
  total: z.number().int(),
  hasMore: z.boolean(),
})

/** 所有分页工具的公共入参形状。 */
export const pagingShape = {
  page: z.number().int().min(1).default(1).describe('页码，从 1 开始'),
  pageSize: z.number().int().min(1).max(50).default(10).describe('每页条数，最大 50'),
}

export const memePageSchema = pageSchema.extend({
  items: z.array(memeSchema),
})

export const rankingMemeSchema = memeSchema.extend({
  staleScore: z.number().nullable(),
  hotScore: z.number().nullable(),
  voteCount: z.number().int().nullable(),
})

export const arenaMatchSchema = z.object({
  id: z.number().int(),
  barrageIdA: z.string().nullable(),
  barrageA: z.string(),
  barrageIdB: z.string().nullable(),
  barrageB: z.string(),
  voteA: z.number().int().nullable(),
  voteB: z.number().int().nullable(),
  status: z.string().nullable(),
  pkDate: z.string().nullable(),
})

export const arenaWeekSchema = z.object({
  id: z.number().int(),
  weekStart: z.string(),
  weekEnd: z.string(),
  barrageId: z.string(),
  text: z.string(),
  totalVotes: z.number().int(),
  rankNo: z.number().int().nullable(),
  dailyResults: z.array(
    z.object({
      pkDate: z.string().nullable(),
      matchId: z.number().int().nullable(),
      opponent: z.string().nullable(),
      voteGot: z.number().int().nullable(),
      opponentVotes: z.number().int().nullable(),
      won: z.boolean().nullable(),
    }),
  ),
})

/** 统一把 `id` 与 `barrageId` 两种主键形态归一为字符串。 */
export function readMemeId(raw: RawMeme): string {
  const value = raw.barrageId ?? raw.id
  return value === null || value === undefined ? '' : String(value)
}

export function parseTagCodes(raw: string | null | undefined): string[] {
  if (raw === null || raw === undefined || raw.trim() === '') {
    return []
  }
  return raw
    .split(',')
    .map((code) => code.trim())
    .filter((code) => code !== '')
}

export function normalizeMeme(raw: RawMeme, lookup: TagLookup): z.infer<typeof memeSchema> {
  return {
    barrageId: readMemeId(raw),
    text: raw.barrage,
    copyCount: toInteger(raw.cnt),
    tags: parseTagCodes(raw.tags).map((code) => ({ code, label: lookup(code) })),
    submitTime: raw.submitTime ?? raw.hotDateTime ?? null,
  }
}

export function normalizeRankingMeme(
  raw: RawMeme,
  lookup: TagLookup,
): z.infer<typeof rankingMemeSchema> {
  return {
    ...normalizeMeme(raw, lookup),
    staleScore: toNumber(raw.staleScore),
    hotScore: toNumber(raw.hotScore),
    voteCount: toInteger(raw.voteCnt),
  }
}

export function readPageTotal(raw: RawPage<unknown> | null | undefined): number {
  return typeof raw?.total === 'number' ? raw.total : 0
}

export function readHasMore(
  raw: RawPage<unknown> | null | undefined,
  page: number,
  pageSize: number,
): boolean {
  if (typeof raw?.lastPage === 'boolean') {
    return !raw.lastPage
  }
  return page * pageSize < readPageTotal(raw)
}

export function toNumber(value: number | string | null | undefined): number | null {
  if (value === null || value === undefined || value === '') {
    return null
  }
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

export function toInteger(value: number | string | null | undefined): number | null {
  const parsed = toNumber(value)
  return parsed === null ? null : Math.trunc(parsed)
}
