import { storageGet, storageRemove, storageSet } from '@/utils/storage'

const ACCESS_TOKEN_KEY = 'odin-access-token'

export function getAccessToken(): string {
  return storageGet(ACCESS_TOKEN_KEY)
}

export function setAccessToken(token: string): void {
  storageSet(ACCESS_TOKEN_KEY, token)
}

export function clearAccessToken(): void {
  storageRemove(ACCESS_TOKEN_KEY)
}
