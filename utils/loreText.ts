// A small markdown subset for Lore Master replies and rules text: headings, paragraphs,
// bullet and numbered lists, tables (`| a | b |` rows, a `| --- |` line after the first
// makes it the header), bold, italics, inline code and code blocks. Everything is
// HTML-escaped first, so the result is safe for v-html.

function escape(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function inline(text: string): string {
  return escape(text)
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/(^|[^*\w])\*([^*\s][^*]*)\*(?!\w)/g, '$1<em>$2</em>')
    .replace(/(^|[^_\w])_([^_\s][^_]*)_(?!\w)/g, '$1<em>$2</em>')
}

/**
 * A table row's cells: split on pipes that aren't escaped (`\|`) or inside inline code,
 * outer pipes dropped.
 */
function cells(row: string): string[] {
  return row
    .trim()
    .replace(/`[^`]*`/g, (code) => code.replace(/(?<!\\)\|/g, '\\|'))
    .replace(/^\|/, '')
    .replace(/(?<!\\)\|$/, '')
    .split(/(?<!\\)\|/)
    .map((c) => c.replace(/\\\|/g, '|').trim())
}

const TABLE_ROW = /^\s*\|.*\|\s*$/
/** The line under a table's header: dashes in cells, with at least one pipe (as in GFM). */
const TABLE_RULE = /^(?=.*\|)\s*\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)*\|?\s*$/

function table(rows: string[]): string {
  const [first, second] = rows
  const head = second !== undefined && TABLE_RULE.test(second) ? cells(first ?? '') : null
  const body = (head ? rows.slice(2) : rows).map(cells)
  const tr = (row: string[], tag: 'th' | 'td') =>
    `<tr>${row.map((c) => `<${tag}${tag === 'th' ? ' scope="col"' : ''}>${inline(c)}</${tag}>`).join('')}</tr>`
  return (
    '<div class="table-wrap md-table"><table class="table table--rules">' +
    (head ? `<thead>${tr(head, 'th')}</thead>` : '') +
    `<tbody>${body.map((r) => tr(r, 'td')).join('')}</tbody></table></div>`
  )
}

export interface LoreHtmlOptions {
  /**
   * The HTML level for `##` headings, with `###` one below it and so on. Left out, every
   * heading is an `<h4>` (Scribe replies and rules text inside cards).
   */
  headingBase?: number
}

export function loreHtml(markdown: string, opts: LoreHtmlOptions = {}): string {
  const out: string[] = []
  let list: 'ul' | 'ol' | null = null
  let para: string[] = []
  let code: string[] | null = null
  let rows: string[] = []

  const flushPara = () => {
    if (para.length) out.push(`<p>${para.map(inline).join('<br>')}</p>`)
    para = []
  }
  const closeList = () => {
    if (list) out.push(`</${list}>`)
    list = null
  }
  const closeTable = () => {
    if (rows.length) out.push(table(rows))
    rows = []
  }

  for (const raw of markdown.replace(/\r\n/g, '\n').split('\n')) {
    if (code) {
      if (/^\s*```/.test(raw)) {
        out.push(`<pre><code>${escape(code.join('\n'))}</code></pre>`)
        code = null
      } else {
        code.push(raw)
      }
      continue
    }
    const line = raw.trimEnd()
    if (TABLE_ROW.test(line) || (rows.length === 1 && TABLE_RULE.test(line))) {
      flushPara()
      closeList()
      rows.push(line)
      continue
    }
    closeTable()
    if (/^\s*```/.test(line)) {
      flushPara()
      closeList()
      code = []
      continue
    }
    const heading = /^(#{1,6})\s+(.*)$/.exec(line)
    const bullet = /^\s*[-*•]\s+(.*)$/.exec(line)
    const numbered = /^\s*\d+[.)]\s+(.*)$/.exec(line)
    if (heading) {
      flushPara()
      closeList()
      const level = opts.headingBase
        ? Math.min(6, Math.max(1, opts.headingBase + (heading[1]?.length ?? 2) - 2))
        : 4
      out.push(`<h${level}>${inline(heading[2] ?? '')}</h${level}>`)
    } else if (bullet || numbered) {
      flushPara()
      const kind = bullet ? 'ul' : 'ol'
      if (list !== kind) {
        closeList()
        out.push(`<${kind}>`)
        list = kind
      }
      out.push(`<li>${inline((bullet ?? numbered)?.[1] ?? '')}</li>`)
    } else if (!line.trim()) {
      flushPara()
      closeList()
    } else {
      closeList()
      para.push(line.trim())
    }
  }
  if (code) out.push(`<pre><code>${escape(code.join('\n'))}</code></pre>`)
  closeTable()
  flushPara()
  closeList()
  return out.join('')
}
