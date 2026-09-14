---
title: Setext trap
section: notes
folder: tags
tags: [purge-drill]
---

#ephemeral

Under the block head.

A line of text
---

Strictly, `Text` followed by `---` is a setext heading, not a thematic break.
Tova treats the dashes as a block terminator anyway, because for something
that deletes what it finds, ending the block sooner is the safer mistake.

So this paragraph should survive a purge of ephemeral, and the heading above
it marks where the block stopped.
