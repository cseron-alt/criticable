import { getAnswerRecordBase, type PerceptionAnswerRecord } from "@/lib/perception-engine";
import { supabase } from "@/lib/supabase/client";

export const VOTES_STORAGE_KEY = "criticable-votes-v1";

type VoteRow = {
  answer_value: number;
  created_at: string;
  evaluator_user_id: string;
  group_id: string;
  question_id: string;
  response_time_ms: number;
  stat_key: string;
  target_photo_id: string;
  target_user_id: string;
};

type PhotoLookupRow = {
  id: string;
  image_version: number;
  slot_id: string;
  user_id: string;
};

type ProfileLookupRow = {
  id: string;
  username: string;
};

export function readVotes() {
  if (typeof window === "undefined") {
    return [] as PerceptionAnswerRecord[];
  }

  const raw = window.localStorage.getItem(VOTES_STORAGE_KEY);

  if (!raw) {
    return [] as PerceptionAnswerRecord[];
  }

  try {
    return JSON.parse(raw) as PerceptionAnswerRecord[];
  } catch {
    return [];
  }
}

export function writeVotes(votes: PerceptionAnswerRecord[]) {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.setItem(VOTES_STORAGE_KEY, JSON.stringify(votes));
}

export async function syncVotesFromSupabase() {
  const [
    { data: votesData, error: votesError },
    { data: photosData, error: photosError },
    { data: profilesData, error: profilesError },
  ] = await Promise.all([
    supabase.from("votes").select("*").order("created_at", { ascending: false }),
    supabase.from("photos").select("id, user_id, slot_id, image_version"),
    supabase.from("profiles").select("id, username"),
  ]);

  if (votesError || photosError || profilesError) {
    return readVotes();
  }

  const photosById = new Map(
    ((photosData ?? []) as PhotoLookupRow[]).map((photo) => [photo.id, photo]),
  );
  const usernamesById = new Map(
    ((profilesData ?? []) as ProfileLookupRow[]).map((profile) => [profile.id, profile.username]),
  );

  const nextVotes = ((votesData ?? []) as VoteRow[]).flatMap((vote) => {
    const baseRecord = getAnswerRecordBase(vote.question_id);
    const photo = photosById.get(vote.target_photo_id);

    if (!baseRecord || !photo) {
      return [];
    }

    return [
      {
        ...baseRecord,
        answeredAt: vote.created_at,
        responseTimeMs: vote.response_time_ms,
        subjectId: `Sujeto ${photo.slot_id}`,
        targetImageId: photo.slot_id,
        targetImageInstanceId: `${photo.user_id}-${photo.slot_id}-v${photo.image_version}`,
        targetUsername: usernamesById.get(vote.target_user_id) ?? "anon",
        value: vote.answer_value,
      } satisfies PerceptionAnswerRecord,
    ];
  });

  writeVotes(nextVotes);
  return nextVotes;
}

export async function insertVoteToSupabase(params: {
  evaluatorUserId: string;
  questionId: string;
  responseTimeMs: number;
  targetPhotoId: string;
  targetUserId: string;
  value: 1 | 2 | 3 | 4 | 5;
}) {
  const baseRecord = getAnswerRecordBase(params.questionId);

  if (!baseRecord) {
    throw new Error("No se ha encontrado la pregunta del voto.");
  }

  const { error } = await supabase.from("votes").insert({
    answer_value: params.value,
    evaluator_user_id: params.evaluatorUserId,
    group_id: baseRecord.groupId,
    question_id: params.questionId,
    response_time_ms: params.responseTimeMs,
    stat_key: baseRecord.statKey,
    target_photo_id: params.targetPhotoId,
    target_user_id: params.targetUserId,
  });

  if (error) {
    throw new Error(error.message);
  }
}
