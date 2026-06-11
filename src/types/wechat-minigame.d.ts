interface WeChatTouch {
  identifier: number
  clientX: number
  clientY: number
}

interface WeChatTouchEvent {
  touches: WeChatTouch[]
  changedTouches: WeChatTouch[]
}

interface WeChatWindowInfo {
  windowWidth: number
  windowHeight: number
  screenWidth: number
  screenHeight: number
  pixelRatio: number
  safeArea?: WeChatSafeArea
  safeAreaInsets?: WeChatSafeAreaInsets
}

interface WeChatSafeArea {
  left: number
  right: number
  top: number
  bottom: number
  width: number
  height: number
}

interface WeChatSafeAreaInsets {
  left: number
  right: number
  top: number
  bottom: number
}

interface WeChatWindowResizeResult {
  windowWidth?: number
  windowHeight?: number
  size?: {
    windowWidth: number
    windowHeight: number
  }
}

interface WeChatCloud {
  init(options: { env?: string; traceUser?: boolean }): void
  callFunction<T = unknown>(options: {
    name: string
    data?: Record<string, unknown>
  }): Promise<{ result?: T; errMsg?: string }>
}

interface WeChatMiniGameApi {
  createCanvas(): HTMLCanvasElement
  getWindowInfo(): WeChatWindowInfo
  getStorageSync(key: string): unknown
  setStorageSync(key: string, value: unknown): void
  login(): Promise<{ code: string }>
  onTouchStart(callback: (event: WeChatTouchEvent) => void): void
  onTouchMove(callback: (event: WeChatTouchEvent) => void): void
  onTouchEnd(callback: (event: WeChatTouchEvent) => void): void
  onTouchCancel(callback: (event: WeChatTouchEvent) => void): void
  onHide(callback: () => void): void
  onShow(callback: () => void): void
  onWindowResize(
    callback: (result: WeChatWindowResizeResult) => void,
  ): void
  cloud?: WeChatCloud
}

declare const wx: WeChatMiniGameApi
declare const __DEV__: boolean
