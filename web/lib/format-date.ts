function ordinal(n: number): string {
  const s = ['th', 'st', 'nd', 'rd']
  const v = n % 100
  return n + (s[(v - 20) % 10] ?? s[v] ?? s[0])
}

export function formatDate(iso: string): string {
  const d = new Date(iso)
  const day = ordinal(d.getUTCDate())
  const month = d.toLocaleDateString('en-GB', { month: 'long', timeZone: 'UTC' })
  const year = d.getUTCFullYear()
  return `${day} ${month} ${year}`
}
