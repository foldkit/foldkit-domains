import { Match, Option } from 'effect'

import { ClearSession, RedirectToHome } from '../command'
import { ApplicationDefinition } from '../definition'
import { LoggedInBlock, LoggedOutBlock } from '../page'
import { ApplicationRoute } from '../route'

const foldLoggedInOutMessage = ApplicationDefinition.makeOutMessageFold(
  LoggedInBlock,
  {
    RequestedLogout: () =>
      ApplicationDefinition.makeStep(() => ({
        model: LoggedOutBlock.init(ApplicationRoute.Home()).model,
        commands: [ClearSession(), RedirectToHome()],
      })),
  },
)

export const LoggedInBinding = ApplicationDefinition.makeBinding(
  LoggedInBlock,
  {
    read: model =>
      Match.value(model).pipe(
        Match.tagsExhaustive({
          LoggedOut: () => Option.none(),
          LoggedIn: loggedInModel => Option.some(loggedInModel),
        }),
      ),
    write: (_model, nextLoggedIn) => nextLoggedIn,
  },
).withOutMessagePolicy({ fold: foldLoggedInOutMessage })
