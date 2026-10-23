import type { z } from 'zod'

import type { memeSchema } from './types.js'

type Meme = z.infer<typeof memeSchema>

interface PageInfo {
  page: number
  pageSize: number
  total: number
  hasMore: boolean
}

const MAX_TEXT_LENGTH = 500

/** 渲染烂梗列表；正文中的换行压成单行标记，避免破坏 Markdown 列表结构。 */
export function formatMemeList(
  items: Meme[],
  options: { title: string; page?: PageInfo; emptyText?: string },
): string {
  const lines = [`# ${options.title}`, '']

  if (items.length === 0) {
    lines.push(options.emptyText ?? '暂无数据。')
    return lines.join('\n')
  }

  if (options.page !== undefined) {
    lines.push(formatPageSummary(options.page), '')
  }

  items.forEach((item, index) => {
    lines.push(`${String(index + 1)}. ${formatMemeHeader(item)}`)
    lines.push(`   ${singleLine(truncate(item.text))}`)
  })

  return lines.join('\n')
}

/** 单条烂梗的标题行：`#id · 标签 · 复制次数 · 时间`。 */
export function formatMemeHeader(item: Meme): string {
  const parts = [`\`#${item.barrageId || '未知'}\``]

  const labels = item.tags.map((tag) => tag.label)
  if (labels.length > 0) {
    parts.push(labels.join(' / '))
  }
  if (item.copyCount !== null) {
    parts.push(`复制 ${String(item.copyCount)} 次`)
  }
  if (item.submitTime !== null) {
    parts.push(formatTimestamp(item.submitTime))
  }

  return parts.join(' · ')
}

export function formatPageSummary(page: PageInfo): string {
  const parts = [
    `共 ${String(page.total)} 条`,
    `第 ${String(page.page)} 页`,
    `每页 ${String(page.pageSize)} 条`,
  ]
  if (page.hasMore) {
    parts.push('还有更多')
  }
  return parts.join(' · ')
}

export function formatTimestamp(value: string): string {
  const normalized = value.replace('T', ' ')
  return normalized.length >= 16 ? normalized.slice(0, 16) : normalized
}

/** 按字符（而非 UTF-16 码元）截断，避免拆坏中文与 emoji。 */
export function truncate(text: string, maxLength = MAX_TEXT_LENGTH): string {
  const chars = Array.from(text)
  return chars.length <= maxLength ? text : `${chars.slice(0, maxLength).join('')}…`
}

/** 把多行文本压成单行，保留换行语义但适配 Markdown 列表。 */
export function singleLine(text: string): string {
  return text.replace(/\s*\r?\n\s*/g, ' ⏎ ').trim()
}
