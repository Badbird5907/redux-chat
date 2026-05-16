import type { SVGProps } from "react";

type BrainSvgProps = SVGProps<SVGSVGElement>;

const baseProps: BrainSvgProps = {
  xmlns: "http://www.w3.org/2000/svg",
  width: 24,
  height: 24,
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 2,
  strokeLinecap: "round",
  strokeLinejoin: "round",
};

const BrainOutline = () => (
  <>
    <path d="M17.598 6.5A3 3 0 1 0 12 5a3 3 0 1 0-5.598 1.5" />
    <path d="M17.997 5.125a4 4 0 0 1 2.526 5.77" />
    <path d="M18 18a4 4 0 0 0 2-7.464" />
    <path d="M19.967 17.483A4 4 0 1 1 12 18a4 4 0 1 1-7.967-.517" />
    <path d="M6 18a4 4 0 0 1-2-7.464" />
    <path d="M6.003 5.125a4 4 0 0 0-2.526 5.77" />
  </>
);

export const BrainLowIcon = (props: BrainSvgProps) => (
  <svg {...baseProps} {...props}>
    <path d="M12 18V5" />
    <BrainOutline />
  </svg>
);

export const BrainMediumIcon = (props: BrainSvgProps) => (
  <svg {...baseProps} {...props}>
    <path d="M12 18V5" />
    <path d="M15 13a4.17 4.17 0 0 1-3-4 4.17 4.17 0 0 1-3 4" />
    <BrainOutline />
  </svg>
);

export const BrainHighIcon = (props: BrainSvgProps) => (
  <svg {...baseProps} {...props}>
    <path d="M12,17.572l0,-13" fill="none" stroke="currentColor" strokeWidth={2} />
    <path d="M17.029,13.023c-2.035,0.482 -5.028,-2.605 -5.029,-4.452c-0.001,1.846 -2.988,4.973 -5.005,4.391" fill="none" stroke="currentColor" strokeWidth={2} />
    <path d="M15.971,7.582c2.012,-0.598 2.029,-2.484 2.029,-3.01c0,-1.646 -1.354,-3 -3,-3c-1.646,0 -3,1.354 -3,3c0,0 0,0 0,0c0,-0 0,-0 0,-0c0,-1.646 -1.354,-3 -3,-3c-1.646,0 -3,1.354 -3,3c0,0.527 -0.003,2.433 1.989,3.01" fill="none" stroke="currentColor" strokeWidth={2} />
    <path d="M17.997,4.697c1.762,0.453 3.004,2.054 3.004,3.874c0,0.662 -0.164,1.313 -0.478,1.896" fill="none" stroke="currentColor" strokeWidth={2} />
    <path d="M17.029,16.539c1.972,0.96 4.971,-0.773 4.971,-2.968c0,-1.427 -0.958,-3.888 -4.003,-3.631" fill="none" stroke="currentColor" strokeWidth={2} />
    <path d="M19.967,17.055c0.022,0.17 0.033,0.341 0.033,0.513c0,2.194 -1.806,4 -4,4c-2.193,0 -3.998,-1.803 -4,-3.996c-0.002,2.193 -1.807,3.996 -4,3.996c-2.194,0 -4,-1.806 -4,-4c0,-0.171 0.011,-0.343 0.033,-0.513" fill="none" stroke="currentColor" strokeWidth={2} />
    <path d="M6.995,16.539c-1.942,0.94 -4.995,-0.773 -4.995,-2.968c0,-1.4 0.951,-3.982 3.831,-3.592" fill="none" stroke="currentColor" strokeWidth={2} />
    <path d="M6.003,4.697c-1.762,0.453 -3.004,2.054 -3.004,3.874c0,0.662 0.164,1.313 0.478,1.896" fill="none" stroke="currentColor" strokeWidth={2} />
  </svg>
);
