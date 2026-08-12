const assert = require('node:assert/strict')
const { describe, it } = require('node:test')
const { Template } = require('../cjs/template')

const template = new Template
template.parseVariable = (variable, data) =>
{
	return (variable === '')
		? data
		: (data[variable] ?? '!')
}

describe('parsePath', () => {
	it('dot', async () => {
		assert.deepEqual(await template.parsePath('.', 'data'), 'data')
	})
	it('empty', async () => {
		assert.deepEqual(await template.parsePath('', 'data'), undefined)
	})
	it('member', async () => {
		assert.deepEqual(await template.parsePath('object.name', { object: { name: 'value' } }), 'value')
	})
	it('variable', async () => {
		assert.deepEqual(await template.parsePath('name', { name: 'value' }), 'value')
	})
})
