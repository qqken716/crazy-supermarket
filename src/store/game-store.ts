import {
  createInitialProfile,
  ensureProfileDefaults,
  isUserProfile,
  type ProfileMutationReason,
  type UserProfile,
} from '@/domain/game-profile'
import {
  loadCloudProfile,
  loginWithCloud,
  saveCloudProfile,
} from '@/platform/cloud'

const PROFILE_KEY = 'crazy-supermarket:user-profile:v1'
const CONFLICT_KEY = 'crazy-supermarket:conflict-backup:v1'
const CLOUD_SYNC_INTERVAL = 90_000
const LOCAL_SAVE_DEBOUNCE = 250

export type SyncStatus =
  | 'loading'
  | 'offline'
  | 'dirty'
  | 'syncing'
  | 'synced'
  | 'conflict'
  | 'error'

type Listener = () => void

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T
}

export class GameStore {
  profile: UserProfile = createInitialProfile()
  syncStatus: SyncStatus = 'loading'
  lastError = ''

  private listeners = new Set<Listener>()
  private dirty = false
  private authenticated = false
  private lastSyncAt = 0
  private localChangeVersion = 0
  private localSaveTimer: ReturnType<typeof setTimeout> | null = null
  private cloudSyncTimer: ReturnType<typeof setTimeout> | null = null
  private syncPromise: Promise<void> | null = null
  private syncAgain = false

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  async initialize(): Promise<void> {
    const local = this.readLocal()
    if (local) {
      this.profile = ensureProfileDefaults(local)
      this.emit()
    }

    try {
      const identity = await loginWithCloud()
      this.authenticated = true
      const cloudResult = await loadCloudProfile()

      if (cloudResult.profile) {
        this.profile = ensureProfileDefaults(clone(cloudResult.profile))
        this.syncStatus = 'synced'
        this.lastSyncAt = Date.now()
        this.persistLocalNow()
      } else {
        this.profile = ensureProfileDefaults(
          local ?? createInitialProfile(identity.openId),
        )
        this.profile.identity.openId = identity.openId
        this.profile.identity.lastLoginAt = Date.now()
        this.dirty = true
        await this.syncToCloud(true)
      }
    } catch (error) {
      this.syncStatus = 'offline'
      this.lastError =
        error instanceof Error ? error.message : '微信登录或云存档读取失败'
      this.persistLocalNow()
    }

    wx.onHide(() => {
      this.persistLocalNow()
      void this.syncToCloud(true)
    })
    this.emit()
  }

  mutate(
    reason: ProfileMutationReason,
    mutation: (profile: UserProfile) => void,
  ): void {
    mutation(this.profile)
    this.profile.clientUpdatedAt = Date.now()
    this.localChangeVersion += 1
    this.dirty = true
    this.syncStatus = 'dirty'
    this.scheduleLocalSave()
    this.scheduleCloudSync(reason === 'unlock' || reason === 'upgrade')
    this.emit()
  }

  persistLocalNow(): void {
    if (this.localSaveTimer) {
      clearTimeout(this.localSaveTimer)
      this.localSaveTimer = null
    }
    wx.setStorageSync(PROFILE_KEY, clone(this.profile))
  }

  async syncToCloud(force = false): Promise<void> {
    if (!this.authenticated || (!this.dirty && !force)) {
      return
    }
    if (this.syncPromise) {
      this.syncAgain = true
      return this.syncPromise
    }

    const snapshot = clone(this.profile)
    const snapshotVersion = this.localChangeVersion
    this.syncStatus = 'syncing'
    this.emit()

    this.syncPromise = (async () => {
      try {
        const result = await saveCloudProfile(snapshot, snapshot.revision)
        if (result.conflict) {
          wx.setStorageSync(CONFLICT_KEY, snapshot)
          this.profile = ensureProfileDefaults(clone(result.profile))
          this.dirty = false
          this.syncStatus = 'conflict'
          this.persistLocalNow()
          return
        }

        if (snapshotVersion !== this.localChangeVersion) {
          this.profile.revision = result.profile.revision
          this.profile.serverUpdatedAt = result.profile.serverUpdatedAt
          this.syncStatus = 'dirty'
          this.persistLocalNow()
          return
        }

        this.profile = ensureProfileDefaults(clone(result.profile))
        this.dirty = false
        this.syncStatus = 'synced'
        this.lastSyncAt = Date.now()
        this.lastError = ''
        this.persistLocalNow()
      } catch (error) {
        this.dirty = true
        this.syncStatus = 'error'
        this.lastError =
          error instanceof Error ? error.message : '云存档同步失败'
      } finally {
        this.syncPromise = null
        this.emit()
      }
    })()

    await this.syncPromise
    if (this.syncAgain) {
      this.syncAgain = false
      await this.syncToCloud()
    }
  }

  private readLocal(): UserProfile | null {
    try {
      const value = wx.getStorageSync(PROFILE_KEY)
      return isUserProfile(value) ? ensureProfileDefaults(clone(value)) : null
    } catch {
      return null
    }
  }

  private scheduleLocalSave(): void {
    if (this.localSaveTimer) {
      clearTimeout(this.localSaveTimer)
    }
    this.localSaveTimer = setTimeout(
      () => this.persistLocalNow(),
      LOCAL_SAVE_DEBOUNCE,
    )
  }

  private scheduleCloudSync(immediate: boolean): void {
    if (!this.authenticated) {
      return
    }
    if (this.cloudSyncTimer) {
      clearTimeout(this.cloudSyncTimer)
    }

    const wait = immediate
      ? 0
      : Math.max(0, CLOUD_SYNC_INTERVAL - (Date.now() - this.lastSyncAt))
    this.cloudSyncTimer = setTimeout(() => {
      this.cloudSyncTimer = null
      void this.syncToCloud()
    }, wait)
  }

  private emit(): void {
    this.listeners.forEach((listener) => listener())
  }
}
