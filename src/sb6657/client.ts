const API_BASE = 'https://api.hguofichp.cn'
const OSS_BASE = 'https://sb6657oss.wishao.fun'
const TIMEOUT_MS = 15_000

interface ApiEnvelope<T> {
  code: number
  msg?: string | null
  data: T
}

interface RequestOptions {
  method?: 'GET' | 'POST'
  body?: unknown
}

/** sb6657 后端返回的业务错误，或客户端在请求/解析阶段发现的错误。 */
export class Sb6657ApiError extends Error {
  constructor(
    readonly code: number,
    message: string,
  ) {
    super(message)
    this.name = 'Sb6657ApiError'
  }
}

/**
 * 请求 sb6657 公开接口并解包 `{ code, msg, data }`。
 *
 * 后端失败时 HTTP 状态仍为 200，必须检查业务 `code`；`WordCloud` 直接返回裸数组，
 * 因此数组响应原样透传。官方要求第三方调用不得携带 `dpahjdoiaw` 请求头。
 */
export async function apiRequest<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const url = `${API_BASE}${path}`
  const payload = await fetchPayload(url, options)

  if (Array.isArray(payload)) {
    return payload as T
  }

  if (isEnvelope(payload)) {
    if (payload.code !== 200) {
      const detail = cleanMessage(payload.msg ?? '接口返回未知错误')
      console.error(`[sb6657] ${url} 返回 code=${String(payload.code)}：${payload.msg ?? ''}`)
      throw new Sb6657ApiError(payload.code, detail)
    }
    return payload.data as T
  }

  return payload as T
}

/** 提交 JSON 请求体。 */
export function postJson<T>(path: string, body: unknown): Promise<T> {
  return apiRequest<T>(path, { method: 'POST', body })
}

/** 拉取 OSS 上的静态 JSON（无业务包络）。 */
export async function fetchStaticJson<T>(path: string): Promise<T> {
  const url = `${OSS_BASE}${path}`
  return (await fetchPayload(url)) as T
}

/** 把参数对象拼成查询串；空字符串会被保留（部分接口依赖该参数存在）。 */
export function toQuery(params: Record<string, string | number | undefined>): string {
  const search = new URLSearchParams()
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined) {
      search.set(key, String(value))
    }
  }

  const query = search.toString()
  return query === '' ? '' : `?${query}`
}

async function fetchPayload(url: string, options: RequestOptions = {}): Promise<unknown> {
  const headers: Record<string, string> = { Accept: 'application/json' }
  if (options.body !== undefined) {
    headers['Content-Type'] = 'application/json'
  }

  let response: Response
  try {
    response = await fetch(url, {
      method: options.method ?? 'GET',
      headers,
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    })
  } catch (error) {
    throw new Sb6657ApiError(0, describeNetworkError(error))
  }

  if (!response.ok) {
    throw new Sb6657ApiError(response.status, `接口请求失败（HTTP ${String(response.status)}）`)
  }

  try {
    return await response.json()
  } catch {
    throw new Sb6657ApiError(0, '接口返回了无法解析的内容')
  }
}

function isEnvelope(value: unknown): value is ApiEnvelope<unknown> {
  return (
    typeof value === 'object' &&
    value !== null &&
    'code' in value &&
    typeof (value as { code?: unknown }).code === 'number'
  )
}

function describeNetworkError(error: unknown): string {
  if (error instanceof Error && error.name === 'TimeoutError') {
    return `请求超时（${String(TIMEOUT_MS / 1000)} 秒）`
  }
  if (error instanceof Error && error.name === 'AbortError') {
    return '请求已被中断'
  }
  return `网络请求失败：${error instanceof Error ? error.message : String(error)}`
}

const NOT_FOUND_PATTERN = /NullPointerException|Cannot invoke .+ because .+ is null/

/** 后端错误信息可能夹杂 SQL/堆栈，返回给客户端前压成单行并截断。 */
function cleanMessage(message: string): string {
  const singleLine = message.replace(/\s+/g, ' ').trim()

  // 查询不存在的 ID 时后端会抛 Java NPE，翻译成用户可理解的结果。
  if (NOT_FOUND_PATTERN.test(singleLine)) {
    return '未找到对应数据（可能不存在或暂无内容）'
  }

  const chars = Array.from(singleLine)
  return chars.length > 300 ? `${chars.slice(0, 300).join('')}…` : singleLine
}
