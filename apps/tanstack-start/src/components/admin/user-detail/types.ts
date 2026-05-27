export type ActiveDialog =
  | "password"
  | "profile"
  | "impersonate"
  | "ban"
  | "unban"
  | "delete"
  | null;

export type DialogBaseProps = {
  open: boolean;
  onClose: () => void;
  userId: string;
  displayName: string;
};

/** Minimal shape consumed by admin user detail UI (matches better-auth admin getUser payload). */
export type AdminUserDetail = {
  id: string;
  name?: string | null;
  email: string;
  emailVerified: boolean;
  createdAt: Date | string | number;
  updatedAt: Date | string | number;
  image?: string | null;
  banned: boolean;
  banReason?: string | null;
  banExpires?: Date | string | number | null;
  role?: string | null;
};
