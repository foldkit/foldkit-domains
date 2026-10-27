declare module 'cloudflare:workers' {
  export const env: import('./server/coordination').SearchEnvironment
}
