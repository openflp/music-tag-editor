// Высота и окно виртуального списка считаются из числа строк, а не из scrollHeight:
// измеренный DOM во время догрузки прыгает и тянет за собой ползунок.

export function contentSpan(count: number, row: number, tail = 0): number {
  return count * row + tail
}

export function virtualRange(
  scroll: number,
  view: number,
  count: number,
  row: number,
  overscan: number,
  origin = 0
): { start: number; end: number } {
  if (count <= 0 || row <= 0) return { start: 0, end: 0 }
  const start = Math.max(0, Math.floor((scroll - origin) / row) - overscan)
  const end = Math.min(count, Math.max(start, Math.ceil((scroll + view - origin) / row) + overscan))
  return { start, end }
}

export function thumbBox(
  view: number,
  content: number,
  rail: number,
  scroll: number,
  min = 48
): { height: number; y: number; max: number } {
  const max = content - view
  if (max <= 1 || rail <= 0 || content <= 0 || view <= 0) return { height: 0, y: 0, max: Math.max(0, max) }
  const height = Math.max(min, Math.min(rail, (view / content) * rail))
  const y = (Math.max(0, scroll) / max) * Math.max(0, rail - height)
  return { height, y, max }
}
