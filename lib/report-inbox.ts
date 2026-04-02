import { supabase } from "@/lib/supabase/client";

export const REPORTS_STORAGE_KEY = "criticable-reports-v1";
export const ADMIN_EMAIL = "bok-car@hotmail.com";
export const ADMIN_USERNAME = "carloscriticable";

export type ReportKind = "general" | "image";
export type ReportStatus = "new" | "read";
export type MessageDirection = "to_admin" | "to_user";

export type InboxMessage = {
  body: string;
  createdAt: string;
  direction: MessageDirection;
  fromEmail: string;
  fromUsername: string;
  id: string;
  kind: ReportKind;
  replyToId?: string;
  sourceLabel: string;
  sourceSubject?: string;
  status: ReportStatus;
  subject: string;
  threadId: string;
  toEmail: string;
  toUsername: string;
};

function createMessageId() {
  if (
    typeof window !== "undefined" &&
    typeof window.crypto !== "undefined" &&
    typeof window.crypto.randomUUID === "function"
  ) {
    return window.crypto.randomUUID();
  }

  return `report-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export function normalizeInbox(raw: unknown): InboxMessage[] {
  if (!Array.isArray(raw)) {
    return [];
  }

  const normalized: Array<InboxMessage | null> = raw
    .map((item) => {
      if (!item || typeof item !== "object") {
        return null;
      }

      const candidate = item as Partial<InboxMessage>;

      if (
        !candidate.body ||
        !candidate.createdAt ||
        !candidate.fromEmail ||
        !candidate.fromUsername ||
        !candidate.subject
      ) {
        return null;
      }

      const fromEmail = String(candidate.fromEmail).toLowerCase();
      const toEmail = String(
        candidate.toEmail ||
          (fromEmail === ADMIN_EMAIL ? candidate.sourceSubject || "" : ADMIN_EMAIL),
      ).toLowerCase();
      const toUsername = String(
        candidate.toUsername ||
          (fromEmail === ADMIN_EMAIL ? "usuario" : ADMIN_USERNAME),
      );
      const threadId = String(candidate.threadId || candidate.id || createMessageId());

      return {
        body: String(candidate.body),
        createdAt: String(candidate.createdAt),
        direction:
          candidate.direction === "to_user" || fromEmail === ADMIN_EMAIL
            ? "to_user"
            : "to_admin",
        fromEmail,
        fromUsername: String(candidate.fromUsername),
        id: String(candidate.id || createMessageId()),
        kind: candidate.kind === "image" ? "image" : "general",
        replyToId:
          typeof candidate.replyToId === "string" ? candidate.replyToId : undefined,
        sourceLabel: String(candidate.sourceLabel || "Formulario"),
        sourceSubject:
          typeof candidate.sourceSubject === "string"
            ? candidate.sourceSubject
            : undefined,
        status: candidate.status === "read" ? "read" : "new",
        subject: String(candidate.subject),
        threadId,
        toEmail,
        toUsername,
      } satisfies InboxMessage;
    })
    .filter((item) => item !== null);

  return (normalized as InboxMessage[]).sort((left, right) =>
    right.createdAt.localeCompare(left.createdAt),
  );
}

export function readInbox(storageKey = REPORTS_STORAGE_KEY) {
  if (typeof window === "undefined") {
    return [] as InboxMessage[];
  }

  const raw = window.localStorage.getItem(storageKey);

  if (!raw) {
    return [] as InboxMessage[];
  }

  try {
    return normalizeInbox(JSON.parse(raw));
  } catch {
    return [];
  }
}

export function writeInbox(messages: InboxMessage[], storageKey = REPORTS_STORAGE_KEY) {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.setItem(storageKey, JSON.stringify(normalizeInbox(messages)));
}

export function createInboxMessage(
  input: Omit<InboxMessage, "createdAt" | "id" | "status">,
): InboxMessage {
  return {
    ...input,
    createdAt: new Date().toISOString(),
    id: createMessageId(),
    status: "new",
  };
}

type InternalMessageRow = {
  body: string;
  created_at: string;
  direction: MessageDirection;
  from_user_id: string | null;
  id: string;
  kind: ReportKind;
  source_label: string;
  source_subject: string | null;
  status: ReportStatus;
  subject: string;
  thread_id: string;
  to_user_id: string | null;
};

type ProfileLookupRow = {
  email: string;
  id: string;
  username: string;
};

export async function findAdminProfile() {
  const { data } = await supabase
    .from("profiles")
    .select("id, email, username, is_admin")
    .eq("email", ADMIN_EMAIL)
    .maybeSingle();

  return data as
    | { email: string; id: string; is_admin: boolean; username: string }
    | null;
}

export async function syncInboxFromSupabase(params: {
  isAdmin?: boolean;
  viewerUserId?: string;
}) {
  if (!params.viewerUserId) {
    return readInbox();
  }

  const query = supabase
    .from("internal_messages")
    .select(
      "id, thread_id, kind, direction, from_user_id, to_user_id, subject, body, source_label, source_subject, status, created_at",
    )
    .order("created_at", { ascending: false });

  const { data: messageRows, error: messageError } = params.isAdmin
    ? await query
    : await query.or(
        `from_user_id.eq.${params.viewerUserId},to_user_id.eq.${params.viewerUserId}`,
      );

  const { data: profilesData, error: profilesError } = await supabase
    .from("profiles")
    .select("id, email, username");

  if (messageError || profilesError) {
    return readInbox();
  }

  const profilesById = new Map(
    ((profilesData ?? []) as ProfileLookupRow[]).map((profile) => [profile.id, profile]),
  );

  const nextInbox = ((messageRows ?? []) as InternalMessageRow[]).map((message) => {
    const fromProfile = message.from_user_id ? profilesById.get(message.from_user_id) : null;
    const toProfile = message.to_user_id ? profilesById.get(message.to_user_id) : null;

    return {
      body: message.body,
      createdAt: message.created_at,
      direction: message.direction,
      fromEmail: fromProfile?.email?.toLowerCase() ?? ADMIN_EMAIL,
      fromUsername: fromProfile?.username ?? ADMIN_USERNAME,
      id: message.id,
      kind: message.kind,
      sourceLabel: message.source_label,
      sourceSubject: message.source_subject ?? undefined,
      status: message.status,
      subject: message.subject,
      threadId: message.thread_id,
      toEmail: toProfile?.email?.toLowerCase() ?? ADMIN_EMAIL,
      toUsername: toProfile?.username ?? ADMIN_USERNAME,
    } satisfies InboxMessage;
  });

  writeInbox(nextInbox);
  return nextInbox;
}

export async function sendInboxMessageToSupabase(params: {
  body: string;
  direction: MessageDirection;
  fromUserId: string;
  kind: ReportKind;
  sourceLabel: string;
  sourceSubject?: string;
  status?: ReportStatus;
  subject: string;
  threadId: string;
  toUserId?: string | null;
}) {
  const { error } = await supabase.from("internal_messages").insert({
    body: params.body,
    direction: params.direction,
    from_user_id: params.fromUserId,
    kind: params.kind,
    source_label: params.sourceLabel,
    source_subject: params.sourceSubject ?? null,
    status: params.status ?? "new",
    subject: params.subject,
    thread_id: params.threadId,
    to_user_id: params.toUserId ?? null,
  });

  if (error) {
    throw new Error(error.message);
  }
}

export async function updateUserBanInSupabase(params: {
  banReason?: string | null;
  email: string;
  isBanned: boolean;
}) {
  const { error } = await supabase
    .from("profiles")
    .update({
      ban_reason: params.isBanned
        ? params.banReason ?? "Ban desde panel de administración"
        : null,
      is_banned: params.isBanned,
    })
    .eq("email", params.email.toLowerCase());

  if (error) {
    throw new Error(error.message);
  }
}
