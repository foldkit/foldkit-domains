import { Option } from 'effect'
import { modifyFields } from 'foldkit/struct'

import {
  ApplicationComposition,
  PostDetailsBinding,
  PostsBinding,
  StatsBinding,
} from './composition'
import { Message } from './message'

export const update = ApplicationComposition.makeUpdate((model, message) =>
  Message.match(message, {
    ClickedPost: ({ postId }) =>
      PostDetailsBinding.requestLoadIfMissing({ postId })(
        modifyFields(model, {
          maybeSelectedPostId: () => Option.some(postId),
        }),
      ),

    ClickedBackToPosts: () => ({
      model: modifyFields(model, { maybeSelectedPostId: () => Option.none() }),
    }),

    ClickedRefreshPosts: () => PostsBinding.requestRevalidationOrLoad()(model),
    ClickedRetryPosts: () => PostsBinding.requestRevalidationOrLoad()(model),

    ClickedRetryPost: ({ postId }) =>
      PostDetailsBinding.requestRevalidationOrLoad({ postId })(model),

    ClickedRefreshStats: () => StatsBinding.requestRevalidationOrLoad()(model),
    ClickedRetryStats: () => StatsBinding.requestRevalidationOrLoad()(model),
    TickedStatsRefreshInterval: () => StatsBinding.requestRevalidation()(model),
  }),
)
