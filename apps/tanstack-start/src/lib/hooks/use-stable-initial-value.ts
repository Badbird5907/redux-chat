import { useRef } from "react";

const unset = Symbol("unset");

export function useStableInitialValue<T>(createValue: () => T): T {
  const valueRef = useRef<T | typeof unset>(unset);
  if (valueRef.current === unset) {
    valueRef.current = createValue();
  }
  return valueRef.current;
}
