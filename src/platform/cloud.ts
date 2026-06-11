import type { UserProfile } from '@/domain/game-profile'

export interface CloudIdentity {
  openId: string
}

export interface LoadProfileResult {
  profile: UserProfile | null
}

export interface SaveProfileResult {
  ok: boolean
  conflict: boolean
  profile: UserProfile
}

let initialized = false

function requireCloud(): WeChatCloud {
  if (!wx.cloud) {
    throw new Error('当前小游戏未开通微信云开发')
  }

  if (!initialized) {
    wx.cloud.init({ traceUser: true })
    initialized = true
  }

  return wx.cloud
}

async function callFunction<T>(
  name: string,
  data: Record<string, unknown> = {},
): Promise<T> {
  const response = await requireCloud().callFunction<T>({ name, data })
  if (!response.result) {
    throw new Error(response.errMsg || `云函数 ${name} 未返回结果`)
  }
  return response.result
}

export async function loginWithCloud(): Promise<CloudIdentity> {
  await wx.login()
  return callFunction<CloudIdentity>('login')
}

export function loadCloudProfile(): Promise<LoadProfileResult> {
  return callFunction<LoadProfileResult>('gameProfile', { action: 'load' })
}

export function saveCloudProfile(
  profile: UserProfile,
  expectedRevision: number,
): Promise<SaveProfileResult> {
  return callFunction<SaveProfileResult>('gameProfile', {
    action: 'save',
    profile,
    expectedRevision,
  })
}
