const assert = require('node:assert/strict')
const { describe, it } = require('node:test')
const { Template } = require('../cjs/template')

describe('parseVariable', () => {
	const template = new Template(undefined, 'data')

	it('empty', async () => {
		assert.deepEqual(await template.parseVariable('', 'data'), 'data')
	})
	it('method', async () => {
		assert.deepEqual(await template.parseVariable('name', { name: () => 'value' }), 'value')
	})
	it('property', async () => {
		assert.deepEqual(await template.parseVariable('name', { name: 'value' }), 'value')
		assert.deepEqual(await template.parseVariable('unknown', { name: 'value' }), undefined)
	})
	it('quoted', async () => {
		assert.deepEqual(await template.parseVariable('"name"', { name: 'value' }), 'name')
	})
})
