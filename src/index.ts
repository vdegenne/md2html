interface Md2HtmlOptions {
	hljs?: {
		highlight: (code: string, opts: {language: string}) => {value: string}
		highlightAuto: (code: string) => {value: string}
	}

	/**
	 * @default false
	 */
	unsafe: boolean

	/**
	 * Join character between paragraphs.
	 *
	 * @default ''
	 */
	joinCharacter: string
}

function parseBlocks(text: string, joinCharacter = ''): string {
	// Titres
	text = text.replace(
		/^[^\\]?\s*(#{1,6}) ([^\n]+)$/gm,
		(_, level: string, content: string) =>
			`<h${level.length}>${content}</h${level.length}>`,
	)

	// Task list
	text = text.replace(
		/^[ \t]*[-*+][ \t]+\[([ xX]?)\]\s([^\n]+)$/gm,
		(_, checked: string, content: string) =>
			`<li><input type="checkbox" ${checked.trim().toLowerCase() === 'x' ? 'checked' : ''} disabled> ${content}</li>`,
	)

	// **NOUVEAU** : grouper les <li> consécutifs en <ul>
	text = text.replace(/((?:^[ \t]*[-*+] .+(?:\n|$))+)/gm, (block) => {
		const items = block
			.trim()
			.split('\n')
			.map((line) => line.replace(/^[ \t]*[-*+] (.+)$/, '<li>$1</li>'))
			.join('')
		return `<ul>${items}</ul>`
	})

	// Grouper les <li> numériques en <ol>
	text = text.replace(/((?:^[ \t]*\d+\. .+(?:\n|$))+)/gm, (block) => {
		const items = block
			.trim()
			.split('\n')
			.map((line) => line.replace(/^[ \t]*(\d+)\. (.+)$/, '<li>$2</li>'))
			.join('')
		return `<ol>${items}</ol>`
	})

	// HR
	text = text.replace(/^ {0,3}(([*_-])( *\2 *){2,})(?:\s*$|$)/gm, () => '<hr/>')

	// Blockquote
	text = text.replace(
		/^[ \t]*((?:\>[ \t]*)+)([^\n]*)$/gm,
		(_, sep: string, content: string) => {
			const n = sep.length / 2
			if (!content.trim()) return ''
			return '<blockquote>'.repeat(n) + content + '</blockquote>'.repeat(n)
		},
	)

	// Table
	text = text.replace(
		/^([^\n]*\|[^\n]*)\n([-:| ]+\|)+[-\| ]*\n((?:[^\n]*\|[^\n]*(?:\n|$))*)/gm,
		(_, headers: string, align: string, rows: string) =>
			parseTable(headers, align, rows),
	)

	// Paragraphs
	return text
		.split(/\n{2,}|\\\n/g)
		.map((s) => (/^<(\w+)/.test(s) ? s : `<p>${s}</p>`))
		.join(joinCharacter)
}

function parseTable(headers: string, alignLine: string, rows: string): string {
	const headerCols = headers
		.split('|')
		.map((h) => h.trim())
		.filter(Boolean)
	const aligns = parseTableAlignment(alignLine)

	const body = rows
		.trim()
		.split('\n')
		.reduce<string[][]>((acc, line) => {
			if (!line.includes('|')) return acc
			const cols = line
				.split('|')
				.slice(1, -1)
				.map((c) => c.trim())
			acc.push(headerCols.map((_, i) => cols[i] || ''))
			return acc
		}, [])

	const out: string[] = ['<table>', '<thead><tr>']

	headerCols.forEach((h, i) => {
		out.push(`<th${aligns[i] ? ` align="${aligns[i]}"` : ''}>${h}</th>`)
	})
	out.push('</tr></thead>')

	if (body.length) {
		out.push('<tbody>')
		body.forEach((row) => {
			out.push('<tr>')
			row.forEach((c, j) => {
				out.push(`<td${aligns[j] ? ` align="${aligns[j]}"` : ''}>${c}</td>`)
			})
			out.push('</tr>')
		})
		out.push('</tbody>')
	}

	out.push('</table>')
	return out.join('')
}

function parseTableAlignment(
	alignLine: string,
): Array<'left' | 'right' | 'center' | null> {
	return alignLine
		.split('|')
		.map((s) => s.trim())
		.filter(Boolean)
		.map((part) => {
			const left = part.startsWith(':')
			const right = part.endsWith(':')
			if (left && right) return 'center'
			if (left) return 'left'
			if (right) return 'right'
			return null
		})
}

function parseInlines(text: string): string {
	return text
		.replace(/[*_]{2}(.+?)[*_]{2}/g, '<strong>$1</strong>')
		.replace(
			/(?<!\*)_(.+?)_(?!\*)|(?<!\*)\*(.+?)\*(?!\*)/g,
			(_, g1: string, g2: string) => `<em>${g1 || g2}</em>`,
		)
		.replace(/~~(.+?)~~/g, '<del>$1</del>')
		.replace(/\<([^\s@>]+@[^\s@>]+\.[^\s@>]+)\>/g, '<a href="mailto:$1">$1</a>')
		.replace(
			/\<((?:https?:\/\/|ftp:\/\/|mailto:|tel:)[^>\s]+)\>/g,
			'<a href="$1">$1</a>',
		)
		.replace(/\!\[([^\]]*)\]\(([^)]+)\)/g, '<img src="$2" alt="$1">')
		.replace(
			/\[([^\]]+)\]\(([^) ]+)[ ]?(\"[^)"\"]+\")?\)/g,
			(_, text1: string, url: string, title: string) =>
				`<a href="${url}"${title ? ' title=' + title : ''}>${text1}</a>`,
		)
}

function escapeHTML(text: string): string {
	return text.replace(/[&<>"']/g, (m) => `&#${m.charCodeAt(0)}`)
}

function safeHTML(text: string): string {
	return text
		.replace(
			/<(\/?)\s*(script|iframe|object|embed|frame|link|meta|style|svg|math)[^>]*>/gi,
			(m) => escapeHTML(m),
		)
		.replace(
			/\s(?!data-)[\w-]+=\s*["'\s]*(javascript:|data:|expression:)[^"'\s>]*/gi,
			'',
		)
		.replace(/\<[^\>]+\>/g, (tag) =>
			tag.replace(/\s+on\w+\s*=\s*["']?[^"'\\]*["']?/gi, ''),
		)
}

export function md2html(
	markdown: string,
	options?: Partial<Md2HtmlOptions>,
): string {
	const o: Md2HtmlOptions = {
		joinCharacter: '',
		unsafe: false,
		...options,
	}
	if (typeof markdown !== 'string') return ''

	const codeBlocks: Array<{lang: string; code: string}> = []
	const codeInline: string[] = []

	markdown = markdown
		.replace(
			/(?:^|\n)[^\\]?(`{3,4})[ ]*(\w*?)\n([\s\S]*?)\n\1/g,
			(_, __, lang: string, code: string) => {
				codeBlocks.push({lang: lang.trim(), code: code.trim()})
				return `<!----CODEBLOCK${codeBlocks.length - 1}---->`
			},
		)
		.replace(/([^\\])`([^`]+)`/g, (_, after: string, code: string) => {
			codeInline.push(escapeHTML(code))
			return `${after}<!----CODEINLINE${codeInline.length - 1}---->`
		})
		.replace(
			/\\([\\*_{}[\]()#+\-.!`])/g,
			(_, m: string) => `&#${m.charCodeAt(0)}`,
		)
		.replace(/%%[\n ][^%]+[\n ]%%/g, '')

	markdown = parseInlines(parseBlocks(markdown))
		.replace(/<!----CODEINLINE(\d+)---->/g, (_, id: string) =>
			codeInline[+id] ? `<code>${codeInline[+id]}</code>` : '',
		)
		.replace(/<!----CODEBLOCK(\d+)---->/g, (_, id: string) => {
			const block = codeBlocks[+id]
			if (!block) return ''

			const {lang, code} = block
			let highlighted = code

			if (o.hljs) {
				try {
					highlighted = lang
						? o.hljs.highlight(code, {language: lang}).value
						: o.hljs.highlightAuto(code).value
				} catch {}
			}

			return lang
				? `<pre lang="${lang}"><code class="hljs ${lang} lang-${lang}">${highlighted}</code></pre>`
				: `<pre><code>${highlighted}</code></pre>`
		})

	return o.unsafe ? markdown : safeHTML(markdown)
}
