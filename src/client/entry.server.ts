import { Effect, Option, pipe } from 'effect'
import { Url } from 'foldkit'
import { Server } from 'foldkit/experimental'

import geistLatinUrl from '@fontsource-variable/geist/files/geist-latin-wght-normal.woff2?url'

import { ApplicationBlock } from './block'
import { bootstrapSearchInput } from './bootstrap'
import { ApplicationRoute, urlToApplicationRoute } from './route'
import { searchInputConfig } from './searchInput'
import {
  SITE_DESCRIPTION,
  SITE_NAME,
  SOCIAL_IMAGE_ALT,
  SOCIAL_IMAGE_URL,
} from './site'

export const prerenderPaths: ReadonlyArray<string> = ['/']

export const renderDocument: Server.DocumentRenderer = (
  application,
  assets,
) => {
  const documentAssets = import.meta.env.DEV
    ? Server.DocumentAssets.make({
        ...assets,
        stylesheets: [
          `${import.meta.env.BASE_URL}src/client/styles.css?direct`,
          ...assets.stylesheets,
        ],
      })
    : assets

  return Server.renderDocument(application, documentAssets, {
    head: `<meta name="color-scheme" content="dark">
<meta name="theme-color" content="#09090b">
<meta name="description" content="${SITE_DESCRIPTION}">
<meta property="og:type" content="website">
<meta property="og:site_name" content="${SITE_NAME}">
<meta property="og:title" content="${SITE_NAME}">
<meta property="og:description" content="${SITE_DESCRIPTION}">
<meta property="og:image" content="${SOCIAL_IMAGE_URL}">
<meta property="og:image:type" content="image/png">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta property="og:image:alt" content="${SOCIAL_IMAGE_ALT}">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${SITE_NAME}">
<meta name="twitter:description" content="${SITE_DESCRIPTION}">
<meta name="twitter:image" content="${SOCIAL_IMAGE_URL}">
<meta name="twitter:image:alt" content="${SOCIAL_IMAGE_ALT}">
<link rel="icon" href="/favicon.svg" type="image/svg+xml">
<link rel="icon" href="/favicon-32x32.png" type="image/png" sizes="32x32">
<link rel="apple-touch-icon" href="/apple-touch-icon.png" sizes="180x180">
<link rel="preload" href="${geistLatinUrl}" as="font" type="font/woff2" crossorigin>`,
  }).replace(
    '<script type="module"',
    `<script>(${bootstrapSearchInput.toString()})(${JSON.stringify(searchInputConfig)});</script><script type="module"`,
  )
}

export const renderPage = (request: Request): Promise<Server.EntryResult> => {
  const status = pipe(
    Url.fromString(request.url),
    Option.map(urlToApplicationRoute),
    Option.match({
      onNone: () => 404,
      onSome: ApplicationRoute.match({
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
