export type State = Record<string | number | symbol, unknown>
// types inspired by setState from React, see:
// https://github.com/DefinitelyTyped/DefinitelyTyped/blob/6c49e45842358ba59a508e13130791989911430d/types/react/v16/index.d.ts#L489-L495
export type PartialState<T extends State, K extends keyof T = keyof T> =
  | (Pick<T, K> | T)
  | ((state: T) => Pick<T, K> | T)
export type StateSelector<T extends State, U> = (state: T) => U
export type EqualityChecker<T> = (state: T, newState: T) => boolean
export type StateListener<T> = (state: T, previousState: T) => void
export type StateSliceListener<T> = (slice: T, previousSlice: T) => void
export interface Subscribe<T extends State> {
  (listener: StateListener<T>): () => void
  <StateSlice>(
    listener: StateSliceListener<StateSlice>,
    selector: StateSelector<T, StateSlice>,
    equalityFn?: EqualityChecker<StateSlice>
  ): () => void
}

export type SetState<T extends State> = {
  <K extends keyof T>(partial: PartialState<T, K>, replace?: boolean): void
}
export type GetState<T extends State> = () => T
export type Destroy = () => void
export interface StoreApi<T extends State> {
  setState: SetState<T>
  getState: GetState<T>
  subscribe: Subscribe<T>
  destroy: Destroy
}
export type StateCreator<T extends State, CustomSetState = SetState<T>> = (
  set: CustomSetState,
  get: GetState<T>,
  api: StoreApi<T>
) => T

export default function create<TState extends State>(
  createState: StateCreator<TState>
): StoreApi<TState> {
  let state: TState
  const listeners: Set<StateListener<TState>> = new Set()

  const setState: SetState<TState> = (partial, replace) => {
    const nextState = typeof partial === 'function' ? partial(state) : partial
    if (nextState !== state) {
      const previousState = state
      state = replace
        ? (nextState as TState)
        : Object.assign({}, state, nextState)
      listeners.forEach((listener) => listener(state, previousState))
    }
  }

  const getState: GetState<TState> = () => state

  const subscribeWithSelector = <StateSlice>(
    listener: StateSliceListener<StateSlice>,
    selector: StateSelector<TState, StateSlice> = getState as any,
    equalityFn: EqualityChecker<StateSlice> = Object.is
  ) => {
    let currentSlice: StateSlice = selector(state)
    function listenerToAdd() {
      const nextSlice = selector(state)
      if (!equalityFn(currentSlice, nextSlice)) {
        const previousSlice = currentSlice
        listener((currentSlice = nextSlice), previousSlice)
      }
    }
    listeners.add(listenerToAdd)
    // Unsubscribe
    return () => listeners.delete(listenerToAdd)
  }

  const subscribe: Subscribe<TState> = <StateSlice>(
    listener: StateListener<TState> | StateSliceListener<StateSlice>,
    selector?: StateSelector<TState, StateSlice>,
    equalityFn?: EqualityChecker<StateSlice>
  ) => {
    if (selector || equalityFn) {
      return subscribeWithSelector(
        listener as StateSliceListener<StateSlice>,
        selector,
        equalityFn
      )
    }
    listeners.add(listener as StateListener<TState>)
    // Unsubscribe
    return () => listeners.delete(listener as StateListener<TState>)
  }

  const destroy: Destroy = () => listeners.clear()
  const api = { setState, getState, subscribe, destroy }
  state = createState(setState, getState, api)
  return api
}
