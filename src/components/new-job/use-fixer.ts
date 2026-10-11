import { useCallback, useReducer } from 'react'

export type Fixable =
  'client' | 'title' | 'price' | 'deposit' | 'date' | 'stage'

type State = { fixing: Fixable | null; byError: boolean }

type Action =
  | { type: 'open'; field: Fixable }
  | { type: 'openAfterError' }
  | { type: 'close' }
  | { type: 'closeIfOpenedByError' }

function reduce(state: State, action: Action): State {
  switch (action.type) {
    // Any open by hand clears the error flag, whatever was open before.
    case 'open':
      return { fixing: action.field, byError: false }
    case 'openAfterError':
      return { fixing: 'title', byError: true }
    case 'close':
      return { fixing: null, byError: false }
    case 'closeIfOpenedByError':
      return state.fixing === 'title' && state.byError
        ? { fixing: null, byError: false }
        : state
  }
}

/**
 * Which field of the "+" line is being fixed by hand. The title's box can be
 * opened by a failed save instead of a tap on "Fix": that is remembered only
 * while the box stays open, so closing it by any path forgets it.
 */
export function useFixer() {
  const [state, dispatch] = useReducer(reduce, {
    fixing: null,
    byError: false,
  })
  return {
    fixing: state.fixing,
    titleOpenedByError: state.fixing === 'title' && state.byError,
    open: useCallback(
      (field: Fixable) => dispatch({ type: 'open', field }),
      [],
    ),
    openAfterError: useCallback(() => dispatch({ type: 'openAfterError' }), []),
    close: useCallback(() => dispatch({ type: 'close' }), []),
    closeIfOpenedByError: useCallback(
      () => dispatch({ type: 'closeIfOpenedByError' }),
      [],
    ),
  }
}
