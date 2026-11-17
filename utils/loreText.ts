// A small markdown subset for Lore Master replies: headings, paragraphs, bullet
// and numbered lists, bold, italics, inline code and code blocks. Everything is
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

export function loreHtml(markdown: string): string {
  const out: string[] = []
  let list: 'ul' | 'ol' | null = null
  let para: string[] = []
  let code: string[] | null = null

  const flushPara = () => {
    if (para.length) out.push(`<p>${para.map(inline).join('<br>')}</p>`)
    para = []
  }
  const closeList = () => {
    if (list) out.push(`</${list}>`)
    list = null
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
    if (/^\s*```/.test(line)) {
      flushPara()
      closeList()
      code = []
      continue
    }
    const heading = /^#{1,6}\s+(.*)$/.exec(line)
    const bullet = /^\s*[-*•]\s+(.*)$/.exec(line)
    const numbered = /^\s*\d+[.)]\s+(.*)$/.exec(line)
    if (heading) {
      flushPara()
      closeList()
      out.push(`<h4>${inline(heading[1] ?? '')}</h4>`)
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
  flushPara()
  closeList()
  return out.join('')
}
