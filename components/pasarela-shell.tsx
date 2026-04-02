"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { AppNav } from "@/components/app-nav";
import { VotingScale } from "@/components/voting-scale";
import { perceptionQuestions } from "@/lib/perception-questions";
import { getAnswerRecordBase, type PerceptionAnswerRecord } from "@/lib/perception-engine";
import {
  ADMIN_EMAIL,
  ADMIN_USERNAME,
  createInboxMessage,
  findAdminProfile,
  readInbox,
  sendInboxMessageToSupabase,
  writeInbox,
} from "@/lib/report-inbox";
import { supabase } from "@/lib/supabase/client";
import {
  clearActiveUser,
  isUserBanned,
  readActiveUser,
  syncActiveUserFromSupabase,
  syncUsersFromSupabase,
  type ActiveUser,
} from "@/lib/user-registry";
import {
  insertVoteToSupabase,
  readVotes as readStoredVotes,
  syncVotesFromSupabase,
  writeVotes as writeStoredVotes,
} from "@/lib/vote-store";
const ADVANCE_DELAY_MS = 480;

type VotingSubject = {
  imageInstanceId: string;
  label: string;
  uploadedImage: string | null;
  photoId?: string;
  slotId: string;
  subjectKey: string;
  targetUserId?: string;
  username: string;
};

function pickRandomIndex(length: number) {
  return Math.floor(Math.random() * length);
}

export function PasarelaShell() {
  const [activeUser, setActiveUser] = useState<ActiveUser | null>(null);
  const [isBannedUser, setIsBannedUser] = useState(false);
  const [currentQuestionId, setCurrentQuestionId] = useState(perceptionQuestions[0].id);
  const [currentSubjectId, setCurrentSubjectId] = useState("01");
  const [isAdvancing, setIsAdvancing] = useState(false);
  const [reportFeedback, setReportFeedback] = useState<string | null>(null);
  const [selectedValue, setSelectedValue] = useState<1 | 2 | 3 | 4 | 5 | null>(
    null,
  );
  const [subjectPool, setSubjectPool] = useState<VotingSubject[]>([]);
  const timeoutRef = useRef<number | null>(null);
  const questionStartedAtRef = useRef<number>(Date.now());

  useEffect(() => {
    let cancelled = false;

    async function hydrateRunwayUser() {
      const nextUser = (await syncActiveUserFromSupabase()) ?? readActiveUser();
      const allUsers = await syncUsersFromSupabase();
      const storedUser = nextUser
        ? allUsers.find((user) => user.email === nextUser.email)
        : null;
      const banned = isUserBanned(storedUser);

      if (cancelled) {
        return;
      }

      setIsBannedUser(banned);
      setActiveUser(banned ? null : nextUser);

      if (banned) {
        clearActiveUser();
      }
    }

    void hydrateRunwayUser();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function hydrateSubjectPool() {
      const {
        data: { user: authUser },
      } = await supabase.auth.getUser();

      if (!authUser?.id) {
        if (!cancelled) {
          setSubjectPool(
            ["01", "02", "03"].map((slotId) => ({
              imageInstanceId: `seed-anon-${slotId}`,
              label: `Sujeto ${slotId}`,
              uploadedImage: null,
              slotId,
              subjectKey: `seed-${slotId}`,
              username: "anon",
            })),
          );
        }

        return;
      }

      const [{ data: photosData }, { data: profilesData }] = await Promise.all([
        supabase
          .from("photos")
          .select("id, user_id, slot_id, image_version, storage_path")
          .eq("is_active", true)
          .neq("user_id", authUser.id),
        supabase.from("profiles").select("id, username"),
      ]);

      const usernamesById = new Map(
        ((profilesData ?? []) as Array<{ id: string; username: string }>).map((profile) => [
          profile.id,
          profile.username,
        ]),
      );

      const nextPool = ((photosData ?? []) as Array<{
        id: string;
        image_version: number;
        slot_id: string;
        storage_path: string;
        user_id: string;
      }>).map((photo, index) => ({
        imageInstanceId: `${photo.user_id}-${photo.slot_id}-v${photo.image_version}`,
        label: `Sujeto ${String(index + 1).padStart(2, "0")}`,
        photoId: photo.id,
        slotId: photo.slot_id,
        subjectKey: photo.id,
        targetUserId: photo.user_id,
        uploadedImage: supabase.storage.from("photos").getPublicUrl(photo.storage_path).data
          .publicUrl,
        username: usernamesById.get(photo.user_id) ?? "anon",
      }));

      if (!cancelled) {
        setSubjectPool(
          nextPool.length > 0
            ? nextPool
            : ["01", "02", "03"].map((slotId) => ({
                imageInstanceId: `seed-anon-${slotId}`,
                label: `Sujeto ${slotId}`,
                uploadedImage: null,
                slotId,
                subjectKey: `seed-${slotId}`,
                username: "anon",
              })),
        );
      }
    }

    void hydrateSubjectPool();

    return () => {
      cancelled = true;
    };
  }, [activeUser?.id]);

  useEffect(() => {
    if (subjectPool.length === 0) {
      return;
    }

    const nextQuestion = perceptionQuestions[pickRandomIndex(perceptionQuestions.length)];
    const nextSubject = subjectPool[pickRandomIndex(subjectPool.length)];

    setCurrentQuestionId(nextQuestion.id);
    setCurrentSubjectId(nextSubject.subjectKey);
  }, [subjectPool]);

  const currentReading =
    perceptionQuestions.find((question) => question.id === currentQuestionId) ??
    perceptionQuestions[0];
  const currentSubject =
    subjectPool.find((subject) => subject.subjectKey === currentSubjectId) ?? subjectPool[0];
  const currentVariant = (["a", "b", "c"] as const)[
    Math.max(
      0,
      subjectPool.findIndex((subject) => subject.subjectKey === currentSubjectId),
    ) % 3
  ];

  if (isBannedUser) {
    return (
      <main className="screen">
        <section className="frame frame--locked">
          <p className="frame__stamp">ACCESS BLOCKED</p>
          <h1>Este usuario ha sido bloqueado por administración.</h1>
          <p className="frame__summary">
            El acceso a Criticable está desactivado para esta cuenta.
          </p>
          <Link className="action action--primary action--link" href="/">
            Volver a la entrada
          </Link>
        </section>
      </main>
    );
  }

  useEffect(() => {
    return () => {
      if (timeoutRef.current) {
        window.clearTimeout(timeoutRef.current);
      }
    };
  }, []);

  useEffect(() => {
    questionStartedAtRef.current = Date.now();
  }, [currentQuestionId, currentSubjectId]);

  useEffect(() => {
    if (!reportFeedback) {
      return;
    }

    const timeoutId = window.setTimeout(() => {
      setReportFeedback(null);
    }, 1800);

    return () => window.clearTimeout(timeoutId);
  }, [reportFeedback]);

  const pickNextStep = () => {
    const nextQuestionPool =
      perceptionQuestions.length > 1
        ? perceptionQuestions.filter((question) => question.id !== currentQuestionId)
        : perceptionQuestions;
    const nextSubjectPool =
      subjectPool.length > 1
        ? subjectPool.filter((subject) => subject.subjectKey !== currentSubjectId)
        : subjectPool;
    const nextQuestion = nextQuestionPool[pickRandomIndex(nextQuestionPool.length)];
    const nextSubject = nextSubjectPool[pickRandomIndex(nextSubjectPool.length)];

    setCurrentQuestionId(nextQuestion.id);
    setCurrentSubjectId(nextSubject.subjectKey);
  };

  const handleAnswer = async (value: 1 | 2 | 3 | 4 | 5) => {
    if (isAdvancing || !currentSubject) {
      return;
    }

    if (timeoutRef.current) {
      window.clearTimeout(timeoutRef.current);
    }

    const baseRecord = getAnswerRecordBase(currentReading.id);

    if (!baseRecord) {
      return;
    }

    const responseTimeMs = Date.now() - questionStartedAtRef.current;
    const nextRecord: PerceptionAnswerRecord = {
      ...baseRecord,
      answeredAt: new Date().toISOString(),
      responseTimeMs,
      subjectId: currentSubject.label,
      targetImageId: currentSubject.slotId,
      targetImageInstanceId: currentSubject.imageInstanceId,
      targetUsername: currentSubject.username,
      value,
    };
    const existingVotes = readStoredVotes();
    const nextVotes = [...existingVotes, nextRecord];

    writeStoredVotes(nextVotes);

    if (activeUser?.id && currentSubject.photoId && currentSubject.targetUserId) {
      try {
        await insertVoteToSupabase({
          evaluatorUserId: activeUser.id,
          questionId: currentReading.id,
          responseTimeMs,
          targetPhotoId: currentSubject.photoId,
          targetUserId: currentSubject.targetUserId,
          value,
        });
        await syncVotesFromSupabase();
      } catch {
        writeStoredVotes(nextVotes);
      }
    }

    setSelectedValue(value);
    setIsAdvancing(true);

    timeoutRef.current = window.setTimeout(() => {
      pickNextStep();
      setSelectedValue(null);
      setIsAdvancing(false);
    }, ADVANCE_DELAY_MS);
  };

  const handleReportImage = async () => {
    if (!activeUser || !currentSubject) {
      return;
    }

    const currentInbox = readInbox();
    const nextMessage = createInboxMessage({
      body: `Denuncia directa desde pasarela sobre ${currentSubject.label}. Pregunta visible: ${currentReading.prompt}`,
      direction: "to_admin",
      fromEmail: activeUser.email,
      fromUsername: activeUser.username,
      kind: "image",
      sourceLabel: "Pasarela",
      sourceSubject: currentSubject.label,
      subject: "Denuncia de imagen",
      threadId: `thread-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      toEmail: ADMIN_EMAIL,
      toUsername: ADMIN_USERNAME,
    });

    writeInbox([nextMessage, ...currentInbox]);
    if (activeUser.id) {
      try {
        const adminProfile = await findAdminProfile();

        await sendInboxMessageToSupabase({
          body: nextMessage.body,
          direction: "to_admin",
          fromUserId: activeUser.id,
          kind: "image",
          sourceLabel: nextMessage.sourceLabel,
          sourceSubject: nextMessage.sourceSubject,
          subject: nextMessage.subject,
          threadId: nextMessage.threadId,
          toUserId: adminProfile?.id ?? null,
        });
      } catch {
        // Keep local fallback if the shared channel is not ready yet.
      }
    }
    setReportFeedback("Reportada");
  };

  return (
    <main className="profile-app">
      <AppNav />

      <section className="profile-page">
        <div className="profile-page__inner profile-page__inner--runway">
          <header className="runway-header">
            <span className="profile-card__eyebrow">Pasarela</span>
            <h1>Desfilando</h1>
            <p>Sin contexto. Primera lectura.</p>
          </header>

          <section
            className={`profile-card runway-experiment ${isAdvancing ? "runway-experiment--advancing" : ""}`}
          >
              <div className={`runway-experiment__media runway-experiment__media--${currentVariant}`}>
              <div className="runway-experiment__badge">{currentSubject?.label ?? "Sujeto"}</div>
              <div
                className={`runway-experiment__visual ${currentSubject?.uploadedImage ? "runway-experiment__visual--uploaded" : ""}`}
                style={
                  currentSubject?.uploadedImage
                    ? { backgroundImage: `url(${currentSubject.uploadedImage})` }
                    : undefined
                }
              />
              <div className="runway-experiment__report">
                <button
                  className="runway-report-button"
                  onClick={handleReportImage}
                  type="button"
                >
                  {reportFeedback ?? "Denunciar imagen"}
                </button>
              </div>
            </div>

            <div className="runway-experiment__panel">
              <div className="runway-experiment__copy">
                <span className="profile-card__eyebrow">{currentReading.groupLabel}</span>
                <h2>{currentReading.prompt}</h2>
                <p>Responde sin pensarlo demasiado.</p>
              </div>

              <VotingScale
                disabled={isAdvancing}
                leftLabel={currentReading.leftLabel}
                onSelect={handleAnswer}
                question={currentReading.prompt}
                rightLabel={currentReading.rightLabel}
                selectedValue={selectedValue}
                stepLabels={currentReading.stepLabels}
              />
            </div>
          </section>
        </div>
      </section>
    </main>
  );
}
