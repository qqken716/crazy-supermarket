import type { UserProfile } from '@/domain/game-profile'

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
  hasProduct: boolean
}

export const WORLD_WIDTH = 720
export const WORLD_HEIGHT = 1180

export const SOURCE: Rect = { x: 70, y: 180, width: 150, height: 150 }
export const SHELF: Rect = { x: 440, y: 250, width: 150, height: 180 }
export const REGISTER: Rect = { x: 410, y: 780, width: 190, height: 120 }
export const UNLOCK_PAD: Rect = { x: 75, y: 760, width: 170, height: 120 }
export const ENTRANCE = { x: 650, y: 1030 }

export function isNear(
  x: number,
  y: number,
  rect: Rect,
  padding = 35,
): boolean {
  return (
    x >= rect.x - padding &&
    x <= rect.x + rect.width + padding &&
    y >= rect.y - padding &&
    y <= rect.y + rect.height + padding
  )
}

export function getAppleShelf(profile: UserProfile) {
  return profile.world.shelves.find(
    (shelf) => shelf.shelfId === 'apple-shelf-01',
  )
}
