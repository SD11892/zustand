import type { StateCreator, StoreApi, StoreMutatorIdentifier } from '../vanilla'

export interface StateStorage {
  getItem: (name: string) => string | null | Promise<string | null>
  setItem: (name: string, value: string) => void | Promise<void>
  removeItem: (name: string) => void | Promise<void>
}

export type StorageValue<S> = {
  state: S
  version?: number
}

export interface PersistStorage<S> {
  getItem: (
    name: string
  ) => StorageValue<S> | null | Promise<StorageValue<S> | null>
  setItem: (name: string, value: StorageValue<S>) => void | Promise<void>
  removeItem: (name: string) => void | Promise<void>
}

export function createJSONStorage<S>(
  getStorage: () => StateStorage
): PersistStorage<S> | undefined {
  let storage: StateStorage | undefined
  try {
    storage = getStorage()
  } catch (e) {
    // prevent error if the storage is not defined (e.g. when server side rendering a page)
    return
  }
  const persistStorage: PersistStorage<S> = {
    getItem: (name) => {
      const parse = (str: string | null) => {
        if (str === null) {
          return null
        }
        return JSON.parse(str) as StorageValue<S>
      }
      const str = (storage as StateStorage).getItem(name) ?? null
      if (str instanceof Promise) {
        return str.then(parse)
      }
      return parse(str)
    },
    setItem: (name, newValue) =>
      (storage as StateStorage).setItem(name, JSON.stringify(newValue)),
    removeItem: (name) => (storage as StateStorage).removeItem(name),
  }
  return persistStorage
}

export interface PersistOptions<S, PersistedState = S> {
  /** Name of the storage (must be unique) */
  name: string
  /**
   * @deprecated Use `storage` instead.
   * A function returning a storage.
   * The storage must fit `window.localStorage`'s api (or an async version of it).
   * For example the storage could be `AsyncStorage` from React Native.
   *
   * @default () => localStorage
   */
  getStorage?: () => StateStorage
  /**
   * @deprecated Use `storage` instead.
   * Use a custom serializer.
   * The returned string will be stored in the storage.
   *
   * @default JSON.stringify
   */
  serialize?: (state: StorageValue<S>) => string | Promise<string>
  /**
   * @deprecated Use `storage` instead.
   * Use a custom deserializer.
   * Must return an object matching StorageValue<S>
   *
   * @param str The storage's current value.
   * @default JSON.parse
   */
  deserialize?: (
    str: string
  ) => StorageValue<PersistedState> | Promise<StorageValue<PersistedState>>
  /**
   * Use a custom persist storage.
   *
   * Combining `createJSONStorage` helps creating a persist storage
   * with JSON.parse and JSON.stringify.
   *
   * @default createJSONStorage(() => localStorage)
   */
  storage?: PersistStorage<PersistedState> | undefined
  /**
   * Filter the persisted value.
   *
   * @params state The state's value
   */
  partialize?: (state: S) => PersistedState
  /**
   * A function returning another (optional) function.
   * The main function will be called before the state rehydration.
   * The returned function will be called after the state rehydration or when an error occurred.
   */
  onRehydrateStorage?: (
    state: S
  ) => ((state?: S, error?: unknown) => void) | void
  /**
   * If the stored state's version mismatch the one specified here, the storage will not be used.
   * This is useful when adding a breaking change to your store.
   */
  version?: number
  /**
   * A function to perform persisted state migration.
   * This function will be called when persisted state versions mismatch with the one specified here.
   */
  migrate?: (persistedState: unknown, version: number) => S | Promise<S>
  /**
   * A function to perform custom hydration merges when combining the stored state with the current one.
   * By default, this function does a shallow merge.
   */
  merge?: (persistedState: unknown, currentState: S) => S
}

type PersistListener<S> = (state: S) => void

type StorePersist<S, Ps> = {
  persist: {
    setOptions: (options: Partial<PersistOptions<S, Ps>>) => void
    clearStorage: () => void
    rehydrate: () => Promise<void> | void
    hasHydrated: () => boolean
    onHydrate: (fn: PersistListener<S>) => () => void
    onFinishHydration: (fn: PersistListener<S>) => () => void
    getOptions: () => Partial<PersistOptions<S, Ps>>
  }
}

type Thenable<Value> = {
  then<V>(
    onFulfilled: (value: Value) => V | Promise<V> | Thenable<V>
  ): Thenable<V>
  catch<V>(
    onRejected: (reason: Error) => V | Promise<V> | Thenable<V>
  ): Thenable<V>
}

const toThenable =
  <Result, Input>(
    fn: (input: Input) => Result | Promise<Result> | Thenable<Result>
  ) =>
  (input: Input): Thenable<Result> => {
    try {
      const result = fn(input)
      if (result instanceof Promise) {
        return result as Thenable<Result>
      }
      return {
        then(onFulfilled) {
          return toThenable(onFulfilled)(result as Result)
        },
        catch(_onRejected) {
          return this as Thenable<any>
        },
      }
    } catch (e: any) {
      return {
        then(_onFulfilled) {
          return this as Thenable<any>
        },
        catch(onRejected) {
          return toThenable(onRejected)(e)
        },
      }
    }
  }

const oldImpl: PersistImpl = (config, baseOptions) => (set, get, api) => {
  type S = ReturnType<typeof config>
  let options = {
    getStorage: () => localStorage,
    serialize: JSON.stringify as (state: StorageValue<S>) => string,
    deserialize: JSON.parse as (str: string) => StorageValue<S>,
    partialize: (state: S) => state,
    version: 0,
    merge: (persistedState: unknown, currentState: S) => ({
      ...currentState,
      ...(persistedState as object),
    }),
    ...baseOptions,
  }

  let hasHydrated = false
  const hydrationListeners = new Set<PersistListener<S>>()
  const finishHydrationListeners = new Set<PersistListener<S>>()
  let storage: StateStorage | undefined

  try {
    storage = options.getStorage()
  } catch (e) {
    // prevent error if the storage is not defined (e.g. when server side rendering a page)
  }

  if (!storage) {
    return config(
      (...args) => {
        console.warn(
          `[zustand persist middleware] Unable to update item '${options.name}', the given storage is currently unavailable.`
        )
        set(...args)
      },
      get,
      api
    )
  }

  const thenableSerialize = toThenable(options.serialize)

  const setItem = (): Thenable<void> => {
    const state = options.partialize({ ...get() })

    let errorInSync: Error | undefined
    const thenable = thenableSerialize({ state, version: options.version })
      .then((serializedValue) =>
        (storage as StateStorage).setItem(options.name, serializedValue)
      )
      .catch((e) => {
        errorInSync = e
      })
    if (errorInSync) {
      throw errorInSync
    }
    return thenable
  }

  const savedSetState = api.setState

  api.setState = (state, replace) => {
    savedSetState(state, replace)
    void setItem()
  }

  const configResult = config(
    (...args) => {
      set(...args)
      void setItem()
    },
    get,
    api
  )

  // a workaround to solve the issue of not storing rehydrated state in sync storage
  // the set(state) value would be later overridden with initial state by create()
  // to avoid this, we merge the state from localStorage into the initial state.
  let stateFromStorage: S | undefined

  // rehydrate initial state with existing stored state
  const hydrate = () => {
    if (!storage) return

    hasHydrated = false
    hydrationListeners.forEach((cb) => cb(get()))

    const postRehydrationCallback =
      options.onRehydrateStorage?.(get()) || undefined

    // bind is used to avoid `TypeError: Illegal invocation` error
    return toThenable(storage.getItem.bind(storage))(options.name)
      .then((storageValue) => {
        if (storageValue) {
          return options.deserialize(storageValue)
        }
      })
      .then((deserializedStorageValue) => {
        if (deserializedStorageValue) {
          if (
            typeof deserializedStorageValue.version === 'number' &&
            deserializedStorageValue.version !== options.version
          ) {
            if (options.migrate) {
              return options.migrate(
                deserializedStorageValue.state,
                deserializedStorageValue.version
              )
            }
            console.error(
              `State loaded from storage couldn't be migrated since no migrate function was provided`
            )
          } else {
            return deserializedStorageValue.state
          }
        }
      })
      .then((migratedState) => {
        stateFromStorage = options.merge(
          migratedState as S,
          get() ?? configResult
        )

        set(stateFromStorage as S, true)
        return setItem()
      })
      .then(() => {
        postRehydrationCallback?.(stateFromStorage, undefined)
        hasHydrated = true
        finishHydrationListeners.forEach((cb) => cb(stateFromStorage as S))
      })
      .catch((e: Error) => {
        postRehydrationCallback?.(undefined, e)
      })
  }

  ;(api as StoreApi<S> & StorePersist<S, S>).persist = {
    setOptions: (newOptions) => {
      options = {
        ...options,
        ...newOptions,
      }

      if (newOptions.getStorage) {
        storage = newOptions.getStorage()
      }
    },
    clearStorage: () => {
      storage?.removeItem(options.name)
    },
    getOptions: () => options,
    rehydrate: () => hydrate() as Promise<void>,
    hasHydrated: () => hasHydrated,
    onHydrate: (cb) => {
      hydrationListeners.add(cb)

      return () => {
        hydrationListeners.delete(cb)
      }
    },
    onFinishHydration: (cb) => {
      finishHydrationListeners.add(cb)

      return () => {
        finishHydrationListeners.delete(cb)
      }
    },
  }

  hydrate()

  return stateFromStorage || configResult
}

const newImpl: PersistImpl = (config, baseOptions) => (set, get, api) => {
  type S = ReturnType<typeof config>
  let options = {
    storage: createJSONStorage<S>(() => localStorage),
    partialize: (state: S) => state,
    version: 0,
    merge: (persistedState: unknown, currentState: S) => ({
      ...currentState,
      ...(persistedState as object),
    }),
    ...baseOptions,
  }

  let hasHydrated = false
  const hydrationListeners = new Set<PersistListener<S>>()
  const finishHydrationListeners = new Set<PersistListener<S>>()
  let storage = options.storage

  if (!storage) {
    return config(
      (...args) => {
        console.warn(
          `[zustand persist middleware] Unable to update item '${options.name}', the given storage is currently unavailable.`
        )
        set(...args)
      },
      get,
      api
    )
  }

  const setItem = (): void | Promise<void> => {
    const state = options.partialize({ ...get() })
    return (storage as PersistStorage<S>).setItem(options.name, {
      state,
      version: options.version,
    })
  }

  const savedSetState = api.setState

  api.setState = (state, replace) => {
    savedSetState(state, replace)
    void setItem()
  }

  const configResult = config(
    (...args) => {
      set(...args)
      void setItem()
    },
    get,
    api
  )

  // a workaround to solve the issue of not storing rehydrated state in sync storage
  // the set(state) value would be later overridden with initial state by create()
  // to avoid this, we merge the state from localStorage into the initial state.
  let stateFromStorage: S | undefined

  // rehydrate initial state with existing stored state
  const hydrate = () => {
    if (!storage) return

    hasHydrated = false
    hydrationListeners.forEach((cb) => cb(get()))

    const postRehydrationCallback =
      options.onRehydrateStorage?.(get()) || undefined

    // bind is used to avoid `TypeError: Illegal invocation` error
    return toThenable(storage.getItem.bind(storage))(options.name)
      .then((deserializedStorageValue) => {
        if (deserializedStorageValue) {
          if (
            typeof deserializedStorageValue.version === 'number' &&
            deserializedStorageValue.version !== options.version
          ) {
            if (options.migrate) {
              return options.migrate(
                deserializedStorageValue.state,
                deserializedStorageValue.version
              )
            }
            console.error(
              `State loaded from storage couldn't be migrated since no migrate function was provided`
            )
          } else {
            return deserializedStorageValue.state
          }
        }
      })
      .then((migratedState) => {
        stateFromStorage = options.merge(
          migratedState as S,
          get() ?? configResult
        )

        set(stateFromStorage as S, true)
        return setItem()
      })
      .then(() => {
        postRehydrationCallback?.(stateFromStorage, undefined)
        hasHydrated = true
        finishHydrationListeners.forEach((cb) => cb(stateFromStorage as S))
      })
      .catch((e: Error) => {
        postRehydrationCallback?.(undefined, e)
      })
  }

  ;(api as StoreApi<S> & StorePersist<S, S>).persist = {
    setOptions: (newOptions) => {
      options = {
        ...options,
        ...newOptions,
      }

      if (newOptions.storage) {
        storage = newOptions.storage
      }
    },
    clearStorage: () => {
      storage?.removeItem(options.name)
    },
    getOptions: () => options,
    rehydrate: () => hydrate() as Promise<void>,
    hasHydrated: () => hasHydrated,
    onHydrate: (cb) => {
      hydrationListeners.add(cb)

      return () => {
        hydrationListeners.delete(cb)
      }
    },
    onFinishHydration: (cb) => {
      finishHydrationListeners.add(cb)

      return () => {
        finishHydrationListeners.delete(cb)
      }
    },
  }

  hydrate()

  return stateFromStorage || configResult
}

const persistImpl: PersistImpl = (config, baseOptions) => {
  if (
    'getStorage' in baseOptions ||
    'serialize' in baseOptions ||
    'deserialize' in baseOptions
  ) {
    if (__DEV__) {
      console.warn(
        '[DEPRECATED] `getStorage`, `serialize` and `deserialize` options are deprecated. Please use `storage` option instead.'
      )
    }
    return oldImpl(config, baseOptions)
  }
  return newImpl(config, baseOptions)
}

type Persist = <
  T,
  Mps extends [StoreMutatorIdentifier, unknown][] = [],
  Mcs extends [StoreMutatorIdentifier, unknown][] = [],
  U = T
>(
  initializer: StateCreator<T, [...Mps, ['zustand/persist', unknown]], Mcs>,
  options: PersistOptions<T, U>
) => StateCreator<T, Mps, [['zustand/persist', U], ...Mcs]>

declare module '../vanilla' {
  interface StoreMutators<S, A> {
    'zustand/persist': WithPersist<S, A>
  }
}

type Write<T, U> = Omit<T, keyof U> & U

type WithPersist<S, A> = S extends { getState: () => infer T }
  ? Write<S, StorePersist<T, A>>
  : never

type PersistImpl = <T>(
  storeInitializer: StateCreator<T, [], []>,
  options: PersistOptions<T, T>
) => StateCreator<T, [], []>

export const persist = persistImpl as unknown as Persist
