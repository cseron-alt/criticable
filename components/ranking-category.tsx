"use client";

import { useMemo } from "react";
import type { RankingCategoryDefinition, RankedEntry } from "@/lib/rankings";

type RankingCategoryProps = {
  currentUsername?: string | null;
  definition: RankingCategoryDefinition;
  entries: RankedEntry[];
};

export function RankingCategory({
  currentUsername,
  definition,
  entries,
}: RankingCategoryProps) {
  const featuredUser = entries[0];
  const listUsers = entries.slice(1, 5);

  const currentUserPosition = useMemo(() => {
    if (!currentUsername) {
      return null;
    }

    const index = entries.findIndex((entry) => entry.username === currentUsername);

    return index === -1 ? null : index + 1;
  }, [currentUsername, entries]);

  return (
    <article className="profile-card ranking-category">
      <header className="ranking-category__header">
        <span className="profile-card__eyebrow">Ranking</span>
        <h2>{definition.title}</h2>
        <p>{definition.microcopy}</p>
      </header>

      <div className="ranking-category__featured">
        <div
          className={`ranking-category__featured-media ranking-category__featured-media--${featuredUser.imageVariant}`}
          style={
            featuredUser.imageUrl
              ? {
                  backgroundImage: `url(${featuredUser.imageUrl})`,
                  backgroundPosition: "center",
                  backgroundSize: "cover",
                }
              : undefined
          }
        >
          {!featuredUser.imageUrl ? <span>{featuredUser.initials}</span> : null}
        </div>

        <div className="ranking-category__featured-copy">
          <span>#1</span>
          <strong>{featuredUser.username}</strong>
        </div>
      </div>

      <ol className="ranking-category__list">
        {listUsers.map((entry, index) => {
          const position = index + 2;
          const isCurrent = entry.username === currentUsername;

          return (
            <li
              className={`ranking-category__item ${isCurrent ? "ranking-category__item--current" : ""}`}
              key={`${definition.id}-${entry.id}`}
            >
              <span>{position}.</span>
              <strong>{entry.username}</strong>
            </li>
          );
        })}
      </ol>

      {currentUserPosition ? (
        <p className="ranking-category__position">Tu posición: #{currentUserPosition}</p>
      ) : null}
    </article>
  );
}
