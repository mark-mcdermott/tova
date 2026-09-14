---
title: Inline tags own nothing
section: notes
folder: tags
tags: [purge-drill]
---

# Inline tags own nothing

This is the safety property of the whole feature. A tag written inside a
sentence claims no text, so mentioning #ephemeral here cannot cost anyone the
paragraph around it.

Every paragraph in this note mentions #ephemeral somewhere, and a purge of
#ephemeral should leave the note untouched apart from — nothing. It should
leave it entirely untouched.

A tag at the start of a line but followed by prose is still inline:

#ephemeral is a tag with words after it, so this line is not a block head.

A line that is a tag plus punctuation is also not a tag-only line:

#ephemeral.

And a tag inside a list item:

- something about #ephemeral
- something else
