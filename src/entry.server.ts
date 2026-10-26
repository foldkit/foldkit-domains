import { Effect, Option, pipe } from 'effect'
import { Url } from 'foldkit'
import { Server } from 'foldkit/experimental'

import { ApplicationBlock } from './block'
import bootstrap from './bootstrap.mjs?raw'
import { ApplicationRoute, urlToApplicationRoute } from './route'

export const prerenderPaths: ReadonlyArray<string> = ['/']

export const renderDocument: Server.DocumentRenderer = (
  application,
  assets,
) => {
  const documentAssets = import.meta.env.DEV
    ? Server.DocumentAssets.make({
        ...assets,
        stylesheets: [
          `${import.meta.env.BASE_URL}src/styles.css?direct`,
          ...assets.stylesheets,
        ],
      })
    : assets

  return Server.renderDocument(application, documentAssets, {
    head: '<meta name="color-scheme" content="dark">',
  }).replace(
    '<script type="module"',
    `<script>${bootstrap}</script><script type="module"`,
  )
}

export const renderPage = (request: Request): Promise<Server.EntryResult> => {
  const status = pipe(
    Url.fromString(request.url),
    Option.map(urlToApplicationRoute),
    Option.match({
      onNone: () => 404,
      onSome: ApplicationRoute.match<number>({
        Search: () => 200,
        NotFound: () => 404,
      }),
    }),
  )

  return Effect.runPromise(
    Server.renderToString(
      ApplicationBlock,
      { routing: {} },
      { url: request.url },
    ).pipe(Effect.map(application => Server.Rendered(application, { status }))),
  )
}
