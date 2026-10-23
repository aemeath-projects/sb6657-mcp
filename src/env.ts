/**
 * 解析逗号分隔的列表配置。
 *
 * 空字符串、纯空白与空项会被忽略；没有任何有效项时返回 `undefined`，
 * 以便调用方区分“未配置”与“配置了空列表”（后者会导致校验拒绝所有请求）。
 */
export function parseList(value: string | undefined): string[] | undefined {
  if (value === undefined) {
    return undefined
  }

  const items = value
    .split(',')
    .map((item) => item.trim())
    .filter((item) => item.length > 0)

  return items.length > 0 ? items : undefined
}
