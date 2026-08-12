const assert = require('node:assert/strict')
const { describe, it } = require('node:test')
const { Template } = require('../cjs/template')

describe('parseVars', () => {
	const template = new Template({
		id1:     1,
		numLoop: [1, 2],
		one:     'found'
	})
	template.doLiteral = false

	it('conditionFalse', async () => {
		template.setSource('<article data-id="{?id0}" data-another="{one}"></article>')
		assert.deepEqual(await template.parseVars(), '<article data-another="found"></article>')
	})
	it('conditionTrue', async () => {
		template.setSource('<article data-id="{?id1}" data-another="{one}"></article>')
		assert.deepEqual(await template.parseVars(), '<article data-id="1" data-another="found"></article>')
	})
	it('empty', async () => {
		template.setSource('')
		assert.deepEqual(await template.parseVars(), '')
	})
	it('numLoop', async () => {
		template.setSource(`
			<ul>
				<!--numLoop-->
				<li>Hello{.}</li>
				<!--end-->
			</ul>
		`)
		assert.deepEqual(await template.parseVars(), `
			<ul>
				<li>Hello1</li>
				<li>Hello2</li>
			</ul>
		`)
	})
})
