import { aggregatePerceptionAnswers, type PerceptionAnswerRecord, type TraitScores } from "@/lib/perception-engine";
import type { StoredImageEntry } from "@/lib/user-images";
import type { StoredUser } from "@/lib/user-registry";

export type RankingUser = {
  id: string;
  imageUrl?: string;
  imageVariant: "a" | "b" | "c" | "d" | "e" | "f";
  initials: string;
  traitScores: TraitScores;
  username: string;
};

export type RankingCategoryDefinition = {
  id: string;
  microcopy: string;
  scoreUser: (user: RankingUser) => number;
  title: string;
};

export type RankedEntry = RankingUser & {
  score: number;
};

export const rankingUsers: RankingUser[] = [
  {
    id: "u01",
    imageVariant: "a",
    initials: "CC",
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
    username: "carloscriticable",
  },
  {
    id: "u02",
    imageVariant: "b",
    initials: "LM",
    traitScores: {
      ambition: 39,
      authenticity: 81,
      control: 26,
      distance: 19,
      ego: 18,
      magnetism: 49,
      risk: 16,
      status: 35,
      trust: 74,
      validation: 18,
      warmth: 82,
    },
    username: "lauramodo",
  },
  {
    id: "u03",
    imageVariant: "c",
    initials: "AV",
    traitScores: {
      ambition: 82,
      authenticity: 33,
      control: 77,
      distance: 74,
      ego: 79,
      magnetism: 68,
      risk: 58,
      status: 80,
      trust: 29,
      validation: 84,
      warmth: 21,
    },
    username: "axelvista",
  },
  {
    id: "u04",
    imageVariant: "d",
    initials: "IN",
    traitScores: {
      ambition: 58,
      authenticity: 44,
      control: 61,
      distance: 66,
      ego: 63,
      magnetism: 57,
      risk: 71,
      status: 64,
      trust: 27,
      validation: 53,
      warmth: 28,
    },
    username: "inesnorte",
  },
  {
    id: "u05",
    imageVariant: "e",
    initials: "MP",
    traitScores: {
      ambition: 31,
      authenticity: 76,
      control: 24,
      distance: 22,
      ego: 20,
      magnetism: 61,
      risk: 21,
      status: 30,
      trust: 67,
      validation: 25,
      warmth: 71,
    },
    username: "martaplana",
  },
  {
    id: "u06",
    imageVariant: "f",
    initials: "DR",
    traitScores: {
      ambition: 64,
      authenticity: 29,
      control: 69,
      distance: 61,
      ego: 73,
      magnetism: 74,
      risk: 65,
      status: 78,
      trust: 25,
      validation: 77,
      warmth: 24,
    },
    username: "darianrojo",
  },
  {
    id: "u07",
    imageVariant: "a",
    initials: "SN",
    traitScores: {
      ambition: 42,
      authenticity: 72,
      control: 32,
      distance: 35,
      ego: 27,
      magnetism: 54,
      risk: 33,
      status: 41,
      trust: 62,
      validation: 29,
      warmth: 64,
    },
    username: "saranube",
  },
  {
    id: "u08",
    imageVariant: "c",
    initials: "JP",
    traitScores: {
      ambition: 54,
      authenticity: 22,
      control: 58,
      distance: 69,
      ego: 66,
      magnetism: 48,
      risk: 83,
      status: 46,
      trust: 19,
      validation: 61,
      warmth: 18,
    },
    username: "jorgepose",
  },
  {
    id: "u09",
    imageVariant: "e",
    initials: "CL",
    traitScores: {
      ambition: 37,
      authenticity: 84,
      control: 18,
      distance: 14,
      ego: 16,
      magnetism: 58,
      risk: 15,
      status: 27,
      trust: 79,
      validation: 14,
      warmth: 76,
    },
    username: "claraluz",
  },
  {
    id: "u10",
    imageVariant: "d",
    initials: "BN",
    traitScores: {
      ambition: 71,
      authenticity: 38,
      control: 66,
      distance: 55,
      ego: 59,
      magnetism: 72,
      risk: 49,
      status: 73,
      trust: 41,
      validation: 64,
      warmth: 37,
    },
    username: "brunonexo",
  },
];

const scoreLow = (value: number) => 100 - value;

function pickImageVariant(seed: string): RankingUser["imageVariant"] {
  const variants: RankingUser["imageVariant"][] = ["a", "b", "c", "d", "e", "f"];
  let hash = 0;

  for (let index = 0; index < seed.length; index += 1) {
    hash = (hash * 31 + seed.charCodeAt(index)) >>> 0;
  }

  return variants[hash % variants.length];
}

const rankingScoreByCategory = {
  conceited: (scores: TraitScores) =>
    scores.ego * 0.38 +
    scores.validation * 0.26 +
    scores.control * 0.14 +
    scores.status * 0.14 +
    scoreLow(scores.authenticity) * 0.08,
  cunado: (scores: TraitScores) =>
    scores.risk * 0.3 +
    scores.ego * 0.2 +
    scores.validation * 0.16 +
    scores.distance * 0.12 +
    scores.status * 0.12 +
    scoreLow(scores.authenticity) * 0.1,
  "good-people": (scores: TraitScores) =>
    scores.warmth * 0.34 +
    scores.trust * 0.3 +
    scores.authenticity * 0.18 +
    scoreLow(scores.ego) * 0.08 +
    scoreLow(scores.risk) * 0.1,
  "less-trustworthy": (scores: TraitScores) =>
    scoreLow(scores.trust) * 0.44 +
    scores.risk * 0.22 +
    scoreLow(scores.authenticity) * 0.14 +
    scores.distance * 0.1 +
    scores.validation * 0.1,
  magnetic: (scores: TraitScores) =>
    scores.magnetism * 0.46 +
    scores.warmth * 0.16 +
    scores.status * 0.12 +
    scores.ambition * 0.08 +
    scoreLow(scores.distance) * 0.08 +
    scoreLow(scores.risk) * 0.1,
  natural: (scores: TraitScores) =>
    scores.authenticity * 0.46 +
    scoreLow(scores.control) * 0.18 +
    scoreLow(scores.validation) * 0.14 +
    scores.warmth * 0.12 +
    scoreLow(scores.ego) * 0.1,
} as const;

type RankingCategoryId = keyof typeof rankingScoreByCategory;

export function scoreCategoryFromTraits(
  categoryId: RankingCategoryId,
  scores: TraitScores,
) {
  return Math.round(rankingScoreByCategory[categoryId](scores));
}

export const rankingCategoryDefinitions: RankingCategoryDefinition[] = [
  {
    id: "good-people",
    microcopy: "Los que generan confianza y cercanía de primeras.",
    scoreUser: (user) => scoreCategoryFromTraits("good-people", user.traitScores),
    title: "Más buena gente",
  },
  {
    id: "less-trustworthy",
    microcopy: "Los que despiertan más desconfianza inicial.",
    scoreUser: (user) => scoreCategoryFromTraits("less-trustworthy", user.traitScores),
    title: "Menos fiable",
  },
  {
    id: "conceited",
    microcopy: "Los que parecen más pendientes de sí mismos.",
    scoreUser: (user) => scoreCategoryFromTraits("conceited", user.traitScores),
    title: "Más engreído",
  },
  {
    id: "magnetic",
    microcopy: "Los que arrastran más curiosidad al entrar.",
    scoreUser: (user) => scoreCategoryFromTraits("magnetic", user.traitScores),
    title: "Más magnético",
  },
  {
    id: "cunado",
    microcopy: "Los que activan más rápido la alarma social.",
    scoreUser: (user) => scoreCategoryFromTraits("cunado", user.traitScores),
    title: "Más cuñado",
  },
  {
    id: "natural",
    microcopy: "Los que parecen menos fabricados y más reales.",
    scoreUser: (user) => scoreCategoryFromTraits("natural", user.traitScores),
    title: "Más natural",
  },
];

export function getRankedEntriesForCategory(
  definition: RankingCategoryDefinition,
  users: RankingUser[] = rankingUsers,
) {
  return [...users]
    .map((user) => ({
      ...user,
      score: Math.round(definition.scoreUser(user)),
    }))
    .sort((left, right) => right.score - left.score);
}

export function buildRankingUsersFromData(params: {
  allImages: Record<string, Record<string, StoredImageEntry>>;
  users: StoredUser[];
  votes: PerceptionAnswerRecord[];
}) {
  const nextUsers = params.users
    .map<RankingUser | null>((user) => {
      const userVotes = params.votes.filter((vote) => vote.targetUsername === user.username);
      const fallbackSeed = rankingUsers.find((entry) => entry.username === user.username);
      const traitScores =
        userVotes.length > 0
          ? aggregatePerceptionAnswers(userVotes).traitScores
          : fallbackSeed?.traitScores;

      if (!traitScores) {
        return null;
      }

      const userImages = params.allImages[user.username] ?? {};
      const primaryImage =
        userImages["01"] ??
        userImages["02"] ??
        userImages["03"] ??
        Object.values(userImages).sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))[0];

      return {
        id: user.id ?? user.email,
        imageUrl: primaryImage?.src,
        imageVariant: fallbackSeed?.imageVariant ?? pickImageVariant(user.username),
        initials: user.username.slice(0, 2).toUpperCase(),
        traitScores,
        username: user.username,
      };
    })
    .filter((user): user is RankingUser => Boolean(user));

  return nextUsers.length > 0 ? nextUsers : rankingUsers;
}
