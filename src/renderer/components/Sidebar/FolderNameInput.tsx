import { useEffect, useRef, useState } from "react"

interface FolderNameInputProps {
  initialValue?: string
  onSubmit: (name: string) => void
  onCancel: () => void
}

/** Inline field used for both creating and renaming a folder. */
export function FolderNameInput({
  initialValue = "",
  onSubmit,
  onCancel
}: FolderNameInputProps) {
  const [value, setValue] = useState(initialValue)
  const ref = useRef<HTMLInputElement>(null)

  useEffect(() => {
    // focus before select: select() alone leaves the caret elsewhere, so the
    // field appears ready to type into but swallows nothing.
    ref.current?.focus()
    ref.current?.select()
  }, [])

  function commit() {
    const name = value.trim()
    if (name === "") {
      onCancel()
      return
    }
    onSubmit(name)
  }

  return (
    <input
      ref={ref}
      className="folder-name-input"
      value={value}
      aria-label="Folder name"
      placeholder="Folder name"
      onChange={(event) => setValue(event.target.value)}
      onBlur={commit}
      onKeyDown={(event) => {
        if (event.key === "Enter") {
          event.preventDefault()
          commit()
        }
        if (event.key === "Escape") {
          event.preventDefault()
          onCancel()
        }
      }}
    />
  )
}
