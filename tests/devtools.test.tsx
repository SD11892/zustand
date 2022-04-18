import { devtools, redux } from 'zustand/middleware'
import create, { StoreApi } from 'zustand/vanilla'

let extensionSubscriber: ((message: any) => void) | undefined
const extension = {
  subscribe: jest.fn((f) => {
    extensionSubscriber = f
    return () => {}
  }),
  unsubscribe: jest.fn(),
  send: jest.fn(),
  init: jest.fn(),
  error: jest.fn(),
}
const extensionConnector = { connect: jest.fn(() => extension) }
;(window as any).__REDUX_DEVTOOLS_EXTENSION__ = extensionConnector

beforeEach(() => {
  extensionConnector.connect.mockClear()
  extension.subscribe.mockClear()
  extension.unsubscribe.mockClear()
  extension.send.mockClear()
  extension.init.mockClear()
  extension.error.mockClear()
  extensionSubscriber = undefined
})

it('connects to the extension by passing the options and initializes', () => {
  const options = { name: 'test', foo: 'bar', enabled: true }
  const initialState = { count: 0 }
  create(devtools(() => initialState, options))

  expect(extensionConnector.connect).toHaveBeenLastCalledWith(options)
  expect(extension.init).toHaveBeenLastCalledWith(initialState)
})

describe('If there is no extension installed...', () => {
  let savedConsoleWarn: any
  let savedDEV: boolean
  beforeEach(() => {
    savedConsoleWarn = console.warn
    console.warn = jest.fn()
    savedDEV = __DEV__
    ;(window as any).__REDUX_DEVTOOLS_EXTENSION__ = undefined
  })
  afterEach(() => {
    console.warn = savedConsoleWarn
    __DEV__ = savedDEV
    ;(window as any).__REDUX_DEVTOOLS_EXTENSION__ = extensionConnector
  })

  it('does not throw', () => {
    expect(() => {
      create(devtools(() => ({ count: 0 })))
    }).not.toThrow()
  })

  it('does not warn if not enabled', () => {
    create(devtools(() => ({ count: 0 })))
    expect(console.warn).not.toBeCalled()
  })

  it('[DEV-ONLY] warns if enabled in dev mode', () => {
    __DEV__ = true
    create(devtools(() => ({ count: 0 }), { enabled: true }))
    expect(console.warn).toBeCalled()
  })

  it('[PRD-ONLY] does not warn if not in dev env', () => {
    __DEV__ = false
    create(devtools(() => ({ count: 0 })))
    expect(console.warn).not.toBeCalled()
  })

  it('[PRD-ONLY] does not warn if not in dev env even if enabled', () => {
    __DEV__ = false
    create(devtools(() => ({ count: 0 }), { enabled: true }))
    expect(console.warn).not.toBeCalled()
  })
})

describe('When state changes...', () => {
  it("sends { type: setStateName || 'anonymous` } as the action with current state", () => {
    const api = create(
      devtools(() => ({ count: 0, foo: 'bar' }), {
        name: 'testOptionsName',
        enabled: true,
      })
    )
    api.setState({ count: 10 }, false, 'testSetStateName')
    expect(extension.send).toHaveBeenLastCalledWith(
      { type: 'testSetStateName' },
      { count: 10, foo: 'bar' }
    )
    api.setState({ count: 5, foo: 'baz' }, true)
    expect(extension.send).toHaveBeenLastCalledWith(
      { type: 'anonymous' },
      { count: 5, foo: 'baz' }
    )
  })
})

describe('when it receives an message of type...', () => {
  describe('ACTION...', () => {
    it('does nothing', () => {
      const initialState = { count: 0 }
      const api = create(devtools(() => initialState, { enabled: true }))
      const setState = jest.spyOn(api, 'setState')

      ;(extensionSubscriber as (message: any) => void)({
        type: 'ACTION',
        payload: '{ "type": "INCREMENT" }',
      })

      expect(api.getState()).toBe(initialState)
      expect(setState).not.toBeCalled()
    })

    it('unless action type is __setState', () => {
      const initialState = { count: 0 }
      const api = create(devtools(() => initialState, { enabled: true }))

      ;(extensionSubscriber as (message: any) => void)({
        type: 'ACTION',
        payload: '{ "type": "__setState", "state": { "foo": "bar" } }',
      })

      expect(api.getState()).toStrictEqual({ ...initialState, foo: 'bar' })
    })

    it('does nothing even if there is `api.dispatch`', () => {
      const initialState = { count: 0 }
      const api = create(devtools(() => initialState, { enabled: true }))
      ;(api as any).dispatch = jest.fn()
      const setState = jest.spyOn(api, 'setState')

      ;(extensionSubscriber as (message: any) => void)({
        type: 'ACTION',
        payload: '{ "type": "INCREMENT" }',
      })

      expect(api.getState()).toBe(initialState)
      expect(setState).not.toBeCalled()
      expect((api as any).dispatch).not.toBeCalled()
    })

    it('dispatches with `api.dispatch` when `api.dispatchFromDevtools` is set to true', () => {
      const initialState = { count: 0 }
      const api = create(devtools(() => initialState, { enabled: true }))
      ;(api as any).dispatch = jest.fn()
      ;(api as any).dispatchFromDevtools = true
      const setState = jest.spyOn(api, 'setState')

      ;(extensionSubscriber as (message: any) => void)({
        type: 'ACTION',
        payload: '{ "type": "INCREMENT" }',
      })

      expect(api.getState()).toBe(initialState)
      expect(setState).not.toBeCalled()
      expect((api as any).dispatch).toHaveBeenLastCalledWith({
        type: 'INCREMENT',
      })
    })

    it('does not throw for unsupported payload', () => {
      const initialState = { count: 0 }
      const api = create(devtools(() => initialState, { enabled: true }))
      ;(api as any).dispatch = jest.fn()
      ;(api as any).dispatchFromDevtools = true
      const setState = jest.spyOn(api, 'setState')
      const originalConsoleError = console.error
      console.error = jest.fn()

      expect(() => {
        ;(extensionSubscriber as (message: any) => void)({
          type: 'ACTION',
          payload: 'this.increment()',
        })
      }).not.toThrow()

      expect(console.error).toHaveBeenLastCalledWith(
        '[zustand devtools middleware] Could not parse the received json',
        (() => {
          try {
            JSON.parse('this.increment()')
          } catch (e) {
            return e
          }
        })()
      )

      expect(() => {
        ;(extensionSubscriber as (message: any) => void)({
          type: 'ACTION',
          payload: { name: 'increment', args: [] },
        })
      }).not.toThrow()

      expect(console.error).toHaveBeenLastCalledWith(
        '[zustand devtools middleware] Unsupported action format'
      )

      expect(api.getState()).toBe(initialState)
      expect(setState).not.toBeCalled()
      expect((api as any).dispatch).not.toBeCalled()

      console.error = originalConsoleError
    })
  })

  describe('DISPATCH and payload of type...', () => {
    it('RESET, it inits with initial state', () => {
      const initialState = { count: 0 }
      const api = create(devtools(() => initialState, { enabled: true }))
      api.setState({ count: 1 })

      extension.send.mockClear()
      ;(extensionSubscriber as (message: any) => void)({
        type: 'DISPATCH',
        payload: { type: 'RESET' },
      })

      expect(api.getState()).toStrictEqual(initialState)
      expect(extension.init).toHaveBeenLastCalledWith(initialState)
      expect(extension.send).not.toBeCalled()
    })

    it('COMMIT, it inits with current state', () => {
      const initialState = { count: 0 }
      const api = create(devtools(() => initialState, { enabled: true }))
      api.setState({ count: 2 })
      const currentState = api.getState()

      extension.send.mockClear()
      ;(extensionSubscriber as (message: any) => void)({
        type: 'DISPATCH',
        payload: { type: 'COMMIT' },
      })

      expect(extension.init).toHaveBeenLastCalledWith(currentState)
      expect(extension.send).not.toBeCalled()
    })

    describe('ROLLBACK...', () => {
      it('it updates state without recording and inits with `message.state`', () => {
        const initialState = { count: 0, increment: () => {} }
        const api = create(devtools(() => initialState, { enabled: true }))
        const newState = { foo: 'bar' }

        extension.send.mockClear()
        ;(extensionSubscriber as (message: any) => void)({
          type: 'DISPATCH',
          payload: { type: 'ROLLBACK' },
          state: JSON.stringify(newState),
        })

        expect(api.getState()).toStrictEqual({ ...initialState, ...newState })
        expect(extension.init).toHaveBeenLastCalledWith({
          ...initialState,
          ...newState,
        })
        expect(extension.send).not.toBeCalled()
      })

      it('does not throw for unparsable `message.state`', () => {
        const increment = () => {}
        const initialState = { count: 0, increment }
        const api = create(devtools(() => initialState, { enabled: true }))
        const originalConsoleError = console.error
        console.error = jest.fn()

        extension.init.mockClear()
        extension.send.mockClear()
        ;(extensionSubscriber as (message: any) => void)({
          type: 'DISPATCH',
          payload: { type: 'ROLLBACK' },
          state: 'foobar',
        })

        expect(console.error).toHaveBeenLastCalledWith(
          '[zustand devtools middleware] Could not parse the received json',
          (() => {
            try {
              JSON.parse('foobar')
            } catch (e) {
              return e
            }
          })()
        )
        expect(api.getState()).toBe(initialState)
        expect(extension.init).not.toBeCalled()
        expect(extension.send).not.toBeCalled()

        console.error = originalConsoleError
      })
    })

    describe('JUMP_TO_STATE...', () => {
      const increment = () => {}
      it('it updates state without recording with `message.state`', () => {
        const initialState = { count: 0, increment }
        const api = create(devtools(() => initialState, { enabled: true }))
        const newState = { foo: 'bar' }

        extension.send.mockClear()
        ;(extensionSubscriber as (message: any) => void)({
          type: 'DISPATCH',
          payload: { type: 'JUMP_TO_STATE' },
          state: JSON.stringify(newState),
        })
        expect(api.getState()).toStrictEqual({ ...initialState, ...newState })
        expect(extension.send).not.toBeCalled()
      })

      it('does not throw for unparsable `message.state`', () => {
        const initialState = { count: 0, increment: () => {} }
        const api = create(devtools(() => initialState, { enabled: true }))
        const originalConsoleError = console.error
        console.error = jest.fn()

        extension.send.mockClear()
        ;(extensionSubscriber as (message: any) => void)({
          type: 'DISPATCH',
          payload: { type: 'JUMP_TO_STATE' },
          state: 'foobar',
        })

        expect(console.error).toHaveBeenLastCalledWith(
          '[zustand devtools middleware] Could not parse the received json',
          (() => {
            try {
              JSON.parse('foobar')
            } catch (e) {
              return e
            }
          })()
        )
        expect(api.getState()).toBe(initialState)
        expect(extension.send).not.toBeCalled()

        console.error = originalConsoleError
      })
    })

    describe('JUMP_TO_ACTION...', () => {
      it('it updates state without recording with `message.state`', () => {
        const initialState = { count: 0, increment: () => {} }
        const api = create(devtools(() => initialState, { enabled: true }))
        const newState = { foo: 'bar' }

        extension.send.mockClear()
        ;(extensionSubscriber as (message: any) => void)({
          type: 'DISPATCH',
          payload: { type: 'JUMP_TO_ACTION' },
          state: JSON.stringify(newState),
        })
        expect(api.getState()).toStrictEqual({ ...initialState, ...newState })
        expect(extension.send).not.toBeCalled()
      })

      it('does not throw for unparsable `message.state`', () => {
        const increment = () => {}
        const initialState = { count: 0, increment }
        const api = create(devtools(() => initialState, { enabled: true }))
        const originalConsoleError = console.error
        console.error = jest.fn()

        extension.send.mockClear()
        ;(extensionSubscriber as (message: any) => void)({
          type: 'DISPATCH',
          payload: { type: 'JUMP_TO_ACTION' },
          state: 'foobar',
        })

        expect(console.error).toHaveBeenLastCalledWith(
          '[zustand devtools middleware] Could not parse the received json',
          (() => {
            try {
              JSON.parse('foobar')
            } catch (e) {
              return e
            }
          })()
        )
        expect(api.getState()).toBe(initialState)
        expect(extension.send).not.toBeCalled()

        console.error = originalConsoleError
      })
    })

    it('IMPORT_STATE, it updates state without recording and inits the last computedState', () => {
      const initialState = { count: 0, increment: () => {} }
      const api = create(devtools(() => initialState, { enabled: true }))
      const nextLiftedState = {
        computedStates: [{ state: { count: 4 } }, { state: { count: 5 } }],
      }

      extension.send.mockClear()
      ;(extensionSubscriber as (message: any) => void)({
        type: 'DISPATCH',
        payload: {
          type: 'IMPORT_STATE',
          nextLiftedState,
        },
      })
      expect(api.getState()).toStrictEqual({
        ...initialState,
        ...nextLiftedState.computedStates.slice(-1)[0]?.state,
      })
      expect(extension.send).toHaveBeenLastCalledWith(null, nextLiftedState)
    })

    it('PAUSE_RECORDING, it toggles the sending of actions', () => {
      const api = create(devtools(() => ({ count: 0 }), { enabled: true }))

      api.setState({ count: 1 }, false, 'increment')
      expect(extension.send).toHaveBeenLastCalledWith(
        { type: 'increment' },
        { count: 1 }
      )
      ;(extensionSubscriber as (message: any) => void)({
        type: 'DISPATCH',
        payload: { type: 'PAUSE_RECORDING' },
      })

      api.setState({ count: 2 }, false, 'increment')
      expect(extension.send).toHaveBeenLastCalledWith(
        { type: 'increment' },
        { count: 1 }
      )
      ;(extensionSubscriber as (message: any) => void)({
        type: 'DISPATCH',
        payload: { type: 'PAUSE_RECORDING' },
      })

      api.setState({ count: 3 }, false, 'increment')
      expect(extension.send).toHaveBeenLastCalledWith(
        { type: 'increment' },
        { count: 3 }
      )
    })
  })
})

describe('with redux middleware', () => {
  let api: StoreApi<{
    count: number
    dispatch: (
      action: { type: 'INCREMENT' } | { type: 'DECREMENT' }
    ) => { type: 'INCREMENT' } | { type: 'DECREMENT' }
  }>

  it('works as expected', () => {
    api = create(
      devtools(
        redux(
          (
            { count },
            { type }: { type: 'INCREMENT' } | { type: 'DECREMENT' }
          ) => ({
            count: count + (type === 'INCREMENT' ? 1 : -1),
          }),
          { count: 0 }
        ),
        { enabled: true }
      )
    )
    ;(api as any).dispatch({ type: 'INCREMENT' })
    ;(api as any).dispatch({ type: 'INCREMENT' })
    ;(extensionSubscriber as (message: any) => void)({
      type: 'ACTION',
      payload: JSON.stringify({ type: 'DECREMENT' }),
    })

    expect(extension.init.mock.calls).toMatchObject([[{ count: 0 }]])
    expect(extension.send.mock.calls).toMatchObject([
      [{ type: 'INCREMENT' }, { count: 1 }],
      [{ type: 'INCREMENT' }, { count: 2 }],
      [{ type: 'DECREMENT' }, { count: 1 }],
    ])
    expect(api.getState()).toMatchObject({ count: 1 })
  })

  it('[DEV-ONLY] warns about misusage', () => {
    const originalConsoleWarn = console.warn
    console.warn = jest.fn()
    ;(api as any).dispatch({ type: '__setState' as any })
    expect(console.warn).toHaveBeenLastCalledWith(
      '[zustand devtools middleware] "__setState" action type is reserved ' +
        'to set state from the devtools. Avoid using it.'
    )

    console.warn = originalConsoleWarn
  })
})

it('works in non-browser env', () => {
  const originalWindow = global.window
  global.window = undefined as any

  expect(() => {
    create(devtools(() => ({ count: 0 }), { enabled: true }))
  }).not.toThrow()

  global.window = originalWindow
})

it('works in react native env', () => {
  const originalWindow = global.window
  global.window = {} as any

  expect(() => {
    create(devtools(() => ({ count: 0 }), { enabled: true }))
  }).not.toThrow()

  global.window = originalWindow
})

it('preserves isRecording after setting from devtools', () => {
  const api = create(devtools(() => ({ count: 0 }), { enabled: true }))
  ;(extensionSubscriber as (message: any) => void)({
    type: 'DISPATCH',
    payload: { type: 'PAUSE_RECORDING' },
  })
  ;(extensionSubscriber as (message: any) => void)({
    type: 'ACTION',
    payload: '{ "type": "__setState", "state": { "foo": "bar" } }',
  })

  api.setState({ count: 1 })
  expect(extension.send).not.toBeCalled()
})
