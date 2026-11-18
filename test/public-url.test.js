const { appDir } = require('@itrocks/app-dir')
const assert = require('node:assert/strict')
const { mkdir, mkdtemp, rm, writeFile } = require('node:fs/promises')
const { join } = require('node:path')
const { it } = require('node:test')
const { frontScripts, HtmlResponse, Template } = require('../cjs/template')

function mounted(data)
{
	const template = new Template(data)
	template.applicationPath = path => path.startsWith('/site/') ? path.slice(5) : path
	template.urlAttributes.push('data-fetch', 'data-route')
	template.publicUrl = path => path.startsWith('/') && !path.startsWith('//') && !path.startsWith('/site/')
		? '/site' + path : path
	return template
}

it('applies the public URL callback to parsed URL attributes and expressions only', async () => {
	const source = '<html><head><base href="/"></head><body>'
		+ '<a href="app://(link)">Go</a><form action="/save" data-route="/movie">'
		+ '<input data-fetch="/person/json" value="/unchanged"><button formaction="/other">Save</button></form>'
		+ '<a href="//external.example/path">External</a><a href="#anchor">Anchor</a>'
		+ '<script>const path = "/unchanged"</script><img src="/site/icon.png"></body></html>'
	const html = await mounted({ link: '/movie?sort=title' }).parseBuffer(source)
	assert.match(html, /href="\/site\/"/)
	assert.match(html, /href="\/site\/movie\?sort=title"/)
	assert.match(html, /action="\/site\/save" data-route="\/site\/movie"/)
	assert.match(html, /data-fetch="\/site\/person\/json" value="\/unchanged"/)
	assert.match(html, /formaction="\/site\/other"/)
	assert.match(html, /href="\/\/external.example\/path"/)
	assert.match(html, /href="#anchor"/)
	assert.match(html, /const path = "\/unchanged"/)
	assert.match(html, /src="\/site\/icon.png"/)
	assert.equal(await new Template({ link: '/movie' }).parseBuffer('<a href="app://(link)">Go</a>'),
		'<a href="/movie">Go</a>')
})

it('shares the callback with includes and keeps discovered scripts independent of the mount', async () => {
	await mkdir(join(appDir, 'tmp'), { recursive: true })
	const directory = await mkdtemp(join(appDir, 'tmp/template-public-url-'))
	const script = '/@itrocks/example/entry.js'
	try {
		await writeFile(join(directory, 'child.html'), '<html><head>'
			+ `<script src="${script}" type="module"></script>`
			+ '</head><body><!--BEGIN--><a href="/movie">Movies</a><!--END--></body></html>')
		await writeFile(join(directory, 'parent.html'), '<html><head></head><body>{./child.html}</body></html>')
		const html = await mounted({}).parseFile(join(directory, 'parent.html'))
		assert.match(html, /href="\/site\/movie"/)
		assert.match(html, /src="\/site\/@itrocks\/example\/entry.js"/)
		assert.ok(frontScripts.includes(script))
		assert.ok(!frontScripts.includes('/site' + script))
		const embedded = mounted({ content: new HtmlResponse('content', `<script src="${script}"></script>`) })
		assert.match(await embedded.parseBuffer('<html><head></head><body>{content}</body></html>'),
			/src="\/site\/@itrocks\/example\/entry.js"/)
	}
	finally {
		await rm(directory, { force: true, recursive: true })
	}
})

it('prefixes URLs in generated controls without evaluating or translating their contents again', async () => {
	const template = mounted({
		control: '<input data-fetch="/person/json" value="{untouched}">',
		link: new HtmlResponse('<a href="/movie/1">A movie</a>')
	})
	const html = await template.parseBuffer('<html><body>{control}{link}</body></html>')
	assert.match(html, /data-fetch="\/site\/person\/json" value="\{untouched\}"/)
	assert.match(html, /href="\/site\/movie\/1"/)
})

it('recognises already mounted scripts without registering their public prefix as a filesystem path', async () => {
	const script = '/@itrocks/generated/body.js'
	const template = mounted({ content: new HtmlResponse(`<script src="/site${script}"></script>`) })
	const html = await template.parseBuffer('<html><body>{content}</body></html>')
	assert.match(html, /src="\/site\/@itrocks\/generated\/body.js"><\/script>/)
	assert.ok(frontScripts.includes(script))
	assert.ok(!frontScripts.includes('/site' + script))
})
