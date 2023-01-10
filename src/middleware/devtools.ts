import type {} from '@redux-devtools/extension'
import type { StateCreator, StoreApi, StoreMutatorIdentifier } from '../vanilla'

// Copy types to avoid import type { Config } from '@redux-devtools/extension'
// https://github.com/pmndrs/zustand/issues/1205
type Action<T = any> = {
  type: T
}
type ActionCreator<A, P extends any[] = any[]> = {
  (...args: P): A
}
type EnhancerOptions = {
  name?: string
  actionCreators?:
    | ActionCreator<any>[]
    | {
        [key: string]: ActionCreator<any>
      }
  latency?: number
  maxAge?: number
  serialize?:
    | boolean
    | {
        options?:
          | undefined
          | boolean
          | {
              date?: true
              regex?: true
              undefined?: true
              error?: true
              symbol?: true
              map?: true
              set?: true
              function?: true | ((fn: (...args: any[]) => any) => string)
            }
        replacer?: (key: string, value: unknown) => any
        reviver?: (key: string, value: unknown) => any
        immutable?: any
        refs?: any
      }
  actionSanitizer?: <A extends Action>(action: A, id: number) => A
  stateSanitizer?: <S>(state: S, index: number) => S
  actionsBlacklist?: string | string[]
  actionsWhitelist?: string | string[]
  actionsDenylist?: string | string[]
  actionsAllowlist?: string | string[]
  predicate?: <S, A extends Action>(state: S, action: A) => boolean
  shouldRecordChanges?: boolean
  pauseActionType?: string
  autoPause?: boolean
  shouldStartLocked?: boolean
  shouldHotReload?: boolean
  shouldCatchErrors?: boolean
  features?: {
    pause?: boolean
    lock?: boolean
    persist?: boolean
    export?: boolean | 'custom'
    import?: boolean | 'custom'
    jump?: boolean
    skip?: boolean
    reorder?: boolean
    dispatch?: boolean
    test?: boolean
  }
  trace?: boolean | (<A extends Action>(action: A) => string)
  traceLimit?: number
}
type Config = EnhancerOptions & {
  type?: string
}

declare module '../vanilla' {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  interface StoreMutators<S, A> {
    'zustand/devtools': WithDevtools<S>
  }
}

// FIXME https://github.com/reduxjs/redux-devtools/issues/1097
type Message = {
  type: string
  payload?: any
  state?: any
}

type Cast<T, U> = T extends U ? T : U
type Write<T, U> = Omit<T, keyof U> & U
type TakeTwo<T> = T extends { length: 0 }
  ? [undefined, undefined]
  : T extends { length: 1 }
  ? [...a0: Cast<T, unknown[]>, a1: undefined]
  : T extends { length: 0 | 1 }
  ? [...a0: Cast<T, unknown[]>, a1: undefined]
  : T extends { length: 2 }
  ? T
  : T extends { length: 1 | 2 }
  ? T
  : T extends { length: 0 | 1 | 2 }
  ? T
  : T extends [infer A0, infer A1, ...unknown[]]
  ? [A0, A1]
  : T extends [infer A0, (infer A1)?, ...unknown[]]
  ? [A0, A1?]
  : T extends [(infer A0)?, (infer A1)?, ...unknown[]]
  ? [A0?, A1?]
  : never

type WithDevtools<S> = Write<S, StoreDevtools<S>>

type StoreDevtools<S> = S extends {
  setState: (...a: infer Sa) => infer Sr
}
  ? {
      setState<A extends string | { type: unknown }>(
        ...a: [...a: TakeTwo<Sa>, action?: A]
      ): Sr
    }
  : never

export interface DevtoolsOptions extends Config {
  enabled?: boolean
  anonymousActionType?: string
  store?: string
}

type Devtools = <
  T,
  Mps extends [StoreMutatorIdentifier, unknown][] = [],
  Mcs extends [StoreMutatorIdentifier, unknown][] = []
>(
  initializer: StateCreator<T, [...Mps, ['zustand/devtools', never]], Mcs>,
  devtoolsOptions?: DevtoolsOptions
) => StateCreator<T, Mps, [['zustand/devtools', never], ...Mcs]>

declare module '../vanilla' {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  interface StoreMutators<S, A> {
    'zustand/devtools': WithDevtools<S>
  }
}

type DevtoolsImpl = <T>(
  storeInitializer: StateCreator<T, [], []>,
  devtoolsOptions?: DevtoolsOptions
) => StateCreator<T, [], []>

export type NamedSet<T> = WithDevtools<StoreApi<T>>['setState']

type Connection = ReturnType<
  NonNullable<Window['__REDUX_DEVTOOLS_EXTENSION__']>['connect']
>
type ConnectionName = string | undefined
type StoreName = string
type StoreInformation = StoreApi<unknown>
type ConnectionInformation = {
  connection: Connection
  stores: Record<StoreName, StoreInformation>
}
const trackedConnections: Map<ConnectionName, ConnectionInformation> = new Map()

const getTrackedConnectionState = (
  name: string | undefined
): Record<string, any> => {
  const api = trackedConnections.get(name)
  if (!api) return {}
  return Object.fromEntries(
    Object.entries(api.stores).map(([key, api]) => [key, api.getState()])
  )
}

const extractConnectionInformation = (
  store: string | undefined,
  extensionConnector: NonNullable<
    (typeof window)['__REDUX_DEVTOOLS_EXTENSION__']
  >,
  options: Omit<DevtoolsOptions, 'enabled' | 'anonymousActionType' | 'store'>
) => {
  if (store === undefined) {
    return {
      type: 'untracked' as const,
      connection: extensionConnector.connect(options),
    }
  }
  const existingConnection = trackedConnections.get(options.name)
  if (existingConnection) {
    return { type: 'tracked' as const, store, ...existingConnection }
  }
  const newConnection: ConnectionInformation = {
    connection: extensionConnector.connect(options),
    stores: {},
  }
  trackedConnections.set(options.name, newConnection)
  return { type: 'tracked' as const, store, ...newConnection }
}

const devtoolsImpl: DevtoolsImpl =
  (fn, devtoolsOptions = {}) =>
  (set, get, api) => {
    const { enabled, anonymousActionType, store, ...options } = devtoolsOptions

    type S = ReturnType<typeof fn> & {
      [store: string]: ReturnType<typeof fn>
    }
    type PartialState = Partial<S> | ((s: S) => Partial<S>)

    let extensionConnector:
      | (typeof window)['__REDUX_DEVTOOLS_EXTENSION__']
      | false
    try {
      extensionConnector =
        (enabled ?? __DEV__) && window.__REDUX_DEVTOOLS_EXTENSION__
    } catch (e) {
      // ignored
    }

    if (!extensionConnector) {
      if (__DEV__ && enabled) {
        console.warn(
          '[zustand devtools middleware] Please install/enable Redux devtools extension'
        )
      }
      return fn(set, get, api)
    }

    const { connection, ...connectionInformation } =
      extractConnectionInformation(store, extensionConnector, options)

    let isRecording = true
    ;(api.setState as NamedSet<S>) = (state, replace, nameOrAction) => {
      const r = set(state, replace)
      if (!isRecording) return r
      const action: Action<unknown> =
        nameOrAction === undefined
          ? { type: anonymousActionType || 'anonymous' }
          : typeof nameOrAction === 'string'
          ? { type: nameOrAction }
          : nameOrAction
      if (store === undefined) {
        connection?.send(action, get())
        return r
      }
      connection?.send(
        {
          ...action,
          type: `${store}/${action.type}`,
        },
        {
          ...getTrackedConnectionState(options.name),
          [store]: api.getState(),
        }
      )
      return r
    }

    const setStateFromDevtools: StoreApi<S>['setState'] = (...a) => {
      const originalIsRecording = isRecording
      isRecording = false
      set(...a)
      isRecording = originalIsRecording
    }

    const initialState = fn(api.setState, get, api)
    if (connectionInformation.type === 'untracked') {
      connection?.init(initialState)
    } else {
      connectionInformation.stores[connectionInformation.store] = api
      connection?.init(
        Object.fromEntries(
          Object.entries(connectionInformation.stores).map(([key, store]) => [
            key,
            key === connectionInformation.store
              ? initialState
              : store.getState(),
          ])
        )
      )
    }

    if (
      (api as any).dispatchFromDevtools &&
      typeof (api as any).dispatch === 'function'
    ) {
      let didWarnAboutReservedActionType = false
      const originalDispatch = (api as any).dispatch
      ;(api as any).dispatch = (...a: any[]) => {
        if (
          __DEV__ &&
          a[0].type === '__setState' &&
          !didWarnAboutReservedActionType
        ) {
          console.warn(
            '[zustand devtools middleware] "__setState" action type is reserved ' +
              'to set state from the devtools. Avoid using it.'
          )
          didWarnAboutReservedActionType = true
        }
        ;(originalDispatch as any)(...a)
      }
    }

    ;(
      connection as unknown as {
        // FIXME https://github.com/reduxjs/redux-devtools/issues/1097
        subscribe: (
          listener: (message: Message) => void
        ) => (() => void) | undefined
      }
    ).subscribe((message: any) => {
      switch (message.type) {
        case 'ACTION':
          if (typeof message.payload !== 'string') {
            console.error(
              '[zustand devtools middleware] Unsupported action format'
            )
            return
          }
          return parseJsonThen<{ type: unknown; state?: PartialState }>(
            message.payload,
            (action) => {
              if (action.type === '__setState') {
                if (store === undefined) {
                  setStateFromDevtools(action.state as PartialState)
                  return
                }
                if (Object.keys(action.state as S).length !== 1) {
                  console.error(
                    `
                    [zustand devtools middleware] Unsupported __setState action format. 
                    When using 'store' option in devtools(), the 'state' should have only one key, which is a value of 'store' that was passed in devtools(),
                    and value of this only key should be a state object. Example: { "type": "__setState", "state": { "abc123Store": { "foo": "bar" } } }
                    `
                  )
                }
                const stateFromDevtools = (action.state as S)[store]
                if (
                  stateFromDevtools === undefined ||
                  stateFromDevtools === null
                ) {
                  return
                }
                if (
                  JSON.stringify(api.getState()) !==
                  JSON.stringify(stateFromDevtools)
                ) {
                  setStateFromDevtools(stateFromDevtools)
                }
                return
              }

              if (!(api as any).dispatchFromDevtools) return
              if (typeof (api as any).dispatch !== 'function') return
              ;(api as any).dispatch(action)
            }
          )

        case 'DISPATCH':
          switch (message.payload.type) {
            case 'RESET':
              setStateFromDevtools(initialState as S)
              if (store === undefined) {
                return connection?.init(api.getState())
              }
              return connection?.init(getTrackedConnectionState(options.name))

            case 'COMMIT':
              if (store === undefined) {
                connection?.init(api.getState())
                return
              }
              return connection?.init(getTrackedConnectionState(options.name))

            case 'ROLLBACK':
              return parseJsonThen<S>(message.state, (state) => {
                if (store === undefined) {
                  setStateFromDevtools(state)
                  connection?.init(api.getState())
                  return
                }
                setStateFromDevtools(state[store] as S)
                connection?.init(getTrackedConnectionState(options.name))
              })

            case 'JUMP_TO_STATE':
            case 'JUMP_TO_ACTION':
              return parseJsonThen<S>(message.state, (state) => {
                if (store === undefined) {
                  setStateFromDevtools(state)
                  return
                }
                if (
                  JSON.stringify(api.getState()) !==
                  JSON.stringify(state[store])
                ) {
                  setStateFromDevtools(state[store] as S)
                }
              })

            case 'IMPORT_STATE': {
              const { nextLiftedState } = message.payload
              const lastComputedState =
                nextLiftedState.computedStates.slice(-1)[0]?.state
              if (!lastComputedState) return
              if (store === undefined) {
                setStateFromDevtools(lastComputedState)
              } else {
                setStateFromDevtools(lastComputedState[store])
              }
              connection?.send(
                null as any, // FIXME no-any
                nextLiftedState
              )
              return
            }

            case 'PAUSE_RECORDING':
              return (isRecording = !isRecording)
          }
          return
      }
    })

    return initialState
  }
export const devtools = devtoolsImpl as unknown as Devtools

const parseJsonThen = <T>(stringified: string, f: (parsed: T) => void) => {
  let parsed: T | undefined
  try {
    parsed = JSON.parse(stringified)
  } catch (e) {
    console.error(
      '[zustand devtools middleware] Could not parse the received json',
      e
    )
  }
  if (parsed !== undefined) f(parsed as T)
}
