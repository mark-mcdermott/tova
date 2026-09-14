---
title: Only tag is the target
section: notes
folder: tags
tags: [ephemeral]
---

This note carries the target tag in its front matter row and carries no other
tag anywhere. A purge of ephemeral should delete the note itself rather than
empty it out, and it should stop appearing on index pages the moment it goes.

That last part is the bit that broke once: the note was removed but the index
still listed it, and opening it gave "No such file or directory (os error 2)".
