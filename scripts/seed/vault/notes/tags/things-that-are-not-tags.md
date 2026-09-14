---
title: Things that are not tags
section: notes
folder: tags
tags: [purge-drill]
---

# Not tags

None of the lines below is a tag-only line, so none of them heads a block and
nothing under them can be deleted by tag.

#1

A hash then a digit. A tag has to start with a letter.

#

A hash on its own.

# A heading

A hash, a space, then words: an ATX heading.

#-leading-hyphen

#_leading_underscore

## Inside a URL

A link to https://example.com/page#ephemeral and a bare anchor #ephemeral-ish
written mid-sentence.

## Inside code — worth watching

The line inside this fence is a tag alone on a line. Nothing here reads
fences, so it may well be treated as a block head:

```
#ephemeral
this text sits under it
```

And indented code, same question:

    #ephemeral
    this text sits under it

Prose after the code blocks, which should survive either way.
