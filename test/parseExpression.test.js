const assert = require('node:assert/strict')
const { describe, it } = require('node:test')
const { Template } = require('../cjs/template')

const template     = new Template
template.doLiteral = false
template.parsePath = async (expression) => ({

	'.': 'dot',

	againValueThing: 'foo',
	array:           ['one', 'two'],
	fooRecursion:    'bar',
	Name:            'Value',
	name:            'value',
	object:          { test: 1 },
	value:           'valuable',
	valueRecursion:  'result',

	"'simple'":                 'simple',
	'"simple"':                 'simple',
	'"escaped}".toUpperCase':   'ESCAPED}',
	"'escaped}'.toUpperCase":   'ESCAPED}',
	'"escaped)".toUpperCase':   'ESCAPED)',
	"'escaped)'.toUpperCase":   'ESCAPED)',
	"'escape\\'d'.toUpperCase": "ESCAPE'D",
	'"escape\\"d".toUpperCase': 'ESCAPE"D'

}[expression])

const parseExpression = async (expression, close, finalClose = '') => {
	template.setSource(expression)
	const open = expression.startsWith('<!--') ? '<' : expression[0]
	await template.parseExpression(undefined, open, close, finalClose)
	return template.getPosition()
}

describe('bad', () => {
	it('close', async () => {
		assert.deepEqual(await parseExpression('<!--{{name-->', '}', '-->'), { index: 13, start: 13, target: 'value' })
		assert.deepEqual(await parseExpression('<!--no{real{name-->', '}', '-->'), { index: 19, start: 19, target: 'norealvalue' })
		assert.deepEqual(await parseExpression('<!--no{real{name{deep-->', '}', '-->'), { index: 24, start: 24, target: 'norealnameundefined' })
	})
	it('end', async () => {
		assert.deepEqual(await parseExpression('{name', '}'), { index: 5, start: 1, target: '{' })
		assert.deepEqual(await parseExpression('(name', ')'), { index: 5, start: 1, target: '(' })
		assert.deepEqual(await parseExpression('<!--name', '}', '-->'), { index: 8, start: 4, target: '<!--' })
	})
	it('endRecurse', async () => {
		assert.deepEqual(await parseExpression('{no{name', '}'), { index: 8, start: 4, target: '{no{' })
		assert.deepEqual(await parseExpression('(no(name', ')'), { index: 8, start: 4, target: '(no(' })
		assert.deepEqual(await parseExpression('<!--no{name', '}', '-->'), { index: 11, start: 7, target: '<!--no{' })
		assert.deepEqual(await parseExpression('<!--no{ka{name', '}', '-->'), { index: 14, start: 10, target: '<!--no{ka{' })
		assert.deepEqual(await parseExpression('<!--no{ka{name{deep', '}', '-->'), { index: 19, start: 15, target: '<!--no{ka{name{' })
		assert.deepEqual(await parseExpression('<!--no{ka-{name}', '}', '-->'), { index: 16, start: 16, target: '<!--no{ka-value' })
	})
})

describe('condition', () => {
	it('array', async () => {
		assert.deepEqual(await parseExpression('<!--array-->', '}', '-->'), { index: 12, start: 12, target: ['one', 'two'] })
	})
	it('expression1', async () => {
		assert.deepEqual(await parseExpression('<!--{name}-->', '}', '-->'), { index: 13, start: 13, target: 'valuable' })
	})
	it('expression2', async () => {
		assert.deepEqual(await parseExpression('<!--{name}Recursion-->', '}', '-->'), { index: 22, start: 22, target: 'result' })
	})
	it('expressionRecurse', async () => {
		assert.deepEqual(await parseExpression('<!--{again{Name}Thing}Recursion-->', '}', '-->'), { index: 34, start: 34, target: 'bar'})
	})
	it('object', async () => {
		assert.deepEqual(await parseExpression('<!--object-->', '}', '-->'), { index: 13, start: 13, target: { test: 1 } })
	})
	it('value', async () => {
		assert.deepEqual(await parseExpression('<!--name-->', '}', '-->'), { index: 11, start: 11, target: 'value' })
	})
})

describe('cross', () => {
	it('braceInParentheses', async () => {
		assert.deepEqual(await parseExpression('({name}Recursion)', ')'), { index: 1, start: 0, target: '' })
	})
	it('parenthesisInBlock', async () => {
		assert.deepEqual(await parseExpression('<!--(name)-->', '}', '-->'), {index: 4, start: 0, target: ''})
	})
	it('parenthesisInBrace', async () => {
		assert.deepEqual(await parseExpression('{(name)Recursion}', '}'), { index: 1, start: 0, target: '' })
	})
})

describe('misc', () => {
	it('targetTransmit', async () => {
		template.setSource('{name} transmit {name}{next}', 16, 12, 'done trans')
		await template.parseExpression({ name: 'value' }, '{', '}')
		assert.deepEqual(template.getPosition(), { index: 22, start: 22, target: 'done transmit value' })
	})
})

describe('quotes', () => {
	it('doubleQuote', async () => {
		assert.deepEqual(await parseExpression('{"simple"}', '}'), { index: 10, start: 10, target: 'simple' })
	})
	it('doubleQuoteEscapesBrace', async () => {
		assert.deepEqual(await parseExpression('{"escaped}".toUpperCase}', '}'), { index: 24, start: 24, target: 'ESCAPED}' })
	})
	it('doubleQuoteEscapesParenthesis', async () => {
		assert.deepEqual(await parseExpression('("escaped)".toUpperCase)', ')'), { index: 24, start: 24, target: 'ESCAPED)' })
	})
	it('escapeDoubleQuote', async () => {
		assert.deepEqual(await parseExpression('("escape\\"d".toUpperCase)', ')'), { index: 25, start: 25, target: 'ESCAPE"D' })
	})
	it('escapeSingleQuote', async () => {
		assert.deepEqual(await parseExpression("('escape\\'d'.toUpperCase)", ')'), { index: 25, start: 25, target: "ESCAPE'D" })
	})
	it('singleQuote', async () => {
		assert.deepEqual(await parseExpression("{'simple'}", '}'), { index: 10, start: 10, target: 'simple' })
	})
	it('singleQuoteEscapesBrace', async () => {
		assert.deepEqual(await parseExpression("{'escaped}'.toUpperCase}", '}'), { index: 24, start: 24, target: 'ESCAPED}' })
	})
	it('singleQuoteEscapesParenthesis', async () => {
		assert.deepEqual(await parseExpression("('escaped)'.toUpperCase)", ')'), { index: 24, start: 24, target: 'ESCAPED)' })
	})
})

describe('recurse', () => {
	it('braces', async () => {
		assert.deepEqual(await parseExpression('{{name}Recursion}', '}'), { index: 17, start: 17, target: 'result' })
	})
	it('parentheses', async () => {
		assert.deepEqual(await parseExpression('((name)Recursion)', ')'), { index: 17, start: 17, target: 'result' })
	})
})

describe('script', () => {
	it('ignore', async () => {
		assert.deepEqual(await parseExpression('{ name }', '}'), {index: 1, start: 0, target: '' })
	})
})

describe('short', () => {
	it('dot', async () => {
		assert.deepEqual(await parseExpression('{.}', '}'), { index: 3, start: 3, target: 'dot' })
	})
	it('empty', async () => {
		assert.deepEqual(await parseExpression('{}', '}'), { index: 2, start: 2, target: undefined })
	})
})

describe('stop', () => {
	it('block', async () => {
		assert.deepEqual(await parseExpression('<!--name--> continuation', '}', '-->'), { index: 11, start: 11, target: 'value' })
	})
	it('expression', async () => {
		assert.deepEqual(await parseExpression('{name} continuation', '}'), { index: 6, start: 6, target: 'value' })
	})
})

describe('value', () => {
	it('array', async () => {
		assert.deepEqual(await parseExpression('{array}', '}', '}'), { index: 7, start: 7, target: ['one', 'two'] })
	})
	it('object', async () => {
		assert.deepEqual(await parseExpression('{object}', '}', '}'), { index: 8, start: 8, target: { test: 1 } })
	})
	it('string', async () => {
		assert.deepEqual(await parseExpression('{name}', '}'), { index: 6, start: 6, target: 'value' })
		assert.deepEqual(await parseExpression('(name)', ')'), { index: 6, start: 6, target: 'value' })
	})
})
