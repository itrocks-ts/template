import Template from '../template'

describe('arrays', () => {
	const template = new Template
	it('inlineElements', () => {
		expect(template.inlineElements.isSorted()).toBe(true)
	})
	it('literalAttributes', () => {
		expect(template.literalAttributes.isSorted()).toBe(true)
	})
	it('literalElements', () => {
		expect(template.literalElements.isSorted()).toBe(true)
	})
	it('unclosingTags', () => {
		expect(template.unclosingTags.isSorted()).toBe(true)
	})
})
