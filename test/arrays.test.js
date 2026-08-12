const assert = require('node:assert/strict')
const { describe, it } = require('node:test')
const { Template } = require('../cjs/template')

describe('arrays', () => {
	const template = new Template
	it('inlineElements', () => {
		assert.equal(template.inlineElements.isSorted(), true)
	})
	it('literalAttributes', () => {
		assert.equal(template.literalAttributes.isSorted(), true)
	})
	it('literalElements', () => {
		assert.equal(template.literalElements.isSorted(), true)
	})
	it('unclosingTags', () => {
		assert.equal(template.unclosingTags.isSorted(), true)
	})
})
