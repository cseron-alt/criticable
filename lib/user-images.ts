import { supabase } from "@/lib/supabase/client";

export const USER_IMAGES_STORAGE_KEY = "criticable-user-images-v1";
const PHOTOS_BUCKET = "photos";

export type StoredImageEntry = {
  instanceId: string;
  photoId?: string;
  src: string;
  storagePath?: string;
  updatedAt: string;
};

export type UserImagesRecord = Record<string, StoredImageEntry>;

type PhotoRow = {
  created_at: string;
  id: string;
  image_version: number;
  slot_id: string;
  storage_path: string;
  updated_at: string;
  user_id: string;
};

type ProfileLookupRow = {
  id: string;
  username: string;
};

function createImageInstanceId() {
  if (
    typeof window !== "undefined" &&
    typeof window.crypto !== "undefined" &&
    typeof window.crypto.randomUUID === "function"
  ) {
    return window.crypto.randomUUID();
  }

  return `img-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function normalizeEntry(value: unknown): StoredImageEntry | null {
  if (!value) {
    return null;
  }

  if (typeof value === "string") {
    return {
      instanceId: createImageInstanceId(),
      src: value,
      updatedAt: new Date().toISOString(),
    };
  }

  if (typeof value !== "object") {
    return null;
  }

  const candidate = value as Partial<StoredImageEntry>;

  if (!candidate.src) {
    return null;
  }

  return {
    instanceId: candidate.instanceId || createImageInstanceId(),
    photoId: candidate.photoId,
    src: String(candidate.src),
    storagePath: candidate.storagePath,
    updatedAt: candidate.updatedAt || new Date().toISOString(),
  };
}

function normalizeUserImages(raw: unknown) {
  if (!raw || typeof raw !== "object") {
    return {} as UserImagesRecord;
  }

  return Object.fromEntries(
    Object.entries(raw).flatMap(([slotId, value]) => {
      const normalized = normalizeEntry(value);

      return normalized ? [[slotId, normalized]] : [];
    }),
  ) as UserImagesRecord;
}

export function readAllUserImages(storageKey = USER_IMAGES_STORAGE_KEY) {
  if (typeof window === "undefined") {
    return {} as Record<string, UserImagesRecord>;
  }

  const raw = window.localStorage.getItem(storageKey);

  if (!raw) {
    return {} as Record<string, UserImagesRecord>;
  }

  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;

    return Object.fromEntries(
      Object.entries(parsed).map(([username, images]) => [
        username,
        normalizeUserImages(images),
      ]),
    ) as Record<string, UserImagesRecord>;
  } catch {
    return {};
  }
}

export function readUserImages(username: string, storageKey = USER_IMAGES_STORAGE_KEY) {
  const allImages = readAllUserImages(storageKey);

  return allImages[username] ?? ({} as UserImagesRecord);
}

export function writeUserImages(
  username: string,
  images: UserImagesRecord,
  storageKey = USER_IMAGES_STORAGE_KEY,
) {
  if (typeof window === "undefined") {
    return;
  }

  const allImages = readAllUserImages(storageKey);

  allImages[username] = normalizeUserImages(images);
  window.localStorage.setItem(storageKey, JSON.stringify(allImages));
}

export function createStoredImageEntry(src: string): StoredImageEntry {
  return {
    instanceId: createImageInstanceId(),
    src,
    updatedAt: new Date().toISOString(),
  };
}

export function getImageInstanceId(
  username: string,
  slotId: string,
  entry?: StoredImageEntry | null,
) {
  return entry?.instanceId ?? `seed-${username}-${slotId}`;
}

function dataUrlToBlob(dataUrl: string) {
  const [header, content] = dataUrl.split(",");
  const mimeMatch = header.match(/data:(.*?);base64/);
  const mime = mimeMatch?.[1] || "image/webp";
  const bytes = atob(content);
  const array = new Uint8Array(bytes.length);

  for (let index = 0; index < bytes.length; index += 1) {
    array[index] = bytes.charCodeAt(index);
  }

  return new Blob([array], { type: mime });
}

export async function uploadUserImageToSupabase(params: {
  dataUrl: string;
  slotId: string;
  userId: string;
  username: string;
}) {
  const timestamp = Date.now();
  const storagePath = `${params.userId}/${params.slotId}/${timestamp}.webp`;
  const fileBlob = dataUrlToBlob(params.dataUrl);

  const { error: uploadError } = await supabase.storage
    .from(PHOTOS_BUCKET)
    .upload(storagePath, fileBlob, {
      cacheControl: "3600",
      contentType: "image/webp",
      upsert: true,
    });

  if (uploadError) {
    throw new Error(uploadError.message);
  }

  const { data: existingRows } = await supabase
    .from("photos")
    .select("id, image_version, storage_path")
    .eq("user_id", params.userId)
    .eq("slot_id", params.slotId)
    .eq("is_active", true);

  const previousRow = (existingRows ?? [])[0] as
    | { id: string; image_version: number; storage_path: string }
    | undefined;
  const nextVersion = (previousRow?.image_version ?? 0) + 1;

  if (previousRow) {
    await supabase
      .from("photos")
      .update({ is_active: false, updated_at: new Date().toISOString() })
      .eq("id", previousRow.id);
  }

  const { data: insertedRows, error: insertError } = await supabase
    .from("photos")
    .insert({
      image_version: nextVersion,
      is_active: true,
      slot_id: params.slotId,
      storage_path: storagePath,
      user_id: params.userId,
    })
    .select("id, image_version, slot_id, storage_path, updated_at")
    .limit(1);

  if (insertError) {
    throw new Error(insertError.message);
  }

  const publicUrl = supabase.storage.from(PHOTOS_BUCKET).getPublicUrl(storagePath).data
    .publicUrl;
  const inserted = (insertedRows ?? [])[0] as
    | Pick<PhotoRow, "id" | "image_version" | "slot_id" | "storage_path" | "updated_at">
    | undefined;

  return {
    entry: {
      instanceId: `${params.userId}-${params.slotId}-v${inserted?.image_version ?? nextVersion}`,
      photoId: inserted?.id,
      src: publicUrl,
      storagePath,
      updatedAt: inserted?.updated_at ?? new Date().toISOString(),
    } satisfies StoredImageEntry,
  };
}

export async function syncUserImagesFromSupabase(params: {
  userId: string;
  username: string;
}) {
  const { data, error } = await supabase
    .from("photos")
    .select("id, slot_id, storage_path, image_version, created_at, updated_at")
    .eq("user_id", params.userId)
    .eq("is_active", true);

  if (error) {
    return readUserImages(params.username);
  }

  const nextImages = ((data ?? []) as PhotoRow[]).reduce<UserImagesRecord>((acc, photo) => {
    const publicUrl = supabase.storage.from(PHOTOS_BUCKET).getPublicUrl(photo.storage_path).data
      .publicUrl;

    acc[photo.slot_id] = {
      instanceId: `${params.userId}-${photo.slot_id}-v${photo.image_version}`,
      photoId: photo.id,
      src: publicUrl,
      storagePath: photo.storage_path,
      updatedAt: photo.updated_at || photo.created_at,
    };

    return acc;
  }, {});

  writeUserImages(params.username, nextImages);
  return nextImages;
}

export async function syncAllUserImagesFromSupabase() {
  const [{ data: photosData, error: photosError }, { data: profilesData, error: profilesError }] =
    await Promise.all([
      supabase
        .from("photos")
        .select("id, user_id, slot_id, storage_path, image_version, created_at, updated_at")
        .eq("is_active", true),
      supabase.from("profiles").select("id, username"),
    ]);

  if (photosError || profilesError) {
    return readAllUserImages();
  }

  const usernamesById = new Map(
    ((profilesData ?? []) as ProfileLookupRow[]).map((profile) => [profile.id, profile.username]),
  );

  const nextAllImages = ((photosData ?? []) as PhotoRow[]).reduce<Record<string, UserImagesRecord>>(
    (acc, photo) => {
      const username = usernamesById.get(photo.user_id);

      if (!username) {
        return acc;
      }

      const publicUrl = supabase.storage.from(PHOTOS_BUCKET).getPublicUrl(photo.storage_path).data
        .publicUrl;

      acc[username] ??= {};
      acc[username][photo.slot_id] = {
        instanceId: `${photo.user_id}-${photo.slot_id}-v${photo.image_version}`,
        photoId: photo.id,
        src: publicUrl,
        storagePath: photo.storage_path,
        updatedAt: photo.updated_at || photo.created_at,
      };

      return acc;
    },
    {},
  );

  if (typeof window !== "undefined") {
    window.localStorage.setItem(USER_IMAGES_STORAGE_KEY, JSON.stringify(nextAllImages));
  }

  return nextAllImages;
}
