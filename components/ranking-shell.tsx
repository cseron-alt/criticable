"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { AppNav } from "@/components/app-nav";
import { RankingCategory } from "@/components/ranking-category";
import {
  buildRankingUsersFromData,
  getRankedEntriesForCategory,
  rankingCategoryDefinitions,
} from "@/lib/rankings";
import { syncAllUserImagesFromSupabase, type UserImagesRecord } from "@/lib/user-images";
import type { PerceptionAnswerRecord } from "@/lib/perception-engine";
import {
  clearActiveUser,
  isUserBanned,
  readActiveUser,
  readUsers,
  syncActiveUserFromSupabase,
  syncUsersFromSupabase,
  type StoredUser,
  type ActiveUser,
} from "@/lib/user-registry";
import { readVotes, syncVotesFromSupabase } from "@/lib/vote-store";

export function RankingShell() {
  const [activeUser, setActiveUser] = useState<ActiveUser | null>(null);
  const [allImages, setAllImages] = useState<Record<string, UserImagesRecord>>({});
  const [isBannedUser, setIsBannedUser] = useState(false);
  const [users, setUsers] = useState<StoredUser[]>(readUsers());
  const [votes, setVotes] = useState<PerceptionAnswerRecord[]>([]);

  useEffect(() => {
    let cancelled = false;

    async function hydrateRankingUser() {
      const nextUser = (await syncActiveUserFromSupabase()) ?? readActiveUser();
      const allUsers = await syncUsersFromSupabase();
      const storedUser = nextUser
        ? allUsers.find((user) => user.email === nextUser.email)
        : null;
      const banned = isUserBanned(storedUser);
      const nextVotes = nextUser?.id ? await syncVotesFromSupabase() : readVotes();
      const nextAllImages = await syncAllUserImagesFromSupabase();

      if (cancelled) {
        return;
      }

      setIsBannedUser(banned);
      setActiveUser(banned ? null : nextUser);
      setAllImages(nextAllImages);
      setUsers(allUsers);
      setVotes(nextVotes);

      if (banned) {
        clearActiveUser();
      }
    }

    void hydrateRankingUser();

    return () => {
      cancelled = true;
    };
  }, []);

  const rankingModules = useMemo(
    () => {
      const rankingUsers = buildRankingUsersFromData({
        allImages,
        users,
        votes,
      });

      return rankingCategoryDefinitions.map((definition) => ({
        definition,
        entries: getRankedEntriesForCategory(definition, rankingUsers),
      }));
    },
    [allImages, users, votes],
  );

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
        <div className="profile-page__inner profile-page__inner--ranking">
          <header className="ranking-header">
            <span className="profile-card__eyebrow">Ranking</span>
            <h1>Así te están leyendo</h1>
            <p>Esto no describe quién eres. Describe cómo te perciben.</p>
          </header>

          <section className="ranking-grid">
            {rankingModules.map(({ definition, entries }) => (
              <RankingCategory
                currentUsername={activeUser?.username ?? null}
                definition={definition}
                entries={entries}
                key={definition.id}
              />
            ))}
          </section>
        </div>
      </section>
    </main>
  );
}
