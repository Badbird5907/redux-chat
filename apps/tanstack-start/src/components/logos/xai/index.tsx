import type { SVGProps } from "react";

const cx = 841.89 / 2;
const cy = 595.28 / 2;
const markScale = 1.22;

const xAILogo = (props: SVGProps<SVGSVGElement>) => (
  <svg {...props} xmlSpace="preserve" fill="#fff" viewBox="0 0 841.89 595.28">
    <g
      transform={`translate(${cx} ${cy}) scale(${markScale}) translate(${-cx} ${-cy})`}
    >
      <path d="m557.09 211.99 8.31 326.37h66.56l8.32-445.18zM640.28 56.91H538.72L379.35 284.53l50.78 72.52zM201.61 538.36h101.56l50.79-72.52-50.79-72.53zM201.61 211.99l228.52 326.37h101.56L303.17 211.99z" />
    </g>
  </svg>
);

/** Same mark as xAILogo — white fill for dark UI. */
const xAILogoWhite = xAILogo;

export { xAILogo, xAILogoWhite };
