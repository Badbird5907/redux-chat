import { useState } from "react";

export function useStableInitialValue<T>(createValue: () => T): T {
  const [value] = useState(createValue);
  return value;
}
