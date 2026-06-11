export interface Direction {
  x: number
  y: number
}

export class TouchJoystick {
  readonly direction: Direction = { x: 0, y: 0 }
  active = false
  centerX = 0
  centerY = 0
  knobX = 0
  knobY = 0

  private touchId: number | null = null
  private readonly radius = 52

  constructor(
    private screenHeight: number,
    private readonly shouldIgnoreTouch: (touch: WeChatTouch) => boolean = () =>
      false,
  ) {
    wx.onTouchStart((event) => this.handleStart(event))
    wx.onTouchMove((event) => this.handleMove(event))
    wx.onTouchEnd((event) => this.handleEnd(event))
    wx.onTouchCancel((event) => this.handleEnd(event))
  }

  resize(screenHeight: number): void {
    this.screenHeight = screenHeight
    if (!this.active) {
      this.centerX = 0
      this.centerY = 0
      this.knobX = 0
      this.knobY = 0
    }
  }

  private handleStart(event: WeChatTouchEvent): void {
    if (this.touchId !== null) {
      return
    }
    const touch = event.changedTouches[0]
    if (
      !touch ||
      this.shouldIgnoreTouch(touch) ||
      touch.clientY < this.screenHeight * 0.45
    ) {
      return
    }

    this.touchId = touch.identifier
    this.active = true
    this.centerX = touch.clientX
    this.centerY = touch.clientY
    this.knobX = touch.clientX
    this.knobY = touch.clientY
  }

  private handleMove(event: WeChatTouchEvent): void {
    if (this.touchId === null) {
      return
    }
    const touch = event.touches.find(
      (candidate) => candidate.identifier === this.touchId,
    )
    if (!touch) {
      return
    }

    const dx = touch.clientX - this.centerX
    const dy = touch.clientY - this.centerY
    const distance = Math.hypot(dx, dy)
    const scale = distance > this.radius ? this.radius / distance : 1
    const normalizedDistance = Math.min(1, distance / this.radius)

    this.knobX = this.centerX + dx * scale
    this.knobY = this.centerY + dy * scale
    this.direction.x = distance ? (dx / distance) * normalizedDistance : 0
    this.direction.y = distance ? (dy / distance) * normalizedDistance : 0
  }

  private handleEnd(event: WeChatTouchEvent): void {
    if (
      this.touchId === null ||
      !event.changedTouches.some((touch) => touch.identifier === this.touchId)
    ) {
      return
    }

    this.touchId = null
    this.active = false
    this.direction.x = 0
    this.direction.y = 0
  }
}
