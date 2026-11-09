const MAJOR: Record<string, string> = {
  c: '8B',
  'c#': '3B',
  db: '3B',
  d: '10B',
  'd#': '5B',
  eb: '5B',
  e: '12B',
  f: '7B',
  'f#': '2B',
  gb: '2B',
  g: '9B',
  'g#': '4B',
  ab: '4B',
  a: '11B',
  'a#': '6B',
  bb: '6B',
  b: '1B'
}

const MINOR: Record<string, string> = {
  c: '5A',
  'c#': '12A',
  db: '12A',
  d: '7A',
  'd#': '2A',
  eb: '2A',
  e: '9A',
  f: '4A',
  'f#': '11A',
  gb: '11A',
  g: '6A',
  'g#': '1A',
  ab: '1A',
  a: '8A',
  'a#': '3A',
  bb: '3A',
  b: '10A'
}

export function camelotOf(key: string): string {
  const raw = key.trim().replace('♯', '#').replace('♭', 'b')
  if (/^\d{1,2}[ab]$/i.test(raw)) return raw.toUpperCase()
  const minor = /(?:minor|min|m)$/i.test(raw)
  const root = raw
    .replace(/\s*(major|minor|maj|min)$/i, '')
    .replace(/m$/i, '')
    .trim()
    .toLowerCase()
  return (minor ? MINOR : MAJOR)[root] ?? ''
}
