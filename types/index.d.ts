export type BannerFlag = boolean

declare module 'claude-code' {
  interface PluginState {
    'task-chime': { isBannerShown: BannerFlag }
  }
}
