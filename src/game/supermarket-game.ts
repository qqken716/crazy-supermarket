import type { ProductId, UserProfile } from '@/domain/game-profile'
import { TouchJoystick } from '@/game/input'
import {
  ENTRANCE,
  getBackpackQuantity,
  getBackpackTotal,
  getProductionNode,
  getShelf,
  isNear,
  PRODUCT_COLORS,
  PRODUCTION_DURATION_MS,
  PRODUCTION_RECTS,
  REGISTER,
  SHELF_RECTS,
  SOURCE_RECTS,
  type Rect,
  type RuntimeCustomer,
  UNLOCK_PAD,
  WORLD_HEIGHT,
  WORLD_WIDTH,
} from '@/game/world'
import { GameStore } from '@/store/game-store'

const PLAYER_COLLISION_RADIUS = 18
const CUSTOMER_COLLISION_RADIUS = 13
const INTERACTION_COOLDOWN = 180
const CAMERA_EDGE_PADDING = 80
const STORE_FLOOR: Rect = { x: 220, y: 85, width: 1450, height: 655 }
const DECORATION_COLLIDERS: Rect[] = [
  { x: 310, y: 137, width: 235, height: 90 },
  { x: 1180, y: 144, width: 60, height: 82 },
  { x: 254, y: 202, width: 40, height: 64 },
  { x: 1582, y: 140, width: 48, height: 78 },
]
const PRODUCT_PRICES: Record<string, number> = {
  apple: 3,
  tomato: 4,
  egg: 6,
  milk: 8,
}
const CUSTOMER_COLORS = ['#ff72ca', '#8d67eb', '#ff916c', '#54c9df']

export class SupermarketGame {
  private readonly canvas = wx.createCanvas()
  private readonly context = this.canvas.getContext('2d')!
  private readonly store = new GameStore()
  private readonly customers: RuntimeCustomer[] = []
  private readonly joystick: TouchJoystick
  private viewport = {
    width: 1,
    height: 1,
    pixelRatio: 1,
  }
  private safeInsets = {
    left: 0,
    right: 0,
    top: 0,
    bottom: 0,
  }

  private cameraX = 900
  private cameraY = 550
  private baseCameraZoom = 0.7
  private cameraZoom = 0.7
  private settingsOpen = false
  private settingsPanelProgress = 0
  private lastFrame = 0
  private lastInteractionAt = 0
  private lastPositionSaveAt = 0
  private lastCustomerSpawnAt = 0
  private nextCustomerId = 1
  private nextShelfIndex = 0
  private pendingCoins = 0
  private animationTime = 0
  private paused = false

  constructor() {
    const windowInfo = wx.getWindowInfo()
    this.applyViewport(
      windowInfo.windowWidth,
      windowInfo.windowHeight,
      windowInfo.pixelRatio,
      windowInfo,
    )
    this.cameraX = this.store.profile.player.position.x
    this.cameraY = this.store.profile.player.position.y

    this.joystick = new TouchJoystick(
      this.viewport.height,
      () => this.settingsOpen,
    )
    wx.onTouchStart((event) => this.handleUiTouchStart(event))
    wx.onWindowResize((result) => {
      const width = result.windowWidth ?? result.size?.windowWidth
      const height = result.windowHeight ?? result.size?.windowHeight
      const current = wx.getWindowInfo()
      this.applyViewport(
        width ?? current.windowWidth,
        height ?? current.windowHeight,
        current.pixelRatio,
        current,
      )
    })
    wx.onHide(() => {
      this.paused = true
    })
    wx.onShow(() => {
      const current = wx.getWindowInfo()
      this.applyViewport(
        current.windowWidth,
        current.windowHeight,
        current.pixelRatio,
        current,
      )
      this.paused = false
      this.lastFrame = 0
    })
  }

  async start(): Promise<void> {
    this.loop(0)
    await this.store.initialize()
    this.recoverPlayerPosition()
    this.updateCameraZoom()
    this.cameraX = this.store.profile.player.position.x
    this.cameraY = this.store.profile.player.position.y
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
    const player = this.store.profile.player
    const speed = 245 + (player.moveSpeedLevel - 1) * 24
    this.movePlayer(
      this.joystick.direction.x * speed * deltaSeconds,
      this.joystick.direction.y * speed * deltaSeconds,
    )
    this.animationTime += deltaSeconds
    const panelTarget = this.settingsOpen ? 1 : 0
    this.settingsPanelProgress +=
      (panelTarget - this.settingsPanelProgress) *
      Math.min(1, deltaSeconds * 12)
    this.updateCamera(deltaSeconds)

    if (time - this.lastPositionSaveAt > 2000) {
      this.lastPositionSaveAt = time
      this.store.mutate('movement', () => {})
    }

    this.updateProduction(Date.now())
    this.handlePlayerInteractions(time)
    this.updateCustomers(deltaSeconds, time)
  }

  private updateCamera(deltaSeconds: number): void {
    const player = this.store.profile.player
    const follow = Math.min(1, deltaSeconds * 7.5)
    this.cameraX += (player.position.x - this.cameraX) * follow
    this.cameraY += (player.position.y - this.cameraY) * follow

    this.cameraX = this.clamp(
      this.cameraX,
      CAMERA_EDGE_PADDING,
      WORLD_WIDTH - CAMERA_EDGE_PADDING,
    )
    this.cameraY = this.clamp(
      this.cameraY,
      CAMERA_EDGE_PADDING,
      WORLD_HEIGHT - CAMERA_EDGE_PADDING,
    )
  }

  private applyViewport(
    reportedWidth: number,
    reportedHeight: number,
    reportedPixelRatio: number,
    windowInfo: WeChatWindowInfo,
  ): void {
    // The game is locked to landscape. Some phones report the pre-rotation
    // portrait dimensions during the first startup frame.
    const width = Math.max(reportedWidth, reportedHeight)
    const height = Math.min(reportedWidth, reportedHeight)
    const pixelRatio = Math.max(1, Math.min(reportedPixelRatio || 1, 2))

    this.viewport = { width, height, pixelRatio }
    this.safeInsets = this.resolveSafeInsets(
      windowInfo,
      reportedWidth,
      reportedHeight,
    )
    this.canvas.width = Math.round(width * pixelRatio)
    this.canvas.height = Math.round(height * pixelRatio)
    this.baseCameraZoom = Math.min(
      0.9,
      Math.max(0.58, Math.min(width / 1050, height / 620)),
    )
    this.updateCameraZoom()
    this.joystick?.resize(height)
  }

  private resolveSafeInsets(
    info: WeChatWindowInfo,
    reportedWidth: number,
    reportedHeight: number,
  ): { left: number; right: number; top: number; bottom: number } {
    let left = info.safeAreaInsets?.left ?? 0
    let right = info.safeAreaInsets?.right ?? 0
    let top = info.safeAreaInsets?.top ?? 0
    let bottom = info.safeAreaInsets?.bottom ?? 0

    if (info.safeArea) {
      const safeLooksPortrait = info.safeArea.height > info.safeArea.width
      if (safeLooksPortrait) {
        const portraitWidth = Math.min(info.screenWidth, info.screenHeight)
        const portraitHeight = Math.max(info.screenWidth, info.screenHeight)
        left = info.safeArea.top
        right = Math.max(0, portraitHeight - info.safeArea.bottom)
        top = Math.max(0, portraitWidth - info.safeArea.right)
        bottom = info.safeArea.left
      } else {
        left = info.safeArea.left
        right = Math.max(0, reportedWidth - info.safeArea.right)
        top = info.safeArea.top
        bottom = Math.max(0, reportedHeight - info.safeArea.bottom)
      }
    } else if (reportedWidth < reportedHeight) {
      const previousLeft = left
      left = top
      top = right
      right = bottom
      bottom = previousLeft
    }

    return {
      left: this.clamp(left, 0, 100),
      right: this.clamp(right, 0, 100),
      top: this.clamp(top, 0, 60),
      bottom: this.clamp(bottom, 0, 60),
    }
  }

  private getCollisionRects(): Rect[] {
    const profile = this.store.profile
    const rects: Rect[] = [
      this.insetRect(REGISTER, 10, 8),
      ...DECORATION_COLLIDERS,
    ]

    for (const source of profile.world.sourceNodes) {
      const rect = SOURCE_RECTS[source.sourceId]
      if (source.unlocked && rect) {
        rects.push(this.insetRect(rect, 9, 7))
      }
    }
    for (const node of profile.world.productionNodes) {
      const rect = PRODUCTION_RECTS[node.nodeId]
      if (node.unlocked && rect) {
        rects.push(this.insetRect(rect, 9, 7))
      }
    }
    for (const shelf of profile.world.shelves) {
      const rect = SHELF_RECTS[shelf.shelfId]
      if (shelf.unlocked && rect) {
        rects.push(this.insetRect(rect, 10, 7))
      }
    }

    return rects
  }

  private insetRect(rect: Rect, insetX: number, insetY: number): Rect {
    return {
      x: rect.x + insetX,
      y: rect.y + insetY,
      width: Math.max(1, rect.width - insetX * 2),
      height: Math.max(1, rect.height - insetY * 2),
    }
  }

  private isPositionBlocked(x: number, y: number, radius: number): boolean {
    if (
      x < radius ||
      x > WORLD_WIDTH - radius ||
      y < radius ||
      y > WORLD_HEIGHT - radius
    ) {
      return true
    }

    return this.getCollisionRects().some((rect) => {
      const nearestX = this.clamp(x, rect.x, rect.x + rect.width)
      const nearestY = this.clamp(y, rect.y, rect.y + rect.height)
      const dx = x - nearestX
      const dy = y - nearestY
      return dx * dx + dy * dy < radius * radius
    })
  }

  private movePlayer(deltaX: number, deltaY: number): void {
    const position = this.store.profile.player.position
    const nextX = this.clamp(
      position.x + deltaX,
      PLAYER_COLLISION_RADIUS,
      WORLD_WIDTH - PLAYER_COLLISION_RADIUS,
    )
    if (!this.isPositionBlocked(nextX, position.y, PLAYER_COLLISION_RADIUS)) {
      position.x = nextX
    }

    const nextY = this.clamp(
      position.y + deltaY,
      PLAYER_COLLISION_RADIUS,
      WORLD_HEIGHT - PLAYER_COLLISION_RADIUS,
    )
    if (!this.isPositionBlocked(position.x, nextY, PLAYER_COLLISION_RADIUS)) {
      position.y = nextY
    }
  }

  private recoverPlayerPosition(): void {
    const position = this.store.profile.player.position
    if (
      !this.isPositionBlocked(
        position.x,
        position.y,
        PLAYER_COLLISION_RADIUS,
      )
    ) {
      return
    }

    for (let distance = 24; distance <= 320; distance += 16) {
      for (let index = 0; index < 24; index += 1) {
        const angle = (Math.PI * 2 * index) / 24
        const x = this.clamp(
          position.x + Math.cos(angle) * distance,
          PLAYER_COLLISION_RADIUS,
          WORLD_WIDTH - PLAYER_COLLISION_RADIUS,
        )
        const y = this.clamp(
          position.y + Math.sin(angle) * distance,
          PLAYER_COLLISION_RADIUS,
          WORLD_HEIGHT - PLAYER_COLLISION_RADIUS,
        )
        if (!this.isPositionBlocked(x, y, PLAYER_COLLISION_RADIUS)) {
          position.x = x
          position.y = y
          this.store.mutate('movement', () => {})
          return
        }
      }
    }
  }

  private updateCameraZoom(): void {
    const scale = this.store.profile.settings.cameraScale ?? 1
    this.cameraZoom = this.clamp(this.baseCameraZoom * scale, 0.48, 1.12)
  }

  private handleUiTouchStart(event: WeChatTouchEvent): void {
    const touch = event.changedTouches[0]
    if (!touch) {
      return
    }

    const layout = this.getSettingsLayout()
    if (
      touch.clientX >= layout.gearX - 4 &&
      touch.clientX <= layout.gearX + 58 &&
      touch.clientY >= layout.gearY - 4 &&
      touch.clientY <= layout.gearY + 58
    ) {
      this.settingsOpen = !this.settingsOpen
      return
    }

    if (!this.settingsOpen) {
      return
    }

    const choices = [0.78, 1, 1.22]
    for (let index = 0; index < choices.length; index += 1) {
      const x = layout.panelX + 12 + index * 78
      if (
        touch.clientX >= x &&
        touch.clientX <= x + 66 &&
        touch.clientY >= layout.buttonY &&
        touch.clientY <= layout.buttonY + 43
      ) {
        const cameraScale = choices[index]
        this.store.mutate('settings', (draft) => {
          draft.settings.cameraScale = cameraScale
        })
        this.updateCameraZoom()
        return
      }
    }

    if (
      touch.clientX < layout.panelX ||
      touch.clientX > layout.panelX + layout.panelWidth ||
      touch.clientY < layout.panelY ||
      touch.clientY > layout.panelY + 145
    ) {
      this.settingsOpen = false
    }
  }

  private getSettingsLayout(): {
    gearX: number
    gearY: number
    panelX: number
    panelY: number
    panelWidth: number
    buttonY: number
  } {
    const safeLeft = this.safeInsets.left + 10
    const safeTop = this.safeInsets.top + 10
    const panelWidth = Math.min(
      270,
      this.viewport.width - safeLeft - this.safeInsets.right - 20,
    )
    const panelY = safeTop + 68
    const panelX =
      -panelWidth +
      (safeLeft + panelWidth) * this.settingsPanelProgress
    return {
      gearX: safeLeft,
      gearY: safeTop,
      panelX,
      panelY,
      panelWidth,
      buttonY: panelY + 75,
    }
  }

  private updateProduction(now: number): void {
    const completedNodeIds = this.store.profile.world.productionNodes
      .filter((node) => {
        const duration = PRODUCTION_DURATION_MS[node.nodeId]
        return (
          node.unlocked &&
          duration &&
          node.processingStartedAt !== null &&
          now - node.processingStartedAt >= duration
        )
      })
      .map((node) => node.nodeId)

    if (completedNodeIds.length === 0) {
      return
    }

    this.store.mutate('production', (draft) => {
      for (const nodeId of completedNodeIds) {
        const node = getProductionNode(draft, nodeId)
        if (!node || node.processingStartedAt === null) {
          continue
        }
        node.inputStock = Math.max(0, node.inputStock - 1)
        node.outputStock = Math.min(node.capacity, node.outputStock + 1)
        node.processingStartedAt =
          node.inputStock > 0 && node.outputStock < node.capacity ? now : null
      }
    })
  }

  private handlePlayerInteractions(time: number): void {
    if (time - this.lastInteractionAt < INTERACTION_COOLDOWN) {
      return
    }

    const profile = this.store.profile
    const player = profile.player
    const backpackTotal = getBackpackTotal(profile)

    for (const node of profile.world.productionNodes) {
      const rect = PRODUCTION_RECTS[node.nodeId]
      if (
        node.unlocked &&
        rect &&
        node.outputStock > 0 &&
        backpackTotal < player.backpackCapacity &&
        isNear(player.position.x, player.position.y, rect)
      ) {
        this.lastInteractionAt = time
        this.store.mutate('production', (draft) => {
          const draftNode = getProductionNode(draft, node.nodeId)
          if (!draftNode || draftNode.outputStock <= 0) {
            return
          }
          draftNode.outputStock -= 1
          this.addToBackpack(draft, draftNode.outputProductId, 1)
          if (
            draftNode.processingStartedAt === null &&
            draftNode.inputStock > 0
          ) {
            draftNode.processingStartedAt = Date.now()
          }
        })
        return
      }
    }

    for (const node of profile.world.productionNodes) {
      const rect = PRODUCTION_RECTS[node.nodeId]
      const carriedInput = getBackpackQuantity(profile, node.inputProductId)
      if (
        node.unlocked &&
        rect &&
        carriedInput > 0 &&
        node.inputStock < node.capacity &&
        isNear(player.position.x, player.position.y, rect)
      ) {
        this.lastInteractionAt = time
        this.store.mutate('production', (draft) => {
          const draftNode = getProductionNode(draft, node.nodeId)
          if (!draftNode || draftNode.inputStock >= draftNode.capacity) {
            return
          }
          this.removeFromBackpack(draft, draftNode.inputProductId, 1)
          draftNode.inputStock += 1
          draftNode.processingStartedAt ??= Date.now()
        })
        return
      }
    }

    for (const source of profile.world.sourceNodes) {
      const rect = SOURCE_RECTS[source.sourceId]
      if (
        source.unlocked &&
        rect &&
        backpackTotal < player.backpackCapacity &&
        isNear(player.position.x, player.position.y, rect)
      ) {
        this.lastInteractionAt = time
        this.store.mutate('production', (draft) => {
          this.addToBackpack(draft, source.productId, 1)
        })
        return
      }
    }

    for (const shelf of profile.world.shelves) {
      const rect = SHELF_RECTS[shelf.shelfId]
      const carried = getBackpackQuantity(profile, shelf.productId)
      if (
        shelf.unlocked &&
        rect &&
        carried > 0 &&
        shelf.stock < shelf.capacity &&
        isNear(player.position.x, player.position.y, rect)
      ) {
        this.lastInteractionAt = time
        this.store.mutate('restock', (draft) => {
          const draftShelf = getShelf(draft, shelf.shelfId)
          if (!draftShelf) {
            return
          }
          const quantity = Math.min(
            getBackpackQuantity(draft, shelf.productId),
            draftShelf.capacity - draftShelf.stock,
          )
          draftShelf.stock += quantity
          this.removeFromBackpack(draft, shelf.productId, quantity)
        })
        return
      }
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
        draft.world.sourceNodes
          .filter((source) => source.sourceId === 'tomato-patch-01')
          .forEach((source) => {
            source.unlocked = true
          })
        draft.world.productionNodes.forEach((node) => {
          node.unlocked = true
        })
        draft.world.shelves
          .filter((shelf) => shelf.productId !== 'apple')
          .forEach((shelf) => {
            shelf.unlocked = true
            if (shelf.productId === 'milk') {
              shelf.stock = 8
              shelf.capacity = 8
            }
          })
      })
    }
  }

  private updateCustomers(deltaSeconds: number, time: number): void {
    if (time - this.lastCustomerSpawnAt > 4200 && this.customers.length < 5) {
      this.lastCustomerSpawnAt = time
      const shelves = this.store.profile.world.shelves.filter(
        (shelf) => shelf.unlocked,
      )
      const target = shelves[this.nextShelfIndex % shelves.length]
      this.nextShelfIndex += 1
      this.customers.push({
        id: this.nextCustomerId++,
        x: ENTRANCE.x,
        y: ENTRANCE.y,
        state: 'entering',
        productId: null,
        targetShelfId: target?.shelfId ?? null,
      })
    }

    for (const customer of this.customers) {
      if (customer.state === 'entering' || customer.state === 'shopping') {
        customer.state = 'shopping'
        const shelfId = customer.targetShelfId
        const rect = shelfId ? SHELF_RECTS[shelfId] : undefined
        if (!shelfId || !rect) {
          customer.state = 'leaving'
          continue
        }
        if (
          this.moveTowards(
            customer,
            rect.x + rect.width / 2,
            rect.y + rect.height + 38,
            deltaSeconds,
          )
        ) {
          const shelf = getShelf(this.store.profile, shelfId)
          if (shelf && shelf.stock > 0) {
            this.store.mutate('checkout', (draft) => {
              const draftShelf = getShelf(draft, shelfId)
              if (draftShelf && draftShelf.stock > 0) {
                draftShelf.stock -= 1
              }
            })
            customer.productId = shelf.productId
            customer.state = 'checkout'
          }
        }
      } else if (customer.state === 'checkout') {
        if (
          this.moveTowards(
            customer,
            REGISTER.x + REGISTER.width / 2,
            REGISTER.y + REGISTER.height + 38,
            deltaSeconds,
          )
        ) {
          if (customer.productId) {
            this.pendingCoins += PRODUCT_PRICES[customer.productId] ?? 3
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
    const speed = 105
    const step = Math.min(distance, speed * deltaSeconds)
    const targetAngle = Math.atan2(dy, dx)
    const steeringOffsets = [
      0,
      Math.PI / 6,
      -Math.PI / 6,
      Math.PI / 3,
      -Math.PI / 3,
      Math.PI / 2,
      -Math.PI / 2,
    ]

    for (const offset of steeringOffsets) {
      const angle = targetAngle + offset
      const nextX = customer.x + Math.cos(angle) * step
      const nextY = customer.y + Math.sin(angle) * step
      if (
        !this.isPositionBlocked(nextX, nextY, CUSTOMER_COLLISION_RADIUS)
      ) {
        customer.x = nextX
        customer.y = nextY
        break
      }
    }
    return false
  }

  private render(): void {
    const ctx = this.context
    ctx.setTransform(1, 0, 0, 1, 0, 0)
    ctx.clearRect(0, 0, this.canvas.width, this.canvas.height)
    ctx.setTransform(
      this.viewport.pixelRatio,
      0,
      0,
      this.viewport.pixelRatio,
      0,
      0,
    )
    ctx.fillStyle = '#b8ed5c'
    ctx.fillRect(0, 0, this.viewport.width, this.viewport.height)

    ctx.save()
    ctx.translate(this.viewport.width / 2, this.viewport.height / 2)
    ctx.scale(this.cameraZoom, this.cameraZoom)
    ctx.translate(-this.cameraX, -this.cameraY)
    this.drawWorld(ctx)
    ctx.restore()

    this.drawHud(ctx)
    this.drawSettingsPanel(ctx)
    this.drawJoystick(ctx)
  }

  private drawWorld(ctx: CanvasRenderingContext2D): void {
    this.drawGround(ctx)
    this.drawStore(ctx)
    this.drawDecorations(ctx)

    const renderItems: Array<{ depth: number; draw: () => void }> = []

    for (const source of this.store.profile.world.sourceNodes) {
      const rect = SOURCE_RECTS[source.sourceId]
      if (source.unlocked && rect) {
        renderItems.push({
          depth: rect.y + rect.height,
          draw: () => this.drawCropSource(ctx, rect, source.productId),
        })
      }
    }

    for (const shelf of this.store.profile.world.shelves) {
      const rect = SHELF_RECTS[shelf.shelfId]
      if (shelf.unlocked && rect) {
        renderItems.push({
          depth: rect.y + rect.height,
          draw: () => {
            if (shelf.productId === 'milk') {
              this.drawMilkFridge(ctx, rect, shelf.stock, shelf.capacity)
            } else {
              this.drawShelf(
                ctx,
                rect,
                shelf.productId,
                shelf.stock,
                shelf.capacity,
              )
            }
          },
        })
      }
    }

    for (const node of this.store.profile.world.productionNodes) {
      const rect = PRODUCTION_RECTS[node.nodeId]
      if (!node.unlocked || !rect) {
        continue
      }
      renderItems.push({
        depth: rect.y + rect.height,
        draw: () => {
          if (node.nodeId === 'chicken-coop-01') {
            this.drawChickenCoop(ctx, rect)
          } else if (node.nodeId === 'cow-barn-01') {
            this.drawCowBarn(ctx, rect)
          }
          this.drawProductionBubble(
            ctx,
            rect,
            node.inputProductId,
            node.inputStock,
            node.capacity,
            node.outputProductId,
            node.outputStock,
          )
          this.drawProductionProgress(
            ctx,
            node.nodeId,
            node.processingStartedAt,
            rect,
          )
        },
      })
    }

    renderItems.push({
      depth: REGISTER.y + REGISTER.height,
      draw: () => this.drawRegister(ctx),
    })
    renderItems.push({
      depth: UNLOCK_PAD.y + UNLOCK_PAD.height,
      draw: () => this.drawUnlockPad(ctx),
    })

    for (const customer of this.customers) {
      renderItems.push({
        depth: customer.y + 66,
        draw: () => {
          this.drawCharacter(
            ctx,
            customer.x,
            customer.y,
            CUSTOMER_COLORS[customer.id % CUSTOMER_COLORS.length],
            false,
          )
          if (customer.state === 'shopping' && customer.targetShelfId) {
            const shelf = getShelf(this.store.profile, customer.targetShelfId)
            if (shelf) {
              this.drawThoughtBubble(
                ctx,
                customer.x,
                customer.y - 65,
                shelf.productId,
              )
            }
          }
          if (customer.productId) {
            this.drawProductIcon(
              ctx,
              customer.productId,
              customer.x + 22,
              customer.y - 15,
              12,
            )
          }
        },
      })
    }

    const player = this.store.profile.player
    const moving =
      Math.abs(this.joystick.direction.x) + Math.abs(this.joystick.direction.y) >
      0.05
    const bob = moving ? Math.sin(this.animationTime * 12) * 3 : 0
    renderItems.push({
      depth: player.position.y + 66,
      draw: () => {
        this.drawCharacter(
          ctx,
          player.position.x,
          player.position.y + bob,
          '#28c8e8',
          true,
        )
        this.drawBackpackBubble(ctx)
      },
    })

    renderItems.sort((left, right) => left.depth - right.depth)
    renderItems.forEach((item) => item.draw())
  }

  private drawGround(ctx: CanvasRenderingContext2D): void {
    ctx.fillStyle = '#b8ed5c'
    ctx.fillRect(0, 0, WORLD_WIDTH, WORLD_HEIGHT)
    ctx.fillStyle = 'rgba(255,255,255,0.12)'
    for (let y = 40; y < WORLD_HEIGHT; y += 105) {
      for (let x = 45 + ((y / 105) % 2) * 35; x < WORLD_WIDTH; x += 130) {
        ctx.beginPath()
        ctx.arc(x, y, 4, 0, Math.PI * 2)
        ctx.fill()
      }
    }
  }

  private drawStore(ctx: CanvasRenderingContext2D): void {
    const { x, y, width, height } = STORE_FLOOR
    ctx.fillStyle = 'rgba(55, 95, 50, 0.22)'
    ctx.fillRect(x + 24, y + 28, width, height)
    ctx.fillStyle = '#ffd489'
    ctx.fillRect(x, y, width, height)

    const floorGradient = ctx.createLinearGradient(x, y, x, y + height)
    floorGradient.addColorStop(0, 'rgba(255,255,255,0.24)')
    floorGradient.addColorStop(1, 'rgba(255,174,72,0.06)')
    ctx.fillStyle = floorGradient
    ctx.fillRect(x, y, width, height)

    ctx.fillStyle = '#e7f1ed'
    ctx.fillRect(x, y, width, 34)
    ctx.fillStyle = '#64a7ef'
    ctx.fillRect(x, y + 34, width, 12)
    ctx.fillStyle = '#54c62e'
    ctx.fillRect(x, y + 46, width, 9)
    ctx.fillStyle = '#9ab9c6'
    ctx.fillRect(x, y, 18, height)

    ctx.fillStyle = '#fff5dc'
    ctx.beginPath()
    ctx.moveTo(1560, y + height)
    ctx.lineTo(1660, y + height)
    ctx.lineTo(1705, y + height + 65)
    ctx.lineTo(1515, y + height + 65)
    ctx.closePath()
    ctx.fill()
    for (let index = 0; index < 5; index += 1) {
      ctx.fillStyle = index % 2 === 0 ? '#ff615c' : '#fff5dc'
      ctx.fillRect(1530 + index * 34, y + height + 5, 22, 58)
    }
  }

  private drawDecorations(ctx: CanvasRenderingContext2D): void {
    this.drawOfficeDesk(ctx, 300, 145)
    this.drawPlant(ctx, 270, 220, 1)
    this.drawPlant(ctx, 1600, 165, 0.9)
    this.drawTrashCan(ctx, 1180, 150)
  }

  private drawOfficeDesk(ctx: CanvasRenderingContext2D, x: number, y: number): void {
    ctx.fillStyle = 'rgba(80,55,35,0.22)'
    this.roundedRect(ctx, x + 18, y + 35, 245, 70, 8)
    ctx.fill()
    ctx.fillStyle = '#cc7440'
    this.roundedRect(ctx, x, y + 15, 245, 62, 7)
    ctx.fill()
    ctx.strokeStyle = '#6d432c'
    ctx.lineWidth = 4
    ctx.stroke()
    ctx.fillStyle = '#43413f'
    this.roundedRect(ctx, x + 90, y - 20, 76, 52, 4)
    ctx.fill()
    ctx.fillStyle = '#292a2b'
    ctx.fillRect(x + 118, y + 31, 18, 18)
    ctx.fillRect(x + 88, y + 49, 82, 8)
  }

  private drawPlant(ctx: CanvasRenderingContext2D, x: number, y: number, scale: number): void {
    ctx.save()
    ctx.translate(x, y)
    ctx.scale(scale, scale)
    ctx.fillStyle = '#c56b35'
    this.roundedRect(ctx, -18, 18, 36, 35, 5)
    ctx.fill()
    ctx.strokeStyle = '#5e432d'
    ctx.lineWidth = 3
    ctx.stroke()
    ctx.fillStyle = '#32b83d'
    for (const [dx, dy] of [[0, 0], [-18, 5], [18, 5], [-8, -18], [10, -17]]) {
      ctx.beginPath()
      ctx.arc(dx, dy, 17, 0, Math.PI * 2)
      ctx.fill()
    }
    ctx.restore()
  }

  private drawTrashCan(ctx: CanvasRenderingContext2D, x: number, y: number): void {
    ctx.fillStyle = 'rgba(55,55,55,0.2)'
    this.roundedRect(ctx, x + 12, y + 15, 58, 72, 9)
    ctx.fill()
    ctx.fillStyle = '#ff5757'
    this.roundedRect(ctx, x, y, 58, 72, 9)
    ctx.fill()
    ctx.strokeStyle = '#342d2d'
    ctx.lineWidth = 4
    ctx.stroke()
    ctx.fillStyle = '#30343a'
    this.roundedRect(ctx, x - 5, y - 8, 68, 22, 6)
    ctx.fill()
  }

  private drawMilkFridge(
    ctx: CanvasRenderingContext2D,
    rect: Rect,
    stock: number,
    capacity: number,
  ): void {
    const { x, y, width, height } = rect
    this.drawObjectBoundary(ctx, rect, 12)
    ctx.save()
    ctx.shadowColor = 'rgba(32,48,55,0.34)'
    ctx.shadowBlur = 12
    ctx.shadowOffsetX = 16
    ctx.shadowOffsetY = 20
    ctx.fillStyle = '#387fc4'
    this.roundedRect(ctx, x, y, width, height, 10)
    ctx.fill()
    ctx.restore()

    ctx.fillStyle = '#3278ba'
    ctx.beginPath()
    ctx.moveTo(x + width, y + 8)
    ctx.lineTo(x + width + 18, y - 8)
    ctx.lineTo(x + width + 18, y + height - 10)
    ctx.lineTo(x + width, y + height)
    ctx.closePath()
    ctx.fill()
    ctx.strokeStyle = '#1e405b'
    ctx.lineWidth = 5
    ctx.stroke()

    const bodyGradient = ctx.createLinearGradient(x, y, x + width, y + height)
    bodyGradient.addColorStop(0, '#69b9f1')
    bodyGradient.addColorStop(1, '#3488cf')
    ctx.fillStyle = bodyGradient
    this.roundedRect(ctx, x, y, width, height, 10)
    ctx.fill()
    ctx.strokeStyle = '#203d52'
    ctx.lineWidth = 6
    ctx.stroke()

    ctx.fillStyle = '#dff8ff'
    this.roundedRect(ctx, x + 14, y + 28, width - 28, height - 56, 5)
    ctx.fill()
    ctx.strokeStyle = '#31586d'
    ctx.lineWidth = 4
    ctx.stroke()
    ctx.fillStyle = 'rgba(255,255,255,0.48)'
    ctx.fillRect(x + 21, y + 35, 12, height - 70)

    ctx.strokeStyle = '#789cac'
    ctx.lineWidth = 3
    ctx.beginPath()
    ctx.moveTo(x + 14, y + height / 2)
    ctx.lineTo(x + width - 14, y + height / 2)
    ctx.stroke()

    for (let index = 0; index < capacity; index += 1) {
      const column = index % 4
      const row = Math.floor(index / 4)
      const bottleX = x + 32 + column * 29
      const bottleY = y + 61 + row * 57
      if (index < stock) {
        this.drawProductIcon(ctx, 'milk', bottleX, bottleY, 11)
      } else {
        ctx.strokeStyle = 'rgba(54,91,108,0.25)'
        ctx.lineWidth = 2
        this.roundedRect(ctx, bottleX - 8, bottleY - 13, 16, 26, 3)
        ctx.stroke()
      }
    }

    this.drawStockPill(
      ctx,
      x + width / 2,
      y - 24,
      'milk',
      stock,
      capacity,
      '#49768a',
    )
  }

  private drawCropSource(
    ctx: CanvasRenderingContext2D,
    rect: Rect,
    productId: ProductId,
  ): void {
    this.drawObjectBoundary(ctx, rect, 30)
    ctx.fillStyle = 'rgba(48,70,35,0.3)'
    this.roundedRect(ctx, rect.x + 20, rect.y + 28, rect.width, rect.height, 30)
    ctx.fill()
    ctx.fillStyle = '#9b5b27'
    ctx.beginPath()
    ctx.moveTo(rect.x + 10, rect.y + rect.height - 5)
    ctx.lineTo(rect.x + rect.width, rect.y + rect.height - 5)
    ctx.lineTo(rect.x + rect.width + 15, rect.y + rect.height + 12)
    ctx.lineTo(rect.x + 25, rect.y + rect.height + 12)
    ctx.closePath()
    ctx.fill()
    ctx.strokeStyle = '#55351f'
    ctx.lineWidth = 4
    ctx.stroke()
    ctx.fillStyle = '#d99131'
    this.roundedRect(ctx, rect.x, rect.y, rect.width, rect.height, 30)
    ctx.fill()
    ctx.strokeStyle = '#7b5128'
    ctx.lineWidth = 6
    ctx.stroke()
    ctx.strokeStyle = 'rgba(255,223,143,0.8)'
    ctx.lineWidth = 3
    ctx.beginPath()
    ctx.moveTo(rect.x + 24, rect.y + 9)
    ctx.lineTo(rect.x + rect.width - 26, rect.y + 9)
    ctx.stroke()
    ctx.fillStyle = '#7d4d27'
    this.roundedRect(
      ctx,
      rect.x + 18,
      rect.y + 22,
      rect.width - 36,
      rect.height - 42,
      24,
    )
    ctx.fill()

    for (let index = 0; index < 3; index += 1) {
      const x = rect.x + 47 + index * 48
      const y = rect.y + 55 + (index % 2) * 7
      ctx.strokeStyle = '#238f2c'
      ctx.lineWidth = 6
      ctx.beginPath()
      ctx.moveTo(x, y + 24)
      ctx.lineTo(x, y - 12)
      ctx.stroke()
      ctx.fillStyle = '#39bb3e'
      ctx.beginPath()
      ctx.arc(x - 9, y - 4, 10, 0, Math.PI * 2)
      ctx.arc(x + 10, y - 10, 10, 0, Math.PI * 2)
      ctx.fill()
      this.drawProductIcon(ctx, productId, x, y + 12, 15)
    }
    this.drawStockPill(ctx, rect.x + rect.width / 2, rect.y - 20, productId, getBackpackQuantity(this.store.profile, productId), this.store.profile.player.backpackCapacity)
  }

  private drawShelf(
    ctx: CanvasRenderingContext2D,
    rect: Rect,
    productId: ProductId,
    stock: number,
    capacity: number,
  ): void {
    const x = rect.x
    const y = rect.y
    this.drawObjectBoundary(ctx, rect, 10)
    ctx.save()
    ctx.shadowColor = 'rgba(63,40,24,0.34)'
    ctx.shadowBlur = 10
    ctx.shadowOffsetX = 17
    ctx.shadowOffsetY = 20
    ctx.fillStyle = '#a95d2d'
    this.roundedRect(ctx, x, y, rect.width, rect.height, 8)
    ctx.fill()
    ctx.restore()

    ctx.fillStyle = '#8f4d28'
    ctx.beginPath()
    ctx.moveTo(x + rect.width, y)
    ctx.lineTo(x + rect.width + 18, y - 17)
    ctx.lineTo(x + rect.width + 18, y + rect.height - 10)
    ctx.lineTo(x + rect.width, y + rect.height)
    ctx.closePath()
    ctx.fill()
    ctx.strokeStyle = '#4a2c1c'
    ctx.lineWidth = 5
    ctx.stroke()

    const shelfGradient = ctx.createLinearGradient(x, y, x + rect.width, y)
    shelfGradient.addColorStop(0, '#e7974d')
    shelfGradient.addColorStop(0.48, '#d37b38')
    shelfGradient.addColorStop(1, '#b96731')
    ctx.fillStyle = shelfGradient
    this.roundedRect(ctx, x, y, rect.width, rect.height, 7)
    ctx.fill()
    ctx.strokeStyle = '#553721'
    ctx.lineWidth = 6
    ctx.stroke()
    ctx.fillStyle = '#e89b53'
    ctx.beginPath()
    ctx.moveTo(x, y)
    ctx.lineTo(x + 22, y - 22)
    ctx.lineTo(x + rect.width + 22, y - 22)
    ctx.lineTo(x + rect.width, y)
    ctx.closePath()
    ctx.fill()
    ctx.stroke()
    ctx.strokeStyle = 'rgba(255,221,163,0.85)'
    ctx.lineWidth = 3
    ctx.beginPath()
    ctx.moveTo(x + 27, y - 15)
    ctx.lineTo(x + rect.width + 13, y - 15)
    ctx.stroke()
    ctx.strokeStyle = '#6c4125'
    ctx.lineWidth = 4
    for (let index = 1; index <= 2; index += 1) {
      const shelfY = y + (rect.height / 3) * index
      ctx.beginPath()
      ctx.moveTo(x + 8, shelfY)
      ctx.lineTo(x + rect.width - 8, shelfY)
      ctx.stroke()
    }
    this.drawSign(ctx, x + rect.width / 2, y - 48, productId)
    this.drawStockPill(ctx, x + rect.width / 2, y - 87, productId, stock, capacity)
  }

  private drawSign(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    productId: ProductId,
  ): void {
    ctx.fillStyle = '#d98a48'
    this.roundedRect(ctx, x - 38, y - 12, 76, 54, 10)
    ctx.fill()
    ctx.strokeStyle = '#3e2e22'
    ctx.lineWidth = 4
    ctx.stroke()
    ctx.fillStyle = '#f4d6a3'
    this.roundedRect(ctx, x - 27, y - 3, 54, 35, 10)
    ctx.fill()
    this.drawProductIcon(ctx, productId, x, y + 14, 14)
  }

  private drawChickenCoop(ctx: CanvasRenderingContext2D, rect: Rect): void {
    this.drawPen(ctx, rect, '#f6b247')
    ctx.fillStyle = '#ffffff'
    ctx.beginPath()
    ctx.arc(rect.x + 95, rect.y + 67, 30, 0, Math.PI * 2)
    ctx.fill()
    ctx.strokeStyle = '#493d30'
    ctx.lineWidth = 4
    ctx.stroke()
    ctx.fillStyle = '#f04d42'
    ctx.beginPath()
    ctx.arc(rect.x + 94, rect.y + 38, 9, 0, Math.PI * 2)
    ctx.arc(rect.x + 106, rect.y + 41, 8, 0, Math.PI * 2)
    ctx.fill()
    ctx.fillStyle = '#f4aa24'
    ctx.beginPath()
    ctx.moveTo(rect.x + 124, rect.y + 63)
    ctx.lineTo(rect.x + 145, rect.y + 70)
    ctx.lineTo(rect.x + 124, rect.y + 77)
    ctx.closePath()
    ctx.fill()
  }

  private drawCowBarn(ctx: CanvasRenderingContext2D, rect: Rect): void {
    this.drawObjectBoundary(ctx, rect, 24)
    ctx.fillStyle = 'rgba(38,74,58,0.23)'
    this.roundedRect(ctx, rect.x + 18, rect.y + 28, rect.width, rect.height, 22)
    ctx.fill()
    ctx.fillStyle = '#6abf83'
    this.roundedRect(ctx, rect.x, rect.y, rect.width, rect.height, 22)
    ctx.fill()
    ctx.strokeStyle = '#3c6e4c'
    ctx.lineWidth = 5
    ctx.stroke()
    ctx.fillStyle = '#fff7e8'
    this.roundedRect(ctx, rect.x + 43, rect.y + 35, 125, 74, 30)
    ctx.fill()
    ctx.strokeStyle = '#3b332e'
    ctx.stroke()
    ctx.fillStyle = '#3b332e'
    ctx.beginPath()
    ctx.arc(rect.x + 76, rect.y + 56, 17, 0, Math.PI * 2)
    ctx.arc(rect.x + 145, rect.y + 85, 20, 0, Math.PI * 2)
    ctx.fill()
    ctx.fillStyle = '#f6a9ad'
    this.roundedRect(ctx, rect.x + 145, rect.y + 64, 48, 42, 18)
    ctx.fill()
    ctx.strokeStyle = '#3b332e'
    ctx.stroke()
  }

  private drawPen(ctx: CanvasRenderingContext2D, rect: Rect, color: string): void {
    this.drawObjectBoundary(ctx, rect, 30)
    ctx.fillStyle = 'rgba(90,65,35,0.2)'
    this.roundedRect(ctx, rect.x + 18, rect.y + 24, rect.width, rect.height, 30)
    ctx.fill()
    ctx.fillStyle = color
    this.roundedRect(ctx, rect.x, rect.y, rect.width, rect.height, 30)
    ctx.fill()
    ctx.strokeStyle = '#8e5a2c'
    ctx.lineWidth = 6
    ctx.stroke()
    ctx.strokeStyle = '#d78735'
    ctx.lineWidth = 8
    for (let index = 0; index < 5; index += 1) {
      const fenceX = rect.x + 12 + index * ((rect.width - 24) / 4)
      ctx.beginPath()
      ctx.moveTo(fenceX, rect.y - 8)
      ctx.lineTo(fenceX, rect.y + 25)
      ctx.stroke()
    }
  }

  private drawProductionBubble(
    ctx: CanvasRenderingContext2D,
    rect: Rect,
    inputId: ProductId,
    inputStock: number,
    capacity: number,
    outputId: ProductId,
    outputStock: number,
  ): void {
    const centerX = rect.x + rect.width / 2
    this.drawStockPill(
      ctx,
      centerX,
      rect.y - 25,
      inputId,
      inputStock,
      capacity,
    )
    if (outputStock > 0) {
      this.drawStockPill(
        ctx,
        centerX,
        rect.y + rect.height + 27,
        outputId,
        outputStock,
        capacity,
        '#47b66a',
      )
    }
  }

  private drawProductionProgress(
    ctx: CanvasRenderingContext2D,
    nodeId: string,
    startedAt: number | null,
    rect: Rect,
  ): void {
    if (startedAt === null) {
      return
    }
    const duration = PRODUCTION_DURATION_MS[nodeId]
    const progress = this.clamp((Date.now() - startedAt) / duration, 0, 1)
    const width = rect.width - 34
    ctx.fillStyle = '#ffffff'
    this.roundedRect(ctx, rect.x + 17, rect.y + rect.height - 18, width, 12, 6)
    ctx.fill()
    ctx.fillStyle = '#55d470'
    this.roundedRect(
      ctx,
      rect.x + 19,
      rect.y + rect.height - 16,
      Math.max(6, (width - 4) * progress),
      8,
      4,
    )
    ctx.fill()
  }

  private drawRegister(ctx: CanvasRenderingContext2D): void {
    const rect = REGISTER
    this.drawObjectBoundary(ctx, rect, 14)
    ctx.fillStyle = 'rgba(52,82,78,0.23)'
    this.roundedRect(ctx, rect.x + 20, rect.y + 28, rect.width, rect.height, 12)
    ctx.fill()
    ctx.fillStyle = '#52dfbd'
    this.roundedRect(ctx, rect.x, rect.y + 45, rect.width, 65, 10)
    ctx.fill()
    ctx.strokeStyle = '#267267'
    ctx.lineWidth = 5
    ctx.stroke()
    ctx.fillStyle = '#4e5659'
    this.roundedRect(ctx, rect.x + 70, rect.y, 80, 70, 7)
    ctx.fill()
    ctx.strokeStyle = '#282d2f'
    ctx.stroke()
    ctx.fillStyle = '#22282b'
    ctx.fillRect(rect.x + 82, rect.y + 12, 56, 34)
    ctx.fillStyle = '#d9e2d5'
    this.roundedRect(ctx, rect.x + 165, rect.y + 25, 64, 48, 7)
    ctx.fill()
    this.drawStockPill(
      ctx,
      rect.x + rect.width / 2,
      rect.y - 32,
      'milk',
      this.pendingCoins,
      Math.max(this.pendingCoins, 1),
      '#69786f',
      true,
    )
  }

  private drawUnlockPad(ctx: CanvasRenderingContext2D): void {
    const unlocked =
      this.store.profile.world.unlockedAreaIds.includes('milk-zone')
    const rect = UNLOCK_PAD
    ctx.fillStyle = 'rgba(60,85,48,0.22)'
    this.roundedRect(ctx, rect.x + 16, rect.y + 23, rect.width, rect.height, 18)
    ctx.fill()
    ctx.fillStyle = unlocked ? '#95c68a' : '#ffda3e'
    this.roundedRect(ctx, rect.x, rect.y, rect.width, rect.height, 18)
    ctx.fill()
    ctx.strokeStyle = unlocked ? '#54754d' : '#ad791f'
    ctx.lineWidth = 5
    ctx.stroke()
    ctx.fillStyle = '#ffffff'
    ctx.font = 'bold 22px sans-serif'
    ctx.textAlign = 'center'
    ctx.strokeStyle = '#4b3a21'
    ctx.lineWidth = 5
    const label = unlocked ? '生产区已解锁' : '解锁生产区  20'
    ctx.strokeText(label, rect.x + rect.width / 2, rect.y + 75)
    ctx.fillText(label, rect.x + rect.width / 2, rect.y + 75)
    ctx.textAlign = 'start'
  }

  private drawCharacter(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    color: string,
    isPlayer: boolean,
  ): void {
    ctx.save()
    ctx.fillStyle = 'rgba(28,34,30,0.3)'
    ctx.beginPath()
    ctx.ellipse(x + 8, y + 35, 34, 16, 0, 0, Math.PI * 2)
    ctx.fill()

    ctx.strokeStyle = '#171b1d'
    ctx.lineWidth = 7
    ctx.lineCap = 'round'
    const bodyGradient = ctx.createLinearGradient(x - 20, y, x + 22, y + 55)
    bodyGradient.addColorStop(0, '#ffffff')
    bodyGradient.addColorStop(0.08, color)
    bodyGradient.addColorStop(0.72, color)
    bodyGradient.addColorStop(1, '#257788')
    ctx.fillStyle = bodyGradient
    this.roundedRect(ctx, x - 20, y - 5, 40, 58, 18)
    ctx.fill()
    ctx.stroke()
    ctx.strokeStyle = 'rgba(255,255,255,0.72)'
    ctx.lineWidth = 3
    ctx.beginPath()
    ctx.moveTo(x - 10, y + 5)
    ctx.lineTo(x - 13, y + 34)
    ctx.stroke()

    ctx.strokeStyle = '#171b1d'
    ctx.lineWidth = 7
    ctx.beginPath()
    ctx.moveTo(x - 13, y + 45)
    ctx.lineTo(x - 17, y + 66)
    ctx.moveTo(x + 13, y + 45)
    ctx.lineTo(x + 18, y + 66)
    ctx.stroke()
    ctx.beginPath()
    ctx.moveTo(x - 18, y + 5)
    ctx.lineTo(x - 31, y + 28)
    ctx.moveTo(x + 18, y + 5)
    ctx.lineTo(x + 31, y + 28)
    ctx.stroke()

    const headGradient = ctx.createRadialGradient(
      x - 9,
      y - 36,
      3,
      x,
      y - 25,
      28,
    )
    headGradient.addColorStop(0, '#ffffff')
    headGradient.addColorStop(1, '#c9c8c4')
    ctx.fillStyle = headGradient
    ctx.beginPath()
    ctx.arc(x, y - 25, 27, 0, Math.PI * 2)
    ctx.fill()
    ctx.strokeStyle = '#171b1d'
    ctx.lineWidth = 7
    ctx.stroke()
    ctx.fillStyle = '#7d8284'
    ctx.beginPath()
    ctx.arc(x, y - 31, 25, Math.PI, Math.PI * 2)
    ctx.lineTo(x + 25, y - 22)
    ctx.lineTo(x - 25, y - 22)
    ctx.closePath()
    ctx.fill()

    if (isPlayer) {
      ctx.fillStyle = '#ffffff'
      ctx.font = 'bold 17px sans-serif'
      ctx.textAlign = 'center'
      ctx.strokeStyle = '#292929'
      ctx.lineWidth = 5
      ctx.strokeText('MAX', x, y - 66)
      ctx.fillText('MAX', x, y - 66)
      ctx.textAlign = 'start'
    }
    ctx.restore()
  }

  private drawBackpackBubble(ctx: CanvasRenderingContext2D): void {
    const player = this.store.profile.player
    const total = getBackpackTotal(this.store.profile)
    const x = player.position.x
    const y = player.position.y - 102
    ctx.fillStyle = 'rgba(255,255,255,0.96)'
    this.roundedRect(ctx, x - 54, y - 18, 108, 36, 14)
    ctx.fill()
    ctx.fillStyle = '#3b4240'
    ctx.font = 'bold 16px sans-serif'
    ctx.textAlign = 'center'
    ctx.fillText(`${total}/${player.backpackCapacity}`, x + 16, y + 6)
    const first = player.backpack[0]?.productId ?? 'apple'
    this.drawProductIcon(ctx, first, x - 28, y, 11)
    ctx.textAlign = 'start'
  }

  private drawThoughtBubble(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    productId: ProductId,
  ): void {
    ctx.fillStyle = '#ffffff'
    this.roundedRect(ctx, x - 31, y - 24, 62, 47, 14)
    ctx.fill()
    ctx.fillStyle = '#ffffff'
    ctx.beginPath()
    ctx.arc(x - 12, y + 31, 6, 0, Math.PI * 2)
    ctx.fill()
    this.drawProductIcon(ctx, productId, x, y, 13)
  }

  private drawStockPill(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    productId: ProductId,
    current: number,
    capacity: number,
    color = '#68706d',
    money = false,
  ): void {
    const width = money ? 108 : 92
    ctx.fillStyle = color
    this.roundedRect(ctx, x - width / 2, y - 18, width, 36, 16)
    ctx.fill()
    if (money) {
      this.drawCashIcon(ctx, x - 31, y, 11)
    } else {
      this.drawProductIcon(ctx, productId, x - 28, y, 10)
    }
    ctx.fillStyle = '#ffffff'
    ctx.font = 'bold 16px sans-serif'
    ctx.textAlign = 'center'
    ctx.fillText(
      money ? `${current}` : `${current}/${capacity}`,
      x + 14,
      y + 6,
    )
    ctx.textAlign = 'start'
  }

  private drawProductIcon(
    ctx: CanvasRenderingContext2D,
    productId: ProductId,
    x: number,
    y: number,
    radius: number,
  ): void {
    ctx.save()
    ctx.translate(x, y)
    ctx.strokeStyle = '#263129'
    ctx.lineWidth = Math.max(2, radius * 0.16)
    if (productId === 'egg') {
      ctx.fillStyle = '#fff1bd'
      ctx.beginPath()
      ctx.ellipse(0, 0, radius * 0.78, radius, 0, 0, Math.PI * 2)
      ctx.fill()
      ctx.stroke()
    } else if (productId === 'milk') {
      ctx.fillStyle = '#e7f7ff'
      this.roundedRect(ctx, -radius * 0.65, -radius, radius * 1.3, radius * 1.9, 3)
      ctx.fill()
      ctx.stroke()
      ctx.fillStyle = '#58a8df'
      ctx.fillRect(-radius * 0.55, -radius * 0.15, radius * 1.1, radius * 0.55)
    } else {
      ctx.fillStyle = PRODUCT_COLORS[productId] ?? '#ec5c48'
      ctx.beginPath()
      ctx.arc(0, 2, radius, 0, Math.PI * 2)
      ctx.fill()
      ctx.stroke()
      ctx.fillStyle = '#39a944'
      ctx.beginPath()
      ctx.moveTo(0, -radius + 2)
      ctx.lineTo(-radius * 0.7, -radius * 1.15)
      ctx.lineTo(-radius * 0.2, -radius * 0.45)
      ctx.lineTo(radius * 0.65, -radius * 1.05)
      ctx.closePath()
      ctx.fill()
    }
    ctx.restore()
  }

  private drawCashIcon(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    size: number,
  ): void {
    ctx.save()
    ctx.translate(x, y)
    ctx.rotate(-0.15)
    ctx.fillStyle = '#8ddc4b'
    this.roundedRect(ctx, -size, -size * 0.65, size * 2, size * 1.3, 3)
    ctx.fill()
    ctx.strokeStyle = '#23311f'
    ctx.lineWidth = 2
    ctx.stroke()
    ctx.fillStyle = '#477d2d'
    ctx.beginPath()
    ctx.arc(0, 0, size * 0.34, 0, Math.PI * 2)
    ctx.fill()
    ctx.restore()
  }

  private drawHud(ctx: CanvasRenderingContext2D): void {
    const coins = this.store.profile.economy.coins
    const coinWidth = 118
    const coinX =
      this.viewport.width - this.safeInsets.right - coinWidth - 12
    const coinY = this.safeInsets.top + 10
    ctx.fillStyle = 'rgba(255,255,255,0.95)'
    this.roundedRect(ctx, coinX, coinY, coinWidth, 42, 18)
    ctx.fill()
    ctx.strokeStyle = 'rgba(42,61,34,0.3)'
    ctx.lineWidth = 2
    ctx.stroke()
    this.drawCashIcon(ctx, coinX + 25, coinY + 21, 13)
    ctx.fillStyle = '#233023'
    ctx.font = 'bold 21px sans-serif'
    ctx.fillText(`${coins}`, coinX + 48, coinY + 28)

    const layout = this.getSettingsLayout()
    ctx.fillStyle = '#9c73ed'
    this.roundedRect(ctx, layout.gearX, layout.gearY, 50, 50, 12)
    ctx.fill()
    ctx.strokeStyle = this.settingsOpen ? '#ffffff' : '#6542ad'
    ctx.lineWidth = this.settingsOpen ? 4 : 3
    ctx.stroke()
    this.drawGear(ctx, layout.gearX + 25, layout.gearY + 25)
  }

  private drawSettingsPanel(ctx: CanvasRenderingContext2D): void {
    if (this.settingsPanelProgress < 0.01) {
      return
    }

    const layout = this.getSettingsLayout()
    const width = layout.panelWidth
    const x = layout.panelX
    const y = layout.panelY
    ctx.save()
    ctx.shadowColor = 'rgba(38,43,38,0.32)'
    ctx.shadowBlur = 16
    ctx.shadowOffsetX = 8
    ctx.shadowOffsetY = 8
    ctx.fillStyle = 'rgba(255,255,255,0.97)'
    this.roundedRect(ctx, x, y, width, 145, 18)
    ctx.fill()
    ctx.restore()

    ctx.strokeStyle = '#7052b0'
    ctx.lineWidth = 3
    this.roundedRect(ctx, x, y, width, 145, 18)
    ctx.stroke()
    ctx.fillStyle = '#382d48'
    ctx.font = 'bold 19px sans-serif'
    ctx.fillText('视角大小', x + 18, y + 31)
    ctx.fillStyle = '#77717d'
    ctx.font = '12px sans-serif'
    ctx.fillText('选择镜头远近，设置会自动保存', x + 18, y + 52)

    const choices = [
      { label: '远', value: 0.78 },
      { label: '标准', value: 1 },
      { label: '近', value: 1.22 },
    ]
    const selected = this.store.profile.settings.cameraScale ?? 1
    for (let index = 0; index < choices.length; index += 1) {
      const buttonX = x + 12 + index * 78
      const buttonY = layout.buttonY
      const active = Math.abs(selected - choices[index].value) < 0.05
      ctx.fillStyle = active ? '#9c73ed' : '#eee9f8'
      this.roundedRect(ctx, buttonX, buttonY, 66, 43, 12)
      ctx.fill()
      ctx.strokeStyle = active ? '#5f409d' : '#c7bbdf'
      ctx.lineWidth = 3
      ctx.stroke()
      ctx.fillStyle = active ? '#ffffff' : '#5e536a'
      ctx.font = 'bold 15px sans-serif'
      ctx.textAlign = 'center'
      ctx.fillText(choices[index].label, buttonX + 33, buttonY + 27)
    }
    ctx.textAlign = 'start'
    ctx.fillStyle = '#948b9c'
    ctx.font = '11px sans-serif'
    ctx.fillText('再次点击齿轮关闭', x + 18, y + 135)
  }

  private drawGear(ctx: CanvasRenderingContext2D, x: number, y: number): void {
    ctx.save()
    ctx.translate(x, y)
    ctx.fillStyle = '#ffffff'
    for (let index = 0; index < 8; index += 1) {
      ctx.rotate(Math.PI / 4)
      ctx.fillRect(-4, -19, 8, 11)
    }
    ctx.beginPath()
    ctx.arc(0, 0, 13, 0, Math.PI * 2)
    ctx.fill()
    ctx.fillStyle = '#6d52a8'
    ctx.beginPath()
    ctx.arc(0, 0, 6, 0, Math.PI * 2)
    ctx.fill()
    ctx.restore()
  }

  private drawJoystick(ctx: CanvasRenderingContext2D): void {
    const defaultX = this.safeInsets.left + 82
    const defaultY =
      this.viewport.height - this.safeInsets.bottom - 76
    const centerX = this.joystick.active ? this.joystick.centerX : defaultX
    const centerY = this.joystick.active ? this.joystick.centerY : defaultY
    const knobX = this.joystick.active ? this.joystick.knobX : defaultX
    const knobY = this.joystick.active ? this.joystick.knobY : defaultY

    ctx.fillStyle = 'rgba(255,255,255,0.28)'
    ctx.beginPath()
    ctx.arc(centerX, centerY, 52, 0, Math.PI * 2)
    ctx.fill()
    ctx.strokeStyle = 'rgba(64,100,47,0.35)'
    ctx.lineWidth = 3
    ctx.stroke()
    ctx.fillStyle = this.joystick.active
      ? 'rgba(78,191,71,0.82)'
      : 'rgba(78,191,71,0.48)'
    ctx.beginPath()
    ctx.arc(knobX, knobY, 24, 0, Math.PI * 2)
    ctx.fill()
  }

  private drawObjectBoundary(
    ctx: CanvasRenderingContext2D,
    rect: Rect,
    radius: number,
  ): void {
    ctx.save()
    ctx.fillStyle = 'rgba(37,43,32,0.15)'
    this.roundedRect(
      ctx,
      rect.x - 7,
      rect.y - 7,
      rect.width + 14,
      rect.height + 14,
      radius,
    )
    ctx.fill()
    ctx.strokeStyle = 'rgba(27,31,26,0.3)'
    ctx.lineWidth = 4
    ctx.stroke()
    ctx.restore()
  }

  private roundedRect(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    width: number,
    height: number,
    radius: number,
  ): void {
    const safeRadius = Math.min(radius, Math.abs(width) / 2, Math.abs(height) / 2)
    ctx.beginPath()
    ctx.moveTo(x + safeRadius, y)
    ctx.lineTo(x + width - safeRadius, y)
    ctx.quadraticCurveTo(x + width, y, x + width, y + safeRadius)
    ctx.lineTo(x + width, y + height - safeRadius)
    ctx.quadraticCurveTo(
      x + width,
      y + height,
      x + width - safeRadius,
      y + height,
    )
    ctx.lineTo(x + safeRadius, y + height)
    ctx.quadraticCurveTo(x, y + height, x, y + height - safeRadius)
    ctx.lineTo(x, y + safeRadius)
    ctx.quadraticCurveTo(x, y, x + safeRadius, y)
    ctx.closePath()
  }

  private addToBackpack(
    profile: UserProfile,
    productId: ProductId,
    quantity: number,
  ): void {
    const stack = profile.player.backpack.find(
      (item) => item.productId === productId,
    )
    if (stack) {
      stack.quantity += quantity
    } else {
      profile.player.backpack.push({ productId, quantity })
    }
  }

  private removeFromBackpack(
    profile: UserProfile,
    productId: ProductId,
    quantity: number,
  ): void {
    const stack = profile.player.backpack.find(
      (item) => item.productId === productId,
    )
    if (!stack) {
      return
    }
    stack.quantity = Math.max(0, stack.quantity - quantity)
    profile.player.backpack = profile.player.backpack.filter(
      (item) => item.quantity > 0,
    )
  }

  private clamp(value: number, minimum: number, maximum: number): number {
    return Math.max(minimum, Math.min(maximum, value))
  }
}
