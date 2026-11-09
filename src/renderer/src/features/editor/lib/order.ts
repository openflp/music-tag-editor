export function movePaths(order: string[], moving: string[], insertAt: number): string[] {
  const known = new Set(order)
  const picked = new Set<string>()
  const group: string[] = []
  for (const path of moving) {
    if (!known.has(path) || picked.has(path)) continue
    picked.add(path)
    group.push(path)
  }
  if (!group.length) return order
  const rest = order.filter((path) => !picked.has(path))
  let at = insertAt
  for (const path of group) {
    if (order.indexOf(path) < insertAt) at -= 1
  }
  at = Math.max(0, Math.min(at, rest.length))
  const next = [...rest.slice(0, at), ...group, ...rest.slice(at)]
  return next.every((path, index) => path === order[index]) ? order : next
}
