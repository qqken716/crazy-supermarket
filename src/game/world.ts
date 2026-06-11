import type {
  ProductId,
  ProductionNodeSave,
  ShelfSave,
  UserProfile,
} from '@/domain/game-profile'

export interface Rect {
  x: number
  y: number
  width: number
  height: number
}

export interface RuntimeCustomer {
  id: number
  x: number
  y: number
  state: 'entering' | 'shopping' | 'checkout' | 'leaving'
  productId: ProductId | null
  targetShelfId: string | null
}

export const WORLD_WIDTH = 2200
export const WORLD_HEIGHT = 1300

export const SOURCE_RECTS: Record<string, Rect> = {
  'apple-tree-01': { x: 300, y: 820, width: 190, height: 120 },
  'tomato-patch-01': { x: 570, y: 820, width: 190, height: 120 },
}

export const PRODUCTION_RECTS: Record<string, Rect> = {
  'chicken-coop-01': { x: 860, y: 815, width: 190, height: 130 },
  'cow-barn-01': { x: 1360, y: 800, width: 220, height: 150 },
}

export const SHELF_RECTS: Record<string, Rect> = {
  'apple-shelf-01': { x: 570, y: 235, width: 190, height: 135 },
  'tomato-shelf-01': { x: 880, y: 235, width: 190, height: 135 },
  'egg-shelf-01': { x: 570, y: 485, width: 190, height: 135 },
  'milk-shelf-01': { x: 1470, y: 470, width: 150, height: 190 },
}

export const REGISTER: Rect = { x: 1290, y: 260, width: 250, height: 135 }
export const UNLOCK_PAD: Rect = { x: 310, y: 555, width: 210, height: 130 }
export const ENTRANCE = { x: 1640, y: 680 }

export const PRODUCT_LABELS: Record<string, string> = {
  apple: '苹果',
  tomato: '番茄',
  egg: '鸡蛋',
  milk: '牛奶',
}

export const PRODUCT_COLORS: Record<string, string> = {
  apple: '#e84f45',
  tomato: '#e95b45',
  egg: '#fff0b5',
  milk: '#f7fbff',
}

export const PRODUCTION_DURATION_MS: Record<string, number> = {
  'chicken-coop-01': 1_800,
  'cow-barn-01': 2_200,
}

export function isNear(
  x: number,
  y: number,
  rect: Rect,
  padding = 38,
): boolean {
  return (
    x >= rect.x - padding &&
    x <= rect.x + rect.width + padding &&
    y >= rect.y - padding &&
    y <= rect.y + rect.height + padding
  )
}

export function getShelf(
  profile: UserProfile,
  shelfId: string,
): ShelfSave | undefined {
  return profile.world.shelves.find((shelf) => shelf.shelfId === shelfId)
}

export function getProductionNode(
  profile: UserProfile,
  nodeId: string,
): ProductionNodeSave | undefined {
  return profile.world.productionNodes.find((node) => node.nodeId === nodeId)
}

export function getBackpackQuantity(
  profile: UserProfile,
  productId: ProductId,
): number {
  return (
    profile.player.backpack.find((stack) => stack.productId === productId)
      ?.quantity ?? 0
  )
}

export function getBackpackTotal(profile: UserProfile): number {
  return profile.player.backpack.reduce(
    (total, stack) => total + stack.quantity,
    0,
  )
}
