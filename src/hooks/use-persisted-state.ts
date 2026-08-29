import { useCallback, useEffect, useState } from 'react'

const STORAGE_PREFIX = 'stix-vc-node:'

function readStoredValue<T>(key: string, initialValue?: T): T | undefined {
  if (typeof window === 'undefined') return initialValue
  try {
    const raw = window.localStorage.getItem(STORAGE_PREFIX + key)
    if (raw === null) return initialValue
    return JSON.parse(raw) as T
  } catch {
    return initialValue
  }
}

function writeStoredValue<T>(key: string, value: T): void {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(STORAGE_PREFIX + key, JSON.stringify(value))
  } catch {
    // Quota or privacy mode — keep in-memory state only.
  }
}

function deleteStoredValue(key: string): void {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.removeItem(STORAGE_PREFIX + key)
  } catch {
    // ignore
  }
}

/**
 * localStorage-backed state with the same signature as Spark `useKV`.
 * Works on any static host without the GitHub Spark runtime proxy.
 */
export function usePersistedState<T = string>(
  key: string,
  initialValue?: NoInfer<T>
): readonly [T | undefined, (newValue: T | ((oldValue?: T) => T)) => void, () => void] {
  const [value, setValue] = useState<T | undefined>(() => readStoredValue(key, initialValue))

  useEffect(() => {
    setValue(readStoredValue(key, initialValue))
    // Rehydrate once per key on mount.
  }, [key])

  const setPersisted = useCallback(
    (newValue: T | ((oldValue?: T) => T)) => {
      setValue((oldValue) => {
        const next = typeof newValue === 'function'
          ? (newValue as (oldValue?: T) => T)(oldValue)
          : newValue
        writeStoredValue(key, next)
        return next
      })
    },
    [key]
  )

  const deleteValue = useCallback(() => {
    deleteStoredValue(key)
    setValue(initialValue)
  }, [initialValue, key])

  return [value, setPersisted, deleteValue] as const
}
