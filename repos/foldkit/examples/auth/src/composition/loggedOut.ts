import { Match, Option } from 'effect'

import { RedirectToDashboard, SaveSession } from '../command'
import { ApplicationDefinition } from '../definition'
import { LoggedInBlock, LoggedOutBlock } from '../page'
import { ApplicationRoute } from '../route'

const foldLoggedOutOutMessage = ApplicationDefinition.makeOutMessageFold(
  LoggedOutBlock,
  {
    SucceededLogin: ({ session }) =>
      ApplicationDefinition.makeStep(() => ({
        model: LoggedInBlock.init(ApplicationRoute.Dashboard(), session).model,
        commands: [SaveSession({ session }), RedirectToDashboard()],
      })),
  },
)

export const LoggedOutBinding = ApplicationDefinition.makeBinding(
  LoggedOutBlock,
  {
    read: model =>
      Match.value(model).pipe(
        Match.tagsExhaustive({
          LoggedOut: loggedOutModel => Option.some(loggedOutModel),
          LoggedIn: () => Option.none(),
        }),
      ),
    write: (_model, nextLoggedOut) => nextLoggedOut,
  },
).withOutMessagePolicy({ fold: foldLoggedOutOutMessage })
