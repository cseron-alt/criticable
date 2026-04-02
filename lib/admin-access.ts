import { ADMIN_EMAIL, ADMIN_USERNAME } from "@/lib/report-inbox";

type IdentityLike = {
  email?: string | null;
  isAdmin?: boolean | null;
  username?: string | null;
};

function normalize(value?: string | null) {
  return String(value || "")
    .trim()
    .toLowerCase();
}

export function isAdminIdentity(identity?: IdentityLike | null) {
  const email = normalize(identity?.email);
  const username = normalize(identity?.username);

  return email === normalize(ADMIN_EMAIL) || username === normalize(ADMIN_USERNAME);
}

export function canAccessAdmin(identity?: IdentityLike | null) {
  return isAdminIdentity(identity);
}

export function isReservedAdminIdentity(input: {
  email?: string | null;
  username?: string | null;
}) {
  return isAdminIdentity(input);
}
