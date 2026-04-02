import { supabase } from "@/lib/supabase/client";

export const USERS_STORAGE_KEY = "criticable-users-v1";
export const ACTIVE_USER_STORAGE_KEY = "criticable-active-user-v1";

export type StoredUser = {
  bannedAt?: string | null;
  banReason?: string | null;
  createdAt: string;
  email: string;
  id?: string;
  inviteCode: string;
  passwordHash: string;
  username: string;
};

export type ActiveUser = {
  email: string;
  id?: string;
  isAdmin?: boolean;
  username: string;
};

type ProfileRow = {
  ban_reason: string | null;
  created_at: string;
  email: string;
  id: string;
  invite_code_used: string | null;
  is_admin: boolean;
  is_banned: boolean;
  username: string;
};

function normalizeUsernameSeed(value?: string | null) {
  const base = String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]/g, "")
    .slice(0, 24);

  if (base.length >= 3) {
    return base;
  }

  return `${base}usr`.slice(0, 3);
}

async function createAvailableUsername(seed: string) {
  const base = normalizeUsernameSeed(seed);
  let candidate = base;
  let attempt = 0;

  while (attempt < 12) {
    const { data } = await supabase
      .from("profiles")
      .select("id")
      .eq("username", candidate)
      .maybeSingle();

    if (!data) {
      return candidate;
    }

    attempt += 1;
    const suffix = `${Math.floor(Math.random() * 900) + 100}`;
    candidate = `${base.slice(0, Math.max(3, 24 - suffix.length))}${suffix}`;
  }

  return `${base.slice(0, 18)}${Date.now().toString().slice(-6)}`;
}

export function readUsers() {
  if (typeof window === "undefined") {
    return [] as StoredUser[];
  }

  const raw = window.localStorage.getItem(USERS_STORAGE_KEY);

  if (!raw) {
    return [] as StoredUser[];
  }

  try {
    const parsed = JSON.parse(raw) as Array<Partial<StoredUser>>;

    return parsed.map((user) => ({
      bannedAt: user.bannedAt ?? null,
      banReason: user.banReason ?? null,
      createdAt: String(user.createdAt || new Date().toISOString()),
      email: String(user.email || "").toLowerCase(),
      id: user.id ? String(user.id) : undefined,
      inviteCode: String(user.inviteCode || ""),
      passwordHash: String(user.passwordHash || ""),
      username: String(user.username || ""),
    }));
  } catch {
    return [];
  }
}

export function writeUsers(users: StoredUser[]) {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.setItem(USERS_STORAGE_KEY, JSON.stringify(users));
}

export function readActiveUser() {
  if (typeof window === "undefined") {
    return null;
  }

  const raw = window.localStorage.getItem(ACTIVE_USER_STORAGE_KEY);

  if (!raw) {
    return null;
  }

  try {
    const parsed = JSON.parse(raw) as Partial<ActiveUser>;

    return {
      email: String(parsed.email || "").toLowerCase(),
      id: parsed.id ? String(parsed.id) : undefined,
      isAdmin: Boolean(parsed.isAdmin),
      username: String(parsed.username || ""),
    } satisfies ActiveUser;
  } catch {
    return null;
  }
}

export function clearActiveUser() {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.removeItem(ACTIVE_USER_STORAGE_KEY);
}

export function activateUser(
  user: Pick<StoredUser, "email" | "id" | "username"> & { isAdmin?: boolean },
) {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.setItem(
    ACTIVE_USER_STORAGE_KEY,
    JSON.stringify({
      email: user.email,
      id: user.id,
      isAdmin: Boolean(user.isAdmin),
      username: user.username,
    } satisfies ActiveUser),
  );
}

export function findStoredUser(identity: string, users: StoredUser[]) {
  const normalized = identity.trim().toLowerCase();

  return users.find(
    (entry) =>
      entry.email.toLowerCase() === normalized ||
      entry.username.toLowerCase() === normalized,
  );
}

export function isUserBanned(user?: Pick<StoredUser, "bannedAt"> | null) {
  return Boolean(user?.bannedAt);
}

function profileRowToStoredUser(profile: ProfileRow): StoredUser {
  return {
    bannedAt: profile.is_banned ? profile.created_at : null,
    banReason: profile.ban_reason,
    createdAt: profile.created_at,
    email: profile.email.toLowerCase(),
    id: profile.id,
    inviteCode: profile.invite_code_used ?? "",
    passwordHash: "",
    username: profile.username,
  };
}

export async function syncUsersFromSupabase() {
  const { data, error } = await supabase
    .from("profiles")
    .select(
      "id, email, username, invite_code_used, is_admin, is_banned, ban_reason, created_at",
    )
    .order("created_at", { ascending: false });

  if (error) {
    return readUsers();
  }

  const nextUsers = ((data ?? []) as ProfileRow[]).map(profileRowToStoredUser);
  writeUsers(nextUsers);
  return nextUsers;
}

export async function syncActiveUserFromSupabase() {
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    clearActiveUser();
    return null;
  }

  const { data, error } = await supabase
    .from("profiles")
    .select(
      "id, email, username, invite_code_used, is_admin, is_banned, ban_reason, created_at",
    )
    .eq("id", user.id)
    .maybeSingle();

  if (error || !data) {
    const fallbackUser = {
      email: user.email ?? "",
      id: user.id,
      isAdmin: false,
      username: String(user.user_metadata?.username || user.email?.split("@")[0] || ""),
    } satisfies ActiveUser;

    activateUser(fallbackUser);
    return fallbackUser;
  }

  const activeUser = {
    email: data.email,
    id: data.id,
    isAdmin: data.is_admin,
    username: data.username,
  } satisfies ActiveUser;

  activateUser(activeUser);
  return activeUser;
}

export async function ensureProfileForAuthUser(params: {
  email?: string | null;
  id: string;
  usernameHint?: string | null;
}) {
  const email = String(params.email || "").trim().toLowerCase();

  if (!email) {
    return null;
  }

  const { data: existingProfile } = await supabase
    .from("profiles")
    .select(
      "id, email, username, invite_code_used, is_admin, is_banned, ban_reason, created_at",
    )
    .eq("id", params.id)
    .maybeSingle();

  if (existingProfile) {
    return profileRowToStoredUser(existingProfile as ProfileRow);
  }

  const username = await createAvailableUsername(
    params.usernameHint || email.split("@")[0] || "usuario",
  );
  const createdAt = new Date().toISOString();

  const { error: insertProfileError } = await supabase.from("profiles").upsert(
    {
      email,
      id: params.id,
      invite_code_used: "",
      username,
    },
    {
      onConflict: "id",
    },
  );

  if (insertProfileError) {
    throw new Error(insertProfileError.message);
  }

  await supabase.from("user_settings").upsert({
    age_confirmed: true,
    exposure_consent_accepted: true,
    first_entry_pending: false,
    onboarding_completed: false,
    terms_accepted_at: createdAt,
    user_id: params.id,
  });

  const createdProfile: StoredUser = {
    createdAt,
    email,
    id: params.id,
    inviteCode: "",
    passwordHash: "",
    username,
  };

  return createdProfile;
}

export async function signOutFromSupabase() {
  await supabase.auth.signOut();
  clearActiveUser();
}
