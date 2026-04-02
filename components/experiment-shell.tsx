"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { AppNav } from "@/components/app-nav";
import {
  clearFirstEntryPending,
  hasPendingFirstEntry,
} from "@/lib/first-entry";
import {
  aggregatePerceptionAnswers,
  buildNarrativeInsights,
  buildPerceptionSummary,
  buildTraitDetail,
  buildTraitCards,
  type TraitScores,
  type PerceptionAnswerRecord,
} from "@/lib/perception-engine";
import {
  getRankedEntriesForCategory,
  buildRankingUsersFromData,
  rankingCategoryDefinitions,
} from "@/lib/rankings";
import {
  createStoredImageEntry,
  getImageInstanceId,
  readAllUserImages,
  readUserImages,
  syncAllUserImagesFromSupabase,
  syncUserImagesFromSupabase,
  uploadUserImageToSupabase,
  writeUserImages,
  type UserImagesRecord,
} from "@/lib/user-images";
import { supabase } from "@/lib/supabase/client";
import {
  clearActiveUser,
  isUserBanned,
  readActiveUser,
  readUsers,
  syncActiveUserFromSupabase,
  syncUsersFromSupabase,
  type ActiveUser,
} from "@/lib/user-registry";
import { MAX_IMAGE_UPLOAD_BYTES, processImageForUpload } from "@/lib/image-upload";
import {
  ensureUserInvite,
  ensureUserInviteInSupabase,
  readInvites,
  syncInvitesFromSupabase,
  writeInvites,
  type InviteRecord,
} from "@/lib/invite-system";
import { ADMIN_EMAIL, readInbox, syncInboxFromSupabase, type InboxMessage } from "@/lib/report-inbox";
import { readVotes as readStoredVotes, syncVotesFromSupabase } from "@/lib/vote-store";
const STORAGE_KEY = "criticable-consent-v1";
const INVITES_STORAGE_KEY = "criticable-invites-v1";

const rawImageSlots: Array<{
  avgResponseTime: number;
  caption: string;
  clarity: number;
  code: string;
  descriptor: string;
  id: string;
  polarization: number;
  reads: number;
  status: string;
  traitScores: TraitScores;
}> = [
  {
    avgResponseTime: 1.8,
    caption: "Imagen base para lectura general",
    clarity: 78,
    code: "IMG 01",
    descriptor: "Confiable y algo distante",
    id: "01",
    polarization: 34,
    reads: 84,
    status: "Principal",
    traitScores: {
      ambition: 46,
      authenticity: 63,
      control: 41,
      distance: 52,
      ego: 38,
      magnetism: 64,
      risk: 31,
      status: 55,
      trust: 71,
      validation: 36,
      warmth: 58,
    },
  },
  {
    avgResponseTime: 2.4,
    caption: "Segunda imagen del mismo ciclo",
    clarity: 61,
    code: "IMG 02",
    descriptor: "Ambiciosa, fría y más jerárquica",
    id: "02",
    polarization: 58,
    reads: 41,
    status: "Activa",
    traitScores: {
      ambition: 74,
      authenticity: 39,
      control: 72,
      distance: 76,
      ego: 68,
      magnetism: 57,
      risk: 62,
      status: 76,
      trust: 43,
      validation: 69,
      warmth: 34,
    },
  },
  {
    avgResponseTime: 1.5,
    caption: "Variación de encuadre o postura",
    clarity: 82,
    code: "IMG 03",
    descriptor: "Cercana, natural y menos aspiracional",
    id: "03",
    polarization: 27,
    reads: 29,
    status: "Activa",
    traitScores: {
      ambition: 39,
      authenticity: 79,
      control: 29,
      distance: 24,
      ego: 25,
      magnetism: 59,
      risk: 22,
      status: 39,
      trust: 63,
      validation: 22,
      warmth: 75,
    },
  },
] as const;

type BaseImageSlot = (typeof rawImageSlots)[number];
type ImageSlot = BaseImageSlot & {
  confidenceScore: number;
  currentInstanceId: string;
  interpretations: Array<{
    axisKey: keyof TraitScores;
    label: string;
    tone: string;
    value: string;
  }>;
  summary: string;
  uploadedImage: string | null;
};

function getImageLabel(image: ImageSlot) {
  return `Imagen ${image.id}`;
}

function getConfidenceNarrative(image: ImageSlot) {
  if (image.reads === 0) {
    return "Esta imagen todavía no ha sido leída por otros.";
  }

  if (image.confidenceScore >= 66) {
    return image.avgResponseTime <= 1.8
      ? "La confianza aparece rápido y con poca fricción."
      : "La confianza domina, aunque la lectura no es instantánea.";
  }

  if (image.confidenceScore >= 55) {
    return "La lectura es favorable, pero no termina de ser cerrada.";
  }

  return "Esta foto despierta más reserva que tranquilidad inicial.";
}

function getDecisionNarrative(image: ImageSlot) {
  if (image.reads === 0) {
    return "Todavía no hay tiempo medio de decisión.";
  }

  if (image.avgResponseTime <= 1.8) {
    return `La mayoría decide sobre ti en ${image.avgResponseTime.toFixed(1)} segundos, casi sin dudar.`;
  }

  return `Necesitan ${image.avgResponseTime.toFixed(1)} segundos para cerrarte una lectura.`;
}

function buildDescriptorFromScores(scores: TraitScores, count: number) {
  if (count === 0) {
    return "Sin lectura acumulada todavía";
  }

  const topTraits = buildTraitCards(scores, 2);

  if (topTraits.length === 0) {
    return "Lectura todavía inestable";
  }

  return topTraits
    .map((trait) => trait.label.toLowerCase())
    .join(" y ");
}

export function ExperimentShell() {
  const [activeUser, setActiveUser] = useState<ActiveUser | null>(null);
  const [copiedInviteCode, setCopiedInviteCode] = useState<string | null>(null);
  const [hasConsent, setHasConsent] = useState(false);
  const [invites, setInvites] = useState<InviteRecord[]>([]);
  const [isBannedUser, setIsBannedUser] = useState(false);
  const [isFirstEntryScreenVisible, setIsFirstEntryScreenVisible] = useState(false);
  const [isReady, setIsReady] = useState(false);
  const [selectedImageId, setSelectedImageId] = useState("01");
  const [allUsers, setAllUsers] = useState(readUsers());
  const [uploadedImages, setUploadedImages] = useState<UserImagesRecord>({});
  const [votes, setVotes] = useState<PerceptionAnswerRecord[]>([]);
  const [inboxMessages, setInboxMessages] = useState<InboxMessage[]>([]);
  const [uploadFeedback, setUploadFeedback] = useState<string | null>(null);
  const [isUploadingImage, setIsUploadingImage] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const imageSlots = useMemo(
    () =>
      rawImageSlots.map((image) => {
        const uploadedEntry = uploadedImages[image.id] ?? null;
        const uploadedImage = uploadedEntry?.src ?? null;
        const currentInstanceId = activeUser
          ? getImageInstanceId(activeUser.username, image.id, uploadedEntry)
          : image.code;
        const relevantVotes =
          activeUser && votes.length > 0
            ? votes.filter(
                (vote) =>
                  vote.targetUsername === activeUser.username &&
                  vote.targetImageId === image.id &&
                  vote.targetImageInstanceId === currentInstanceId,
              )
            : [];

        if (relevantVotes.length === 0) {
          const emptyScores: TraitScores = {
            ambition: 0,
            authenticity: 0,
            control: 0,
            distance: 0,
            ego: 0,
            magnetism: 0,
            risk: 0,
            status: 0,
            trust: 0,
            validation: 0,
            warmth: 0,
          };

          return {
            ...image,
            avgResponseTime: 0,
            clarity: 0,
            confidenceScore: 0,
            currentInstanceId,
            descriptor: uploadedImage ? "Pendiente de evaluación" : "Sin imagen todavía",
            interpretations: [],
            polarization: 0,
            reads: 0,
            summary: uploadedImage
              ? "Todavía no hay suficiente lectura acumulada."
              : "Sube una imagen para entrar en lectura.",
            traitScores: emptyScores,
            uploadedImage,
          };
        }

        const aggregated = aggregatePerceptionAnswers(relevantVotes);
        const nextScores = aggregated.traitScores;

        return {
          ...image,
          avgResponseTime: aggregated.averageResponseTime / 1000,
          clarity: aggregated.clarity,
          confidenceScore: nextScores.trust,
          currentInstanceId,
          descriptor: buildDescriptorFromScores(nextScores, aggregated.count),
          interpretations: buildTraitCards(nextScores, 3),
          polarization: aggregated.polarization,
          reads: aggregated.count,
          summary: buildPerceptionSummary(nextScores, {
            averageResponseTime: aggregated.averageResponseTime,
            count: aggregated.count,
            polarization: aggregated.polarization,
          }),
          traitScores: nextScores,
          uploadedImage,
        };
      }),
    [activeUser, uploadedImages, votes],
  );

  useEffect(() => {
    let cancelled = false;

    async function hydrateShell() {
      const nextUser = (await syncActiveUserFromSupabase()) ?? readActiveUser();
      const allUsers = await syncUsersFromSupabase();
      const storedUser = nextUser
        ? allUsers.find((user) => user.email === nextUser.email)
        : null;
      const banned = isUserBanned(storedUser);

      if (cancelled) {
        return;
      }

      setHasConsent(Boolean(window.localStorage.getItem(STORAGE_KEY)));
      setIsBannedUser(banned);
      setActiveUser(banned ? null : nextUser);
      setAllUsers(allUsers);

      if (banned) {
        clearActiveUser();
        setInvites(await syncInvitesFromSupabase(INVITES_STORAGE_KEY));
        setUploadedImages({});
        setVotes(readStoredVotes());
        setInboxMessages(readInbox());
      } else if (nextUser) {
        const {
          data: { user: authUser },
        } = await supabase.auth.getUser();

        if (authUser?.id) {
          await ensureUserInviteInSupabase(authUser.id, nextUser.username);
          const syncedInvites = await syncInvitesFromSupabase(INVITES_STORAGE_KEY);
          setInvites(syncedInvites);
          await syncAllUserImagesFromSupabase();
          setUploadedImages(
            await syncUserImagesFromSupabase({
              userId: authUser.id,
              username: nextUser.username,
            }),
          );
          setVotes(await syncVotesFromSupabase());
          setInboxMessages(
            await syncInboxFromSupabase({
              isAdmin: Boolean(nextUser.isAdmin),
              viewerUserId: authUser.id,
            }),
          );
        } else {
          const existingInvites = readInvites(INVITES_STORAGE_KEY);
          const hydratedInvites = ensureUserInvite(nextUser.username, existingInvites);
          writeInvites(INVITES_STORAGE_KEY, hydratedInvites);
          setInvites(hydratedInvites);
          setUploadedImages(readUserImages(nextUser.username));
          setVotes(readStoredVotes());
          setInboxMessages(readInbox());
        }
        setIsFirstEntryScreenVisible(hasPendingFirstEntry(nextUser.email));
      } else {
        setInvites(readInvites(INVITES_STORAGE_KEY));
        setUploadedImages({});
        setVotes(readStoredVotes());
        setInboxMessages(readInbox());
        setIsFirstEntryScreenVisible(false);
      }

      setIsReady(true);
    }

    void hydrateShell();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!copiedInviteCode) {
      return;
    }

    const timeoutId = window.setTimeout(() => {
      setCopiedInviteCode(null);
    }, 1600);

    return () => window.clearTimeout(timeoutId);
  }, [copiedInviteCode]);

  const comparisonStats = useMemo(() => {
    const fastest = [...imageSlots].sort(
      (left, right) => left.avgResponseTime - right.avgResponseTime,
    )[0];
    const clearest = [...imageSlots].sort(
      (left, right) => right.clarity - left.clarity,
    )[0];
    const mostAmbiguous = [...imageSlots].sort(
      (left, right) => right.polarization - left.polarization,
    )[0];
    const mostTrust = [...imageSlots].sort(
      (left, right) => right.confidenceScore - left.confidenceScore,
    )[0];
    const mostDoubt = [...imageSlots].sort(
      (left, right) => left.clarity - right.clarity,
    )[0];

    const quickTags: Record<string, string> = {};

    quickTags[mostTrust.id] = "más confiable";
    quickTags[fastest.id] ??= "más rápida";
    quickTags[clearest.id] ??= "más clara";
    quickTags[mostDoubt.id] ??= "más ambigua";

    const cards = [
      {
        detail: `${fastest.avgResponseTime.toFixed(1)} s para decidir`,
        id: fastest.id,
        label: `${getImageLabel(fastest)} se interpreta más rápido`,
        value: "Lectura inmediata",
      },
      {
        detail: `${clearest.clarity}% de claridad`,
        id: clearest.id,
        label: `${getImageLabel(clearest)} deja menos dudas`,
        value: "La foto más clara",
      },
      {
        detail: `${mostAmbiguous.polarization}% de polarización`,
        id: mostAmbiguous.id,
        label: `${getImageLabel(mostAmbiguous)} divide más opiniones`,
        value: "La foto que más separa",
      },
      {
        detail: `${mostTrust.confidenceScore}% de confianza`,
        id: mostTrust.id,
        label: `${getImageLabel(mostTrust)} proyecta más confianza`,
        value: "Tu lectura más fiable",
      },
      {
        detail: `${mostDoubt.clarity}% de claridad`,
        id: mostDoubt.id,
        label: `${getImageLabel(mostDoubt)} genera más duda`,
        value: "La foto más ambigua",
      },
    ];

    return {
      cards,
      mostAmbiguous,
      quickTags,
    };
  }, [imageSlots]);

  if (!isReady) {
    return <main className="screen screen--loading" />;
  }

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

  if (!hasConsent || !activeUser) {
    return (
      <main className="screen">
        <section className="frame frame--locked">
          <p className="frame__stamp">ACCESS BLOCKED</p>
          <h1>Criticable requires an accepted entry and an active user.</h1>
          <p className="frame__summary">
            Complete the warning flow and sign in before entering the user
            surface.
          </p>
          <Link className="action action--primary action--link" href="/">
            Return to entry
          </Link>
        </section>
      </main>
    );
  }

  if (isFirstEntryScreenVisible) {
    return (
      <main className="entry">
        <section className="entry-stage">
          <div className="entry-brand" aria-label="criticable">
            <Image
              alt="criticable"
              className="entry-brand__image"
              height={60}
              priority
              src="/criticable-logo.png"
              width={360}
            />
          </div>

          <div className="entry-stage__inner">
            <div className="entry-card entry-card--first-entry">
              <div className="first-entry-copy">
                <p className="first-entry-copy__headline">Gracias por participar.</p>
                <p className="first-entry-copy__line">
                  A partir de aquí, no controlas la lectura.
                </p>
                <p className="first-entry-copy__line">Sube una imagen.</p>
                <p className="first-entry-copy__line">
                  Y entra en la pasarela para empezar.
                </p>
              </div>

              <div className="entry-actions entry-actions--single">
                <button
                  className="entry-action entry-action--primary"
                  onClick={() => {
                    clearFirstEntryPending(activeUser.email);
                    setIsFirstEntryScreenVisible(false);
                  }}
                  type="button"
                >
                  VAMOS
                </button>
              </div>
            </div>
          </div>
        </section>
      </main>
    );
  }

  const selectedImage =
    imageSlots.find((image) => image.id === selectedImageId) ?? imageSlots[0];
  const comparisonCards = comparisonStats.cards;
  const selectedInsights = [
    ...(selectedImage.reads > 0
      ? buildNarrativeInsights(selectedImage.traitScores, selectedImage.clarity, {
          averageResponseTime: selectedImage.avgResponseTime * 1000,
          count: selectedImage.reads,
          polarization: selectedImage.polarization,
        }).slice(0, 2)
      : [
          "Esta imagen vuelve a empezar desde cero.",
          "No heredará lecturas de la foto anterior.",
        ]),
    selectedImage.reads > 0
      ? selectedImage.id === comparisonStats.mostAmbiguous.id
        ? "Esta foto divide más que las demás."
        : getDecisionNarrative(selectedImage)
      : "Aún no hay evaluaciones acumuladas en pasarela.",
  ].slice(0, 3);
  const perceptionTraits = [
    ...(selectedImage.reads > 0
      ? selectedImage.interpretations.map((signal) => ({
          detail: buildTraitDetail(signal.axisKey, selectedImage.traitScores[signal.axisKey]),
          label: `${signal.label} ${signal.tone.toLowerCase()}`,
          value: signal.value,
        }))
      : [
          {
            detail: "La imagen actual todavía no ha entrado en lectura acumulada.",
            label: "Sin lectura activa",
            value: "0",
          },
        ]),
    ...(selectedImage.reads > 0
      ? [
          {
            detail:
              selectedImage.avgResponseTime <= 1.8
                ? "La decisión llega rápido."
                : "La gente tarda más en fijar una lectura.",
            label:
              selectedImage.avgResponseTime <= 1.8
                ? "Decisión rápida"
                : "Decisión más lenta",
            value: `${selectedImage.avgResponseTime.toFixed(1)} s`,
          },
        ]
      : []),
  ];

  const userInvites = invites.filter(
    (invite) => invite.createdByUsername === activeUser.username,
  );
  const userInvite = userInvites[0] ?? null;
  const rankingUsers = buildRankingUsersFromData({
    allImages: readAllUserImages(),
    users: allUsers,
    votes,
  });
  const rankingPositions = rankingCategoryDefinitions.map((definition) => {
    const rankedEntries = getRankedEntriesForCategory(definition, rankingUsers);
    const position =
      rankedEntries.findIndex((entry) => entry.username === activeUser.username) + 1;

    return {
      definition,
      position: position > 0 ? position : null,
    };
  });
  const inviteUsages = userInvite?.usages ?? [];
  const inviteRemainingUses = userInvite
    ? Math.max(0, userInvite.maxUses - inviteUsages.length)
    : 0;
  const adminConversation = inboxMessages
    .filter((message) => {
      if (!activeUser) {
        return false;
      }

      const userMatch =
        message.fromEmail === activeUser.email || message.toEmail === activeUser.email;
      const adminMatch =
        message.fromEmail === ADMIN_EMAIL || message.toEmail === ADMIN_EMAIL;

      return userMatch && adminMatch;
    })
    .sort((left, right) => right.createdAt.localeCompare(left.createdAt));

  const totalReads = imageSlots.reduce((sum, image) => sum + image.reads, 0);
  const averageDecisionTime =
    imageSlots.reduce((sum, image) => sum + image.avgResponseTime, 0) /
    imageSlots.length;

  const handleCopyInvite = async (code: string) => {
    try {
      await navigator.clipboard.writeText(code);
      setCopiedInviteCode(code);
    } catch {
      setCopiedInviteCode(null);
    }
  };

  const handleUploadTrigger = () => {
    setUploadFeedback(null);
    fileInputRef.current?.click();
  };

  const handleImageSelection = async (
    event: React.ChangeEvent<HTMLInputElement>,
  ) => {
    const file = event.target.files?.[0];

    if (!file || !activeUser) {
      return;
    }

    setIsUploadingImage(true);
    setUploadFeedback(null);

    try {
      const processedImage = await processImageForUpload(file);
      const {
        data: { user: authUser },
      } = await supabase.auth.getUser();

      if (authUser?.id) {
        const { entry } = await uploadUserImageToSupabase({
          dataUrl: processedImage.dataUrl,
          slotId: selectedImageId,
          userId: authUser.id,
          username: activeUser.username,
        });

        setUploadedImages((previous) => {
          const nextImages = {
            ...previous,
            [selectedImageId]: entry,
          };

          writeUserImages(activeUser.username, nextImages);
          return nextImages;
        });
      } else {
        setUploadedImages((previous) => {
          const nextImages = {
            ...previous,
            [selectedImageId]: createStoredImageEntry(processedImage.dataUrl),
          };

          writeUserImages(activeUser.username, nextImages);
          return nextImages;
        });
      }

      setUploadFeedback(
        `Imagen optimizada a ${Math.round(processedImage.bytes / 1024)} KB.`,
      );
    } catch (error) {
      setUploadFeedback(
        error instanceof Error
          ? error.message
          : `No se ha podido procesar la imagen. Límite: ${Math.round(
              MAX_IMAGE_UPLOAD_BYTES / 1024,
            )} KB.`,
      );
    } finally {
      setIsUploadingImage(false);
      event.target.value = "";
    }
  };

  return (
    <main className="profile-app">
      <AppNav />
      <input
        accept="image/*"
        className="sr-only"
        onChange={handleImageSelection}
        ref={fileInputRef}
        type="file"
      />

      <section className="profile-page">
        <div className="profile-page__inner">
          <section className="profile-hero-card">
            <div className="profile-cover" />

            <div className="profile-hero-card__body">
              <div className="profile-avatar">
                <span>{activeUser.username.slice(0, 2).toUpperCase()}</span>
              </div>

              <div className="profile-summary">
                <div className="profile-summary__copy">
                  <p className="profile-summary__eyebrow">Cómo te están interpretando</p>
                  <h1>{activeUser.username}</h1>
                  <p>No es quién eres. Es cómo te leen.</p>
                </div>

                <div className="profile-summary__actions">
                  <button
                    className="profile-button profile-button--primary"
                    disabled={isUploadingImage}
                    onClick={handleUploadTrigger}
                    type="button"
                  >
                    {isUploadingImage
                      ? "Procesando imagen..."
                      : selectedImage.uploadedImage
                        ? "Reemplazar imagen"
                        : "Subir imagen"}
                  </button>
                  {uploadFeedback ? (
                    <p className="profile-upload-feedback">{uploadFeedback}</p>
                  ) : null}
                </div>
              </div>
            </div>

            <div className="profile-facts">
              <div className="profile-fact">
                <span>Personas que han opinado sobre ti</span>
                <strong>{totalReads}</strong>
              </div>
              <div className="profile-fact">
                <span>Tiempo en decidir sobre ti</span>
                <strong>{averageDecisionTime.toFixed(1)} s</strong>
              </div>
              <div className="profile-fact">
                <span>Imágenes activas en lectura</span>
                <strong>3/3</strong>
              </div>
            </div>
          </section>

          <section className="profile-layout">
            <div className="profile-main">
              <article className="profile-card">
                <div className="profile-card__header">
                  <div>
                    <span className="profile-card__eyebrow">Tus imágenes en pasarela</span>
                    <h2>Tus imágenes en pasarela</h2>
                  </div>
                  <p>Compáralas. Ahí está el núcleo de Criticable.</p>
                </div>

                <div className="thumbnail-row">
                  {imageSlots.map((slot) => (
                    <button
                      className={`thumbnail-card ${selectedImage.id === slot.id ? "thumbnail-card--active" : ""}`}
                      key={slot.id}
                      onClick={() => setSelectedImageId(slot.id)}
                      type="button"
                    >
                      <div
                        className={`thumbnail-card__media ${slot.uploadedImage ? "thumbnail-card__media--uploaded" : ""}`}
                        style={
                          slot.uploadedImage
                            ? { backgroundImage: `url(${slot.uploadedImage})` }
                            : undefined
                        }
                      >
                        <span>{slot.id}</span>
                      </div>
                      <div className="thumbnail-card__body">
                        <strong>{getImageLabel(slot)}</strong>
                        <p>{slot.descriptor}</p>
                        <div className="thumbnail-card__stats">
                          <span>{slot.reads} lecturas</span>
                          <span>{slot.avgResponseTime.toFixed(1)} s</span>
                        </div>
                        <div className="thumbnail-card__stats">
                          <span>{comparisonStats.quickTags[slot.id] ?? "lectura propia"}</span>
                          <span>{slot.clarity}% claridad</span>
                        </div>
                      </div>
                    </button>
                  ))}
                </div>
              </article>

              <article className="profile-card profile-card--composer">
                <div className="profile-card__header">
                  <div>
                    <span className="profile-card__eyebrow">Imagen en foco</span>
                    <h2>Imagen en foco</h2>
                  </div>
                  <p>{getImageLabel(selectedImage)}. {selectedImage.descriptor}.</p>
                </div>

                <div className="selected-image-stage">
                  <div className="selected-image-stage__media">
                    <div className="selected-image-stage__badge">
                      {getImageLabel(selectedImage)}
                    </div>
                    <div
                      className={`selected-image-stage__visual ${selectedImage.uploadedImage ? "selected-image-stage__visual--uploaded" : ""}`}
                      style={
                        selectedImage.uploadedImage
                          ? { backgroundImage: `url(${selectedImage.uploadedImage})` }
                          : undefined
                      }
                    />
                  </div>

                  <div className="selected-image-stage__content">
                    <div className="selected-image-stage__meta">
                      <span>{selectedImage.status}</span>
                      <strong>{getConfidenceNarrative(selectedImage)}</strong>
                      <p>{selectedImage.summary}</p>
                    </div>

                    <div className="selected-image-stage__narrative">
                      {selectedInsights.map((insight) => (
                        <div className="narrative-card" key={insight}>
                          <strong>{insight}</strong>
                        </div>
                      ))}
                    </div>

                    <div className="selected-image-stage__stats">
                      <div className="image-stat-card">
                        <span>Personas que han opinado</span>
                        <strong>{selectedImage.reads}</strong>
                      </div>
                      <div className="image-stat-card">
                        <span>Tiempo en decidir sobre ti</span>
                        <strong>{selectedImage.avgResponseTime.toFixed(1)} s</strong>
                      </div>
                      <div className="image-stat-card">
                        <span>Claridad de lectura</span>
                        <strong>{selectedImage.clarity}%</strong>
                      </div>
                      <div className="image-stat-card">
                        <span>Nivel de división</span>
                        <strong>{selectedImage.polarization}%</strong>
                      </div>
                    </div>
                  </div>
                </div>
              </article>

              <article className="profile-card">
                <div className="profile-card__header">
                  <div>
                    <span className="profile-card__eyebrow">Comparación entre fotos</span>
                    <h2>La misma persona cambia según la imagen</h2>
                  </div>
                  <p>Estas son las diferencias que más alteran cómo te perciben.</p>
                </div>

                <div className="comparison-grid">
                  {comparisonCards.map((stat) => (
                    <div className="comparison-card" key={stat.label}>
                      <span>{stat.label}</span>
                      <strong>{stat.value}</strong>
                      <p>{stat.detail}</p>
                    </div>
                  ))}
                </div>
              </article>

              <article className="profile-card">
                <div className="profile-card__header">
                  <div>
                    <span className="profile-card__eyebrow">Tus posiciones</span>
                    <h2>Dónde apareces en los rankings</h2>
                  </div>
                  <p>Seis lecturas públicas de tu imagen dentro del sistema.</p>
                </div>

                <div className="comparison-grid">
                  {rankingPositions.map(({ definition, position }) => (
                    <div className="comparison-card" key={definition.id}>
                      <span>{definition.title}</span>
                      <strong>{position ? `#${position}` : "Sin posición"}</strong>
                      <p>{definition.microcopy}</p>
                    </div>
                  ))}
                </div>
              </article>

              <article className="profile-card">
                <div className="profile-card__header">
                  <div>
                    <span className="profile-card__eyebrow">Resumen actual</span>
                    <h2>Cómo te están leyendo en esta imagen</h2>
                  </div>
                  <p>{selectedImage.descriptor}</p>
                </div>

                <div className="comparison-grid">
                  {selectedInsights.map((insight) => (
                    <div className="comparison-card" key={insight}>
                      <span>Lectura visible</span>
                      <strong>{insight}</strong>
                    </div>
                  ))}
                </div>
              </article>
            </div>

            <aside className="profile-sidebar">
              <article className="profile-card profile-card--accent">
                <div className="profile-card__header">
                  <div>
                    <span className="profile-card__eyebrow">Así te están viendo ahora</span>
                    <h2>Lectura dominante de esta imagen</h2>
                  </div>
                  <p>{getImageLabel(selectedImage)}. {selectedImage.descriptor}.</p>
                </div>

                <div className="signal-stack">
                  {perceptionTraits.map((signal, index) => (
                    <div
                      className="signal-pill"
                      key={`${selectedImage.id}-${signal.label}-${index}`}
                    >
                      <div>
                        <strong>{signal.label}</strong>
                        <p>{signal.detail}</p>
                      </div>
                      <span>{signal.value}</span>
                    </div>
                  ))}
                </div>
              </article>

              <article className="profile-card">
                <div className="profile-card__header">
                  <div>
                    <span className="profile-card__eyebrow">Mensajes</span>
                    <h2>Conversación con administración</h2>
                  </div>
                  <p>Si reportas algo, la respuesta del administrador aparecerá aquí.</p>
                </div>

                <div className="user-message-panel">
                  <Link className="profile-inline-action" href="/reportar">
                    Ir a reportar
                  </Link>

                  <div className="user-message-list">
                    {adminConversation.length > 0 ? (
                      adminConversation.slice(0, 6).map((message) => {
                        const isAdminReply = message.fromEmail === ADMIN_EMAIL;

                        return (
                          <article
                            className={`user-message ${isAdminReply ? "user-message--incoming" : "user-message--outgoing"}`}
                            key={message.id}
                          >
                            <div className="user-message__meta">
                              <span>{isAdminReply ? "Administración" : "Tu mensaje"}</span>
                              <strong>{message.subject}</strong>
                            </div>
                            <p>{message.body}</p>
                            <div className="user-message__footer">
                              <span>{message.sourceLabel}</span>
                              <span>
                                {new Date(message.createdAt).toLocaleDateString("es-ES")}
                              </span>
                            </div>
                          </article>
                        );
                      })
                    ) : (
                      <div className="invite-history__row invite-history__row--empty">
                        <span>Sin mensajes</span>
                        <p>
                          Cuando envíes un reporte o recibas respuesta de
                          administración, aparecerá aquí.
                        </p>
                      </div>
                    )}
                  </div>
                </div>
              </article>

              <article className="profile-card">
                <div className="profile-card__header">
                  <div>
                    <span className="profile-card__eyebrow">Tu código</span>
                    <h2>Acceso por invitación</h2>
                  </div>
                  <p>Comparte siempre el mismo código. Puede activarse hasta cinco veces.</p>
                </div>

                {userInvite ? (
                  <div className="invite-module">
                    <div className="invite-summary-grid invite-summary-grid--compact">
                      <div className="invite-summary-card invite-summary-card--accent">
                        <span>Usos realizados</span>
                        <strong>
                          {inviteUsages.length}/{userInvite.maxUses}
                        </strong>
                      </div>
                      <div className="invite-summary-card">
                        <span>Usos disponibles</span>
                        <strong>{inviteRemainingUses}</strong>
                      </div>
                    </div>

                    <div className="invite-code-card">
                      <div className="invite-code-card__meta">
                        <span>Código único del usuario</span>
                        <strong>{userInvite.code}</strong>
                        <p>
                          Este es el código que debes enviar. Cada uso queda
                          registrado en tu historial.
                        </p>
                      </div>

                      <div className="invite-code-card__actions">
                        <button
                          className="profile-inline-action"
                          onClick={() => handleCopyInvite(userInvite.code)}
                          type="button"
                        >
                          {copiedInviteCode === userInvite.code ? "Copiado" : "Copiar"}
                        </button>
                      </div>
                    </div>

                    <div className="invite-history">
                      <div className="invite-history__header">
                        <span>Quién ha entrado con tu código</span>
                        <strong>{inviteUsages.length} accesos registrados</strong>
                      </div>

                      <div className="invite-list">
                        {inviteUsages.length > 0 ? (
                          inviteUsages.map((usage, index) => (
                            <div className="invite-pill" key={`${usage.email}-${usage.usedAt}`}>
                              <div>
                                <strong>{usage.username}</strong>
                                <p>{usage.email}</p>
                              </div>
                              <div className="invite-pill__actions">
                                <span className="invite-pill__index">Uso {index + 1}</span>
                                <span className="invite-pill__timestamp">
                                  {new Date(usage.usedAt).toLocaleDateString("es-ES")}
                                </span>
                              </div>
                            </div>
                          ))
                        ) : (
                          <div className="invite-history__row invite-history__row--empty">
                            <span>Aún no se ha usado</span>
                            <p>
                              Cuando alguien cree su cuenta con tu código, lo
                              verás aquí con su usuario y su correo.
                            </p>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                ) : null}
              </article>

              <article className="profile-card">
                <div className="profile-card__header">
                  <div>
                    <span className="profile-card__eyebrow">Normas activas</span>
                    <h2>Límites del perfil</h2>
                  </div>
                </div>

                <ul className="profile-rule-list">
                  <li>Solo imágenes propias.</li>
                  <li>Máximo 3 imágenes por usuario.</li>
                  <li>Sin nombres, contacto ni contexto externo.</li>
                  <li>La crítica es estructurada, no libre.</li>
                </ul>
              </article>
            </aside>
          </section>
        </div>
      </section>
    </main>
  );
}
