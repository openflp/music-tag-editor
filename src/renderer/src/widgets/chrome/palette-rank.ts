// Поиск по уже собранной строке. defaultFilter из cmdk на 5000 подписях — десятки миллисекунд на символ.
// Запрос режется на слова один раз, а не заново для каждой из 5000 строк на каждый символ.
function partsOf(queryLower: string): string[] {
  return queryLower.split(/\s+/).filter(Boolean)
}

function scoreParts(hayLower: string, parts: readonly string[]): number {
  let score = 0
  for (const part of parts) {
    const at = hayLower.indexOf(part)
    if (at < 0) return 0
    score += 10_000 - Math.min(9_999, at)
  }
  return score
}

export function scoreHay(hayLower: string, queryLower: string): number {
  if (!queryLower) return 1
  return scoreParts(hayLower, partsOf(queryLower))
}

export function rankBy<T>(rows: readonly T[], query: string, text: (row: T) => string): T[] {
  const q = query.trim().toLowerCase()
  if (!q) return rows as T[]
  const parts = partsOf(q)
  const scored: { row: T; index: number; score: number }[] = []
  for (let index = 0; index < rows.length; index += 1) {
    const row = rows[index]
    const score = scoreParts(text(row), parts)
    if (score > 0) scored.push({ row, index, score })
  }
  scored.sort((left, right) => right.score - left.score || left.index - right.index)
  return scored.map((item) => item.row)
}
