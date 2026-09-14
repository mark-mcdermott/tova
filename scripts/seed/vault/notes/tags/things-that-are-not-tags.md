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

## Inside code

The line inside this fence is a tag alone on a line. It is a comment, not a
tag: nothing is drawn on it, it puts nothing in the sidebar, and a purge of
ephemeral leaves it and everything under it alone.

This is the case that had it wrong. The block used to run from here to the end
of the note, taking the closing fence with it.

```
#ephemeral
this text sits under it
```

And indented code, the same:

    #ephemeral
    this text sits under it

Prose after the code blocks, which should survive either way.
