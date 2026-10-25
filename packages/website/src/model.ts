import { Schema } from 'effect'
import { Url } from 'foldkit/url'

import { DialogBlock } from '@foldkit/ui'

import { Deployment } from './deployment'
import { ResolvedTheme } from './message'
// codex: these should all come through a page/index barrel export not
// individual * as exports. should be like import { Foo, .. } from './page'
import * as ApiReference from './page/apiReference'
import * as ComingFromReact from './page/comingFromReact'
import * as BlockPage from './page/core/blockPage'
import * as ExampleDetail from './page/example'
import * as Home from './page/home'
import * as Playground from './page/playground'
import * as Ui from './page/ui'
import { ApplicationRoute } from './route'
import * as Search from './search'
import { SidebarGroups } from './sidebarStorage'
import * as SnippetCopy from './snippetCopy'
import * as SnippetDisclosure from './snippetDisclosure'
import { ThemePreference } from './themePreference'
import { ThemeMenuBlock } from './view/themeMenu'

export const Model = Schema.Struct({
  route: ApplicationRoute,
  url: Url,
  deployment: Deployment,
  snippetCopy: SnippetCopy.SnippetCopyBlock.Model,
  snippetDisclosure: SnippetDisclosure.SnippetDisclosureBlock.Model,
  maybeGitHubStarCount: Schema.Option(Schema.Number),
  currentYear: Schema.Number,
  newsletterEmail: Schema.String,
  mobileMenuDialog: DialogBlock.Model,
  isMobileTableOfContentsOpen: Schema.Boolean,
  activeSection: Schema.Option(Schema.String),
  isNarrowViewport: Schema.Boolean,
  maybeIsPlaygroundSupported: Schema.Option(Schema.Boolean),
  playground: Schema.Option(Playground.PlaygroundBlock.Model),
  sidebarGroups: SidebarGroups,
  coreBlockPage: BlockPage.BlockPageBlock.Model,
  maybeHome: Schema.Option(Home.HomeBlock.Model),
  themeMenu: ThemeMenuBlock.Model,
  maybeThemePreference: Schema.Option(ThemePreference),
  systemTheme: ResolvedTheme,
  resolvedTheme: ResolvedTheme,
  uiPages: Ui.UiBlock.Model,
  comingFromReact: ComingFromReact.ComingFromReactBlock.Model,
  apiReference: ApiReference.ApiReferenceBlock.Model,
  exampleDetail: ExampleDetail.ExampleDetailBlock.Model,
  search: Search.SearchBlock.Model,
})
