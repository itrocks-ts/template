import { appDir }      from '@itrocks/app-dir'
import { Str }         from '@itrocks/rename'
import { SortedArray } from '@itrocks/sorted-array'
import { readFile }    from 'node:fs/promises'
import { normalize }   from 'node:path'
import { sep }         from 'node:path'

export type Dependencies = {
	toString: (value: any) => Promise<string>
}

export const depends: Dependencies = {
	toString: async (value: any) => '' + value
}

const done = { done: true }

type BlockStackEntry = {
	blockStart: number,
	condition?: boolean,
	data:       any,
	iteration:  IteratorResult<any> | { done: boolean, value?: any },
	iterator?:  Iterator<any>
}

type Close = ')' | '}'
type Final = ''  | '-->'
type Open  = '(' | '{'

export type VariableParser = [parser: string, (variable: string, data: any) => any]

export const frontScripts = new SortedArray<string>()
frontScripts.distinct = true

export function templateDependsOn(dependencies: Partial<Dependencies>)
{
	Object.assign(depends, dependencies)
}

export class HtmlResponse
{
	public dependencies: string[]
	constructor(public html: string, ...dependencies: string[]) { this.dependencies = dependencies }
	toString() { return this.html }
}

export class Template
{
	// block stack
	blockBack = 0
	blockStack: BlockStackEntry[] = []

	// parser
	doExpression  = true
	index         = 0
	length        = 0
	source        = ''
	start         = 0
	tagName       = ''
	tagStack:     { tagName: string, inLiteral: boolean }[] = []
	target        = ''
	targetReplace = ''
	targetStack:  string[] = []

	// literal
	doLiteral       = false
	inLiteral       = false
	literalParts:     string[]   = []
	literalPartStack: string[][] = []
	lockLiteral     = false

	// html head
	addLinks    = new SortedArray<string>()
	doHeadLinks = false
	doneLinks   = new SortedArray<string>()
	headLinks   = new SortedArray<string>()
	headTitle?:   string

	// file
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

	// These elements have no closing tag.
	unclosingTags = new SortedArray(
		'area', 'base', 'basefont', 'br', 'col', 'embed', 'hr', 'img', 'input', 'keygen', 'link', 'meta', 'param',
		'source', 'track'
	)

	// Event hooks
	onAttribute?: (name: string, value: string) => void
	onTagOpen?:   (name: string) => void
	onTagOpened?: (name: string) => void
	onTagClose?:  (name: string) => void

	// Additional parsers
	parsers:   VariableParser[] = []
	prefixes = ''

	constructor(public data?: any, public containerData?: any)
	{
		this.addLinks.distinct  = true
		this.doneLinks.distinct = true
		this.headLinks.distinct = true

		if (containerData) {
			this.blockStack.push({ blockStart: 0, data: containerData, iteration: done })
		}
	}

	applyLiterals(text: string, parts: string[] = [])
	{
		return text.replace(/\$([0-9]+)/g, (_, index) => parts[+index])
	}

	closeTag(shouldInLiteral: boolean, targetIndex: number)
	{
		shouldInLiteral ||= this.inLiteral;
		Object.assign(this, this.tagStack.pop() ?? { tagName: '', inLiteral: false })
		if (this.onTagClose) this.onTagClose.call(this, this.tagName)
		if ((this.tagName[0] === 'a') && (this.tagName === 'address')) {
			this.lockLiteral = false
		}
		if (this.inLiteral && this.inlineElements.includes(this.tagName)) {
			if (this.literalElements.includes(this.tagName)) {
				this.literalTarget(targetIndex)
			}
			this.literalParts = this.literalPartStack.pop() as string[]
			this.literalParts.push(this.target + this.source.substring(this.start, this.index))
			this.start      = this.index
			this.target     = this.targetStack.pop() + '$' + this.literalParts.length
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

	embedHtmlResponse(htmlResponse: HtmlResponse)
	{
		for (let dependency of htmlResponse.dependencies) {
			if (dependency[0] === '<') {
				const script = dependency.match(/<script[^>]*\bsrc=["']([^"']+)["']/i)?.[1]
				if (script) {
					frontScripts.insert(script)
				}
				this.headLinks.insert(dependency)
				continue
			}
			dependency = normalize(dependency).slice(appDir.length)
			switch (dependency.slice(dependency.lastIndexOf('.') + 1)) {
				case 'css':
					this.headLinks.insert('<link href="' + dependency + '" rel="stylesheet">')
					continue
				case 'js':
					frontScripts.insert(dependency)
					this.headLinks.insert('<script src="' + dependency + '" type="module"></script>')
					continue
			}
		}
	}

	getCleanContext()
	{
		const addLinks     = new SortedArray<string>
		const doneLinks    = new SortedArray<string>
		const headLinks    = new SortedArray<string>
		addLinks.distinct  = true
		doneLinks.distinct = true
		headLinks.distinct = true
		return {
			addLinks:         addLinks,
			doHeadLinks:      false,
			doneLinks:        doneLinks,
			headLinks:        headLinks,
			index:            this.length,
			inLiteral:        this.doLiteral,
			length:           this.source.length,
			literalPartStack: [],
			literalParts:     [],
			source:           this.source,
			start:            this.length,
			target:           this.target,
			targetStack:      []
		}
	}

	getPosition()
	{
		return { index: this.index, start: this.start, target: this.target }
	}

	getContext()
	{
		return {
			addLinks:         this.addLinks,
			doHeadLinks:      this.doHeadLinks,
			doneLinks:        this.doneLinks,
			headLinks:        this.headLinks,
			index:            this.index,
			inLiteral:        this.inLiteral,
			length:           this.length,
			literalParts:     this.literalParts,
			literalPartStack: this.literalPartStack,
			source:           this.source,
			start:            this.start,
			target:           this.target,
			targetStack:      this.targetStack,
		}
	}

	async include(path: string, data: any)
	{
		const template = new (Object.getPrototypeOf(this).constructor)(data, this.blockStack[0]?.data) as Template

		template.doExpression = this.doExpression
		template.doHeadLinks  = true
		template.doLiteral    = this.doLiteral
		template.doneLinks    = this.headLinks
		template.included     = true
		template.onAttribute  = this.onAttribute
		template.onTagClose   = this.onTagClose
		template.onTagOpen    = this.onTagOpen
		template.onTagOpened  = this.onTagOpened
		template.parsers      = this.parsers

		const parsed = await template.parseFile(
			((path[0] === sep) || (path[1] === ':'))
				? path
				: (this.filePath + sep + path)
		)

		if (!this.doHeadLinks) {
			this.addLinks.push(...template.headLinks)
			this.headTitle = template.headTitle
		}
		this.headLinks.push(...template.headLinks)

		const beginPosition = parsed.indexOf('<!--BEGIN-->')
		const endPosition   = parsed.indexOf('<!--END-->')
		if ((beginPosition === -1) && (parsed[1] === '!') && parsed.startsWith('<!DOCTYPE html>')) {
			if (this.targetReplace === '') {
				this.targetReplace = parsed
			}
			return ''
		}
		return (beginPosition > -1)
			? parsed.slice(beginPosition + 12, (endPosition > -1) ? endPosition : parsed.length)
			: parsed
	}

	includePath(filePath: string)
	{
		return (filePath[0] === '/')
			? (appDir + ((filePath[1] === '@') ? '/node_modules' : '') + filePath)
			: filePath
	}

	isContextClean()
	{
		const clean   = this.getCleanContext()
		const context = this.getContext()
		return context.doHeadLinks           === clean.doHeadLinks
			&& context.addLinks.distinct       === clean.addLinks.distinct
			&& context.addLinks.length         === clean.addLinks.length
			&& context.doneLinks.distinct      === clean.doneLinks.distinct
			&& context.doneLinks.length        === clean.doneLinks.length
			&& context.headLinks.distinct      === clean.headLinks.distinct
			&& context.headLinks.length        === clean.headLinks.length
			&& context.index                   === clean.index
			&& context.inLiteral               === clean.inLiteral
			&& context.literalPartStack.length === clean.literalPartStack.length
			&& context.literalParts.length     === clean.literalParts.length
			&& context.length                  === clean.length
			&& context.start                   === clean.start
			&& context.targetStack.length      === clean.targetStack.length
	}

	literalTarget(index: number, isTitle = false)
	{
		let combined: string
		if (this.literalParts.length) {
			this.target      += this.source.substring(this.start, index)
			combined          = this.combineLiterals(this.target, this.literalParts)
			this.target       = (this.targetStack.pop() ?? '') + combined
			this.literalParts = []
		}
		else {
			combined     = this.combineLiterals(this.source.substring(this.start, index))
			this.target += combined
		}
		if (isTitle && this.doHeadLinks) {
			this.headTitle = combined
		}
		this.start = index
	}

	async parseBuffer(buffer: string)
	{
		this.prefixes = this.parsers.map(([prefix]) => prefix).join('')
		this.setSource(buffer)
		await this.parseVars()
		if (this.doHeadLinks) {
			return this.target
		}
		if (this.addLinks.length) {
			const position = this.target.lastIndexOf('>', this.target.indexOf('</head>')) + 1
			this.target = this.target.slice(0, position) + '\n\t' + this.addLinks.join('\n\t') + this.target.slice(position)
		}
		if (this.headTitle && !this.included) {
			const position = this.target.indexOf('>', this.target.indexOf('<title') + 6) + 1
			this.target    = this.target.slice(0, position)
				+ this.headTitle
				+ this.target.slice(this.target.indexOf('</title>', position))
		}
		return (this.targetReplace !== '') ? this.targetReplace : this.target
	}

	async parseExpression(data: any, open: Open | '<', close: Close, finalClose: Final = '')
	{
		const indexOut = this.index

		if (this.inLiteral && !this.literalParts.length) {
			this.targetStack.push(this.target)
			this.target = ''
		}

		if (open === '<') {
			this.index += 3
			open = '{'
		}

		this.index ++
		const firstChar = this.source[this.index]
		if ((this.index >= this.length) || !this.startsExpression(firstChar, open, close)) {
			return
		}

		let   conditional = (firstChar === '?')
		const finalChar   = finalClose.length ? finalClose[0] : ''
		let   stackPos    = this.targetStack.length
		if (conditional) {
			this.index ++
		}
		this.targetStack.push(this.target + this.source.substring(this.start, indexOut))
		this.start  = this.index
		this.target = ''

		while (this.index < this.length) {
			const char = this.source[this.index]

			if (char === open) {
				this.targetStack.push(this.target + this.source.substring(this.start, this.index))
				this.index  ++
				this.start  = this.index
				this.target = ''
				continue
			}

			if (
				(char === close)
				|| ((char === finalChar) && (this.source.substring(this.index, this.index + finalClose.length) === finalClose))
			) {
				let minus = 0
				if (this.source[this.index - 1] === '?') {
					conditional = true
					minus       = 1
				}
				const expression = this.target + this.source.substring(this.start, this.index - minus)
				const lastTarget = this.targetStack.pop() as string
				const parsed     = await this.parsePath(expression, data)
				this.index      += (char === close) ? 1 : finalClose.length
				this.start       = this.index
				this.target      = ''
				if (char === finalChar) while (this.targetStack.length > stackPos) {
					this.target += this.targetStack.shift()
				}
				if (this.inLiteral && (this.targetStack.length === stackPos)) {
					this.literalParts.push(parsed)
					this.target += lastTarget + '$' + this.literalParts.length
					return conditional
				}
				if (lastTarget.length || this.target.length) {
					this.target += lastTarget + parsed
				}
				else {
					this.target = parsed
				}
				if (this.targetStack.length !== stackPos) {
					continue
				}
				if (conditional && !parsed) {
					if ((typeof this.target)[0] === 's') {
						this.target = this.target.substring(0, this.target.lastIndexOf(' '))
						while ((this.index < this.length) && !' >\n\r\t\f'.includes(this.source[this.index])) {
							this.index ++
							this.start ++
						}
						this.index --
					}
					return conditional
				}
				return conditional
			}

			if ((char === '"') || (char === "'")) {
				this.index ++
				let c: string
				while ((this.index < this.length) && ((c = this.source[this.index]) !== char)) {
					if (c === '\\') this.index ++
					this.index ++
				}
			}

			this.index ++
		}
		// bad close
		stackPos ++
		while (this.targetStack.length > stackPos) {
			this.target = this.targetStack.pop() + open + this.target
		}
		this.target = this.targetStack.pop() + (finalClose.length ? '<!--' : open) + this.target
		return conditional
	}

	async parseFile(fileName: string, containerFileName?: string): Promise<string>
	{
		if (containerFileName && !this.included) {
			const data = this.data
			this.data  = Object.assign({ content: () => this.include(fileName, data) }, this.blockStack[0]?.data)
			return this.parseFile(normalize(containerFileName))
		}
		this.fileName = fileName.substring(fileName.lastIndexOf(sep) + 1)
		this.filePath = fileName.substring(0, fileName.lastIndexOf(sep))
		return this.parseBuffer(await readFile(fileName, 'utf-8'))
	}

	async parsePath(expression: string, data: any): Promise<any>
	{
		if (expression === '') {
			return undefined
		}
		if (
			((expression[0] === '.') && ((expression[1] === '/') || ((expression[1] === '.') && (expression[2] === '/'))))
			|| (expression[0] === '/')
		) {
			let expressionEnd = expression.length - 1
			if (expression[expressionEnd] === '-') {
				let blockBack = 1
				expressionEnd --
				while (expression[expressionEnd] === '-') {
					blockBack ++
					expressionEnd --
				}
				const blockStack = this.blockStack
				return this.include(
					this.includePath(expression.slice(0, expressionEnd)),
					blockStack[blockStack.length - blockBack].data
				)
			}
			if (expression[expressionEnd] === ')') {
				const openPosition = expression.lastIndexOf('(')
				return this.include(
					this.includePath(expression.slice(0, openPosition)),
					await this.parsePath(expression.slice(openPosition + 1, expression.length - 1), data)
				)
			}
			return this.include(this.includePath(expression), data)
		}
		let onlyDots = true
		for (const c of expression) {
			if (c === '.') continue
			onlyDots = false
			break
		}
		if (onlyDots) {
			if (expression.length <= 1) {
				return (((typeof data)[0] === 'f') && ((data + '')[0] !== 'c'))
					? data.call()
					: data
			}
			expression = expression.slice(2)
		}
		this.blockBack = 0
		for (const variable of expression.split('.')) {
			data = await this.parseVariable(variable, data)
		}
		if (data instanceof HtmlResponse) {
			this.embedHtmlResponse(data)
		}
		return data
	}

	async parseVariable(variable: string, data: any)
	{
		if (variable === '') {
			let dataBack: BlockStackEntry
			do {
				this.blockBack ++
				dataBack = this.blockStack[this.blockStack.length - this.blockBack]
			}
			while (dataBack.condition)
			return dataBack.data
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
		for (const [prefix, callback] of this.parsers) {
			if (firstChar === prefix) {
				return await callback(variable, data)
			}
		}
		if (data[variable] === undefined) {
			data = new Str(await depends.toString(data))
		}
		let value = data[variable]
		return (((typeof value)[0] === 'f') && ((value + '')[0] !== 'c'))
			? value.call(data)
			: value
	}

	async parseVars()
	{
		let blockStart = 0
		let data       = this.data
		let inHead     = false
		let iteration  : IteratorResult<any> | { done: boolean, value?: any } = done
		let iterator   : Iterator<any> | undefined

		while (this.index < this.length) {
			let char = this.source[this.index]

			// expression
			if ((char === '{') && this.doExpression) {
				await this.parseExpression(data, char, '}')
				continue
			}

			// tag ?
			if (char !== '<') {
				this.index ++
				continue
			}

			const tagIndex = this.index
			char = this.source[++this.index]
			if (char === '!') {
				if (this.inLiteral) {
					this.literalTarget(tagIndex)
				}
				char = this.source[++this.index]
				this.index ++

				// comment tag
				if ((char === '-') && (this.source[this.index] === '-')) {
					this.index ++
					const firstChar = this.source[this.index]
					if (
						!this.doExpression
						|| !this.startsExpression(firstChar)
						|| (
							(firstChar === 'B')
							&& this.included
							&& (this.source.substring(this.index, this.index + 8) === 'BEGIN-->')
						)
						|| (
							(firstChar === 'E')
							&& this.included
							&& (this.source.substring(this.index, this.index + 6) === 'END-->')
						)
					) {
						this.index = this.source.indexOf('-->', this.index) + 3
						if (this.index === 2) break
						if (this.inLiteral && (this.index > this.start)) {
							this.sourceToTarget()
						}
						continue
					}

					// end condition / loop block
					if ((firstChar === 'e') && (this.source.substring(this.index, this.index + 6) === 'end-->')) {
						this.target += this.trimEndLine(this.source.substring(this.start, tagIndex))
						iteration = iterator?.next() ?? done
						if (!iteration.done) {
							data       = iteration.value
							this.index = this.start = blockStart
							if (this.inLiteral && (this.index > this.start)) {
								this.sourceToTarget()
							}
							continue
						}
						({ blockStart, data, iteration, iterator } = this.blockStack.pop()
							?? { blockStart: 0, data: undefined, iteration: done })
						this.index += 6
						this.start  = this.index
						if (this.inLiteral && (this.index > this.start)) {
							this.sourceToTarget()
						}
						continue
					}

					// begin condition / loop block
					if (tagIndex > this.start) {
						this.target += this.trimEndLine(this.source.substring(this.start, tagIndex))
						this.start   = tagIndex
					}
					const backTarget    = this.target
					const backInLiteral = this.inLiteral
					this.index          = tagIndex
					this.target         = ''
					this.inLiteral      = false
					const condition     = await this.parseExpression(data, '<', '}', '-->')
					this.blockStack.push({ blockStart, condition, data, iteration, iterator })
					let blockData  = condition ? (this.target ? data : undefined) : this.target
					blockStart     = this.index
					this.target    = backTarget
					this.inLiteral = backInLiteral
					if (blockData && blockData[Symbol.iterator]) {
						iterator  = blockData[Symbol.iterator]()
						iteration = iterator?.next() ?? done
						data      = iteration.value
					}
					else {
						data      = blockData
						iteration = { done: !data, value: data }
						iterator  = undefined
					}
					if (iteration.done) {
						this.skipBlock()
						continue
					}
					if (this.inLiteral && (this.index > this.start)) {
						this.sourceToTarget()
					}
					continue
				}

				// cdata section
				if ((char === '[') && (this.source.substring(this.index, this.index + 6) === 'CDATA[')) {
					this.index = this.source.indexOf(']]>', this.index + 6) + 3
					if (this.index === 2) break
				}

				// DOCTYPE
				else {
					this.index = this.source.indexOf('>', this.index) + 1
				}

				if (this.inLiteral) {
					this.sourceToTarget()
				}
				continue
			}

			// tag close
			if (char === '/') {
				this.index ++
				const closeTagName = this.source.substring(this.index, this.source.indexOf('>', this.index))
				this.index += closeTagName.length + 1
				if (inHead && (closeTagName[0] === 'h') && (closeTagName === 'head')) {
					inHead = false
				}
				let shouldInLiteral = this.inLiteral
				if (!this.unclosingTags.includes(closeTagName)) {
					do {
						shouldInLiteral = this.closeTag(shouldInLiteral, tagIndex)
					}
					while ((this.tagName !== closeTagName) && this.tagName.length)
				}
				if (shouldInLiteral) {
					this.lockLiteral = false
					this.literalTarget(tagIndex, (this.tagName[0] === 't') && (this.tagName === 'title'))
				}
				if (this.inLiteral && (this.index > this.start)) {
					this.sourceToTarget()
				}
				continue
			}

			// tag open
			while ((this.index < this.length) && !' >\n\r\t\f'.includes(this.source[this.index])) this.index ++
			this.tagName = this.source.substring(tagIndex + 1, this.index)
			if (this.onTagOpen) this.onTagOpen.call(this, this.tagName)
			while (' \n\r\t\f'.includes(this.source[this.index])) this.index ++
			char = this.tagName[0]
			if ((char === 'h') && (this.tagName === 'head')) {
				inHead = true
			}

			const unclosingTag = this.unclosingTags.includes(this.tagName)
			if (!unclosingTag) {
				this.tagStack.push({ tagName: this.tagName, inLiteral: this.inLiteral })
			}
			let inlineElement = false
			let pushedParts   = false
			if (this.inLiteral) {
				inlineElement = this.inlineElements.includes(this.tagName)
				if (inlineElement) {
					if (this.literalParts.length) {
						this.targetStack.push(this.target + this.source.substring(this.start, tagIndex))
					}
					else {
						this.targetStack.push(this.target, this.source.substring(this.start, tagIndex))
					}
					this.start  = tagIndex
					this.target = ''
					if (!unclosingTag) {
						this.literalPartStack.push(this.literalParts)
						this.literalParts = []
						pushedParts       = true
					}
				}
				else {
					this.literalTarget(tagIndex)
				}
			}
			const elementInLiteral = this.inLiteral

			// attributes
			let   hasTypeSubmit  = false
			const inInput        = (char === 'i') && (this.tagName === 'input')
			const inLink         = (char === 'l') && (this.tagName === 'link')
			const inScript       = (char === 's') && (this.tagName === 'script')
			let   targetTagIndex = -1
			if (inHead && (inLink || inScript)) {
				this.sourceToTarget()
				targetTagIndex = this.target.lastIndexOf('<')
			}
			while (this.source[this.index] !== '>') {

				// attribute name
				const attributePosition = this.index
				while ((this.index < this.length) && !' =>\n\r\t\f'.includes(this.source[this.index])) this.index ++
				const attributeName = this.source.substring(attributePosition, this.index)
				while (' \n\r\t\f'.includes(this.source[this.index])) this.index ++
				let attributeBlock = (attributeName[0] === 'd') && (attributeName === 'data-if') ? '' : undefined

				// attribute value
				if (this.source[this.index] === '=') {
					this.index ++
					while (' \n\r\t\f'.includes(this.source[this.index])) this.index ++
					const attributeChar = attributeName[0]
					const [open, close]: [Open, Close] = (
						'afhls'.includes(attributeChar)
						&& ['action', 'formaction', 'href', 'location', 'src'].includes(attributeName)
					) ? ['(', ')']
						: ['{', '}']
					let quote = this.source[this.index]
					if ((quote === '"') || (quote === "'")) {
						this.index ++
					}
					else {
						quote = ' >'
					}
					if ((open === '(') && (this.source.substring(this.index, this.index + 6) === 'app://')) {
						this.sourceToTarget()
						this.index += 6
						this.start  = this.index
					}

					this.inLiteral = this.doLiteral && (
						this.literalAttributes.includes(attributeName)
						|| (hasTypeSubmit && (attributeChar === 'v') && (attributeName === 'value'))
					)
					if (this.inLiteral && !pushedParts && unclosingTag && this.literalParts.length) {
						this.literalPartStack.push(this.literalParts)
						this.literalParts = []
						pushedParts       = true
					}

					const inLinkHRef  = inLink   && (attributeChar === 'h') && (attributeName === 'href')
					const inScriptSrc = inScript && (attributeChar === 's') && (attributeName === 'src')
					if ((inLinkHRef || inScriptSrc || this.inLiteral) && (this.index > this.start)) {
						this.sourceToTarget()
					}

					const valuePosition = this.index
					const shortQuote    = !(quote.length - 1)
					if (shortQuote && (attributeBlock !== undefined)) {
						attributeBlock = this.target + this.source.substring(this.start, attributePosition)
						this.start     = this.index
						this.target    = ''
					}
					while (this.index < this.length) {
						const char = this.source[this.index]
						// end of attribute value
						if (shortQuote ? (char === quote) : quote.includes(char)) {
							const attributeValue = this.source.substring(valuePosition, this.index)
							if (inInput && !hasTypeSubmit) {
								hasTypeSubmit = (attributeChar === 't') && (attributeValue[0] === 's')
									&& (attributeName === 'type') && (attributeValue === 'submit')
							}
							if (this.inLiteral) {
								this.literalTarget(this.index)
							}
							if (inLinkHRef && attributeValue.endsWith('.css')) {
								let frontStyle = normalize(this.filePath + sep + this.source.substring(this.start, this.index))
									.substring(appDir.length)
								if (sep !== '/') {
									frontStyle = frontStyle.replaceAll(sep, '/')
								}
								this.target += frontStyle
								this.start = this.index
							}
							if (inScriptSrc && attributeValue.endsWith('.js')) {
								let frontScript = normalize(this.filePath + sep + this.source.substring(this.start, this.index))
									.substring(appDir.length)
								if (sep !== '/') {
									frontScript = frontScript.replaceAll(sep, '/')
								}
								frontScripts.insert(frontScript)
								this.target += frontScript
								this.start   = this.index
							}
							if (this.onAttribute) this.onAttribute(attributeName, attributeValue)
							if (char !== '>') this.index ++
							break
						}
						// expression in attribute value
						if ((char === open) && this.doExpression) {
							await this.parseExpression(data, open, close)
							continue
						}
						this.index ++
					}
				}
				else {
					if (this.onAttribute) this.onAttribute(attributeName, '')
					if ((attributeName[0] === 'd') && (attributeName === 'data-end')) {
						this.index = attributePosition
						this.sourceToTarget()
						this.index += attributeName.length
						this.start  = this.index
					}
				}

				// next attribute
				while (' \n\r\t\f'.includes(this.source[this.index])) this.index ++

				if (attributeBlock !== undefined) {
					if (!this.target) {
						this.index = this.source.indexOf('data-end', this.index) + 8
						if (this.index < 8) {
							throw 'Missing data-end matching data-if at position ' + attributePosition
							+ ' into template file ' + this.filePath + sep + this.fileName
						}
					}
					this.start  = this.index
					this.target = attributeBlock
				}
			}

			this.index ++
			if (this.onTagOpened) this.onTagOpened.call(this, this.tagName)

			// skip script content
			if (inScript) {
				if (this.onTagClose) this.onTagClose.call(this, 'script')
				this.index = this.source.indexOf('</script>', this.index) + 9
				if (this.index === 8) break
				if (this.inLiteral && (this.index > this.start)) {
					this.sourceToTarget()
				}
			}

			if (targetTagIndex > -1) {
				this.sourceToTarget()
				const headLink = this.target.substring(targetTagIndex)
				this.headLinks.insert(headLink)
			}

			if (inScript) {
				continue
			}

			if (unclosingTag) {
				if (pushedParts) {
					this.literalParts = this.literalPartStack.pop() as string[]
				}
				this.inLiteral = elementInLiteral
				if (this.onTagClose) this.onTagClose.call(this, this.tagName)
				if (this.inLiteral) {
					if (this.index > this.start) {
						this.sourceToTarget()
					}
					if (inlineElement) {
						this.literalParts.push(this.target)
						this.target = this.targetStack.pop() + '$' + this.literalParts.length
					}
				}
			}
			else {
				this.lockLiteral ||= (this.tagName[0] === 'a') && (this.tagName === 'address')
				this.inLiteral     = this.doLiteral && !this.lockLiteral && this.literalElements.includes(this.tagName)
				if (this.inLiteral && (this.index > this.start)) {
					this.sourceToTarget()
				}
			}
		}
		if (this.tagStack.length) {
			let shouldInLiteral = this.inLiteral
			while (this.tagStack.length) {
				shouldInLiteral = this.closeTag(shouldInLiteral, this.length)
			}
			if (shouldInLiteral) {
				this.literalTarget(this.length)
			}
			return this.target
		}
		if (this.inLiteral) {
			this.literalTarget(this.index)
		}
		if (this.start < this.length) {
			this.target += this.source.substring(this.start)
			this.start   = this.length
		}
		return this.target
	}

	setSource(source: string, index = 0, start?: number, target = '')
	{
		this.index    = index
		this.length   = source.length
		this.source   = source
		this.start    = start ?? index
		this.tagName  = ''
		this.tagStack = []
		this.target   = target

		this.inLiteral        = this.doLiteral
		this.literalPartStack = []
		this.literalParts     = []
		this.lockLiteral      = false
		this.targetStack      = []
	}

	skipBlock()
	{
		if (this.index > this.start) {
			this.sourceToTarget()
		}
		let depth = 1
		while (depth) {
			this.index = this.source.indexOf('<!--', this.index)
			if (this.index < 0) {
				break
			}
			this.index += 4
			const char = this.source[this.index]
			if (!this.startsExpression(char)) {
				continue
			}
			if ((char === 'e') && (this.source.substring(this.index, this.index + 6) === 'end-->')) {
				depth --
				continue
			}
			depth ++
		}
		this.index -= 4
		if (this.index < 0) {
			this.index = this.length
		}
		this.start = this.index
	}

	sourceToTarget()
	{
		this.target += this.source.substring(this.start, this.index)
		this.start   = this.index
	}

	startsExpression(char: string, open: Open = '{', close: Close = '}')
	{
		return RegExp(`[a-z0-9"'*./?` + open + close + this.prefixes + ']', 'i').test(char)
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
