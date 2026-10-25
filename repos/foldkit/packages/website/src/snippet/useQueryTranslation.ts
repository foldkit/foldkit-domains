import { Effect, Match, Option, Schema, pipe } from 'effect'
import { AsyncData, Block } from 'foldkit'
import { defineMessageUnion } from 'foldkit/message'
import { modifyFields } from 'foldkit/struct'

const Post = Schema.Struct({ id: Schema.String, title: Schema.String })

const PostsData = AsyncData.Schema(Schema.Array(Post), Schema.String)

const Model = Schema.Struct({
  posts: PostsData.schema,
})

const Message = defineMessageUnion({
  EnteredPostsRoute: {},
  CompletedFetchPosts: {
    result: Schema.Result(Schema.Array(Post), Schema.String),
  },
})

const ApplicationDefinition = Block.makeDefinition('Application', {
  Model,
  Message,
})

const FetchPosts = ApplicationDefinition.makeCommand('FetchPosts', {
  messages: [Message.CompletedFetchPosts],
  handler: function* () {
    return () =>
      pipe(
        fetchPosts,
        Effect.result,
        Effect.map(result => Message.CompletedFetchPosts({ result })),
      )
  },
})

const update = ApplicationComposition.makeUpdate((model, message) =>
  Match.value(message).pipe(
    Match.tagsExhaustive({
      EnteredPostsRoute: () =>
        Option.match(AsyncData.revalidateOrLoad(model.posts), {
          onNone: () => ({ model }),
          onSome: nextPosts => ({
            model: modifyFields(model, { posts: () => nextPosts }),
            commands: [FetchPosts()],
          }),
        }),

      CompletedFetchPosts: ({ result }) => ({
        model: modifyFields(model, { posts: AsyncData.settle(result) }),
      }),
    }),
  ),
)
