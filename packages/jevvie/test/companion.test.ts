import { describe, expect, it } from 'vitest'
import { ANY, argCriteria, argQuestions, HELP, MAX_OPTIONS, NONE, queryFrom, ranked, suggestionsFor, tipCriteria, toolCriteria, unsure, wantsAny } from '../src/companion'

describe('Jevvie', () => {
  it('offers every action with help and none, then a long argument list cut to the words asked for', () => {
    expect(Object.keys(toolCriteria([{ name: 'open_page', description: 'Open a page' }]))).toEqual(['open_page', HELP, NONE])
    const values = Array.from({ length: 40 }, (_, i) => ({ value: `v${i}`, label: `colour ${i}` }))
    values.push({ value: 'cat', label: 'cat face' })
    const options = argCriteria({ name: 'shape', description: '', values }, 'paint a cat please')
    expect(Object.keys(options)).toHaveLength(MAX_OPTIONS)
    expect(options.cat).toBe('cat face')
    expect(argCriteria({ name: 'query', description: '' }, 'anything')).toEqual({})
  })
  it('takes free text from the request without filler, the action’s own words or the words to ignore', () => {
    expect(queryFrom('find me posts about chess please', 'Open a page', ['posts'])).toBe('chess')
    expect(queryFrom('find me posts about chess please', 'Open a page')).toBe('posts chess')
    expect(queryFrom('search the blog for chess', 'Search the blog')).toBe('chess')
  })
  it('matches word forms and hints, and asks about each action’s options with the action', () => {
    const values: { value: string; label: string; hint?: string }[] = Array.from({ length: 30 }, (_, i) => ({ value: `p${i}`, label: `Post ${i}` }))
    values.push({ value: 'ai', label: 'Tiny models', hint: 'AI: strange interfaces' })
    expect(argCriteria({ name: 'post', description: '', values }, 'something on interface design').ai).toBe('Tiny models (AI: strange interfaces)')
    const tools = [
      { name: 'open_page', description: 'Open a page', arg: { name: 'page', description: '', values } },
      { name: 'toggle', description: 'On or off', arg: { name: 'state', description: '', values: [{ value: 'on', label: 'on' }] } },
      { name: 'copy_link', description: 'Copy the link' },
    ]
    expect(Object.keys(argQuestions(tools, 'open the post on interfaces'))).toEqual(['open_page'])
  })
  it('ranks the likely options and is unsure only with a close second under half', () => {
    expect(ranked({ choice: 'a', probabilities: { b: 0.3, a: 0.45, c: 0.1 } })).toEqual([['a', 0.45], ['b', 0.3]])
    expect(ranked({ choice: 'a', probabilities: { a: 0.6, b: 0.3 } }, ['a'])).toEqual([['b', 0.3]])
    expect(unsure({ choice: 'a', probabilities: { a: 0.45, b: 0.3 } })).toBe(true)
    expect(unsure({ choice: 'a', probabilities: { a: 0.8, b: 0.1 } })).toBe(false)
    expect(unsure({ choice: NONE, probabilities: { [NONE]: 0.45, a: 0.3, b: 0.12 } })).toBe(false)
  })
  it('fits tips to the page, with / as the home page only, and drops dismissed ones', () => {
    const tips = [{ id: 'a', text: 'A', only: ['/games'] }, { id: 'b', text: 'B', not: ['/blog'] }, { id: 'c', text: 'C' }, { id: 'd', text: 'D', only: ['/'] }]
    expect(Object.keys(tipCriteria(tips, '/games/x/3', ['c']))).toEqual(['a', 'b'])
    expect(Object.keys(tipCriteria(tips, '/blog/x', []))).toEqual(['c'])
    expect(Object.keys(tipCriteria(tips, '/', ['b', 'c']))).toEqual(['d'])
  })
  it('suggests only what the page can do now, and hears a request for anything', () => {
    const tools = new Map([
      ['move', { name: 'move', description: '', arg: { name: 'move', description: '', values: [] } }],
      ['open_page', { name: 'open_page', description: '', arg: { name: 'page', description: '', values: [{ value: 'games', label: 'games' }] } }],
      ['copy_link', { name: 'copy_link', description: '' }],
    ])
    const all = [{ label: 'Move', tool: 'move', arg: ANY }, { label: 'Games', tool: 'open_page', arg: 'games', not: ['/games'] }, { label: 'Copy', tool: 'copy_link' }, { label: 'Paint', tool: 'paint', arg: ANY }]
    expect(suggestionsFor(all, tools, '/').map((s) => s.label)).toEqual(['Games', 'Copy'])
    expect(suggestionsFor(all, tools, '/games/x').map((s) => s.label)).toEqual(['Copy'])
    expect(wantsAny('paint a random one')).toBe(true)
    expect(wantsAny('paint a cat')).toBe(false)
  })
})
