import type * as React from "react";
import { useId } from "react";

const McpLogo = (props: React.SVGProps<SVGSVGElement>) => {
  const clipPathId = useId().replace(/:/g, "");

  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 180 180"
      fill="none"
      {...props}
    >
      <g
        stroke="currentColor"
        strokeLinecap="round"
        strokeWidth={12}
        clipPath={`url(#${clipPathId})`}
      >
        <path d="M18 84.853 85.882 16.97c9.373-9.373 24.569-9.373 33.941 0v0c9.373 9.372 9.373 24.568 0 33.94l-51.265 51.266M69.265 101.47l50.558-50.558c9.373-9.373 24.569-9.373 33.942 0l.353.353c9.373 9.373 9.373 24.569 0 33.941L92.725 146.6a8 8 0 0 0 0 11.313l12.606 12.607" />
        <path d="M102.853 33.941 52.648 84.146c-9.372 9.372-9.372 24.568 0 33.941v0c9.373 9.372 24.569 9.372 33.941 0l50.205-50.205" />
      </g>
      <defs>
        <clipPath id={clipPathId}>
          <path fill="#fff" d="M0 0h180v180H0z" />
        </clipPath>
      </defs>
    </svg>
  );
};

export default McpLogo;
