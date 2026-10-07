import { useEffect, useRef, useState } from 'react'

const COMMIT_DELAY_MS = 250

/**
 * A search box whose words live in the address (so Back returns to the same
 * list), without the address fighting the typing: the box keeps its own text
 * while it is focused and writes the address a moment after the last key.
 * When the address changes from outside (Back, a link), the box follows it.
 */
export function useUrlText(urlValue: string, commit: (value: string) => void) {
  const [text, setText] = useState(urlValue)
  const focused = useRef(false)
  const timer = useRef<number | undefined>(undefined)
  const commitRef = useRef(commit)
  commitRef.current = commit

  useEffect(() => {
    if (!focused.current) setText(urlValue)
  }, [urlValue])
  useEffect(() => () => window.clearTimeout(timer.current), [])

  return {
    value: text,
    onChange: (event: React.ChangeEvent<HTMLInputElement>) => {
      const next = event.target.value
      setText(next)
      window.clearTimeout(timer.current)
      timer.current = window.setTimeout(
        () => commitRef.current(next),
        COMMIT_DELAY_MS,
      )
    },
    onFocus: () => {
      focused.current = true
    },
    onBlur: () => {
      focused.current = false
    },
  }
}
