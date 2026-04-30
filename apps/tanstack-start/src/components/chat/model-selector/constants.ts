import type { Transition } from "motion/react";

export const panelSpring: Transition = {
  type: "spring",
  stiffness: 420,
  damping: 34,
  mass: 0.85,
};

export const sidebarAsideVariants = {
  open: {
    width: "3.5rem",
    opacity: 1,
    transition: {
      width: panelSpring,
      opacity: { duration: 0.22 },
      staggerChildren: 0.055,
      delayChildren: 0.07,
    },
  },
  closed: {
    width: 0,
    opacity: 0,
    transition: {
      width: panelSpring,
      opacity: { duration: 0.16 },
      staggerChildren: 0.03,
      staggerDirection: -1 as const,
    },
  },
};

export const sidebarRailItemVariants = {
  open: {
    opacity: 1,
    scale: 1,
    x: 0,
    transition: panelSpring,
  },
  closed: {
    opacity: 0,
    scale: 0.88,
    x: -12,
    transition: { duration: 0.16 },
  },
};
