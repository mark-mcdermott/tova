import { useState } from "react"

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

      {/*
        No wordmark. The name is already in the rail, a few inches to the left
        and on every screen — printing it again here says nothing the reader
        did not know, and the words underneath were the better thing to lead
        with anyway.

        The heading comes with it: this page has to have one, and the line that
        says what Tova is for is a truer heading than its own name.
      */}
      <h1 className="home-line home-line-lead">
        A quieter place
        <br />
        for your thoughts.
      </h1>

      <p className="home-line home-line-trail">
        Same thoughts.
        <br />
        Brighter tomorrows.
      </p>
    </section>
  )
}
