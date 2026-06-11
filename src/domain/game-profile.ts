export const PROFILE_SCHEMA_VERSION = 1 as const

export type ProductId =
  | 'apple'
  | 'tomato'
  | 'egg'
  | 'milk'
  | 'bread'
  | (string & {})

export interface Vector2 {
  x: number
  y: number
}

export interface ProfileIdentity {
  openId: string
  displayName: string
  avatarUrl: string
  createdAt: number
  lastLoginAt: number
}

export interface EconomySave {
  coins: number
  lifetimeCoins: number
  lifetimeSpent: number
}

export interface InventoryStack {
  productId: ProductId
  quantity: number
}

export interface PlayerSave {
  position: Vector2
  moveSpeedLevel: number
  backpackLevel: number
  backpackCapacity: number
  backpack: InventoryStack[]
}

export interface SourceNodeSave {
  sourceId: string
  productId: ProductId
  level: number
  unlocked: boolean
}

export interface ProductionNodeSave {
  nodeId: string
  inputProductId: ProductId
  outputProductId: ProductId
  level: number
  inputStock: number
  outputStock: number
  capacity: number
  processingStartedAt: number | null
  unlocked: boolean
}

export interface ShelfSave {
  shelfId: string
  productId: ProductId
  level: number
  stock: number
  capacity: number
  unlocked: boolean
}

export interface CashRegisterSave {
  registerId: string
  level: number
  unlocked: boolean
}

export interface WorldSave {
  mapId: string
  unlockedAreaIds: string[]
  sourceNodes: SourceNodeSave[]
  productionNodes: ProductionNodeSave[]
  shelves: ShelfSave[]
  cashRegisters: CashRegisterSave[]
}

export interface UpgradeSave {
  upgradeId: string
  level: number
}

export interface QuestSave {
  questId: string
  progress: number
  target: number
  completed: boolean
  rewardClaimed: boolean
}

export interface GameStatistics {
  playTimeSeconds: number
  customersServed: number
  productsSold: number
  coinsCollected: number
  sessions: number
}

export interface GameSettings {
  musicEnabled: boolean
  soundEnabled: boolean
  vibrationEnabled: boolean
  cameraScale: number
}

/**
 * 可持久化档案。顾客位置、金币掉落实体和动画等瞬时运行态不进入该结构。
 */
export interface UserProfile {
  schemaVersion: typeof PROFILE_SCHEMA_VERSION
  revision: number
  clientUpdatedAt: number
  serverUpdatedAt: number | null
  identity: ProfileIdentity
  economy: EconomySave
  player: PlayerSave
  world: WorldSave
  upgrades: UpgradeSave[]
  quests: QuestSave[]
  statistics: GameStatistics
  settings: GameSettings
}

export type ProfileMutationReason =
  | 'movement'
  | 'production'
  | 'restock'
  | 'checkout'
  | 'coin-collected'
  | 'upgrade'
  | 'unlock'
  | 'settings'

export function createInitialProfile(openId = ''): UserProfile {
  const now = Date.now()

  return {
    schemaVersion: PROFILE_SCHEMA_VERSION,
    revision: 0,
    clientUpdatedAt: now,
    serverUpdatedAt: null,
    identity: {
      openId,
      displayName: '',
      avatarUrl: '',
      createdAt: now,
      lastLoginAt: now,
    },
    economy: {
      coins: 0,
      lifetimeCoins: 0,
      lifetimeSpent: 0,
    },
    player: {
      position: { x: 900, y: 600 },
      moveSpeedLevel: 1,
      backpackLevel: 1,
      backpackCapacity: 4,
      backpack: [],
    },
    world: {
      mapId: 'supermarket-01',
      unlockedAreaIds: ['entrance', 'apple-zone'],
      sourceNodes: [
        {
          sourceId: 'apple-tree-01',
          productId: 'apple',
          level: 1,
          unlocked: true,
        },
        {
          sourceId: 'tomato-patch-01',
          productId: 'tomato',
          level: 1,
          unlocked: false,
        },
      ],
      productionNodes: [
        {
          nodeId: 'chicken-coop-01',
          inputProductId: 'tomato',
          outputProductId: 'egg',
          level: 1,
          inputStock: 0,
          outputStock: 0,
          capacity: 3,
          processingStartedAt: null,
          unlocked: false,
        },
        {
          nodeId: 'cow-barn-01',
          inputProductId: 'tomato',
          outputProductId: 'milk',
          level: 1,
          inputStock: 0,
          outputStock: 0,
          capacity: 3,
          processingStartedAt: null,
          unlocked: false,
        },
      ],
      shelves: [
        {
          shelfId: 'apple-shelf-01',
          productId: 'apple',
          level: 1,
          stock: 0,
          capacity: 8,
          unlocked: true,
        },
        {
          shelfId: 'tomato-shelf-01',
          productId: 'tomato',
          level: 1,
          stock: 0,
          capacity: 8,
          unlocked: false,
        },
        {
          shelfId: 'egg-shelf-01',
          productId: 'egg',
          level: 1,
          stock: 0,
          capacity: 8,
          unlocked: false,
        },
        {
          shelfId: 'milk-shelf-01',
          productId: 'milk',
          level: 1,
          stock: 8,
          capacity: 8,
          unlocked: false,
        },
      ],
      cashRegisters: [
        {
          registerId: 'register-01',
          level: 1,
          unlocked: true,
        },
      ],
    },
    upgrades: [],
    quests: [],
    statistics: {
      playTimeSeconds: 0,
      customersServed: 0,
      productsSold: 0,
      coinsCollected: 0,
      sessions: 1,
    },
    settings: {
      musicEnabled: true,
      soundEnabled: true,
      vibrationEnabled: true,
      cameraScale: 1,
    },
  }
}

export function ensureProfileDefaults(profile: UserProfile): UserProfile {
  const defaults = createInitialProfile(profile.identity.openId)
  profile.settings ??= defaults.settings
  profile.world.sourceNodes ??= []
  profile.world.productionNodes ??= []
  profile.world.shelves ??= []

  const cow = profile.world.productionNodes.find(
    (node) => node.nodeId === 'cow-barn-01',
  )
  const packer = profile.world.productionNodes.find(
    (node) => node.nodeId === 'milk-packer-01',
  )
  if (cow) {
    cow.outputProductId = 'milk'
    cow.outputStock += packer?.outputStock ?? 0
    cow.outputStock += packer?.inputStock ?? 0
    cow.outputStock = Math.min(cow.capacity, cow.outputStock)
  }
  profile.world.productionNodes = profile.world.productionNodes.filter(
    (node) => node.nodeId !== 'milk-packer-01',
  )

  const rawMilk = profile.player.backpack.find(
    (stack) => stack.productId === 'raw-milk',
  )
  if (rawMilk) {
    const milk = profile.player.backpack.find(
      (stack) => stack.productId === 'milk',
    )
    if (milk) {
      milk.quantity += rawMilk.quantity
      profile.player.backpack = profile.player.backpack.filter(
        (stack) => stack !== rawMilk,
      )
    } else {
      rawMilk.productId = 'milk'
    }
  }
  profile.settings.cameraScale ??= 1

  for (const source of defaults.world.sourceNodes) {
    if (!profile.world.sourceNodes.some((item) => item.sourceId === source.sourceId)) {
      profile.world.sourceNodes.push(source)
    }
  }
  for (const node of defaults.world.productionNodes) {
    if (!profile.world.productionNodes.some((item) => item.nodeId === node.nodeId)) {
      profile.world.productionNodes.push(node)
    }
  }
  for (const shelf of defaults.world.shelves) {
    if (!profile.world.shelves.some((item) => item.shelfId === shelf.shelfId)) {
      profile.world.shelves.push(shelf)
    }
  }

  const milkShelf = profile.world.shelves.find(
    (shelf) => shelf.shelfId === 'milk-shelf-01',
  )
  if (milkShelf && packer) {
    milkShelf.stock = 8
    milkShelf.capacity = 8
  }

  const milkZoneUnlocked = profile.world.unlockedAreaIds.includes('milk-zone')
  if (milkZoneUnlocked) {
    profile.world.sourceNodes
      .filter((source) => source.sourceId === 'tomato-patch-01')
      .forEach((source) => {
        source.unlocked = true
      })
    profile.world.productionNodes.forEach((node) => {
      node.unlocked = true
    })
    profile.world.shelves
      .filter((shelf) => shelf.productId !== 'apple')
      .forEach((shelf) => {
        shelf.unlocked = true
      })
  }

  return profile
}

export function isUserProfile(value: unknown): value is UserProfile {
  if (!value || typeof value !== 'object') {
    return false
  }

  const profile = value as Partial<UserProfile>
  return (
    profile.schemaVersion === PROFILE_SCHEMA_VERSION &&
    typeof profile.revision === 'number' &&
    typeof profile.clientUpdatedAt === 'number' &&
    typeof profile.identity?.openId === 'string' &&
    typeof profile.economy?.coins === 'number' &&
    typeof profile.player?.backpackCapacity === 'number' &&
    Array.isArray(profile.world?.shelves)
  )
}
