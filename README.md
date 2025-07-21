[![npm version](https://img.shields.io/npm/v/@itrocks/template?logo=npm)](https://www.npmjs.org/package/@itrocks/template)
[![npm downloads](https://img.shields.io/npm/dm/@itrocks/template)](https://www.npmjs.org/package/@itrocks/template)
[![GitHub](https://img.shields.io/github/last-commit/itrocks-ts/template?color=2dba4e&label=commit&logo=github)](https://github.com/itrocks-ts/template)
[![issues](https://img.shields.io/github/issues/itrocks-ts/template)](https://github.com/itrocks-ts/template/issues)
[![discord](https://img.shields.io/discord/1314141024020467782?color=7289da&label=discord&logo=discord&logoColor=white)](https://25.re/ditr)

# template

The W3C-valid, browser-previewable, concise, and fast HTML template engine that enables delimiter-less translations.

## Installation

```sh
npm i @itrocks/template
```

## Basic Usage

```ts
import { Template } from '@itrocks/template'

new Template({
	users: [
		{ age: 10, name: 'kid' },
		{ age: 20, name: 'old-timer' }
	]
})
	.parseBuffer(`
		<ul>
			<!--users-->
			<li>{name} is {age} years old</li>
			<!--end-->
		</ul>
	`)
	.then(console.log)
```

Result:
```html
<ul>
	<li>kid is 10 years old</li>
	<li>old-timer is 20 years old</li>
</ul>
```

You can also parse a template file:
```ts
console.log(await new Template(data).parseFile('template.html'))
```

The `template.html` template file will validate W3C and display well in your browser:
```html
<!DOCTYPE HTML>
<html lang="en">
<head><title>Title</title></head>
<body>
<!--BEGIN-->
	<ul>
		<!--users-->
		<li>{name} is {age} years old</li>
		<!--end-->
	</ul>
<!--END-->
</body>
</html>
```

Since the engine supports asynchronous operations (e.g., reading files, calling async functions, resolving async data),
parsing returns a [Promise](https://developer.mozilla.org/docs/Web/JavaScript/Reference/Global_Objects/Promise)
that you should handle with [await](https://developer.mozilla.org/docs/Web/JavaScript/Reference/Operators/await)
or [then](https://developer.mozilla.org/docs/Web/JavaScript/Reference/Global_Objects/Promise/then).

This library is fully compatible with both ECMAScript modules (import) and CommonJS (require),
adapting seamlessly to your project's module system.

## Key features

### W3C Validation-Friendly Templates

Templates are designed to [pass W3C validation](https://validator.w3.org/#validate_by_input),
even when handling complex dynamic data.
This ensures your final HTML is as close as possible to valid, standard-compliant markup.

### Browser-Readable Templates

You can write templates that remain fully readable and functional when opened directly in a browser.
This allows you to validate your layout and scripts before injecting dynamic data.
The dynamic portions are minimally intrusive, ensuring a clean HTML structure that can be tested as-is.

### Minimal Intrusion of Template Markers

The template syntax is designed to be as concise and unobtrusive as possible.
You can often use template delimiters in standard HTML without needing to escape them.
For example:
- Spaces after delimiters are recognized best practices to avoid misinterpretation.
- Exceptions requiring escaping are rare.

### Literal Text Detection for Internationalization (i18n)

The engine can detect literal text content in the HTML without requiring special markers.
This makes it straightforward to integrate translation systems (via external plugins).
You can write your pages in your primary language and apply translations automatically later without losing readability.

### Additional Comparable Features

- Lightweight and fast execution
- Extensible and customizable
- Supports variables, functions, conditions, loops, descending into sub-objects, and includes
- Few dependencies (all [it.rocks](https://npmjs.org/org/itrocks) and extremely light)

## Syntax and Detailed Features

### Delimiters Outside of HTML element tags 

**Simple Expressions**: Use braces `{expression}`.

If a brace is followed by a space or an unrecognized special character, it is not treated as a delimiter.
This allows you to use braces in JavaScript code blocks inside your HTML without escaping.

Example:
```html
<span>{user.name}</span>
```

**Blocks** (Conditions, Loops, Descent): Use HTML comment blocks `<!--expression-->` and `<!--end-->`.
If the opening comment `<!--` is followed by a space or an unrecognized character, it won't be treated as a delimiter.
This allows you to maintain normal comments in your HTML as long as they are spaced, e.g., `<!-- comment -->`.

Example:
```html
<ul>
	<!--users-->
	<li>{name}</li>
	<!--end-->
</ul>
```

### Delimiters Inside attribute values

Use braces `{}` as normal, except in [attributes](https://developer.mozilla.org/docs/Web/HTML/Attributes)
that reference files or URLs where W3C validation forbids braces.
In these cases, use parentheses `()`.

Affected attributes:
[action](https://developer.mozilla.org/docs/Web/HTML/Element/form#action),
[formation](https://developer.mozilla.org/docs/Web/HTML/Element/input#formaction),
[href](https://developer.mozilla.org/docs/Web/HTML/Element/a#href),
and [src](https://developer.mozilla.org/docs/Web/HTML/Element/script#src).

Example:
```html
<a href="app://(link)">Follow the white rabbit</a>
<span data-property="{property.name}">{property.value}</span>
```
Given data:
```ts
{ link: '/exit/the/matrix', property: { name: 'voyager', value: 'Neo' } }
```
Results in:
```html
<a href="/exit/the/matrix">Follow the white rabbit</a>
<span data-property="voyager">Neo</span>
```

**app://** Prefix for Href-like Attributes:

Using `app://` before a dynamic link can prevent IDE-integrated validators from complaining about missing files.
`app://` will be stripped out at runtime.

### Script Tags are Ignored by the Template Engine

Inside `<script>` tags, `{expression}` and `<!--expression-->` are never interpreted.
If you need dynamic data in your script, store it in the DOM or in an attribute.

Example:
```html
<script> console.log('{name}') </script>
```
With data `{ name: 'Nick' }`, the script still logs `{name}`, unchanged:
```html
<script> console.log('{name}') </script>
```

Another example:
```html
<script data-name='{name}'> console.log(document.currentScript.dataset.name) </script>
```
Results with console output `Nick`:
```html
<script data-name='Nick'> console.log(document.currentScript.dataset.name) </script>
```

**Note**: `{expression}` will still be interpreted in attributes that might contain JavaScript code
if not properly spaced.

### Simple Variables

Wrap a property in `{}` to display its value:
```ts
new Template({ var: 15 }).parseBuffer('<span>{var}</span>').then(console.log)
```
Result:
```html
<span>15</span>
```

### Calling Functions

If a context property is a function, it will be called and its return value displayed:
```ts
new Template({ var: () => 15 }).parseBuffer('<span>{var}</span>').then(console.log)
```
Result:
```html
<span>15</span>
```

### Displaying the Current Value

Use `{.}` to reference the current data context:
```ts
new Template(15).parseBuffer('<span>{.}</span>').then(console.log)
```
Result:
```html
<span>15</span>
```

### Conditional Attributes

Prefix the expression with `?` to remove the [attribute](https://developer.mozilla.org/docs/Web/HTML/Attributes)
if the value is [falsy](https://developer.mozilla.org/docs/Glossary/Falsy):
```html
<span style="color:{?color};">{name}</span>
```
With data `{ color: 'red', name: 'Bad cop' }`:
```html
<span style="color:red;">Bad cop</span>
```
With data `{ name: 'Good cop' }` (no color):
```html
<span>Good cop</span>
```

### Conditional Attributes Block

Some attributes can't be evaluated or might break W3C validation if their value contains template syntax
(like braces or question marks).

To handle such cases, you can use the reserved `data-if` and `data-end` attributes
as a **conditional attribute block**.\
These control attributes will **not be rendered**.\
All attributes placed **between** `data-if` and `data-end` will be included in the output
**only if** the `data-if` condition evaluates to a [truthy](https://developer.mozilla.org/docs/Glossary/Truthy) value.

Example:
```html
<form data-if="{hasFileProperty}" enctype="multipart/form-data" method="post" data-end>
```
- `data-if` and `data-end` act as structural markers and are removed from the final output.
- `enctype="multipart/form-data"` and `method="post"` will appear only if the `hasFileProperty` function or property
  of the current context returns `true`.

### Conditional Blocks

End your block expression with `?` to render the block only
if the value is [truthy](https://developer.mozilla.org/docs/Glossary/Truthy):
```html
<span><!--user?-->{user.name} is {user.age} years old<!--end--></span>
```
Result on empty data `{}`:
```html
<span></span>
```
Result on data `{ user: { age: 10, name: 'kid' } }`:
```html
<span>kid is 10 years old</span>
```

### Descending into Objects

You can use dot notation within `{your.expression}`:
```ts
new Template({ user: { age: 10, name: 'kid' } })
	.parseBuffer('<span>{user.name} is {user.age} years old</span>')
	.then(console.log)
```
Or use a block to avoid repeating:
```ts
new Template({ user: { age: 10, name: 'kid' } })
	.parseBuffer('<span><!--user-->{name} is {age} years old<!--end--></span>')
	.then(console.log)
```
Both produce:
```html
<span>kid is 10 years old</span>
```

### Iterating Over Object Values

Use `*` to iterate over all values of an object:
```ts
new Template({ object: { first: 'kid', next: 'old-timer' } })
	.parseBuffer('<ul><!--object.*--><li>{.}<!--end--></ul>')
	.then(console.log)
```
Result:
```html
<ul><li>kid</li><li>old-timer</li></ul>
```

### Iterating Over Arrays

```ts
new Template({ users: ['kid', 'old-timer'] })
	.parseBuffer('<ul><!--users--><li>{.}</li><!--end--></ul>')
	.then(console.log)
```
Result:
```html
<ul><li>kid</li><li>old-timer</li></ul>
```

### Iterating Over Arrays of Objects

```ts
await new Template({
	users: [
		{ age: 10, name: 'kid' },
		{ age: 20, name: 'old-timer' }
	]
})
	.parseBuffer(`
		<ul>
			<!--users-->
			<li>{name} is {age} years old</li>
			<!--end-->
		</ul>
	`)
	.then(console.log)
```
Result:
```html
<ul>
	<li>kid is 10 years old</li>
	<li>old-timer is 20 years old</li>
</ul>
```

### Climbing Back Up the Data Structure

Begin with a dot (`.`) to navigate up one level in the data context:
```ts
new Template({ name: 'Eddie', data: { age: 30, status: 'well' } })
	.parseBuffer(`
		<!--data-->
		<ol>
			<li>name: {.name}</li>
			<li>age: {age}</li>
			<li>status: {status}</li>
		</ol>
		<!--end-->
	`)
	.then(console.log)
```
Result:
```html
<ol><li>name: Eddie</li><li>age: 30</li><li>status: well</li></ol>
```

- To climb multiple levels up, add more dots (`.`).
  Example: `{...name}` moves up three levels before retrieving `name`.
- dots (`.`) used alone indicate how many levels to move up:
  - `{.}` refers to the current context (does not move up).
  - `{..}` moves up one level (parent context).
  - `{...}` moves up two levels.

### Simple Literals

Values in quotes inside `{}` are treated as literals:
```html
<span>This is a {'user'}</span>
```
Result:
```html
<span>This is a user</span>
```

### Built-in Formatting Functions (Str)

If a descendant property or method isn't found on the current data object,
the engine attempts to use the [Str](https://www.npmjs.com/package/@itrocks/rename#str-class) helper object,
which provides string formatting functions. If no matching function is found, an error is thrown.
```ts
new Template({ name: 'EDITH' })
	.parseBuffer('<span>{name.lcFirst}</span>')
	.then(console.log)
```
Result:
```html
<span>eDITH</span>
```

### Including Another Template

Any expression starting with `/`, `./` or `../` is considered a template include:
```html
<div>
	{./another-template.html}
</div>
```

The default contextual data is the one in the current scope.

You can pass parent or sub-data to your included template as an alternative context:
```html
<div>
  <!--subData-->
  {./another-template.html(..)}
  <!--end-->
  {./another-template.html(subData)}
</div>
```
In this example, `..` refers to the parent context. Parentheses are optional in this specific case.

#### Delimiting Rendered Content in an Included Template

To keep templates W3C-compliant and browser-viewable, each HTML template may contain full HTML structure.
When including a template into another, you can specify what portion should be rendered using
`<!--BEGIN-->` and `<!--END-->`.

```html
<!DOCTYPE html>
<html lang="en">
<head><title>Title of the template</title></head>
<body>
<!--BEGIN-->

	<span>Content here</span>

<!--END-->
</body>
</html>
```

### Reserved Words

`BEGIN`, `END`, and `end` are reserved keywords for delimiters and cannot be used as simple expressions or block names.

### Internationalization (i18n)

**@itrocks/template** can parse HTML content to identify literal text, making i18n integration easier.
You can apply translations via a plugin without having to mark texts explicitly.
Composite translations, where certain parts of a phrase are replaced by translated elements or non-literal data,
are supported.

Example of a custom template class that applies translations:
```ts
import { Template } from '@itrocks/template'

const TRANSLATIONS: Record<string, string> = {
	'What is my name': 'Quel est mon nom',
	'My name is $1': 'Mon nom est $1',
	'My $1 is $2': 'Mon $1 est $2',
	'name': 'nom de famile'
}

class MyTemplate extends Template
{
	doLiteral = true

	applyLiterals(text: string, parts: string[] = [])
	{
		return TRANSLATIONS[text].replace(
			/\$([0-9]+)/g,
			(_, index) => TRANSLATIONS[parts[+index]]
		)
	}
}
```

Using this class:
```ts
new MyTemplate({ name: 'Nick' })
	.parseBuffer(`
		<h2>What is my name</h2>
		<p>My name is {name}</p>
	`)
	.then(console.log)
```
Results in:
```html
<h2>Quel est mon nom</h2>
<p>Mon nom est Nick</p>
```

[Inline HTML elements](https://developer.mozilla.org/docs/Web/HTML/Element#inline_text_semantics)
are considered part of the phrase, so their text is also translated:
```ts
new MyTemplate({ name: 'Nick' })
	.parseBuffer(`
		<h2>What is my name</h2>
		<p>My <span>name</span> is {name}</p>
	`)
	.then(console.log)
```
Results in:
```html
<h2>Quel est mon nom</h2>
<p>Mon <span>nom de famille</span> est Nick</p>
```

This approach ensures translations occur without complex template markers,
preserving the natural readability of the original HTML.

## Advanced Features

### Event Hooks

**What are event hooks?**

Event hooks are optional callback functions you can provide to the template engine to monitor and react
to parsing events. They are useful for debugging, logging, or customizing behavior during template processing.

**Available Hooks:**

- **onAttribute(name: string, value: string): void**  
  Called each time the parser reads an attribute.  
  Use this to log attribute parsing, enforce certain naming conventions, or filter attributes dynamically.

- **onTagOpen(name: string): void**  
  Called as soon as a tag is detected (after the `<` but before reading its attributes).  
  Useful for tracking which tags are encountered and in what order.

- **onTagOpened(name: string): void**  
  Called once all attributes of a tag have been processed and the tag is considered "opened."  
  You can use this to finalize any logic that depends on knowing the full set of attributes.

- **onTagClose(name: string): void**  
  Called just before closing a tag.  
  Helpful to validate the structure of your HTML or to capture any final metadata before the tag is completed.

### Custom Variable Parsers

**What are variable parsers?**  

In addition to normal object property access and function calls,
you can define custom parsers to handle variables based on specific prefixes.
This gives you flexibility to extend the template engine to support custom syntaxes, transformations, or data lookups.

**How to define a custom parser:**

A parser is a tuple `[prefix, callback]`, where:
- `prefix` is a single-character string that identifies when your parser should be invoked.
- `callback(variable: string, data: any): any` is the function that transforms the variable name into a value.

For example, you could define a parser that, when it sees a variable starting with `@`,
fetches data from an external API or applies a custom transformation.

**Usage Example:**

```ts
const myParser: VariableParser = [
	'@',
	(variable, data) => {
		const key = variable.substring(1) // remove '@'
		return fetchFromCustomDataSource(key)
	}
]
template.parsers.push(myParser)
```

When the template encounters something like {@userId}, it will call myParser to resolve it.

### Controlling Expression and Literal Processing

#### doExpression (boolean)

By default, the template engine attempts to interpret `{foo}` and `<!--bar-->` blocks as expressions or directives.
If you disable `doExpression`, the engine will treat them as literal text and not attempt to parse them.

- Set `template.doExpression = false` if you only want to read the template as-is without any dynamic substitution.

#### doLiteral (boolean)

When `doLiteral` is set to `true`, the template engine enters a mode that carefully analyzes which parts of the template
are textual literals, making it possible to apply advanced transformations such as translation or other textual
operations without additional markers.

- Set `template.doLiteral = true` if you want the engine to identify literal strings and apply transformations like
  internationalization easily.

### Managing `<link>` and `<script>` Tags from Included Templates

When you include another template inside your main template, you may have resources
(like `<link>` or `<script src="...">` tags) defined in the `<head>` of the included template.
If these tags are placed outside of the `<!--BEGIN-->` and `<!--END-->` markers,
the engine will automatically propagate them to the parent template's `<head>` section.

How it works:

- When you include a template via {./another-template.html}, the engine parses the included file.
- The included file's head resources (`<link>`, `<script>`), if found outside of `<!--BEGIN-->`/`<!--END-->`,
  are added to a buffer.
- After the included template is processed, the parent template's `<head>` is updated to include these resources,
  ensuring that all required styles and scripts from included templates are present in the final output.

This means you can maintain a single source of truth for your resources in each template and have them automatically
merged into the final HTML, making includes more modular and easier to manage.

### Advanced Includes

Beyond simply inserting the content of another template, you can:

- Pass data to included templates.
- Use a `containerFileName` parameter when calling `parseFile` to define a "container" template that wraps the
  included content.
- This allows a template to be included in a larger context, providing a content property or a similar data function
  that returns the included template's rendered result.

Example:
```ts
const parsed = await new Template({ name: 'Nick' })
	.parseFile('child-template.html', 'container-template.html')
```

If `container-template.html` expects a content() function or a data placeholder to insert the child-template,
the engine will handle the injection automatically.

### Debugging with debugEvents()

**What is debugEvents()?**

`debugEvents()` is a utility method that sets default hooks (onAttribute, onTagOpen, onTagOpened, onTagClose)
to print out parsing details to the console. It's extremely useful for diagnosing issues during template parsing:

**How to use:**
```ts
const template = new Template(data)
template.debugEvents()
const parsed = await template.parseBuffer(yourTemplateString)
```
As the template is parsed, the console will show events like:
```
attribute name = value
tag.open = div
tag.opened = div
tag.closed = div
```

This allows you to see exactly how the parser is interpreting your template,
helping you quickly locate any unexpected parsing behavior.

## More to come

### Planned Features (Not Yet Implemented)

- Ability to add sample code to repetitive blocks, improving the template's readability when viewed directly in browser,
- Template inheritance with block concepts (native via DOM selectors or by specific structural tags),
- Improved syntax error handling in templates,
- More control over escaping delimiters and defining code blocks that ignore template delimiters,
- Ability to add custom helper functions (beyond existing `Str` helpers and custom parsers),
- Support for both Node and browser execution environments,
- Literal stacking for contextual translation via plugins with `onElement` events,
- Integrated locale formatting (currently you must pre-format your data or use JS-side helpers).

### Desired Future Improvements

- TypeScript validation in major IDEs (VSCode, WebStorm),  
- Precompiled caching mode for even faster execution.

### Assumed Limitations

- Code is optimized for performance at the expense of some extensibility (fewer separate functions).
- No support for complex JavaScript expressions within templates—this is by design,
  as the template engine focuses solely on markup and simple data insertions.
