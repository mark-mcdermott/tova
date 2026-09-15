import { useEffect, useRef } from "react"
import { useSuspendWindowDrag } from "../useWindowDrag"
import { Wordmark } from "./Sidebar/Wordmark"

/** What a choice turns on. `greeted` is set alongside, by whoever handles it. */
export interface WelcomeChoice {
  grammar: boolean
  updates: boolean
}

interface Choice {
  id: string
  label: string
  body: string
  choice: WelcomeChoice
}

/*
 * Three answers, and the differences between them stated in what they cost
 * rather than in adjectives. "Lightest" and "fastest" tell a reader nothing;
 * 15MB and "opens no connection" are things somebody can decide about.
 */
const CHOICES: Choice[] = [
  {
    id: "everything",
    label: "Everything",
    body: "Grammar checking, and a look for a newer Tova when it opens. The grammar checker catches roughly half of common mistakes — it reads words rather than sentences, so it finds confusable words and misses things like subject-verb agreement. Its dictionary is 15MB and arrives in the background.",
    choice: { grammar: true, updates: true }
  },
  {
    id: "lighter",
    label: "Just writing",
    body: "No grammar checking, so there is nothing to download. Tova still looks for a newer version when it opens.",
    choice: { grammar: false, updates: true }
  },
  {
    id: "offline",
    label: "Offline",
    body: "Nothing leaves this machine. No grammar dictionary, no looking for updates — Tova opens no connection at all.",
    choice: { grammar: false, updates: false }
  }
]

interface WelcomeProps {
  onChoose: (choice: WelcomeChoice) => void
}

/**
 * The question Tova asks once, on the first run.
 *
 * It exists because the grammar checker is 15MB of dictionary for a feature
 * that is off by default, and shipping that to everybody in order to serve the
 * people who want it is the wrong way round. Asking once is cheaper than a
 * download nobody chose.
 *
 * No "recommended" badge and no preselected answer. All three are whole
 * answers, and a reader who wants the offline one is not settling for less.
 */
export function Welcome({ onChoose }: WelcomeProps) {
  const firstRef = useRef<HTMLButtonElement>(null)

  useSuspendWindowDrag()

  useEffect(() => {
    firstRef.current?.focus()
  }, [])

  return (
    <div className="welcome" role="dialog" aria-modal="true" aria-labelledby="welcome-title">
      <div className="welcome-panel">
        <h1 className="welcome-wordmark" aria-label="Tova">
          <Wordmark />
        </h1>

        <p className="welcome-lead" id="welcome-title">
          How would you like Tova set up?
        </p>

        <ul className="welcome-choices">
          {CHOICES.map((option, index) => (
            <li key={option.id}>
              <button
                type="button"
                className="welcome-choice"
                ref={index === 0 ? firstRef : undefined}
                onClick={() => onChoose(option.choice)}
              >
                <span className="welcome-choice-label">{option.label}</span>
                <span className="welcome-choice-body">{option.body}</span>
              </button>
            </li>
          ))}
        </ul>

        {/* Said here because "no grammar checking" reads as "no checking at
            all", and the one people notice most is still there. */}
        <p className="welcome-footnote">
          Spelling is checked either way — that is macOS&rsquo;s own checker, and it costs nothing
          to include. Any of this can be changed later in Settings.
        </p>
      </div>
    </div>
  )
}
