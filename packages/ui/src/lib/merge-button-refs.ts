import * as React from "react";

export function mergeButtonRefs(
  refs: Array<
    | React.MutableRefObject<HTMLButtonElement | null>
    | React.LegacyRef<HTMLButtonElement>
    | undefined
    | null
  >,
) {
  return (value: HTMLButtonElement | null) => {
    refs.forEach((ref) => {
      if (typeof ref === "function") {
        ref(value);
      } else if (ref != null) {
        (ref as React.MutableRefObject<HTMLButtonElement | null>).current =
          value;
      }
    });
  };
}
