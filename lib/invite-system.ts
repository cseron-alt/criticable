import { supabase } from "@/lib/supabase/client";

export const INVITES_PER_USER = 5;

export type InviteUsage = {
  email: string;
  usedAt: string;
  username: string;
};

export type InviteRecord = {
  code: string;
  createdAt: string;
  createdByUsername: string;
  maxUses: number;
  usages: InviteUsage[];
};

type LegacyInviteRecord = {
  code?: string;
  createdAt?: string;
  createdByUsername?: string;
  status?: "pending" | "used" | "canceled";
  usedAt?: string | null;
  usedByEmail?: string | null;
};

function makeRandomChunk() {
  if (
    typeof window !== "undefined" &&
    typeof window.crypto !== "undefined" &&
    typeof window.crypto.randomUUID === "function"
  ) {
    return window.crypto.randomUUID().replace(/-/g, "").slice(0, 6).toUpperCase();
  }

  return (Math.random().toString(36).slice(2) + Date.now().toString(36))
    .slice(0, 6)
    .toUpperCase();
}

export function createInviteCode(ownerUsername: string) {
  const owner = ownerUsername
    .replace(/[^a-z0-9]/gi, "")
    .slice(0, 6)
    .toUpperCase();

  return `${owner}-${makeRandomChunk()}`;
}

function normalizeUsage(usage: unknown): InviteUsage | null {
  if (!usage || typeof usage !== "object") {
    return null;
  }

  const candidate = usage as Partial<InviteUsage>;

  if (!candidate.email || !candidate.usedAt || !candidate.username) {
    return null;
  }

  return {
    email: String(candidate.email).toLowerCase(),
    usedAt: String(candidate.usedAt),
    username: String(candidate.username),
  };
}

function mergeInviteRecord(
  existing: InviteRecord | undefined,
  incoming: InviteRecord,
): InviteRecord {
  if (!existing) {
    return incoming;
  }

  const usageMap = new Map<string, InviteUsage>();

  [...existing.usages, ...incoming.usages].forEach((usage) => {
    usageMap.set(`${usage.email}-${usage.usedAt}`, usage);
  });

  return {
    code: existing.code || incoming.code,
    createdAt:
      new Date(existing.createdAt).getTime() <= new Date(incoming.createdAt).getTime()
        ? existing.createdAt
        : incoming.createdAt,
    createdByUsername: existing.createdByUsername || incoming.createdByUsername,
    maxUses: Math.max(existing.maxUses, incoming.maxUses),
    usages: Array.from(usageMap.values()).sort((left, right) =>
      left.usedAt.localeCompare(right.usedAt),
    ),
  };
}

export function normalizeInvites(raw: unknown): InviteRecord[] {
  if (!Array.isArray(raw)) {
    return [];
  }

  const grouped = new Map<string, InviteRecord>();

  raw.forEach((item) => {
    if (!item || typeof item !== "object") {
      return;
    }

    const candidate = item as Partial<InviteRecord> & LegacyInviteRecord;
    const owner = candidate.createdByUsername?.trim();

    if (!owner) {
      return;
    }

    if (Array.isArray(candidate.usages)) {
      const normalizedRecord: InviteRecord = {
        code: candidate.code?.trim() || createInviteCode(owner),
        createdAt: candidate.createdAt || new Date().toISOString(),
        createdByUsername: owner,
        maxUses:
          typeof candidate.maxUses === "number" ? candidate.maxUses : INVITES_PER_USER,
        usages: candidate.usages
          .map((usage) => normalizeUsage(usage))
          .filter((usage): usage is InviteUsage => Boolean(usage)),
      };

      grouped.set(
        owner,
        mergeInviteRecord(grouped.get(owner), normalizedRecord),
      );
      return;
    }

    const legacyUsage =
      candidate.status === "used" && candidate.usedByEmail
        ? [
            {
              email: candidate.usedByEmail.toLowerCase(),
              usedAt: candidate.usedAt || new Date().toISOString(),
              username: candidate.usedByEmail.split("@")[0],
            },
          ]
        : [];

    const migratedRecord: InviteRecord = {
      code: candidate.code?.trim() || createInviteCode(owner),
      createdAt: candidate.createdAt || new Date().toISOString(),
      createdByUsername: owner,
      maxUses: INVITES_PER_USER,
      usages: legacyUsage,
    };

    grouped.set(owner, mergeInviteRecord(grouped.get(owner), migratedRecord));
  });

  return Array.from(grouped.values());
}

export function ensureUserInvite(
  ownerUsername: string,
  invites: InviteRecord[],
) {
  const normalizedInvites = normalizeInvites(invites);
  const existingInvite = normalizedInvites.find(
    (invite) => invite.createdByUsername === ownerUsername,
  );

  if (existingInvite) {
    return normalizedInvites;
  }

  return [
    ...normalizedInvites,
    {
      code: createInviteCode(ownerUsername),
      createdAt: new Date().toISOString(),
      createdByUsername: ownerUsername,
      maxUses: INVITES_PER_USER,
      usages: [],
    },
  ];
}

export function readInvites(storageKey: string) {
  if (typeof window === "undefined") {
    return [] as InviteRecord[];
  }

  const raw = window.localStorage.getItem(storageKey);

  if (!raw) {
    return [] as InviteRecord[];
  }

  try {
    return normalizeInvites(JSON.parse(raw));
  } catch {
    return [];
  }
}

export function writeInvites(storageKey: string, invites: InviteRecord[]) {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.setItem(
    storageKey,
    JSON.stringify(normalizeInvites(invites)),
  );
}

export function findInviteByCode(code: string, invites: InviteRecord[]) {
  const normalizedCode = code.trim().toUpperCase();

  return invites.find((invite) => invite.code.toUpperCase() === normalizedCode);
}

type InviteRow = {
  code: string;
  created_at: string;
  created_by_user_id: string;
  id: string;
  max_uses: number;
};

type InviteUsageRow = {
  invite_id: string;
  used_at: string;
  used_email: string;
  used_username: string;
};

type ProfileLookupRow = {
  id: string;
  username: string;
};

export async function syncInvitesFromSupabase(storageKey: string) {
  const [{ data: invitesData, error: invitesError }, { data: usagesData }, { data: profilesData }] =
    await Promise.all([
      supabase
        .from("invites")
        .select("id, code, created_by_user_id, max_uses, created_at")
        .order("created_at", { ascending: true }),
      supabase.from("invite_usages").select("invite_id, used_email, used_username, used_at"),
      supabase.from("profiles").select("id, username"),
    ]);

  if (invitesError) {
    return readInvites(storageKey);
  }

  const usernamesById = new Map(
    ((profilesData ?? []) as ProfileLookupRow[]).map((profile) => [profile.id, profile.username]),
  );
  const usagesByInviteId = new Map<string, InviteUsage[]>();

  ((usagesData ?? []) as InviteUsageRow[]).forEach((usage) => {
    const current = usagesByInviteId.get(usage.invite_id) ?? [];
    current.push({
      email: usage.used_email.toLowerCase(),
      usedAt: usage.used_at,
      username: usage.used_username,
    });
    usagesByInviteId.set(usage.invite_id, current);
  });

  const normalized = ((invitesData ?? []) as InviteRow[]).map((invite) => ({
    code: invite.code,
    createdAt: invite.created_at,
    createdByUsername:
      usernamesById.get(invite.created_by_user_id) ?? invite.created_by_user_id.slice(0, 8),
    maxUses: invite.max_uses,
    usages: (usagesByInviteId.get(invite.id) ?? []).sort((left, right) =>
      left.usedAt.localeCompare(right.usedAt),
    ),
  }));

  writeInvites(storageKey, normalized);
  return normalized;
}

export async function ensureUserInviteInSupabase(ownerUserId: string, ownerUsername: string) {
  const { data: existing } = await supabase
    .from("invites")
    .select("id")
    .eq("created_by_user_id", ownerUserId)
    .limit(1)
    .maybeSingle();

  if (existing) {
    return;
  }

  const { error } = await supabase.from("invites").insert({
    code: createInviteCode(ownerUsername),
    created_by_user_id: ownerUserId,
    max_uses: INVITES_PER_USER,
  });

  if (error && !error.message.toLowerCase().includes("duplicate")) {
    throw new Error(error.message);
  }
}
