import { perceptionQuestions, type PerceptionQuestion } from "@/lib/perception-questions";

export type AxisKey =
  | "trust"
  | "warmth"
  | "distance"
  | "status"
  | "authenticity"
  | "control"
  | "validation"
  | "magnetism"
  | "risk"
  | "ambition"
  | "ego";

export type TraitScores = Record<AxisKey, number>;

export type PerceptionAnswerRecord = {
  answeredAt: string;
  axisKey: AxisKey;
  groupId: string;
  groupLabel: string;
  prompt: string;
  questionId: string;
  responseTimeMs: number;
  statKey: string;
  subjectId: string;
  targetImageId?: string;
  targetImageInstanceId?: string;
  targetUsername?: string;
  value: number;
};

type AxisDefinition = {
  caution?: boolean;
  label: string;
  negative: string;
  positive: string;
};

type NarrativeOptions = {
  averageResponseTime?: number;
  clarity?: number;
  count?: number;
  polarization?: number;
};

type QuestionInterpretation = {
  axisKey: AxisKey;
  inverted?: boolean;
  statKey: string;
};

const midpoint = 3;

export const axisDefinitions: Record<AxisKey, AxisDefinition> = {
  ambition: {
    label: "Ambición",
    negative: "Poca ambición visible",
    positive: "Ambición alta",
  },
  authenticity: {
    label: "Autenticidad",
    negative: "Autenticidad baja",
    positive: "Autenticidad alta",
  },
  control: {
    caution: true,
    label: "Control",
    negative: "Control bajo",
    positive: "Imagen muy medida",
  },
  distance: {
    caution: true,
    label: "Distancia",
    negative: "Distancia baja",
    positive: "Distancia alta",
  },
  ego: {
    caution: true,
    label: "Ego",
    negative: "Ego bajo",
    positive: "Ego alto",
  },
  magnetism: {
    label: "Magnetismo",
    negative: "Magnetismo bajo",
    positive: "Magnetismo alto",
  },
  risk: {
    caution: true,
    label: "Riesgo",
    negative: "Riesgo bajo",
    positive: "Riesgo alto",
  },
  status: {
    label: "Estatus",
    negative: "Estatus bajo",
    positive: "Estatus alto",
  },
  trust: {
    label: "Confianza",
    negative: "Confianza baja",
    positive: "Confianza alta",
  },
  validation: {
    caution: true,
    label: "Validación",
    negative: "Validación baja",
    positive: "Búsqueda de validación alta",
  },
  warmth: {
    label: "Cercanía",
    negative: "Cercanía baja",
    positive: "Cercanía alta",
  },
};

function normalizePrompt(input: string) {
  return input
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

const rules: Array<{
  axisKey: AxisKey;
  inverted?: boolean;
  patterns: RegExp[];
}> = [
  {
    axisKey: "trust",
    patterns: [
      /te fiarias/,
      /confiarias/,
      /confiarias dinero/,
      /llave de tu casa/,
      /confiarias un secreto/,
      /alguien leal/,
      /cumplir lo que promete/,
      /tiene valores/,
      /parece estable/,
    ],
  },
  {
    axisKey: "warmth",
    patterns: [
      /te acercarias a hablarle/,
      /facil de tratar/,
      /te caeria bien/,
      /mas simpatica que borde/,
      /alguien con quien te reirias/,
      /parece accesible/,
      /buena compania/,
      /apeteceria quedar/,
      /parece cercana/,
      /te genera curiosidad/,
      /genera curiosidad/,
    ],
  },
  {
    axisKey: "distance",
    patterns: [
      /te daria pereza conocerla/,
      /mas borde que simpatica/,
      /parece alguien solitario/,
      /observan antes de hablar/,
      /te impondria un poco/,
      /te cambiarias de acera/,
    ],
  },
  {
    axisKey: "risk",
    patterns: [
      /te haria desconfiar/,
      /podria ser infiel/,
      /desaparece cuando toca dar la cara/,
      /te fallaria sin pestanear/,
      /aspecto de cunado/,
      /vende a su madre por dinero/,
      /parece alguien complicado/,
      /doble fondo/,
      /mala leche/,
      /juzga mucho a los demas/,
      /intimida sin querer/,
      /divide opiniones/,
      /cae mejor en foto que en persona/,
    ],
  },
  {
    axisKey: "status",
    patterns: [
      /inspira respeto/,
      /alguien con dinero/,
      /quiere parecer que tiene dinero/,
      /con gusto o con presupuesto/,
      /cuida el detalle/,
      /con poder social/,
      /impresionar por estatus/,
      /mas lujo que criterio/,
      /salirse con la suya/,
    ],
  },
  {
    axisKey: "authenticity",
    patterns: [
      /parece una imagen honesta/,
      /te crees esta version/,
      /parece comoda en su propia imagen/,
      /busca parecer natural/,
      /encaja con su vestimenta/,
      /emocionalmente claro/,
    ],
  },
  {
    axisKey: "authenticity",
    inverted: true,
    patterns: [
      /parece una imagen fabricada/,
      /hay postureo aqui/,
      /demasiada intencion de controlar tu impresion/,
      /parece estar actuando/,
      /se toma demasiado en serio/,
      /sin esfuerzo/,
      /mas personaje que persona/,
      /busca parecer espontanea sin serlo/,
    ],
  },
  {
    axisKey: "validation",
    patterns: [
      /busca aprobacion/,
      /busca parecer deseable/,
      /busca parecer interesante/,
      /quieren gustar a todo el mundo/,
      /muy pendiente de su imagen/,
      /necesitar validacion/,
      /vive pendiente de gustar/,
      /compite por atencion/,
      /no soporta pasar desapercibido/,
      /oir algo concreto/,
    ],
  },
  {
    axisKey: "ego",
    patterns: [
      /parece narcisista/,
      /inseguro detras del personaje/,
      /parece alguien con actitud chulesca/,
      /se vende bien/,
    ],
  },
  {
    axisKey: "ego",
    inverted: true,
    patterns: [/te parece humilde/],
  },
  {
    axisKey: "control",
    patterns: [
      /busca imponer/,
      /esta demasiado pensada/,
      /mide lo que proyecta/,
      /sabe exactamente lo que hace/,
      /parece alguien controlador/,
      /no improvisa nada/,
      /se vigila mucho/,
      /jugar el juego social/,
      /usa la imagen como escudo/,
    ],
  },
  {
    axisKey: "ambition",
    patterns: [
      /parece alguien ambicioso/,
      /parece alguien competitivo/,
      /quiere impresionar por estatus/,
      /popular/,
      /llaman la atencion si entra en un bar/,
    ],
  },
  {
    axisKey: "magnetism",
    patterns: [
      /llena una habitacion/,
      /divertido o mas bien intenso/,
      /llamaria la atencion si entra en un bar/,
      /tiene magnetismo/,
      /tiene encanto/,
      /parece seductor/,
      /genera curiosidad/,
      /te llamaria la atencion/,
    ],
  },
];

function interpretQuestion(question: PerceptionQuestion): QuestionInterpretation {
  const normalized = normalizePrompt(question.prompt);

  for (const rule of rules) {
    if (rule.patterns.some((pattern) => pattern.test(normalized))) {
      return {
        axisKey: rule.axisKey,
        inverted: rule.inverted,
        statKey: question.statKey,
      };
    }
  }

  switch (question.groupId) {
    case "A":
      return { axisKey: "trust", statKey: question.statKey };
    case "B":
      return { axisKey: "magnetism", statKey: question.statKey };
    case "C":
      return { axisKey: "control", statKey: question.statKey };
    case "D":
      return { axisKey: "authenticity", statKey: question.statKey };
    case "E":
      return { axisKey: "trust", statKey: question.statKey };
    case "F":
      return { axisKey: "validation", statKey: question.statKey };
    case "G":
      return { axisKey: "status", statKey: question.statKey };
    case "H":
      return { axisKey: "ambition", statKey: question.statKey };
    case "I":
      return { axisKey: "magnetism", statKey: question.statKey };
    case "J":
    default:
      return { axisKey: "risk", statKey: question.statKey };
  }
}

export const questionInterpretations = Object.fromEntries(
  perceptionQuestions.map((question) => [question.id, interpretQuestion(question)]),
) as Record<string, QuestionInterpretation>;

function emptyTraitScores(): TraitScores {
  return {
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
}

function scoreFromValue(value: number, inverted?: boolean) {
  const clamped = Math.min(5, Math.max(1, value));
  const normalized = ((clamped - 1) / 4) * 100;

  return inverted ? 100 - normalized : normalized;
}

function toneForScore(score: number) {
  if (score >= 68) {
    return "Alta";
  }

  if (score >= 45) {
    return "Media";
  }

  return "Baja";
}

function hashSeed(input: string) {
  let hash = 0;

  for (let index = 0; index < input.length; index += 1) {
    hash = (hash * 31 + input.charCodeAt(index)) >>> 0;
  }

  return hash;
}

function pickVariant(seed: string, options: string[]) {
  if (options.length === 0) {
    return "";
  }

  return options[hashSeed(seed) % options.length];
}

function topTraitKey(scores: TraitScores, caution?: boolean) {
  return sortTraits(scores, caution)[0]?.axisKey ?? "trust";
}

function buildPrimaryAxisLine(axisKey: AxisKey, score: number, seed: string) {
  if (score < 52) {
    return pickVariant(`${seed}-${axisKey}-soft`, [
      "La lectura no termina de cerrarse del todo.",
      "No hay una impresión dominante completamente estable.",
      "La imagen deja espacio a lecturas distintas.",
    ]);
  }

  const pools: Record<AxisKey, string[]> = {
    ambition: [
      "Se percibe ambición y cierta intención de avanzar o imponerse.",
      "La imagen proyecta impulso, cálculo y ganas de marcar posición.",
      "Aquí aparece una lectura de competitividad bastante visible.",
    ],
    authenticity: [
      "Predomina una sensación de naturalidad y de poca impostación.",
      "La lectura mayoritaria la empuja hacia lo creíble y lo poco forzado.",
      "Se instala una idea de autenticidad bastante clara.",
    ],
    control: [
      "También se nota una imagen medida, con bastante control de impresión.",
      "La foto deja sensación de cálculo y de encuadre muy vigilado.",
      "Hay una impresión de control visible en cómo se presenta.",
    ],
    distance: [
      "A la vez aparece cierta distancia en la forma de llegar.",
      "La lectura deja un punto de frialdad o separación.",
      "No termina de sentirse una imagen cercana; hay distancia en ella.",
    ],
    ego: [
      "También asoma una lectura de ego o de personaje bastante marcada.",
      "La imagen deja algo de autoimportancia en primer plano.",
      "Aparece una capa de pose o de personaje por encima de lo demás.",
    ],
    magnetism: [
      "Lo que más se impone es el magnetismo: atrae y pide atención.",
      "La foto genera curiosidad y arrastra la mirada con facilidad.",
      "Hay una lectura clara de encanto social y capacidad de atraer.",
    ],
    risk: [
      "Al mismo tiempo se activa una alerta o una reserva visible.",
      "La imagen despierta algo de cautela además de interés.",
      "Junto a la lectura principal queda una sombra de desconfianza.",
    ],
    status: [
      "La imagen sugiere estatus o conciencia de lo que quiere proyectar.",
      "Se lee intención de posición, de presencia y de cierto rango.",
      "Predomina una idea de estatus bastante marcada.",
    ],
    trust: [
      "La primera lectura empuja hacia la confianza y la fiabilidad.",
      "La mayoría cae bastante rápido en una impresión de confianza.",
      "Se instala una sensación de solvencia personal bastante clara.",
    ],
    validation: [
      "También se nota una necesidad de respuesta o de validación externa.",
      "La foto deja rastro de querer gustar o provocar reacción.",
      "Asoma una lectura de búsqueda de validación bastante visible.",
    ],
    warmth: [
      "La lectura dominante la acerca a la cercanía y al trato fácil.",
      "Se impone una sensación de simpatía y de acceso sencillo.",
      "Lo que más aparece es una idea de proximidad y buena disposición.",
    ],
  };

  return pickVariant(`${seed}-${axisKey}-primary`, pools[axisKey]);
}

function buildCautionLine(axisKey: AxisKey, seed: string) {
  const pools: Partial<Record<AxisKey, string[]>> = {
    control: [
      "Eso no evita que también se vea bastante medida.",
      "Aun así, la foto parece bastante trabajada.",
      "Junto a lo anterior, se nota bastante control de imagen.",
    ],
    distance: [
      "Pero no termina de acercarse del todo.",
      "A la vez deja un margen claro de distancia.",
      "También se percibe una pequeña barrera en la manera de entrar.",
    ],
    ego: [
      "También aparece un punto de pose o de personaje.",
      "A la vez asoma una lectura de ego por encima de lo espontáneo.",
      "Pero deja algo de autoescenificación en el fondo.",
    ],
    risk: [
      "Y junto a eso aparece una cautela bastante visible.",
      "A la vez deja una reserva que no desaparece.",
      "Pero la imagen no termina de quitar del todo la sospecha.",
    ],
    validation: [
      "También se lee una necesidad de aprobación bastante visible.",
      "A la vez parece una imagen que espera respuesta.",
      "Pero deja rastro de querer provocar una reacción concreta.",
    ],
  };

  return pickVariant(
    `${seed}-${axisKey}-caution`,
    pools[axisKey] ?? ["También queda una lectura secundaria bastante visible."],
  );
}

export function buildTraitDetail(axisKey: AxisKey, score: number) {
  const seed = `${axisKey}-${Math.round(score / 5)}`;

  if (score >= 70) {
    const strongPools: Record<AxisKey, string[]> = {
      ambition: [
        "Se lee ambición con bastante claridad.",
        "La imagen transmite hambre de posición y avance.",
      ],
      authenticity: [
        "Se percibe poco forzada y bastante creíble.",
        "Da sensación de versión poco fabricada.",
      ],
      control: [
        "Se nota una imagen muy medida.",
        "Da sensación de control bastante consciente.",
      ],
      distance: [
        "Marca distancia con bastante facilidad.",
        "No invita demasiado a la cercanía inmediata.",
      ],
      ego: [
        "La pose pesa y se nota.",
        "Se percibe personaje antes que espontaneidad.",
      ],
      magnetism: [
        "Llama la atención con facilidad.",
        "Tiene bastante capacidad de arrastre visual.",
      ],
      risk: [
        "Activa una cautela bastante clara.",
        "Deja una sospecha visible en la lectura.",
      ],
      status: [
        "Proyecta posición y conciencia de imagen.",
        "Se lee estatus con bastante nitidez.",
      ],
      trust: [
        "La mayoría la empuja hacia la fiabilidad.",
        "La lectura de confianza domina con claridad.",
      ],
      validation: [
        "Se nota deseo de gustar o de obtener respuesta.",
        "La imagen parece bastante pendiente de la reacción ajena.",
      ],
      warmth: [
        "Se siente accesible y fácil de tratar.",
        "La cercanía aparece de forma bastante limpia.",
      ],
    };

    return pickVariant(seed, strongPools[axisKey]);
  }

  if (score >= 46) {
    const mediumPools: Record<AxisKey, string[]> = {
      ambition: [
        "Hay ambición, aunque no monopoliza la imagen.",
        "Se percibe impulso, pero no de forma agresiva.",
      ],
      authenticity: [
        "La autenticidad aparece, aunque no termina de imponerse.",
        "Se percibe bastante creíble, sin ser una lectura cerrada.",
      ],
      control: [
        "Se percibe cierta intención de control.",
        "La imagen parece algo medida, pero no rígida.",
      ],
      distance: [
        "Hay algo de distancia en la manera de entrar.",
        "No termina de ser completamente cercana.",
      ],
      ego: [
        "Asoma un punto de personaje.",
        "La pose pesa un poco, aunque no domina del todo.",
      ],
      magnetism: [
        "Despierta interés, aunque no arrastra del todo.",
        "Tiene algo de gancho social en la lectura.",
      ],
      risk: [
        "Activa cierta cautela, aunque no de forma extrema.",
        "Deja una reserva de fondo.",
      ],
      status: [
        "Se nota cierta conciencia de estatus.",
        "La idea de posición aparece, aunque no manda del todo.",
      ],
      trust: [
        "La confianza aparece, pero no termina de cerrarse.",
        "La lectura es favorable, aunque no firme del todo.",
      ],
      validation: [
        "Parece esperar algo de respuesta.",
        "Se percibe cierta necesidad de aprobación.",
      ],
      warmth: [
        "La cercanía aparece, aunque no de forma absoluta.",
        "Se la lee bastante amable, pero no de forma unánime.",
      ],
    };

    return pickVariant(seed, mediumPools[axisKey]);
  }

  const lowPools: Record<AxisKey, string[]> = {
    ambition: [
      "La ambición no es lo primero que deja.",
      "No se la lee especialmente competitiva.",
    ],
    authenticity: [
      "La autenticidad aquí no termina de sostenerse.",
      "Cuesta leerla como totalmente natural.",
    ],
    control: [
      "No parece una imagen particularmente calculada.",
      "El control no es lo que más pesa aquí.",
    ],
    distance: [
      "No marca demasiada distancia.",
      "La barrera con quien mira no parece muy fuerte.",
    ],
    ego: [
      "No deja una lectura fuerte de ego.",
      "La pose no pesa demasiado en esta imagen.",
    ],
    magnetism: [
      "No genera un arrastre especialmente fuerte.",
      "La curiosidad aparece menos de lo esperado.",
    ],
    risk: [
      "No activa una alarma clara.",
      "La cautela aquí no domina la lectura.",
    ],
    status: [
      "El estatus no termina de imponerse.",
      "No parece una imagen centrada en posición o rango.",
    ],
    trust: [
      "La confianza no termina de estabilizarse.",
      "La fiabilidad no aparece como lectura fuerte.",
    ],
    validation: [
      "No parece buscar aprobación de forma evidente.",
      "La necesidad de validación no pesa demasiado aquí.",
    ],
    warmth: [
      "La cercanía no termina de imponerse.",
      "No deja una sensación claramente acogedora.",
    ],
  };

  return pickVariant(seed, lowPools[axisKey]);
}

export function aggregatePerceptionAnswers(answers: PerceptionAnswerRecord[]) {
  const totals = emptyTraitScores();
  const counts = emptyTraitScores();
  let totalDeviation = 0;
  let totalResponseTime = 0;
  const values: number[] = [];

  for (const answer of answers) {
    const interpretation = questionInterpretations[answer.questionId];

    if (!interpretation) {
      continue;
    }

    totals[interpretation.axisKey] += scoreFromValue(
      answer.value,
      interpretation.inverted,
    );
    counts[interpretation.axisKey] += 1;
    totalDeviation += Math.abs(answer.value - midpoint);
    totalResponseTime += answer.responseTimeMs;
    values.push(answer.value);
  }

  const traitScores = Object.fromEntries(
    Object.entries(totals).map(([axisKey, total]) => {
      const key = axisKey as AxisKey;
      const count = counts[key];

      return [key, count ? Math.round(total / count) : 0];
    }),
  ) as TraitScores;

  const clarity =
    answers.length > 0
      ? Math.round((totalDeviation / (answers.length * 2)) * 100)
      : 0;
  const averageValue =
    values.length > 0
      ? values.reduce((sum, value) => sum + value, 0) / values.length
      : 0;
  const polarization =
    values.length > 1
      ? Math.round(
          (values.reduce((sum, value) => sum + Math.abs(value - averageValue), 0) /
            (values.length * 2)) *
            100,
        )
      : 0;

  return {
    averageResponseTime:
      answers.length > 0 ? totalResponseTime / answers.length : 0,
    clarity,
    count: answers.length,
    polarization,
    traitScores,
  };
}

function sortTraits(scores: TraitScores, caution?: boolean) {
  return Object.entries(scores)
    .map(([key, score]) => ({
      axisKey: key as AxisKey,
      definition: axisDefinitions[key as AxisKey],
      score,
    }))
    .filter((trait) =>
      typeof caution === "boolean"
        ? Boolean(trait.definition.caution) === caution
        : true,
    )
    .sort((left, right) => right.score - left.score);
}

export function buildTraitCards(scores: TraitScores, limit = 4) {
  return sortTraits(scores)
    .slice(0, limit)
    .map((trait) => ({
      axisKey: trait.axisKey,
      label: trait.definition.label,
      tone: toneForScore(trait.score),
      value: String(trait.score),
    }));
}

export function buildPerceptionSummary(
  scores: TraitScores,
  options: NarrativeOptions = {},
) {
  const topPositive = sortTraits(scores, false)[0];
  const topCaution = sortTraits(scores, true)[0];
  const seed = `${topTraitKey(scores, false)}-${topTraitKey(scores, true)}-${options.count ?? 0}`;

  if (!topPositive && !topCaution) {
    return "Todavía no hay suficiente lectura acumulada.";
  }

  if ((options.count ?? 0) === 0) {
    return "Todavía no hay suficiente lectura acumulada.";
  }

  const parts: string[] = [];

  if (topPositive) {
    parts.push(buildPrimaryAxisLine(topPositive.axisKey, topPositive.score, seed));
  }

  if (topCaution && topCaution.score >= 60) {
    parts.push(buildCautionLine(topCaution.axisKey, seed));
  }

  return parts.join(" ");
}

export function buildNarrativeInsights(
  scores: TraitScores,
  clarity: number,
  options: NarrativeOptions = {},
) {
  const topPositive = sortTraits(scores, false)[0];
  const topCaution = sortTraits(scores, true)[0];
  const insights: string[] = [];
  const seed = `${topTraitKey(scores, false)}-${topTraitKey(scores, true)}-${clarity}-${options.polarization ?? 0}`;

  if ((options.count ?? 0) === 0) {
    return ["Todavía no hay suficiente lectura acumulada."];
  }

  if (topPositive && topPositive.score >= 56) {
    insights.push(buildPrimaryAxisLine(topPositive.axisKey, topPositive.score, `${seed}-i1`));
  }

  if (topCaution && topCaution.score >= 58) {
    insights.push(buildCautionLine(topCaution.axisKey, `${seed}-i2`));
  }

  if ((options.polarization ?? 0) >= 58) {
    insights.push(
      pickVariant(`${seed}-polarized`, [
        "No ordena una lectura tranquila: esta imagen separa bastante las opiniones.",
        "La reacción no sale compacta; aquí las lecturas se parten con facilidad.",
        "Es una imagen que divide más de lo normal y deja juicios muy distintos.",
      ]),
    );
  } else if (clarity >= 74) {
    insights.push(
      pickVariant(`${seed}-clear`, [
        "La impresión sale bastante alineada; no deja demasiado margen para lecturas opuestas.",
        "Tiende a cerrarse una lectura bastante uniforme entre quienes la ven.",
        "La percepción aquí se estabiliza con relativa facilidad.",
      ]),
    );
  } else if (clarity <= 38) {
    insights.push(
      pickVariant(`${seed}-doubt`, [
        "La lectura no termina de fijarse y deja bastante espacio para la duda.",
        "Aquí cuesta cerrar una sola impresión; la imagen se mueve más.",
        "No empuja una conclusión limpia y abre interpretaciones distintas.",
      ]),
    );
  }

  if (typeof options.averageResponseTime === "number" && options.averageResponseTime > 0) {
    if (options.averageResponseTime <= 1800) {
      insights.push(
        pickVariant(`${seed}-fast`, [
          "La mayoría decide deprisa, casi sin vacilar.",
          "Es una imagen que dispara una impresión rápida.",
          "La lectura cae pronto; no obliga a pensársela demasiado.",
        ]),
      );
    } else if (options.averageResponseTime >= 2600) {
      insights.push(
        pickVariant(`${seed}-slow`, [
          "La decisión tarda más y eso suele indicar una imagen menos obvia.",
          "Aquí la primera lectura se cocina más despacio que en otras fotos.",
          "No se decide tan rápido: la imagen obliga a mirar un poco más.",
        ]),
      );
    }
  }

  if ((options.count ?? 0) < 8) {
    insights.push(
      pickVariant(`${seed}-sample`, [
        "Todavía hay pocas lecturas; esta impresión puede moverse.",
        "La muestra sigue siendo corta, así que la lectura aún no está cerrada.",
        "Aún no hay suficiente volumen como para darla por totalmente estable.",
      ]),
    );
  }

  return Array.from(new Set(insights)).slice(0, 3);
}

export function getAnswerRecordBase(questionId: string) {
  const question = perceptionQuestions.find((item) => item.id === questionId);

  if (!question) {
    return null;
  }

  const interpretation = questionInterpretations[question.id];

  return {
    axisKey: interpretation.axisKey,
    groupId: question.groupId,
    groupLabel: question.groupLabel,
    prompt: question.prompt,
    questionId: question.id,
    statKey: interpretation.statKey,
  };
}
