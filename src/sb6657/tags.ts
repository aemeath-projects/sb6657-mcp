import { apiRequest } from './client.js'
import type { RawTag, TagLookup } from './types.js'

export interface TagInfo {
  code: string
  label: string
  iconUrl?: string
}

const CACHE_TTL_MS = 10 * 60 * 1000

let cache: { value: TagInfo[]; expiresAt: number } | undefined

/**
 * 获取标签字典。字典仅 31 条且极少变化，做 10 分钟进程内缓存，
 * 供搜索时的中文名解析与 Markdown 渲染复用。
 *
 * 拉取失败时不写入缓存，由调用方决定降级策略。
 */
export async function getTags(): Promise<TagInfo[]> {
  if (cache !== undefined && cache.expiresAt > Date.now()) {
    return cache.value
  }

  const raw = await apiRequest<RawTag[]>('/machine/dictList')
  const value = raw.map((item) => ({
    code: item.dictValue,
    label: item.dictLabel,
    ...(item.iconUrl === null || item.iconUrl === undefined ? {} : { iconUrl: item.iconUrl }),
  }))

  cache = { value, expiresAt: Date.now() + CACHE_TTL_MS }
  return value
}

export interface TagContext {
  /** 编码 → 中文名；字典拉取失败时退化为原样返回编码。 */
  lookup: TagLookup
  /** 用户输入（编码或中文名）解析后的编码列表。 */
  codes: string[]
}

/**
 * 一次性完成「字典加载 + 输入解析」，供搜索与渲染复用。
 * 字典不可用时降级为原始编码，不阻断主流程。
 */
export async function loadTagContext(inputs: string[] = []): Promise<TagContext> {
  const normalized = inputs.map((input) => input.trim()).filter((input) => input !== '')

  try {
    const tags = await getTags()
    const codeByLabel = new Map(tags.map((tag) => [tag.label, tag.code]))
    const labelByCode = new Map(tags.map((tag) => [tag.code, tag.label]))

    return {
      lookup: (code) => labelByCode.get(code) ?? code,
      codes: normalized.map((input) => codeByLabel.get(input) ?? input),
    }
  } catch (error) {
    console.warn('[sb6657] 标签字典加载失败，降级为原始编码：', error)
    return {
      lookup: (code) => code,
      codes: normalized,
    }
  }
}
