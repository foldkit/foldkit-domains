import { Effect } from 'effect'
import { Server } from 'foldkit/experimental'

import { ApplicationBlock } from './block'
import bootstrap from './bootstrap.mjs?raw'

export const prerenderPaths: ReadonlyArray<string> = ['/']

export const renderDocument: Server.DocumentRenderer = (application, assets) =>
  Server.renderDocument(application, assets, {
    head: '<meta name="color-scheme" content="dark">',
  }).replace(
    '<script type="module"',
    `<script>${bootstrap}</script><script type="module"`,
  )

export const renderPage = (request: Request): Promise<Server.EntryResult> =>
  Effect.runPromise(
    Server.renderToString(
      ApplicationBlock,
      { routing: {} },
      { url: request.url },
    ).pipe(Effect.map(Server.Rendered)),
  )
