import {
  CURRENT_SCHEMA_VERSION,
  createEmptyStorageSchema,
  type Profile,
  type Settings,
  type StorageSchema,
} from './schema'

const STORAGE_KEY = 'autofillStore'

function isValidStorageSchema(value: unknown): value is StorageSchema {
  return (
    typeof value === 'object' &&
    value !== null &&
    (value as StorageSchema).version === CURRENT_SCHEMA_VERSION &&
    typeof (value as StorageSchema).profile === 'object' &&
    typeof (value as StorageSchema).settings === 'object'
  )
}

export async function loadStorage(): Promise<StorageSchema> {
  const result = await chrome.storage.local.get(STORAGE_KEY)
  const stored = result[STORAGE_KEY]
  return isValidStorageSchema(stored) ? stored : createEmptyStorageSchema()
}

export async function saveStorage(data: StorageSchema): Promise<void> {
  await chrome.storage.local.set({ [STORAGE_KEY]: data })
}

export async function saveProfile(profile: Profile): Promise<void> {
  const current = await loadStorage()
  await saveStorage({ ...current, profile })
}

export async function saveSettings(settings: Settings): Promise<void> {
  const current = await loadStorage()
  await saveStorage({ ...current, settings })
}

export async function clearStorage(): Promise<void> {
  await chrome.storage.local.remove(STORAGE_KEY)
}
