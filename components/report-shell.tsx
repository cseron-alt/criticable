"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { AppNav } from "@/components/app-nav";
import {
  ADMIN_EMAIL,
  ADMIN_USERNAME,
  createInboxMessage,
  findAdminProfile,
  readInbox,
  sendInboxMessageToSupabase,
  syncInboxFromSupabase,
  writeInbox,
} from "@/lib/report-inbox";
import {
  clearActiveUser,
  isUserBanned,
  readActiveUser,
  readUsers,
  syncActiveUserFromSupabase,
  syncUsersFromSupabase,
  type ActiveUser,
} from "@/lib/user-registry";

type ReportForm = {
  body: string;
  sourceLabel: string;
  subject: string;
};

export function ReportShell() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [activeUser, setActiveUser] = useState<ActiveUser | null>(null);
  const [isBannedUser, setIsBannedUser] = useState(false);
  const presetSubject = searchParams.get("subject") ?? "";
  const presetSource = searchParams.get("source") ?? "Formulario";
  const presetTarget = searchParams.get("target") ?? "";
  const presetKind = searchParams.get("kind") === "image" ? "image" : "general";
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState<ReportForm>({
    body:
      presetKind === "image"
        ? `Quiero denunciar la imagen ${presetTarget || "seleccionada"} por el siguiente motivo:`
        : "",
    sourceLabel: presetSource,
    subject: presetSubject || (presetKind === "image" ? "Denuncia de imagen" : ""),
  });

  useEffect(() => {
    let cancelled = false;

    async function hydrateReportUser() {
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

    void hydrateReportUser();

    return () => {
      cancelled = true;
    };
  }, []);

  const updateField = (field: keyof ReportForm, value: string) => {
    setForm((current) => ({
      ...current,
      [field]: value,
    }));
    setError(null);
  };

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!activeUser) {
      setError("Necesitas entrar con un usuario activo para enviar un reporte.");
      return;
    }

    if (!form.subject.trim() || !form.body.trim()) {
      setError("Completa el asunto y el mensaje antes de enviarlo.");
      return;
    }

    setIsSubmitting(true);

    try {
      const currentInbox = readInbox();
      const threadId = `thread-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      const nextMessage = createInboxMessage({
        body: form.body.trim(),
        direction: "to_admin",
        fromEmail: activeUser.email,
        fromUsername: activeUser.username,
        kind: presetKind,
        threadId,
        toEmail: ADMIN_EMAIL,
        toUsername: ADMIN_USERNAME,
        sourceLabel: form.sourceLabel.trim() || "Formulario",
        sourceSubject: presetTarget || undefined,
        subject: form.subject.trim(),
      });

      writeInbox([nextMessage, ...currentInbox]);
      if (activeUser.id) {
        const adminProfile = await findAdminProfile();

        await sendInboxMessageToSupabase({
          body: nextMessage.body,
          direction: "to_admin",
          fromUserId: activeUser.id,
          kind: nextMessage.kind,
          sourceLabel: nextMessage.sourceLabel,
          sourceSubject: nextMessage.sourceSubject,
          subject: nextMessage.subject,
          threadId,
          toUserId: adminProfile?.id ?? null,
        });
        await syncInboxFromSupabase({
          viewerUserId: activeUser.id,
        });
      }
      setIsSubmitted(true);
      setForm((current) => ({
        ...current,
        body: "",
        subject: presetKind === "image" ? "Denuncia de imagen" : "",
      }));
    } catch {
      setError("No se ha podido enviar el mensaje. Inténtalo otra vez.");
    } finally {
      setIsSubmitting(false);
    }
  };

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

  return (
    <main className="profile-app">
      <AppNav />

      <section className="profile-page">
        <div className="profile-page__inner profile-page__inner--narrow">
          <header className="runway-header runway-header--report">
            <span className="profile-card__eyebrow">Reportar</span>
            <h1>Enviar mensaje interno</h1>
            <p>Describe lo justo. Llegará directamente al buzón de administración.</p>
          </header>

          <section className="profile-card report-layout">
            <div className="report-intro">
              <span className="profile-card__eyebrow">Canal interno</span>
              <h2>
                {presetKind === "image"
                  ? "Denuncia de imagen"
                  : "Reporte general"}
              </h2>
              <p>
                Usa este canal para incidencias, contenido problemático o
                cualquier aviso que deba revisar administración.
              </p>

              {presetTarget ? (
                <div className="comparison-card">
                  <span>Contexto</span>
                  <strong>{presetTarget}</strong>
                  <p>{presetSource}</p>
                </div>
              ) : null}
            </div>

            <form className="report-form" onSubmit={handleSubmit}>
              <label className="signup-field">
                <span>ASUNTO</span>
                <input
                  onChange={(event) => updateField("subject", event.target.value)}
                  placeholder="Asunto del mensaje"
                  type="text"
                  value={form.subject}
                />
              </label>

              <label className="signup-field">
                <span>ORIGEN</span>
                <input
                  onChange={(event) => updateField("sourceLabel", event.target.value)}
                  placeholder="Página o sección"
                  type="text"
                  value={form.sourceLabel}
                />
              </label>

              <label className="signup-field signup-field--textarea">
                <span>MENSAJE</span>
                <textarea
                  onChange={(event) => updateField("body", event.target.value)}
                  placeholder="Explica qué ha pasado o qué debe revisarse."
                  rows={7}
                  value={form.body}
                />
              </label>

              {error ? <p className="signup-form__error">{error}</p> : null}
              {isSubmitted ? (
                <p className="report-form__success">
                  Mensaje enviado. Ya está en el buzón de administración.
                </p>
              ) : null}

              <div className="entry-actions entry-actions--form report-form__actions">
                <button
                  className="entry-action entry-action--primary"
                  disabled={isSubmitting}
                  type="submit"
                >
                  {isSubmitting ? "ENVIANDO..." : "ENVIAR"}
                </button>
                <button
                  className="entry-action entry-action--secondary"
                  onClick={() => router.back()}
                  type="button"
                >
                  VOLVER
                </button>
              </div>
            </form>
          </section>
        </div>
      </section>
    </main>
  );
}
