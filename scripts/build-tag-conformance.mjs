#!/usr/bin/env node
/*
 * Rebuilds `conformance/tags.json` by asking the editor's own markdown parser
 * where a `#` is not a tag.
 *
 *   node scripts/build-tag-conformance.mjs
 *
 * A tag inside code, a URL, a link, an image or a heading is not a tag: not
 * drawn in the editor, and not listed in the sidebar. The editor gets that for
 * free from its syntax tree — `EXCLUDES_TAGS` in `markdownDecorations.ts` is
 * the whole rule. Nothing else has a parser, so the rule is reimplemented by
 * hand in two languages, and this fixture is what holds all three to the same
 * answer.
 *
 * `code` is the narrower question, asked separately because `tag_blocks.rs`
 * needs it on its own: a `---` inside a fence is not a divider, while a `---`
 * under a paragraph is a heading the deletion still has to stop at.
 *
 * Written from the parser rather than from the spec because the spec's answer
 * and the editor's answer are the same thing only when someone checks. The
 * code work found an indented-code rule read straight from the spec that was
 * wrong inside lists; the same held here, where the spec has nothing at all to
 * say about a bare `https://` URL being a link.
 */
import { writeFileSync } from "node:fs"

import { markdown, markdownLanguage } from "@codemirror/lang-markdown"
import { ensureSyntaxTree } from "@codemirror/language"
import { EditorState } from "@codemirror/state"

const CODE = /Code/
const EXCLUDES_TAGS = /Code|URL|Link|Image|Heading/

const cases = [
  // Code — the cases PR #115 settled, which still have to hold.
  ["a fence", "before\n\n```sh\n#work\n```\n\nafter\n"],
  ["a fence of tildes", "before\n\n~~~\n#work\n~~~\n\nafter\n"],
  ["a fence with no closing fence", "```\n#work\nstill code\n"],
  ["a fence inside a quote", "> ```\n> #work\n> ```\n"],
  ["a fence holding a rule", "```\n#work\n---\nstill code\n```\n\nafter\n"],
  ["a longer fence closed by a shorter one", "````\n#work\n```\nstill code\n````\n"],
  ["indented code after a blank line", "before\n\n    #work\n\nafter\n"],
  ["an indented line continuing a paragraph", "before\n    #work\nafter\n"],
  ["a tab-indented code block", "before\n\n\t#work\n\nafter\n"],
  ["a nested list item at four spaces", "- item\n    - #work\n"],
  ["a nested list item after a blank line", "- item\n\n    - #work\n"],
  ["a paragraph continuing a list item", "- item\n\n    #work\n"],
  ["code inside a list item", "- item\n\n      #work\n"],
  ["a fence inside a list item", "- item\n\n    ```\n    #work\n    ```\n"],
  ["an ordered list item", "1. item\n\n    #work\n"],
  ["an inline code span", "a `#work` b\n"],
  ["a tag alone on a line", "#work\n\ntext under it\n"],
  ["a tag in prose", "a sentence mentioning #work in passing\n"],
  ["three spaces of indent is not code", "before\n\n   #work\n\nafter\n"],
  ["a quote is not code", "> #work\n"],
  ["a heading is not code", "# Heading\n\n#work\n"],
  ["a tag inside a quote", "> #work\n"],
  ["a tag inside a fence inside a quote", "> ```\n> #work\n> ```\n"],
  ["several tags, only one in code", "#alpha\n\n```\n#beta\n```\n\n#gamma\n"],
  ["a tag in a code span mid-sentence", "before `#work` after #real\n"],

  // Code spans, which the line-at-a-time rule used to get wrong.
  ["a code span running across a line break", "a `#work\nstill` b\n"],
  ["a code span of two backticks holding one", "`` a ` #work `` b\n"],
  ["an escaped backtick opens nothing", "\\`#work\\` x\n"],
  ["an unclosed backtick", "a ` #work b\n"],
  ["a code span inside a heading", "# a `#work` b\n"],
  ["a code span inside a link", "[a `#work`](x)\n"],

  // Headings.
  ["a tag in an ATX heading", "# Heading #work\n"],
  ["a tag in a sixth-level heading", "###### h #work\n"],
  ["seven hashes are not a heading", "####### h #work\n"],
  ["hashes with no space are not a heading", "#h #work\n"],
  ["a heading indented three spaces", "   # h #work\n"],
  ["a heading indented four spaces is code", "    # Heading #work\n"],
  ["a heading closed by its own hashes", "## a #work ##\n"],
  ["a heading interrupting a paragraph", "a\n# h #work\n"],
  ["a heading in a quote", "> # Heading #work\n"],
  ["a heading in a list item", "- # h #work\n"],
  ["a heading in an ordered list item", "1) # h #work\n"],
  ["a heading in an indented list item", "  - # h #work\n"],
  ["a heading in a list item in a quote", "> - # h #work\n"],
  ["a tag under a heading", "# h\n#work\n"],
  ["a tag over a heading", "#work\n# h\n"],

  // Setext headings, which reach back over the paragraph above them.
  ["a tag over an equals underline", "Setext #work\n===\n"],
  ["a tag over a dash underline", "Setext #work\n---\n"],
  ["a tag on the first of two underlined lines", "a #work\nb\n---\n"],
  ["a tag alone on a line that is underlined", "text\n#work\n===\n"],
  ["tags alone on a line that is underlined", "#tag1 #tag2\n---\n"],
  ["an underline indented three spaces", "text #work\n   ---\n"],
  ["an underline indented four spaces is not one", "text #work\n    ---\n"],
  ["an underline with anything after it is not one", "text #work\n===x\n"],
  ["spaced dashes are a rule, not an underline", "text #work\n- - -\n"],
  ["an underline inside a list item", "- item #work\n  ---\n"],
  ["an underline inside a quote", "> text #work\n> ---\n"],
  ["a rule between a tag and a link", "text [a\n***\nb](c#work)\n"],

  // Links and images.
  ["a tag in a link destination", "[text](https://example.com/#work)\n"],
  ["a tag in link text", "[a #work b](x)\n"],
  ["a tag in a link title", '[text](url "title #work")\n'],
  ["a tag in a reference label", "[text][#work]\n"],
  ["a tag in brackets with nothing after them", "[just brackets #work]\n"],
  ["empty brackets are not a link", "[]#work\n"],
  ["a tag after a closed link", "[a][b] #work\n"],
  ["a tag in the second of two bracket runs", "[a] [b #work]\n"],
  ["a link that never closes", "[unclosed #work\n"],
  ["a destination that never closes", "[a](b#work\n"],
  ["an escaped bracket opens nothing", "\\[not a link #work]\n"],
  ["an escaped bracket closes nothing", "[a\\](b#work)\n"],
  ["an escaped paren inside a destination", "[a](b\\)#work)\n"],
  ["brackets nested inside brackets", "[a [nested #work] b](x)\n"],
  ["a tag right after a link", "[a](b)#work\n"],
  ["a link across a line break", "See [the long\ndocument #work](https://x.com) here\n"],
  ["a destination across a line break", "[text](\nhttps://x.com/#work)\n"],
  ["an angled destination across a line break", "[a](<url\n#work>)\n"],
  ["a link across a line break in a quote", "> [a #work\n> b](x)\n"],
  ["a link across a line break in a list item", "- [a #work\n  b](x)\n"],
  ["brackets across a blank line", "[a\n\nb #work](x)\n"],
  ["an angled destination", "[a](<url #work>)\n"],
  ["a tag in an image destination", "![alt](img.png#work)\n"],
  ["a tag in image alt text", "![alt #work](img.png)\n"],
  ["a tag in an image title", 'text ![alt](a.png "t #work") more\n'],
  ["an image with a reference label", "![#work][ref]\n"],
  ["an image with nothing after it", "![a] #work\n"],
  ["an image inside a link", "[![img #work](a.png)](b)\n"],
  ["a link inside emphasis", "*[emph #work](x)*\n"],
  ["a link in a list item", "- item\n  [a #work](b)\n"],
  ["a link after a fence", "```\ncode\n```\n[a](b#work)\n"],
  ["a link in a table cell", "| a | [x #work](y) |\n| - | - |\n| 1 | 2 |\n"],
  ["a tag in a table cell", "| a | #work |\n| - | - |\n| 1 | 2 |\n"],

  // Link reference definitions.
  ["a tag in a definition's destination", "[ref]: /path#work\n"],
  ["a tag in a definition's label", "[#work]: https://example.com\n"],
  ["a tag in a definition's title", '[a]: /1 "t #w2"\nmore #w3\n'],
  ["two definitions in a row", "[a]: /1#w1\n[b]: /2#w2\n"],
  ["a definition indented two spaces", "  [ref]: /path#work\n"],
  ["a definition and then prose", "[ref]: /x#work\ntext [a](b#work2)\n"],
  ["a definition with no destination", "[a]: \n#work\n"],
  ["a definition whose title never closes", '[a]: /x "unclosed #work\n'],
  ["a definition after prose is not one", "para\n[a]: /x#work\n"],
  ["a blank label is not a definition", "[ ]: /x#work\n"],
  ["a definition with no space after the colon", "[a]:#work\n"],

  // URLs written with no markup around them.
  ["a bare https URL", "https://example.com/page#work\n"],
  ["a bare www URL", "a www.example.com/#work b\n"],
  ["a bare URL with no path", "http://x.com#work\n"],
  ["a bare URL in a sentence", "see https://x.com/a#work, and #real\n"],
  ["a bare URL ending a sentence", "end. https://x.com/a#work.\n"],
  ["a bare URL in parentheses", "(https://x.com/#work)\n"],
  ["a bare URL with an unbalanced paren", "https://x.com/#work)\n"],
  ["two fragments in one bare URL", "https://x.com/#work#more\n"],
  ["an upper-case URL is not autolinked", "HTTPS://X.COM/#work\n"],
  ["an unknown scheme is not autolinked", "ftp://x.com/#work\n"],
  ["a host with no scheme is not autolinked", "see example.com/page#work here\n"],
  ["a URL in the middle of a word", "x#work and ax.com/#work\n"],
  ["a bare URL inside an unclosed link", "[a] https://x.com/b#work [c]\n"],
  ["a bare URL inside a closed link", "[see https://x.com/a#work](y)\n"],
  ["an angled autolink", "text <https://x.com/#work> more\n"],
  ["a mailto link", "mailto:a@b.com#work\n"],
  ["an xmpp link", "xmpp:a@b.com/#work\n"],
  ["a bare email address", "a@b.com/#work\n"],
  ["an HTML attribute is not a URL", '<a href="#work">x</a>\n'],
  ["an entity before a tag", "a &amp; #work\n"],

  // Raw HTML, whose insides markdown never reads.
  ["a link inside an HTML block", "<div>\n[a](b#work)\n</div>\n"],
  ["a link inside an HTML comment", "<!-- see [a](b#work) -->\n"],
  ["a link under a bare tag on its own line", "<x-widget>\n[a](b#work)\n"],
  ["a tag under an HTML block", "<div>\nx\n</div>\n\n[a](b#work)\n"],
  ["an inline tag does not open a block", "an <b>emphatic</b> [a](b#work)\n"],
  ["a closing tag on its own line", '[a]: /1 "t"\n</pre>\n[a](b#work)\n'],

  // What the fuzzing against the parser turned up.
  ["a link inside an image", "![a [b](c) d #work](e)\n"],
  ["a backtick in a fence's info string", "```a`b\n#work\n"],
  ["a fence ending with the quote it is in", "> ```\n#work\n"],
  ["a quoted fence mark inside a fence", "```\n> ```\n#work\n"],
  ["an empty list item over an indented line", "- \n      #work\n"],
  ["an empty quote line over an indented line", "> \n    #work\n"],
  ["a blank line closes an empty quote line", "> \n> \n    #work\n"],
  ["a quote after a list item", "- a\n> ```\n\t#work\n"],
  ["a number that is not a list", "I scored `10 out of\n10. #work` not bad\n"],
  ["a list that does start at one", "text `a\n1. #work` b\n"],
  ["an empty item cannot interrupt a paragraph", "text `a\n* \n#work` b\n"],
  ["an item with something in it can", "text `a\n* x\n#work` b\n"],
  ["a definition over an indented line", "[a]: /x\n    #work\n"],
  ["a definition whose title is on its own line", '[a]: /x\n  "t #work"\n'],
  ["a definition then a lazy continuation", "- a\n[b]: /x#work\n"]
]

const TAG = /#[A-Za-z][\w-]*/g

/** Every `#tag` in the text, and what the parser says about where it sits. */
function occurrences(text) {
  const state = EditorState.create({
    doc: text,
    // The editor's own configuration. The base matters: `markdownLanguage` is
    // the GitHub-flavoured one, and it is the only one that reads a bare
    // `https://` URL as a link at all.
    extensions: [markdown({ base: markdownLanguage, addKeymap: false })]
  })
  const tree = ensureSyntaxTree(state, text.length, 10_000)
  if (tree === null) throw new Error("the parser gave up")

  const found = []
  for (const match of text.matchAll(TAG)) {
    let code = false
    let excluded = false
    for (let node = tree.resolveInner(match.index, 1); node; node = node.parent) {
      if (CODE.test(node.name)) code = true
      if (EXCLUDES_TAGS.test(node.name)) excluded = true
    }
    found.push({ tag: match[0], at: match.index, code, excluded })
  }

  return found
}

/*
 * Offsets mean bytes to the Rust and UTF-16 units to JavaScript. They are the
 * same number only while the text is ASCII, so a case that wandered outside it
 * would leave the two sides comparing different positions and agreeing by
 * accident. Caught here, where the fixture is written.
 */
for (const [name, text] of cases) {
  if (!/^[\x00-\x7F]*$/.test(text)) throw new Error(`case ${name} is not ASCII`)
}

const fixture = {
  _readme: [
    "Which `#tags` in a note are not tags at all, because the `#` already means",
    "something where it sits.",
    "",
    "Generated by scripts/build-tag-conformance.mjs from @codemirror/lang-markdown —",
    "the parser the editor itself uses to decide which tags to draw. Nothing outside",
    "the editor has a parser, so the rule is reimplemented by hand in two languages;",
    "this fixture is what holds them to the same answer.",
    "",
    "It matters twice over. A tag inside code used to head a block, so deleting that",
    "tag took the prose underneath it — while the editor, which knew it was code,",
    "drew no tag there at all and gave the reader no warning. And a `#fragment` in a",
    "URL was listed in the sidebar as a tag of its own, sending a reader looking for",
    "something the note never said.",
    "",
    "`at` is a byte offset to the `#`. `excluded` is the answer both sides must give",
    "about whether a tag is there at all; `code` is the narrower question of whether",
    "it sits in code, which is what decides where a deletion stops."
  ].join("\n"),
  occurrences: cases.map(([name, text]) => ({ name, text, tags: occurrences(text) }))
}

writeFileSync("conformance/tags.json", JSON.stringify(fixture, null, 2) + "\n")
console.log(`conformance/tags.json — ${fixture.occurrences.length} cases`)
for (const one of fixture.occurrences) {
  const hidden = one.tags.filter((tag) => tag.excluded).map((tag) => tag.tag)
  const plain = one.tags.filter((tag) => !tag.excluded).map((tag) => tag.tag)
  console.log(`  ${one.name.padEnd(44)} not tags: [${hidden}]  tags: [${plain}]`)
}
