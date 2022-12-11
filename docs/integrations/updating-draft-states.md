---
title: Immer middleware
nav: 16
---

The [Immer](https://github.com/immerjs/immer) middleware enables you to use an immutable state in a more convenient
way. Also, with `Immer` you can simplify handling immutable data structures on
`Zustand`.

## Installation

In order to use the Immer middleware in `Zustand`, you will need to install `Immer` as a direct dependency.

```bash
npm install immer
```

## Usage

Updating simple states

```ts
import create from 'zustand'
import { immer } from 'zustand/middleware/immer'

type State = {
  count: number
}

type Actions = {
  increment: (qty: number) => void
  decrement: (qty: number) => void
}

export const useCountStore = create(
  immer<State & Actions>((set) => ({
    count: 0,
    increment: (qty: number) =>
      set((state) => {
        state.count += qty
      }),
    decrement: (qty: number) =>
      set((state) => {
        state.count -= qty
      }),
  }))
)
```

Updating complex states

```ts
import create from 'zustand'
import { immer } from 'zustand/middleware/immer'

interface Todo {
  id: string
  title: string
  done: boolean
}

type State = {
  todos: Record<string, Todo>
}

type Actions = {
  toggleTodo: (todoId: string) => void
}

export const useTodoStore = create(
  immer<State & Actions>((set) => ({
    todos: {
      '82471c5f-4207-4b1d-abcb-b98547e01a3e': {
        id: '82471c5f-4207-4b1d-abcb-b98547e01a3e',
        title: 'Learn Zustand',
        done: false,
      },
      '354ee16c-bfdd-44d3-afa9-e93679bda367': {
        id: '354ee16c-bfdd-44d3-afa9-e93679bda367',
        title: 'Learn Jotai',
        done: false,
      },
      '771c85c5-46ea-4a11-8fed-36cc2c7be344': {
        id: '771c85c5-46ea-4a11-8fed-36cc2c7be344',
        title: 'Learn Valtio',
        done: false,
      },
      '363a4bac-083f-47f7-a0a2-aeeee153a99c': {
        id: '363a4bac-083f-47f7-a0a2-aeeee153a99c',
        title: 'Learn Signals',
        done: false,
      },
    },
    toggleTodo: (todoId: string) =>
      set((state) => {
        state.todos[todoId].done = !state.todos[todoId].done
      }),
  }))
)
```

## Gotchas

On this page we can find some things that we need to keep in mind when we are
using `Zustand` with `Immer`.

### My subscriptions aren't being called

If you are using `Immer`, make sure you are actually following the rules of
[Immer](https://immerjs.github.io/immer/pitfalls).

For example, you have to add `[immerable] = true` for
[class objects](https://immerjs.github.io/immer/complex-objects) to work. If
you don't do this, `Immer` will still mutate the object, but not as a proxy, so
it will also update the current state. `Zustand` checks if the state has
actually changed, so since both the current state as well as the next state are
equal (if you don't do it correctly), it will skip calling the subscriptions.

## CodeSandbox Demo

- Basic: https://codesandbox.io/s/zustand-updating-draft-states-basic-demo-zkp22g
- Advanced: https://codesandbox.io/s/zustand-updating-draft-states-advanced-demo-3znqzk
