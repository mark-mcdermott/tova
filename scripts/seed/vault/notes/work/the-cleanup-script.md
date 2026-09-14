---
title: The cleanup script
section: notes
folder: work
tags: [work, keep]
---

# The cleanup script

This is the note that found the bug. The comment inside the code block below
looks exactly like a block tag to anything that reads line by line.

```sh
#ephemeral
rm -rf ./old-cache
```

Remember to run it before the release, and check with Sam first.

The sentence above this one is the one that should still be here after a purge
of ephemeral. If it is gone, the code block was treated as a tag.
