export const PROFILE_SCHEMA_VERSION = 1 as const

export type ProductId = 'apple' | 'milk' | 'bread' | 'egg' | (string & {})

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
      position: { x: 320, y: 480 },
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
    },
  }
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
