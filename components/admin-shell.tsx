"use client";

import { useEffect, useMemo, useState } from "react";
import { AppNav } from "@/components/app-nav";
import { canAccessAdmin, isAdminIdentity } from "@/lib/admin-access";
import type { PerceptionAnswerRecord } from "@/lib/perception-engine";
import {
  ADMIN_EMAIL,
  ADMIN_USERNAME,
  createInboxMessage,
  sendInboxMessageToSupabase,
  syncInboxFromSupabase,
  updateUserBanInSupabase,
  readInbox,
  writeInbox,
  type InboxMessage,
} from "@/lib/report-inbox";
import { readAllUserImages, syncAllUserImagesFromSupabase } from "@/lib/user-images";
import {
  readActiveUser,
  syncActiveUserFromSupabase,
  syncUsersFromSupabase,
  writeUsers,
  type ActiveUser,
  type StoredUser,
} from "@/lib/user-registry";
import { readVotes, syncVotesFromSupabase } from "@/lib/vote-store";

export function AdminShell() {
  const [activeUser, setActiveUser] = useState<ActiveUser | null>(null);
  const [messages, setMessages] = useState<InboxMessage[]>([]);
  const [replyDrafts, setReplyDrafts] = useState<Record<string, string>>({});
  const [users, setUsers] = useState<StoredUser[]>([]);
  const [votes, setVotes] = useState<PerceptionAnswerRecord[]>([]);
  const [allUserImages, setAllUserImages] = useState<
    Record<string, ReturnType<typeof readAllUserImages>[string]>
  >({});

  useEffect(() => {
    let cancelled = false;

    async function hydrateAdminState() {
      const nextActiveUser =
        (await syncActiveUserFromSupabase()) ?? readActiveUser();
      const nextUsers = await syncUsersFromSupabase();

      if (cancelled) {
        return;
      }

      setActiveUser(nextActiveUser);
      setUsers(nextUsers);
      setMessages(
        nextActiveUser?.id
          ? await syncInboxFromSupabase({
              isAdmin: true,
              viewerUserId: nextActiveUser.id,
            })
          : readInbox(),
      );
      setVotes(nextActiveUser?.id ? await syncVotesFromSupabase() : readVotes());
      setAllUserImages(await syncAllUserImagesFromSupabase());
    }

    void hydrateAdminState();

    return () => {
      cancelled = true;
    };
  }, []);

  const isAdmin = canAccessAdmin(activeUser);
  const adminMessages = useMemo(
    () => messages.filter((message) => message.toEmail === ADMIN_EMAIL),
    [messages],
  );
  const userSummary = useMemo(() => {
    const rows = users
      .map((user) => {
        const images = Object.values(allUserImages[user.username] ?? {});
        const receivedVotes = votes.filter(
          (vote) => vote.targetUsername === user.username,
        );

        return {
          bannedAt: user.bannedAt ?? null,
          createdAt: user.createdAt,
          email: user.email,
          hasActivity: images.length > 0 || receivedVotes.length > 0,
          imageCount: images.length,
          lastImageAt:
            images.length > 0
              ? [...images]
                  .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))[0]
                  ?.updatedAt ?? null
              : null,
          readsReceived: receivedVotes.length,
          username: user.username,
        };
      })
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt));

    return {
      activeUsers: rows.filter((row) => row.hasActivity).length,
      bannedUsers: rows.filter((row) => Boolean(row.bannedAt)).length,
      evaluatedUsers: rows.filter((row) => row.readsReceived > 0).length,
      imageUsers: rows.filter((row) => row.imageCount > 0).length,
      rows,
      totalUsers: rows.length,
    };
  }, [allUserImages, users, votes]);

  const updateReplyDraft = (messageId: string, value: string) => {
    setReplyDrafts((current) => ({
      ...current,
      [messageId]: value,
    }));
  };

  const handleReply = async (message: InboxMessage) => {
    const draft = replyDrafts[message.id]?.trim();

    if (!draft) {
      return;
    }

    const currentInbox = readInbox();
    const reply = createInboxMessage({
      body: draft,
      direction: "to_user",
      fromEmail: ADMIN_EMAIL,
      fromUsername: ADMIN_USERNAME,
      kind: message.kind,
      replyToId: message.id,
      sourceLabel: "Administración",
      sourceSubject: message.subject,
      subject: `Respuesta: ${message.subject}`,
      threadId: message.threadId,
      toEmail: message.fromEmail,
      toUsername: message.fromUsername,
    });

    const nextMessages = [reply, ...currentInbox];
    writeInbox(nextMessages);
    if (activeUser?.id) {
      try {
        const targetUser = users.find((user) => user.email === message.fromEmail);

        await sendInboxMessageToSupabase({
          body: reply.body,
          direction: "to_user",
          fromUserId: activeUser.id,
          kind: reply.kind,
          sourceLabel: reply.sourceLabel,
          sourceSubject: reply.sourceSubject,
          subject: reply.subject,
          threadId: reply.threadId,
          toUserId: targetUser?.id ?? null,
        });
        setMessages(
          await syncInboxFromSupabase({
            isAdmin: true,
            viewerUserId: activeUser.id,
          }),
        );
      } catch {
        setMessages(nextMessages);
      }
    } else {
      setMessages(nextMessages);
    }
    setReplyDrafts((current) => ({
      ...current,
      [message.id]: "",
    }));
  };

  const handleToggleBan = async (email: string) => {
    const nextUsers = users.map((user) => {
      if (user.email !== email) {
        return user;
      }

      if (isAdminIdentity(user)) {
        return user;
      }

      return {
        ...user,
        bannedAt: user.bannedAt ? null : new Date().toISOString(),
        banReason: user.bannedAt ? null : "Ban desde panel de administración",
      };
    });

    writeUsers(nextUsers);
    setUsers(nextUsers);
    try {
      const updatedUser = nextUsers.find((user) => user.email === email);

      await updateUserBanInSupabase({
        banReason: updatedUser?.banReason ?? null,
        email,
        isBanned: Boolean(updatedUser?.bannedAt),
      });
      setUsers(await syncUsersFromSupabase());
    } catch {
      setUsers(nextUsers);
    }
  };

  if (!isAdmin) {
    return (
      <main className="profile-app">
        <AppNav />

        <section className="profile-page">
          <div className="profile-page__inner profile-page__inner--narrow">
            <section className="profile-card">
              <div className="profile-card__header">
                <div>
                  <h2>Acceso restringido</h2>
                </div>
                <p>Esta bandeja solo está disponible para la administración.</p>
              </div>
            </section>
          </div>
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
            <span className="profile-card__eyebrow">Admin</span>
            <h1>Buzón interno</h1>
            <p>Aquí llegan los reportes generales y las denuncias de imágenes.</p>
          </header>

          <section className="profile-card">
            <div className="invite-summary-grid">
              <div className="invite-summary-card invite-summary-card--accent">
                <span>Usuarios registrados</span>
                <strong>{userSummary.totalUsers}</strong>
              </div>
              <div className="invite-summary-card">
                <span>Usuarios activos</span>
                <strong>{userSummary.activeUsers}</strong>
              </div>
              <div className="invite-summary-card">
                <span>Con imágenes subidas</span>
                <strong>{userSummary.imageUsers}</strong>
              </div>
              <div className="invite-summary-card">
                <span>Ya evaluados</span>
                <strong>{userSummary.evaluatedUsers}</strong>
              </div>
              <div className="invite-summary-card">
                <span>Baneados</span>
                <strong>{userSummary.bannedUsers}</strong>
              </div>
            </div>
          </section>

          <section className="profile-card">
            <div className="invite-summary-grid">
              <div className="invite-summary-card invite-summary-card--accent">
                <span>Mensajes recibidos</span>
                <strong>{adminMessages.length}</strong>
              </div>
              <div className="invite-summary-card">
                <span>Nuevos</span>
                <strong>{adminMessages.filter((message) => message.status === "new").length}</strong>
              </div>
              <div className="invite-summary-card">
                <span>Denuncias de imagen</span>
                <strong>{adminMessages.filter((message) => message.kind === "image").length}</strong>
              </div>
              <div className="invite-summary-card">
                <span>Reportes generales</span>
                <strong>
                  {adminMessages.filter((message) => message.kind === "general").length}
                </strong>
              </div>
            </div>
          </section>

          <section className="profile-card">
            <div className="profile-card__header">
              <div>
                <span className="profile-card__eyebrow">Mensajes recibidos</span>
                <h2>Entrada de administración</h2>
              </div>
              <p>Ordenados del más reciente al más antiguo.</p>
            </div>

            <div className="admin-inbox">
              {adminMessages.length > 0 ? (
                adminMessages.map((message) => (
                  <article className="admin-message" key={message.id}>
                    <div className="admin-message__meta">
                      <span className="profile-card__eyebrow">
                        {message.kind === "image" ? "Denuncia de imagen" : "Reporte"}
                      </span>
                      <strong>{message.subject}</strong>
                      <p>
                        {message.fromUsername} · {message.fromEmail}
                      </p>
                    </div>

                    <div className="admin-message__content">
                      {message.sourceSubject ? (
                        <p className="admin-message__context">
                          {message.sourceLabel} · {message.sourceSubject}
                        </p>
                      ) : (
                        <p className="admin-message__context">{message.sourceLabel}</p>
                      )}
                      <p>{message.body}</p>
                    </div>

                    <div className="admin-message__date">
                      {new Date(message.createdAt).toLocaleString("es-ES")}
                    </div>

                    <div className="admin-reply">
                      <label className="signup-field signup-field--textarea">
                        <span>RESPONDER</span>
                        <textarea
                          onChange={(event) => updateReplyDraft(message.id, event.target.value)}
                          placeholder="Escribe una respuesta para este usuario."
                          rows={4}
                          value={replyDrafts[message.id] ?? ""}
                        />
                      </label>

                      <button
                        className="profile-inline-action"
                        onClick={() => handleReply(message)}
                        type="button"
                      >
                        Enviar respuesta
                      </button>
                    </div>
                  </article>
                ))
              ) : (
                <div className="invite-history__row invite-history__row--empty">
                  <span>Buzón vacío</span>
                  <p>Todavía no ha llegado ningún reporte interno.</p>
                </div>
              )}
            </div>
          </section>

          <section className="profile-card">
            <div className="profile-card__header">
              <div>
                <span className="profile-card__eyebrow">Usuarios</span>
                <h2>Recuento de usuarios</h2>
              </div>
              <p>Actividad básica del sistema: registro, imágenes y lecturas recibidas.</p>
            </div>

            <div className="admin-user-list">
              {userSummary.rows.length > 0 ? (
                userSummary.rows.map((user) => (
                  <article className="admin-user-row" key={user.email}>
                    <div className="admin-user-row__identity">
                      <strong>{user.username}</strong>
                      <p>{user.email}</p>
                    </div>

                    <div className="admin-user-row__stats">
                      <span>Imágenes: {user.imageCount}</span>
                      <span>Lecturas: {user.readsReceived}</span>
                      <span>
                        {user.bannedAt
                          ? "Baneado"
                          : user.hasActivity
                            ? "Activo"
                            : "Sin actividad"}
                      </span>
                    </div>

                    <div className="admin-user-row__meta">
                      <span>
                        Alta: {new Date(user.createdAt).toLocaleDateString("es-ES")}
                      </span>
                      <span>
                        Última imagen:{" "}
                        {user.lastImageAt
                          ? new Date(user.lastImageAt).toLocaleDateString("es-ES")
                          : "Sin subida"}
                      </span>
                    </div>

                    <div className="admin-user-row__actions">
                      <button
                        className={`profile-inline-action ${user.bannedAt ? "" : "profile-inline-action--danger"}`}
                        disabled={isAdminIdentity(user)}
                        onClick={() => handleToggleBan(user.email)}
                        type="button"
                      >
                        {user.bannedAt ? "Quitar ban" : "Banear usuario"}
                      </button>
                    </div>
                  </article>
                ))
              ) : (
                <div className="invite-history__row invite-history__row--empty">
                  <span>Sin usuarios</span>
                  <p>Todavía no hay cuentas registradas en el sistema.</p>
                </div>
              )}
            </div>
          </section>
        </div>
      </section>
    </main>
  );
}
