interface EditorTagsProps {
  tags: string[]
}

/**
 * The note's tags, between the title and the prose. The row keeps its height
 * when there are none, so writing the first tag does not shove the whole
 * document down a line.
 */
export function EditorTags({ tags }: EditorTagsProps) {
  return (
    <div className="editor-tags" aria-label="Tags">
      {tags.map((tag) => (
        <span key={tag} className="editor-tag">
          <span className="editor-tag-hash">#</span>
          {tag}
        </span>
      ))}
    </div>
  )
}
