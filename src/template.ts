import Str                from '@itrocks/rename'
import appDir             from '@itrocks/app-dir'
import { SortedArray }    from '@itrocks/sorted-array'
import { readFile }       from 'node:fs/promises'
import { normalize, sep } from 'node:path'

type BlockStack = { blockStart: number, collection: any[], data: any, iteration: number, iterations: number }[]

let blockBack:  number
let blockStack: BlockStack

let doHeadLinks = false

let index:       number
let length:      number
let source:      string
let start:       number
let tagName:     string
let tagStack:    { tagName: string, inLiteral: boolean }[]
let target:      string
let targetStack: string[]

let lockLiteral:      boolean
let literalPartStack: string[][]
let literalParts:     string[]
let inLiteral:        boolean

export const frontScripts = new SortedArray<string>()
frontScripts.distinct = true

let doneLinks = new SortedArray<string>()
let headLinks = new SortedArray<string>()
let headTitle: string | undefined = undefined
doneLinks.distinct = true
headLinks.distinct = true

export type VariableParser = [parser: string, (variable: string, data: any) => any]

export { Template }
export default class Template
{
	doExpression = true
	doLiteral    = false

	fileName?: string
	filePath?: string

	included = false

	// Inline elements are replaced by $1 when in literal.
	inlineElements = new SortedArray(
		'a', 'abbr', 'acronym', 'b', 'bdo', 'big', 'button', 'cite', 'code', 'data', 'del', 'dfn', 'em', 'font', 'i', 'img',
		'input', 'ins', 'kbd', 'label', 'map', 'mark', 'meter', 'object', 'optgroup', 'option', 'output', 'picture', 'q',
		'rt', 'samp', 'select', 'small', 'span', 'strike', 'strong', 'sub', 'sup', 'svg', 'time', 'tspan', 'tt', 'u', 'var',
		'wbr'
	)

	// These attribute values are literals.
	literalAttributes = new SortedArray(
		'alt', 'enterkeyhint', 'label', 'lang', 'placeholder', 'srcdoc', 'title'
	)

	// These element contents are literals.
	literalElements = new SortedArray(
		'a', 'abbr', 'acronym', 'article', 'aside', 'b', 'bdi', 'bdo', 'big', 'blockquote', 'body', 'br', 'button',
		'caption', 'center', 'cite', 'data', 'datalist', 'dd', 'del', 'desc', 'details', 'dfn', 'dialog', 'div', 'dt',
		'em', 'fieldset', 'figcaption', 'figure', 'font', 'footer', 'form',
		'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'header', 'hr', 'i', 'iframe', 'ins', 'keygen', 'label', 'legend', 'li',
		'main', 'mark', 'menuitem', 'meter', 'nav', 'noframes', 'noscript', 'optgroup', 'option', 'p', 'pre',
		'q', 'rb', 's', 'section', 'select', 'small', 'span', 'strike', 'strong', 'sub', 'summary', 'sup',
		'td', 'template', 'text', 'textarea', 'textpath', 'th', 'time', 'title', 'tspan', 'u', 'wbr'
	)

	onAttribute?: ((name: string, value: string) => void)
	onTagOpen?:   ((name: string) => void)
	onTagOpened?: ((name: string) => void)
	onTagClose?:  ((name: string) => void)

	parsers:  VariableParser[] = []
	prefixes: string

	// These elements have no closing tag.
	unclosingTags = new SortedArray(
		'area', 'base', 'basefont', 'br', 'col', 'embed', 'hr', 'img', 'input', 'keygen', 'link', 'meta', 'param',
		'source', 'track'
	)

	constructor(public data?: any, public containerData?: any)
	{
		blockStack = []
		if (containerData) {
			blockStack.push({ blockStart: 0, collection: [], data: containerData, iteration: 0, iterations: 1 })
		}
		this.prefixes = this.parsers.map(([prefix]) => prefix).join('')
	}

	applyLiterals(text: string, parts: string[] = [])
	{
		return text.replace(/\$([0-9]+)/g, (_, index) => parts[+index])
	}

	closeTag(shouldInLiteral: boolean, targetIndex: number)
	{
		shouldInLiteral ||= inLiteral;
		({ tagName, inLiteral } = tagStack.pop() ?? { tagName: '', inLiteral: false })
		if (this.onTagClose) this.onTagClose.call(this, tagName)
		if ((tagName[0] === 'a') && (tagName === 'address')) {
			lockLiteral = false
		}
		if (inLiteral && this.inlineElements.includes(tagName)) {
			if (this.literalElements.includes(tagName)) {
				this.literalTarget(targetIndex)
			}
			literalParts = literalPartStack.pop() as string[]
			literalParts.push(target + source.substring(start, index))
			start           = index
			target          = targetStack.pop() + '$' + literalParts.length
			shouldInLiteral = false
		}
		return shouldInLiteral
	}

	combineLiterals(text: string, parts?: string[])
	{
		const original = text
		text           = text.trimEnd()
		const right    = text.length
		let left       = text.length
		text           = text.trimStart()
		left          -= text.length
		if (text !== '') {
			text = (parts && /^(\$[1-9][0-9]*)+$/.test(text))
				? parts.join('')
				: this.applyLiterals(text, parts?.map(part => ((typeof part)[0] === 's') ? this.applyLiterals(part) : part))
		}
		return original.substring(0, left) + text + original.substring(right)
	}

	debugEvents()
	{
		this.onAttribute = (name: string, value: string) => console.log('attribute', name, '=', value)
		this.onTagOpen   = (name: string) => console.log('tag.open =', name)
		this.onTagOpened = (name: string) => console.log('tag.opened =', name)
		this.onTagClose  = (name: string) => console.log('tag.closed =', name)
	}

	getCleanContext()
	{
		const doneLinks = new SortedArray<string>
		const headLinks = new SortedArray<string>
		doneLinks.distinct = true
		headLinks.distinct = true
		return {
			doHeadLinks:      false,
			doneLinks:        doneLinks,
			headLinks:        headLinks,
			index:            length,
			length:           source.length,
			source:           source,
			start:            length,
			target:           target,
			targetStack:      [],
			literalPartStack: [],
			literalParts:     [],
			inLiteral:        this.doLiteral
		}
	}

	getPosition()
	{
		return { index, start, target }
	}

	getContext()
	{
		return {
			doHeadLinks, doneLinks, headLinks, index, length, source, start, target, targetStack,
			literalPartStack, literalParts, inLiteral
		}
	}

	async include(path: string, data: any)
	{
		const back = {
			doHeadLinks, index, length, source, start, tagName, tagStack, target, targetStack,
			literalParts, literalPartStack, inLiteral, lockLiteral
		}
		doHeadLinks = true

		const template    = new (Object.getPrototypeOf(this).constructor)(data, blockStack[0]?.data)
		template.included = true

		template.doExpression = this.doExpression
		template.doLiteral    = this.doLiteral
		template.onAttribute  = this.onAttribute
		template.onTagClose   = this.onTagClose
		template.onTagOpen    = this.onTagOpen
		template.onTagOpened  = this.onTagOpened
		template.parsers      = this.parsers

		const parsed = await template.parseFile(
			((path[0] === sep) || (path[1] === ':')) ? path : (this.filePath + sep + path));

		({
			doHeadLinks, index, length, source, start, tagName, tagStack, target, targetStack,
			literalParts, literalPartStack, inLiteral, lockLiteral
		} = back)

		return parsed.substring(parsed.indexOf('<!--BEGIN-->') + 12, parsed.indexOf('<!--END-->'))
	}

	isContextClean()
	{
		const clean   = this.getCleanContext()
		const context = this.getContext()
		return context.doHeadLinks           === clean.doHeadLinks
			&& context.doneLinks.distinct      === clean.doneLinks.distinct
			&& context.doneLinks.length        === clean.doneLinks.length
			&& context.headLinks.distinct      === clean.headLinks.distinct
			&& context.headLinks.length        === clean.headLinks.length
			&& context.index                   === clean.index
			&& context.length                  === clean.length
			&& context.start                   === clean.start
			&& context.targetStack.length      === clean.targetStack.length
			&& context.literalPartStack.length === clean.literalPartStack.length
			&& context.literalParts.length     === clean.literalParts.length
			&& context.inLiteral               === clean.inLiteral
	}

	literalTarget(index: number, isTitle = false)
	{
		let combined: string
		if (literalParts.length) {
			target      += source.substring(start, index)
			combined     = this.combineLiterals(target, literalParts)
			target       = (targetStack.pop() ?? '') + combined
			literalParts = []
		}
		else {
			combined = this.combineLiterals(source.substring(start, index))
			target  += combined
		}
		if (isTitle && doHeadLinks) {
			headTitle = combined
		}
		start = index
	}

	async parseBuffer(buffer: string)
	{
		this.setSource(buffer)
		await this.parseVars()
		if (doHeadLinks) {
			return target
		}
		if (headLinks.length) {
			const position = target.lastIndexOf('>', target.indexOf('</head>')) + 1
			target    = target.slice(0, position) + '\n\t' + headLinks.join('\n\t') + target.slice(position)
			doneLinks = new SortedArray<string>
			doneLinks.distinct = true
			headLinks = new SortedArray<string>
			headLinks.distinct = true
		}
		if (headTitle && !this.included) {
			const position = target.indexOf('>', target.indexOf('<title') + 6) + 1
			target = target.slice(0, position) + headTitle + target.slice(target.indexOf('</title>', position))
		}
		return target
	}

	async parseExpression(data: any, close: string, finalClose = '')
	{
		const indexOut = index
		let   open     = source[index]

		if (inLiteral && !literalParts.length) {
			targetStack.push(target)
			target = ''
		}

		if (open === '<') {
			index += 3
			open   = '{'
		}

		index ++
		const firstChar = source[index]
		if ((index >= length) || !this.startsExpression(firstChar, open, close)) {
			return
		}

		let   conditional = (firstChar === '?')
		const finalChar   = finalClose.length ? finalClose[0] : ''
		let   stackPos    = targetStack.length
		if (conditional) {
			index ++
		}
		targetStack.push(target + source.substring(start, indexOut))
		start  = index
		target = ''

		while (index < length) {
			const char = source[index]

			if (char === open) {
				targetStack.push(target + source.substring(start, index))
				index  ++
				start  = index
				target = ''
				continue
			}

			if (
				(char === close)
				|| ((char === finalChar) && (source.substring(index, index + finalClose.length) === finalClose))
			) {
				let minus = 0
				if (source[index - 1] === '?') {
					conditional = true
					minus = 1
				}
				const expression = target + source.substring(start, index - minus)
				const lastTarget = targetStack.pop() as string
				const parsed     = await this.parsePath(expression, data)
				index += (char === close) ? 1 : finalClose.length
				start  = index
				target = ''
				if (char === finalChar) while (targetStack.length > stackPos) {
					target += targetStack.shift()
				}
				if (inLiteral && (targetStack.length === stackPos)) {
					literalParts.push(parsed)
					target += lastTarget + '$' + literalParts.length
					return conditional
				}
				if (lastTarget.length || target.length) {
					target += lastTarget + parsed
				}
				else {
					target = parsed
				}
				if (targetStack.length === stackPos) {
					if (conditional && !parsed) {
						if ((typeof target)[0] === 's') {
							target = target.substring(0, target.lastIndexOf(' '))
							while ((index < length) && !' \n\r\t\f'.includes(source[index])) {
								index ++
								start ++
							}
							index --
						}
						return conditional
					}
					return conditional
				}
				continue
			}

			if ((char === '"') || (char === "'")) {
				index ++
				let c: string
				while ((index < length) && ((c = source[index]) !== char)) {
					if (c === '\\') index ++
					index ++
				}
			}

			index ++
		}
		// bad close
		stackPos ++
		while (targetStack.length > stackPos) {
			target = targetStack.pop() + open + target
		}
		target = targetStack.pop() + (finalClose.length ? '<!--' : open) + target
		return conditional
	}

	async parseFile(fileName: string, containerFileName?: string): Promise<string>
	{
		if (containerFileName && !this.included) {
			const data = this.data
			this.data  = Object.assign({ content: () => this.include(fileName, data) }, blockStack[0]?.data)
			return this.parseFile(normalize(containerFileName))
		}
		this.fileName = fileName.substring(fileName.lastIndexOf(sep) + 1)
		this.filePath = fileName.substring(0, fileName.lastIndexOf(sep))
		return this.parseBuffer(await readFile(fileName, 'utf-8'))
	}

	async parsePath(expression: string, data: any)
	{
		if (expression === '') {
			return undefined
		}
		if ((expression[0] === '.') && (expression.startsWith('./') || expression.startsWith('../'))) {
			return this.include(expression, data)
		}
		blockBack = 0
		for (const variable of expression.split('.')) {
			data = await this.parseVariable(variable, data)
		}
		return data
	}

	async parseVariable(variable: string, data: any)
	{
		if (variable === '') {
			return (typeof data === 'function')
				? data.call()
				: data
		}
		if (variable === '*') {
			return (typeof data === 'object') ? Object.values(data) : data
		}
		const firstChar = variable[0]
		if ((firstChar === 'B') && (variable === 'BEGIN')) {
			return data
		}
		if (
			((firstChar === '"') && (variable[variable.length - 1] === '"'))
			|| ((firstChar === "'") && (variable[variable.length - 1] === "'"))
		) {
			return variable.substring(1, variable.length - 1)
		}
		if (firstChar === '-') {
			blockBack ++
			return blockStack[blockStack.length - blockBack].data
		}
		for (const [prefix, callback] of this.parsers) {
			if (firstChar === prefix) {
				return callback(variable, data)
			}
		}
		if (data[variable] === undefined) {
			data = new Str(data)
		}
		let value = data[variable]
		return ((typeof value === 'function') && !value.prototype)
			? value.call(data)
			: value
	}

	async parseVars()
	{
		let blockStart = 0
		let collection = []
		let data       = this.data
		let inHead     = false
		let iteration  = 0
		let iterations = 0

		while (index < length) {
			let char = source[index]

			// expression
			if ((char === '{') && this.doExpression) {
				await this.parseExpression(data, '}')
				continue
			}

			// tag ?
			if (char !== '<') {
				index ++
				continue
			}

			const tagIndex = index
			char = source[++index]
			if (char === '!') {
				if (inLiteral) {
					this.literalTarget(tagIndex)
				}
				char = source[++index]
				index ++

				// comment tag
				if ((char === '-') && (source[index] === '-')) {
					index ++
					if (
						!/[a-z0-9@%{]/i.test(source[index])
						|| !this.doExpression
						|| ((source[index] === 'B') && this.included && (source.substring(index, index + 8) === 'BEGIN-->'))
						|| ((source[index] === 'E') && this.included && (source.substring(index, index + 6) === 'END-->'))
					) {
						index = source.indexOf('-->', index) + 3
						if (index === 2) break
						if (inLiteral && (index > start)) {
							this.sourceToTarget()
						}
						continue
					}

					// end condition / loop block
					if ('eE'.includes(source[index]) && ['end-->', 'END-->'].includes(source.substring(index, index + 6))) {
						target += this.trimEndLine(source.substring(start, tagIndex))
						iteration ++
						if (iteration < iterations) {
							data  = collection[iteration]
							index = start = blockStart
							if (inLiteral && (index > start)) {
								this.sourceToTarget()
							}
							continue
						}
						({ blockStart, collection, data, iteration, iterations } = blockStack.pop()
							?? { blockStart: 0, collection: [], data: undefined, iteration: 0, iterations: 0 })
						index += 6
						start  = index
						if (inLiteral && (index > start)) {
							this.sourceToTarget()
						}
						continue
					}

					// begin condition / loop block
					blockStack.push({ blockStart, collection, data, iteration, iterations })
					if (tagIndex > start) {
						target += this.trimEndLine(source.substring(start, tagIndex))
						start   = tagIndex
					}
					const backTarget    = target
					const backInLiteral = inLiteral
					index     = tagIndex
					target    = ''
					inLiteral = false
					const condition = await this.parseExpression(data, '}', '-->')
					let blockData   = condition ? (target ? data : undefined) : target
					blockStart = index
					iteration  = 0
					target     = backTarget
					inLiteral  = backInLiteral
					if (Array.isArray(blockData)) {
						collection = blockData
						data       = collection[0]
						iterations = collection.length
					}
					else {
						collection = []
						data       = blockData
						iterations = data ? 1 : 0
					}
					if (!iterations) {
						this.skipBlock()
						continue
					}
					if (inLiteral && (index > start)) {
						this.sourceToTarget()
					}
					continue
				}

				// cdata section
				if ((char === '[') && (source.substring(index, index + 6) === 'CDATA[')) {
					index = source.indexOf(']]>', index + 6) + 3
					if (index === 2) break
				}

				// DOCTYPE
				else {
					index = source.indexOf('>', index) + 1
				}

				if (inLiteral) {
					this.sourceToTarget()
				}
				continue
			}

			// tag close
			if (char === '/') {
				index ++
				const closeTagName = source.substring(index, source.indexOf('>', index))
				index += closeTagName.length + 1
				if (inHead && (closeTagName[0] === 'h') && (closeTagName === 'head')) {
					inHead = false
					if (!doHeadLinks) {
						doneLinks = headLinks
						headLinks = new SortedArray<string>
						headLinks.distinct = true
					}
				}
				let shouldInLiteral = inLiteral
				if (!this.unclosingTags.includes(closeTagName)) {
					do {
						shouldInLiteral = this.closeTag(shouldInLiteral, tagIndex)
					}
					while ((tagName !== closeTagName) && tagName.length)
				}
				if (shouldInLiteral) {
					lockLiteral = false
					this.literalTarget(tagIndex, (tagName[0] === 't') && (tagName === 'title'))
				}
				if (inLiteral && (index > start)) {
					this.sourceToTarget()
				}
				continue
			}

			// tag open
			while ((index < length) && !' >\n\r\t\f'.includes(source[index])) index ++
			tagName = source.substring(tagIndex + 1, index)
			if (this.onTagOpen) this.onTagOpen.call(this, tagName)
			while (' \n\r\t\f'.includes(source[index])) index ++
			char = tagName[0]
			if ((char === 'h') && (tagName === 'head')) {
				inHead = true
			}

			const unclosingTag = this.unclosingTags.includes(tagName)
			if (!unclosingTag) {
				tagStack.push({ tagName, inLiteral })
			}
			let inlineElement = false
			let pushedParts   = false
			if (inLiteral) {
				inlineElement = this.inlineElements.includes(tagName)
				if (inlineElement) {
					if (literalParts.length) {
						targetStack.push(target + source.substring(start, tagIndex))
					}
					else {
						targetStack.push(target, source.substring(start, tagIndex))
					}
					start  = tagIndex
					target = ''
					if (!unclosingTag) {
						literalPartStack.push(literalParts)
						literalParts = []
						pushedParts  = true
					}
				}
				else {
					this.literalTarget(tagIndex)
				}
			}
			const elementInLiteral = inLiteral

			// attributes
			let   hasTypeSubmit  = false
			const inInput        = (char === 'i') && (tagName === 'input')
			const inLink         = (char === 'l') && (tagName === 'link')
			const inScript       = (char === 's') && (tagName === 'script')
			let   targetTagIndex = -1
			if (inHead && (inLink || inScript)) {
				this.sourceToTarget()
				targetTagIndex = target.lastIndexOf('<')
			}
			while (source[index] !== '>') {

				// attribute name
				const position = index
				while ((index < length) && !' =>\n\r\t\f'.includes(source[index])) index ++
				const attributeName = source.substring(position, index)
				while (' \n\r\t\f'.includes(source[index])) index ++

				// attribute value
				if (source[index] === '=') {
					index ++
					while (' \n\r\t\f'.includes(source[index])) index ++
					const attributeChar = attributeName[0]
					const [open, close] = (
						'afhls'.includes(attributeChar)
						&& ['action', 'formaction', 'href', 'location', 'src'].includes(attributeName)
					) ? ['(', ')']
						: ['{', '}']
					let quote = source[index]
					if ((quote === '"') || (quote === "'")) {
						index ++
					}
					else {
						quote = ' >'
					}
					if ((open === '(') && (source.substring(index, index + 6) === 'app://')) {
						this.sourceToTarget()
						index += 6
						start  = index
					}

					inLiteral = this.doLiteral && (
						this.literalAttributes.includes(attributeName)
						|| (hasTypeSubmit && (attributeChar === 'v') && (attributeName === 'value'))
					)
					if (inLiteral && !pushedParts && unclosingTag && literalParts.length) {
						literalPartStack.push(literalParts)
						literalParts = []
						pushedParts  = true
					}

					const inLinkHRef  = inLink   && (attributeChar === 'h') && (attributeName === 'href')
					const inScriptSrc = inScript && (attributeChar === 's') && (attributeName === 'src')
					if ((inLinkHRef || inScriptSrc || inLiteral) && (index > start)) {
						this.sourceToTarget()
					}

					const position   = index
					const shortQuote = !(quote.length - 1)
					while (index < length) {
						const char = source[index]
						// end of attribute value
						if (shortQuote ? (char === quote) : quote.includes(char)) {
							const attributeValue = source.substring(position, index)
							if (inInput) {
								hasTypeSubmit ||= (
									(attributeChar === 't') && (attributeValue[0] === 's')
									&& (attributeName === 'type') && (attributeValue === 'submit')
								)
							}
							if (inLiteral) {
								this.literalTarget(index)
							}
							if (inLinkHRef && attributeValue.endsWith('.css')) {
								let frontStyle = normalize(this.filePath + sep + source.substring(start, index))
									.substring(appDir.length)
								if (sep !== '/') {
									frontStyle = frontStyle.replaceAll(sep, '/')
								}
								target += frontStyle
								start = index
							}
							if (inScriptSrc && attributeValue.endsWith('.js')) {
								let frontScript = normalize(this.filePath + sep + source.substring(start, index))
									.substring(appDir.length)
								if (sep !== '/') {
									frontScript = frontScript.replaceAll(sep, '/')
								}
								frontScripts.insert(frontScript)
								target += frontScript
								start   = index
							}
							if (this.onAttribute) this.onAttribute(attributeName, attributeValue)
							if (char !== '>') index ++
							break
						}
						// expression in attribute value
						if ((char === open) && this.doExpression) {
							await this.parseExpression(data, close)
							continue
						}
						index ++
					}
				}
				else if (this.onAttribute) this.onAttribute(attributeName, '')

				// next attribute
				while (' \n\r\t\f'.includes(source[index])) index ++
			}
			index ++
			if (this.onTagOpened) this.onTagOpened.call(this, tagName)

			// skip script content
			if (inScript) {
				if (this.onTagClose) this.onTagClose.call(this, 'script')
				index = source.indexOf('</script>', index) + 9
				if (index === 8) break
				if (inLiteral && (index > start)) {
					this.sourceToTarget()
				}
			}

			if (targetTagIndex > -1) {
				this.sourceToTarget()
				const headLink = target.substring(targetTagIndex)
				if (!doneLinks || !doneLinks.includes(headLink)) {
					headLinks.insert(headLink)
				}
			}

			if (inScript) {
				continue
			}

			if (unclosingTag) {
				if (pushedParts) {
					literalParts = literalPartStack.pop() as string[]
				}
				inLiteral = elementInLiteral
				if (this.onTagClose) this.onTagClose.call(this, tagName)
				if (inLiteral) {
					if (index > start) {
						this.sourceToTarget()
					}
					if (inlineElement) {
						literalParts.push(target)
						target = targetStack.pop() + '$' + literalParts.length
					}
				}
			}
			else {
				lockLiteral ||= (tagName[0] === 'a') && (tagName === 'address')
				inLiteral     = this.doLiteral && !lockLiteral && this.literalElements.includes(tagName)
				if (inLiteral && (index > start)) {
					this.sourceToTarget()
				}
			}
		}
		if (tagStack.length) {
			let shouldInLiteral = inLiteral
			while (tagStack.length) {
				shouldInLiteral = this.closeTag(shouldInLiteral, length)
			}
			if (shouldInLiteral) {
				this.literalTarget(length)
			}
			return target
		}
		if (inLiteral) {
			this.literalTarget(index)
		}
		if (start < length) {
			target += source.substring(start)
			start   = length
		}
		return target
	}

	setSource(setSource: string, setIndex = 0, setStart?: number, setTarget = '')
	{
		index    = setIndex
		length   = setSource.length
		source   = setSource
		start    = setStart ?? index
		tagName  = ''
		tagStack = []
		target   = setTarget

		inLiteral        = this.doLiteral
		literalPartStack = []
		literalParts     = []
		lockLiteral      = false
		targetStack      = []
	}

	skipBlock()
	{
		if (index > start) {
			this.sourceToTarget()
		}
		let depth = 1
		while (depth) {
			index = source.indexOf('<!--', index)
			if (index < 0) {
				break
			}
			index += 4
			const char = source[index]
			if (!this.startsExpression(char)) {
				continue
			}
			if ((char === 'e') && (source.substring(index, index + 6) === 'end-->')) {
				depth --
				continue
			}
			depth ++
		}
		index -= 4
		if (index < 0) {
			index = length
		}
		start = index
	}

	sourceToTarget()
	{
		target += source.substring(start, index)
		start   = index
	}

	startsExpression(char: string, open = '{', close = '}')
	{
		return RegExp('[a-z0-9"%*.?@\'' + open + close + '-]', 'i').test(char)
	}

	trimEndLine(string: string)
	{
		let index = string.length
		while ((index > 0) && ' \n\r\t\f'.includes(string[index - 1])) {
			index --
			if (string[index] === '\n') {
				break
			}
		}
		return string.substring(0, index)
	}

}
