export type ToolArg = { name: string; description: string; values?: { value: string; label: string; hint?: string }[] }
export type ToolInfo = { name: string; description: string; arg?: ToolArg }
export type Tip = { id: string; text: string; action?: { tool: string; arg?: string }; only?: string[]; not?: string[] }

export type Suggestion = { label: string; tool: string; arg?: string; not?: string[] }

export const QUIET = 'quiet'
export const NONE = 'none'
export const HELP = 'help'
export const ANY = '*'
export const MAX_OPTIONS = 24
export const MAX_ARGS = 8

export function toolCriteria(tools: ToolInfo[]): Record<string, string> {
  return {
    ...Object.fromEntries(tools.map((t) => [t.name, t.description])),
    [HELP]: 'The request asks what the assistant can do, or for help or ideas',
    [NONE]: 'None of these: the request asks for something none of these actions do',
  }
}

const words = (s: string) => s.toLowerCase().split(/[^\p{L}\p{N}]+/u).filter((w) => w.length > 1)
const stem = (w: string) => (w.length > 4 ? w.replace(/(ings?|ed|s)$/, '') : w)

export function argCriteria(arg: ToolArg | undefined, request: string): Record<string, string> {
  if (!arg?.values?.length) return {}
  const asked = new Set(words(request).map(stem))
  const score = (v: { label: string; hint?: string }) => words(`${v.label} ${v.hint ?? ''}`).filter((w) => asked.has(stem(w))).length
  const values = arg.values.length > MAX_OPTIONS ? [...arg.values].sort((a, b) => score(b) - score(a)).slice(0, MAX_OPTIONS) : arg.values
  return Object.fromEntries(values.map((v) => [v.value, v.hint ? `${v.label} (${v.hint})` : v.label]))
}

export function argQuestions(tools: ToolInfo[], request: string): Record<string, { action: string; criteria: Record<string, string> }> {
  return Object.fromEntries(tools.flatMap((t) => {
    const criteria = argCriteria(t.arg, request)
    return Object.keys(criteria).length > 1 ? [[t.name, { action: t.description, criteria }] as const] : []
  }).slice(0, MAX_ARGS))
}

const FILLER = new Set(['search', 'find', 'look', 'show', 'me', 'for', 'the', 'a', 'an', 'about', 'on', 'with', 'please', 'can', 'you', 'any', 'all', 'some', 'that', 'mention', 'mentions', 'in',
  'site', 'page'])
export function queryFrom(request: string, action: string, ignore: Iterable<string> = []): string {
  const own = new Set([...words(action), ...ignore])
  return request.split(/\s+/).filter((w) => { const k = w.toLowerCase().replace(/[^\p{L}\p{N}]/gu, ''); return k && !FILLER.has(k) && !own.has(k) }).join(' ')
}

export const wantsAny = (request: string) => /\b(random|any|anything|whatever|something|surprise|pick one|your choice)\b/i.test(request)

export function suggestionsFor(all: Suggestion[], tools: Map<string, ToolInfo>, path: string, max = 6): Suggestion[] {
  return all.filter((s) => {
    const t = tools.get(s.tool)
    const values = t?.arg?.values
    const valid = !values || (s.arg === ANY ? values.length > 0 : values.some((v) => v.value === s.arg))
    return t && valid && !s.not?.some((p) => under(path, p))
  }).slice(0, max)
}

export const under = (path: string, p: string) => path === p || path.startsWith(`${p}/`)

export function tipCriteria(tips: Tip[], path: string, dismissed: readonly string[]): Record<string, string> {
  const on = (list: string[]) => list.some((p) => (p === '/' ? path === '/' : under(path, p)))
  return Object.fromEntries(tips.filter((t) => !dismissed.includes(t.id) && (!t.only || on(t.only)) && !(t.not && on(t.not))).map((t) => [t.id, t.text]))
}

export type Answer = { choice: string; probabilities: Record<string, number>; args?: Record<string, Answer> }
export const ranked = (a: Answer, skip: readonly string[] = []): [string, number][] => Object.entries(a.probabilities).filter(([k, p]) => !skip.includes(k) && p >= 0.12).sort((x, y) => y[1] - x[1])
export const unsure = (a: Answer): boolean => { const [first, second] = ranked(a, [NONE]); return !!first && !!second && first[1] < 0.5 && second[1] > first[1] / 2 }

export type JevPick = { action: string; p: number; at: number }
export const actionName = (key: string) => { const s = key.replace(/[_-]+/g, ' ').trim(); return s.charAt(0).toUpperCase() + s.slice(1) }
export function pickOf(answer: { choice: string; probabilities: Record<string, number> }, offered: readonly string[], name = actionName): JevPick | null {
  const { choice } = answer
  const p = answer.probabilities[choice]
  if (choice === QUIET || choice === NONE || choice === HELP || !offered.includes(choice) || p === undefined) return null
  return { action: name(choice), p, at: Date.now() }
}
export const pickReadout = (pick: JevPick, ago: string) => `Jev picked ${pick.action} · p ${pick.p.toFixed(2)} · ${ago}`
