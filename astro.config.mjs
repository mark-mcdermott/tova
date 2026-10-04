// @ts-check
import { defineConfig, envField } from "astro/config"
import react from "@astrojs/react"
import vercel from "@astrojs/vercel"
import tailwindcss from "@tailwindcss/vite"

/*
 * The web half of Tova: the marketing pages, and eventually the app itself as a
 * client-side island.
 *
 * `srcDir` is `./web` rather than Astro's default `./src`, because `src/` here
 * already belongs to the desktop app — `src/renderer` is the Tauri UI and
 * `src/shared` is the logic both halves use. Pointing Astro at `src` would put
 * its `pages/` and `components/` conventions next to a renderer that has
 * neither, and nothing about the result would say which was which.
 *
 * `src/shared` is imported from here. That is the whole argument for one
 * repository: 4,000 lines of parsing the web client cannot do without, as an
 * import rather than a published package with versions and release steps.
 *
 * What is NOT here is `src-tauri`. It is the desktop app's Rust backend, it
 * compiles into a macOS binary, and it has no meaning on a server. Vercel's
 * importer offers to deploy it as a service; it should not.
 */
export default defineConfig({
  site: "https://tova.so",
  srcDir: "./web",
  /*
   * Beside `srcDir`, not at the root. Astro's default is `<root>/public`, and
   * the root here is the whole repository — which would put the site's static
   * files next to `src-tauri` and `conformance`, where nothing else about the
   * web lives.
   */
  publicDir: "./web/public",
  outDir: "./out/web",
  adapter: vercel(),
  integrations: [react()],
  vite: { plugins: [tailwindcss()] },

  /*
   * Declared through `astro:env` rather than read off `process.env`.
   *
   * Astro loads `.env` into its own env layer and NOT into `process.env`, so
   * `process.env.DATABASE_URL` is undefined in dev even with a correct `.env` —
   * while `drizzle.config.ts`, which imports `dotenv/config` itself, sees it
   * fine. That split is the kind of thing that costs an afternoon.
   */
  env: {
    schema: {
      /*
       * `access: 'secret'` means read at runtime. A `public` server variable is
       * validated and inlined at build time instead, so one that is unset
       * during a build is frozen as undefined for the life of that deploy.
       */
      DATABASE_URL: envField.string({ context: "server", access: "secret", optional: true }),
      BETTER_AUTH_SECRET: envField.string({ context: "server", access: "secret", optional: true }),
      /*
       * Optional, all of them, so a build can succeed before any of it is
       * wired. They become required when something actually reads them, and
       * failing then says which one is missing rather than failing the whole
       * deploy on a variable nothing uses yet.
       */
      PUBLIC_SITE_URL: envField.string({ context: "client", access: "public", optional: true })
    }
  }
})
