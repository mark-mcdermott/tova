---
title: Kitchen sink
section: notes
folder: markdown
tags: [reference, markdown]
favorite: true
---

# Kitchen sink

Every construct in one note, so a rendering change has somewhere to show itself.

## Emphasis

*italic*, _also italic_, **bold**, __also bold__, ***both***, ~~struck through~~,
`inline code`, and a \*literal asterisk\* that is escaped.

## A quote

> The first level.
>
> > A second level inside it.
>
> — attributed to nobody

## Lists

- unordered
- with a second item
  - and a nested one
    - and a third level
- back to the top

1. ordered
2. second
   1. nested ordered
   2. and another
10. a number that is not next

- [ ] an unchecked task
- [x] a finished task

Loose list, with blank lines between items:

- first

- second

## Code

```js
const greet = (name) => `hello, ${name}`
console.log(greet("world"))
```

```python
def greet(name: str) -> str:
    return f"hello, {name}"
```

~~~
A fence made of tildes, holding ``` backticks ``` safely.
~~~

    An indented code block.
    Four spaces, no fence.

## A table

| Left | Centre | Right |
| :--- | :----: | ----: |
| one  |  two   | three |
| a longer cell | `code` | **bold** |

## Links

An [inline link](https://example.com), a [reference one][ref], an autolink
<https://example.com/autolink>, and a bare https://example.com/bare.

[ref]: https://example.com/reference "With a title"

## Breaks

A hard break made of two trailing spaces  
lands on the next line.

A hard break made of a backslash\
does the same.

## Footnote

Something worth a note.[^1]

[^1]: The note itself.

## HTML

<div align="center"><strong>Raw HTML block</strong></div>

Entities: &amp; &copy; &mdash; &#8212;
