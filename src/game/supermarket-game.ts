import { GameStore } from '@/store/game-store'
import { TouchJoystick } from '@/game/input'
import {
  ENTRANCE,
  getAppleShelf,
  isNear,
  REGISTER,
  SHELF,
  SOURCE,
  type RuntimeCustomer,
  UNLOCK_PAD,
  WORLD_HEIGHT,
  WORLD_WIDTH,
} from '@/game/world'

const PLAYER_RADIUS = 24
const INTERACTION_COOLDOWN = 450

export class SupermarketGame {
  private readonly canvas = wx.createCanvas()
  private readonly context = this.canvas.getContext('2d')!
  private readonly store = new GameStore()
  private readonly customers: RuntimeCustomer[] = []
  private readonly joystick: TouchJoystick
  private readonly viewport = {
    width: this.canvas.width,
    height: this.canvas.height,
  }

  private scale = 1
  private offsetX = 0
  private offsetY = 0
  private lastFrame = 0
  private lastInteractionAt = 0
  private lastPositionSaveAt = 0
  private lastCustomerSpawnAt = 0
  private nextCustomerId = 1
  private pendingCoins = 0
  private paused = false

  constructor() {
    this.scale = Math.min(
      this.viewport.width / WORLD_WIDTH,
      this.viewport.height / WORLD_HEIGHT,
    )
    this.offsetX =
      (this.viewport.width - WORLD_WIDTH * this.scale) / 2
    this.offsetY =
      (this.viewport.height - WORLD_HEIGHT * this.scale) / 2

    this.joystick = new TouchJoystick(this.viewport.height)
    wx.onHide(() => {
      this.paused = true
    })
    wx.onShow(() => {
      this.paused = false
      this.lastFrame = 0
    })
  }

  async start(): Promise<void> {
    this.loop(0)
    await this.store.initialize()
  }

  private loop = (time: number): void => {
    const deltaSeconds = this.lastFrame
      ? Math.min((time - this.lastFrame) / 1000, 0.05)
      : 0
    this.lastFrame = time

    if (!this.paused) {
      this.update(deltaSeconds, time)
      this.render()
    }
    requestAnimationFrame(this.loop)
  }

  private update(deltaSeconds: number, time: number): void {
    const profile = this.store.profile
    const player = profile.player
    const speed = 180 + (player.moveSpeedLevel - 1) * 18
    player.position.x = this.clamp(
      player.position.x + this.joystick.direction.x * speed * deltaSeconds,
      PLAYER_RADIUS,
      WORLD_WIDTH - PLAYER_RADIUS,
    )
    player.position.y = this.clamp(
      player.position.y + this.joystick.direction.y * speed * deltaSeconds,
      PLAYER_RADIUS + 80,
      WORLD_HEIGHT - PLAYER_RADIUS,
    )

    if (time - this.lastPositionSaveAt > 2000) {
      this.lastPositionSaveAt = time
      this.store.mutate('movement', () => {})
    }

    this.handlePlayerInteractions(time)
    this.updateCustomers(deltaSeconds, time)
  }

  private handlePlayerInteractions(time: number): void {
    if (time - this.lastInteractionAt < INTERACTION_COOLDOWN) {
      return
    }

    const profile = this.store.profile
    const player = profile.player
    const appleStack = player.backpack.find(
      (stack) => stack.productId === 'apple',
    )
    const carried = appleStack?.quantity ?? 0

    if (
      isNear(player.position.x, player.position.y, SOURCE) &&
      carried < player.backpackCapacity
    ) {
      this.lastInteractionAt = time
      this.store.mutate('production', (draft) => {
        const stack = draft.player.backpack.find(
          (item) => item.productId === 'apple',
        )
        if (stack) {
          stack.quantity += 1
        } else {
          draft.player.backpack.push({ productId: 'apple', quantity: 1 })
        }
      })
      return
    }

    const shelf = getAppleShelf(profile)
    if (
      shelf &&
      carried > 0 &&
      shelf.stock < shelf.capacity &&
      isNear(player.position.x, player.position.y, SHELF)
    ) {
      this.lastInteractionAt = time
      this.store.mutate('restock', (draft) => {
        const draftShelf = getAppleShelf(draft)
        const stack = draft.player.backpack.find(
          (item) => item.productId === 'apple',
        )
        if (!draftShelf || !stack) {
          return
        }
        const quantity = Math.min(
          stack.quantity,
          draftShelf.capacity - draftShelf.stock,
        )
        draftShelf.stock += quantity
        stack.quantity -= quantity
        draft.player.backpack = draft.player.backpack.filter(
          (item) => item.quantity > 0,
        )
      })
      return
    }

    if (
      this.pendingCoins > 0 &&
      isNear(player.position.x, player.position.y, REGISTER)
    ) {
      this.lastInteractionAt = time
      const coins = this.pendingCoins
      this.pendingCoins = 0
      this.store.mutate('coin-collected', (draft) => {
        draft.economy.coins += coins
        draft.economy.lifetimeCoins += coins
        draft.statistics.coinsCollected += coins
      })
      return
    }

    if (
      !profile.world.unlockedAreaIds.includes('milk-zone') &&
      profile.economy.coins >= 20 &&
      isNear(player.position.x, player.position.y, UNLOCK_PAD)
    ) {
      this.lastInteractionAt = time
      this.store.mutate('unlock', (draft) => {
        draft.economy.coins -= 20
        draft.economy.lifetimeSpent += 20
        draft.world.unlockedAreaIds.push('milk-zone')
      })
    }
  }

  private updateCustomers(deltaSeconds: number, time: number): void {
    if (time - this.lastCustomerSpawnAt > 5000 && this.customers.length < 5) {
      this.lastCustomerSpawnAt = time
      this.customers.push({
        id: this.nextCustomerId++,
        x: ENTRANCE.x,
        y: ENTRANCE.y,
        state: 'entering',
        hasProduct: false,
      })
    }

    const shelf = getAppleShelf(this.store.profile)
    for (const customer of this.customers) {
      if (customer.state === 'entering' || customer.state === 'shopping') {
        customer.state = 'shopping'
        if (this.moveTowards(customer, SHELF.x + 75, SHELF.y + 210, deltaSeconds)) {
          if (shelf && shelf.stock > 0) {
            this.store.mutate('checkout', (draft) => {
              const draftShelf = getAppleShelf(draft)
              if (draftShelf && draftShelf.stock > 0) {
                draftShelf.stock -= 1
              }
            })
            customer.hasProduct = true
            customer.state = 'checkout'
          }
        }
      } else if (customer.state === 'checkout') {
        if (
          this.moveTowards(
            customer,
            REGISTER.x + REGISTER.width / 2,
            REGISTER.y + REGISTER.height + 30,
            deltaSeconds,
          )
        ) {
          if (customer.hasProduct) {
            this.pendingCoins += 3
            this.store.mutate('checkout', (draft) => {
              draft.statistics.customersServed += 1
              draft.statistics.productsSold += 1
            })
          }
          customer.state = 'leaving'
        }
      } else if (
        this.moveTowards(customer, ENTRANCE.x, ENTRANCE.y, deltaSeconds)
      ) {
        customer.x = WORLD_WIDTH + 100
      }
    }

    for (let index = this.customers.length - 1; index >= 0; index -= 1) {
      if (this.customers[index].x > WORLD_WIDTH) {
        this.customers.splice(index, 1)
      }
    }
  }

  private moveTowards(
    customer: RuntimeCustomer,
    targetX: number,
    targetY: number,
    deltaSeconds: number,
  ): boolean {
    const dx = targetX - customer.x
    const dy = targetY - customer.y
    const distance = Math.hypot(dx, dy)
    if (distance < 5) {
      return true
    }
    const speed = 95
    customer.x += (dx / distance) * speed * deltaSeconds
    customer.y += (dy / distance) * speed * deltaSeconds
    return false
  }

  private render(): void {
    const ctx = this.context
    ctx.clearRect(
      0,
      0,
      this.viewport.width,
      this.viewport.height,
    )
    ctx.fillStyle = '#dfead9'
    ctx.fillRect(
      0,
      0,
      this.viewport.width,
      this.viewport.height,
    )

    ctx.save()
    ctx.translate(this.offsetX, this.offsetY)
    ctx.scale(this.scale, this.scale)
    this.drawWorld(ctx)
    ctx.restore()

    this.drawHud(ctx)
    this.drawJoystick(ctx)
  }

  private drawWorld(ctx: CanvasRenderingContext2D): void {
    ctx.fillStyle = '#f8f3e7'
    ctx.fillRect(0, 70, WORLD_WIDTH, WORLD_HEIGHT - 70)

    this.drawZone(ctx, SOURCE.x, SOURCE.y, SOURCE.width, SOURCE.height, '#86c45b')
    ctx.fillStyle = '#ffffff'
    ctx.font = 'bold 26px sans-serif'
    ctx.fillText('苹果货源', SOURCE.x + 20, SOURCE.y + 82)

    this.drawZone(ctx, SHELF.x, SHELF.y, SHELF.width, SHELF.height, '#d38c48')
    const shelf = getAppleShelf(this.store.profile)
    ctx.fillStyle = '#ffffff'
    ctx.fillText(`货架 ${shelf?.stock ?? 0}/${shelf?.capacity ?? 0}`, SHELF.x + 14, SHELF.y + 95)

    this.drawZone(
      ctx,
      REGISTER.x,
      REGISTER.y,
      REGISTER.width,
      REGISTER.height,
      '#4f8cad',
    )
    ctx.fillStyle = '#ffffff'
    ctx.fillText(`收银台 +${this.pendingCoins}`, REGISTER.x + 18, REGISTER.y + 72)

    const unlocked = this.store.profile.world.unlockedAreaIds.includes('milk-zone')
    this.drawZone(
      ctx,
      UNLOCK_PAD.x,
      UNLOCK_PAD.y,
      UNLOCK_PAD.width,
      UNLOCK_PAD.height,
      unlocked ? '#9fb39b' : '#f0bf45',
    )
    ctx.fillStyle = '#4d3b13'
    ctx.fillText(unlocked ? '牛奶区已解锁' : '20 金币解锁', UNLOCK_PAD.x + 12, UNLOCK_PAD.y + 70)

    for (const customer of this.customers) {
      ctx.beginPath()
      ctx.fillStyle = '#7257a8'
      ctx.arc(customer.x, customer.y, 20, 0, Math.PI * 2)
      ctx.fill()
      if (customer.hasProduct) {
        ctx.fillStyle = '#e84f45'
        ctx.fillRect(customer.x + 12, customer.y - 24, 12, 12)
      }
    }

    const player = this.store.profile.player
    ctx.beginPath()
    ctx.fillStyle = '#247239'
    ctx.arc(player.position.x, player.position.y, PLAYER_RADIUS, 0, Math.PI * 2)
    ctx.fill()
    ctx.strokeStyle = '#ffffff'
    ctx.lineWidth = 5
    ctx.stroke()

    const carried =
      player.backpack.find((stack) => stack.productId === 'apple')?.quantity ?? 0
    ctx.fillStyle = '#1e2a1f'
    ctx.font = 'bold 24px sans-serif'
    ctx.fillText(
      `背包 ${carried}/${player.backpackCapacity}`,
      player.position.x - 55,
      player.position.y - 38,
    )
  }

  private drawHud(ctx: CanvasRenderingContext2D): void {
    ctx.fillStyle = 'rgba(255,255,255,0.94)'
    ctx.fillRect(12, 12, this.viewport.width - 24, 62)
    ctx.fillStyle = '#243326'
    ctx.font = 'bold 19px sans-serif'
    ctx.fillText(`金币 ${this.store.profile.economy.coins}`, 26, 39)
    ctx.font = '13px sans-serif'
    ctx.fillStyle = this.store.syncStatus === 'error' ? '#b42318' : '#58705c'
    const message =
      this.store.syncStatus === 'offline'
        ? `离线存档 · ${this.store.lastError}`
        : `存档：${this.store.syncStatus}`
    ctx.fillText(message.slice(0, 46), 26, 61)
  }

  private drawJoystick(ctx: CanvasRenderingContext2D): void {
    if (!this.joystick.active) {
      ctx.fillStyle = 'rgba(36, 114, 57, 0.12)'
      ctx.beginPath()
      ctx.arc(86, this.viewport.height - 88, 48, 0, Math.PI * 2)
      ctx.fill()
      ctx.fillStyle = '#58705c'
      ctx.font = '13px sans-serif'
      ctx.fillText('触摸移动', 58, this.viewport.height - 84)
      return
    }

    ctx.fillStyle = 'rgba(36, 114, 57, 0.2)'
    ctx.beginPath()
    ctx.arc(this.joystick.centerX, this.joystick.centerY, 52, 0, Math.PI * 2)
    ctx.fill()
    ctx.fillStyle = 'rgba(36, 114, 57, 0.65)'
    ctx.beginPath()
    ctx.arc(this.joystick.knobX, this.joystick.knobY, 23, 0, Math.PI * 2)
    ctx.fill()
  }

  private drawZone(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    width: number,
    height: number,
    color: string,
  ): void {
    const radius = Math.min(18, width / 2, height / 2)
    ctx.fillStyle = color
    ctx.beginPath()
    ctx.moveTo(x + radius, y)
    ctx.lineTo(x + width - radius, y)
    ctx.quadraticCurveTo(x + width, y, x + width, y + radius)
    ctx.lineTo(x + width, y + height - radius)
    ctx.quadraticCurveTo(
      x + width,
      y + height,
      x + width - radius,
      y + height,
    )
    ctx.lineTo(x + radius, y + height)
    ctx.quadraticCurveTo(x, y + height, x, y + height - radius)
    ctx.lineTo(x, y + radius)
    ctx.quadraticCurveTo(x, y, x + radius, y)
    ctx.closePath()
    ctx.fill()
  }

  private clamp(value: number, minimum: number, maximum: number): number {
    return Math.max(minimum, Math.min(maximum, value))
  }
}
