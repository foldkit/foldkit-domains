declare module 'cloudflare:workers' {
  export const DurableObject: typeof import('@cloudflare/workers-types').CloudflareWorkersModule.DurableObject
  export const env: import('./server/coordination').SearchEnvironment & {
    readonly COORDINATOR_STAGE?: string
  }
}
