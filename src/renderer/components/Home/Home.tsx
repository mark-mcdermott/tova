import { useState } from "react"
import { Wordmark } from "../Sidebar/Wordmark"

/*
 * The picture, when there is one.
 *
 * Bundled rather than fetched: the app opens without a network and this is the
 * first thing it shows. `import.meta.glob` rather than a plain import so the
 * page builds before the artwork exists — importing a missing file is a build
 * error, and this is a page that should be able to wait for its picture.
 *
 * Drop one at `src/renderer/assets/home/hero.jpg` (or .png, or .webp).
 */
const artwork = Object.values(
  import.meta.glob<string>("../../assets/home/hero.*", {
    eager: true,
    import: "default",
    query: "?url"
  })
)[0]

/**
 * The page behind the wordmark.
 *
 * It holds nothing and does nothing, which is the point: every other screen is
 * a list of work or a piece of work, and this is the one place that is only
 * the app saying what it is for.
 */
export function Home() {
  const [loaded, setLoaded] = useState(false)

  return (
    <section className={`home${artwork === undefined ? " is-unillustrated" : ""}`}>
      {artwork !== undefined && (
        <img
          className={`home-art${loaded ? " is-loaded" : ""}`}
          src={artwork}
          alt=""
          onLoad={() => setLoaded(true)}
        />
      )}

      <div className="home-plate">
        {/* The mark is aria-hidden, as it is in the rail; the heading around
            it carries the name, so it is announced once. */}
        <h1 className="home-wordmark" aria-label="Tova">
          <Wordmark />
        </h1>

        <p className="home-line home-line-lead">
          A quieter place
          <br />
          for your thoughts.
        </p>
      </div>

      <p className="home-line home-line-trail">
        Same thoughts.
        <br />
        Brighter tomorrows.
      </p>
    </section>
  )
}
