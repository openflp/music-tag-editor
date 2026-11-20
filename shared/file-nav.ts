export const FILE_NAV_LIMIT = 50

export interface FileNav {
  past: string[]
  future: string[]
}

function trim(paths: string[]): string[] {
  return paths.length > FILE_NAV_LIMIT ? paths.slice(paths.length - FILE_NAV_LIMIT) : paths
}

function keep(paths: string[], alive: ReadonlySet<string>, current: string | null): string[] {
  return paths.filter((path) => alive.has(path) && path !== current)
}

export function noteFileVisit(nav: FileNav, previous: string | null, next: string | null, alive: ReadonlySet<string>): FileNav {
  if (!alive.size) return { past: [], future: [] }
  const current = next && alive.has(next) ? next : null
  const from = previous && alive.has(previous) ? previous : null
  if (current === from) return { past: trim(keep(nav.past, alive, current)), future: trim(keep(nav.future, alive, current)) }
  const past = keep(nav.past, alive, current)
  if (from) past.push(from)
  return { past: trim(past), future: [] }
}

export function stepFileNav(
  nav: FileNav,
  direction: -1 | 1,
  current: string | null,
  alive: ReadonlySet<string>
): { nav: FileNav; path: string | null } {
  const past = keep(nav.past, alive, null)
  const future = keep(nav.future, alive, null)
  const stack = direction < 0 ? past : future
  const rest = direction < 0 ? future : past
  const path = stack.at(-1) ?? null
  if (!path) return { nav: { past, future }, path: null }
  const nextStack = stack.slice(0, -1)
  const back = current && alive.has(current) && current !== path ? current : null
  const other = back ? [...rest.filter((item) => item !== back), back] : rest.filter((item) => item !== path)
  return {
    path,
    nav: direction < 0 ? { past: trim(nextStack), future: trim(other) } : { past: trim(other), future: trim(nextStack) }
  }
}
