import type { Dispatch, SetStateAction } from "react";
import { useReducer } from "react";

function reducerStateReducer<S>(state: S, action: SetStateAction<S>): S {
  return typeof action === "function"
    ? (action as (previous: S) => S)(state)
    : action;
}

export function useReducerState<S>(
  initialState: S | (() => S),
): [S, Dispatch<SetStateAction<S>>] {
  return useReducer(reducerStateReducer<S>, undefined as S, () =>
    typeof initialState === "function"
      ? (initialState as () => S)()
      : initialState,
  );
}
