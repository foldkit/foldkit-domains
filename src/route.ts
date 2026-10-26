import { Option, Schema, String, pipe } from 'effect'
import { Route } from 'foldkit'
import { defineRouteUnion } from 'foldkit/route'

export const ApplicationRoute = defineRouteUnion({
  Search: { q: Schema.Option(Schema.String) },
  NotFound: { path: Schema.String },
})

export const searchRouter = pipe(
  Route.root,
  Route.query(Schema.Struct({ q: Schema.OptionFromOptional(Schema.String) })),
  Route.mapTo(ApplicationRoute.Search),
)

const routeParser = Route.oneOf(searchRouter)
export const urlToApplicationRoute = Route.parseUrlWithFallback(
  routeParser,
  ApplicationRoute.NotFound,
)

export const routeToQuery = ApplicationRoute.match({
  Search: ({ q }) => Option.getOrElse(q, () => ''),
  NotFound: () => '',
})

export const searchHref = (query: string): string =>
  searchRouter({ q: Option.liftPredicate(query, String.isNonEmpty) })
