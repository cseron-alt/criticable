export type PerceptionQuestionGroup = {
  id: string;
  label: string;
  questions: string[];
};

export type PerceptionQuestion = {
  groupId: string;
  groupLabel: string;
  id: string;
  indexInGroup: number;
  leftLabel: string;
  prompt: string;
  rightLabel: string;
  statKey: string;
  stepLabels: readonly [string, string, string, string, string];
};

function getScaleCopy(prompt: string) {
  const normalized = prompt
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();

  if (
    normalized.includes("parece") ||
    normalized.includes("hay ") ||
    normalized.includes("tiene ") ||
    normalized.includes("esta foto") ||
    normalized.includes("esta demasiado") ||
    normalized.includes("es alguien")
  ) {
    return {
      leftLabel: "Nada",
      rightLabel: "Totalmente",
      stepLabels: ["Nada", "Poco", "Algo", "Bastante", "Totalmente"] as const,
    };
  }

  return {
    leftLabel: "Nada",
    rightLabel: "Mucho",
    stepLabels: ["Nada", "Poco", "Algo", "Bastante", "Mucho"] as const,
  };
}

const rawQuestionGroups: PerceptionQuestionGroup[] = [
  {
    id: "A",
    label: "Primera lectura",
    questions: [
      "¿Te fiarías de esta persona?",
      "¿Te acercarías a hablarle?",
      "¿Te parecería fácil de tratar?",
      "¿Te impondría un poco?",
      "¿Te caería bien de primeras?",
      "¿Te daría pereza conocerla?",
      "¿Te parecería más simpática que borde?",
      "¿Te parecería más borde que simpática?",
      "¿Te inspiraría respeto?",
      "¿Te haría desconfiar?",
      "¿Tiene aspecto de cuñado?",
      "¿Te cambiarías de acera?",
    ],
  },
  {
    id: "B",
    label: "Vibra social",
    questions: [
      "¿Parece alguien popular?",
      "¿Parece alguien solitario?",
      "¿Parece de los que llenan una habitación?",
      "¿Parece de los que observan antes de hablar?",
      "¿Parece divertido o más bien intenso?",
      "¿Parece alguien con quien te reirías?",
      "¿Parece de los que quieren gustar a todo el mundo?",
      "¿Te llamaría la atención si entra en un bar?",
    ],
  },
  {
    id: "C",
    label: "Intención de la foto",
    questions: [
      "¿Esta foto busca aprobación?",
      "¿Esta foto busca imponer?",
      "¿Esta foto busca parecer natural?",
      "¿Esta foto busca parecer espontánea sin serlo?",
      "¿Esta foto busca parecer deseable?",
      "¿Esta foto busca parecer interesante?",
      "¿Esta foto busca parecer cercana?",
      "¿Esta foto está demasiado pensada?",
    ],
  },
  {
    id: "D",
    label: "Autenticidad y artificio",
    questions: [
      "¿Te parece una imagen honesta?",
      "¿Te parece una imagen fabricada?",
      "¿Hay postureo aquí?",
      "¿Hay demasiada intención de controlar tu impresión?",
      "¿Te crees esta versión de la persona?",
      "¿Parece estar actuando?",
      "¿Parece que se toma demasiado en serio?",
      "¿Parece que quiere parecer “sin esfuerzo”?",
      "¿Parece cómoda en su propia imagen?",
      "¿Parece más personaje que persona?",
    ],
  },
  {
    id: "E",
    label: "Confianza y fiabilidad",
    questions: [
      "¿Le confiarías dinero?",
      "¿Le confiarías una llave de tu casa?",
      "¿Crees que podría ser infiel a su pareja?",
      "¿Le confiarías un secreto?",
      "¿Te parecería alguien leal?",
      "¿Te parecería alguien que desaparece cuando toca dar la cara?",
      "¿Parece cumplir lo que promete?",
      "¿Parece más de palabra o de pose?",
      "¿Parece estable?",
      "¿Parece alguien que evita el conflicto o lo provoca?",
      "¿Parece alguien que te fallaría sin pestañear?",
      "¿Crees que tiene valores?",
    ],
  },
  {
    id: "F",
    label: "Ego y validación",
    questions: [
      "¿Parece muy pendiente de su imagen?",
      "¿Parece necesitar validación?",
      "¿Crees que su mirada encaja con su vestimenta?",
      "¿Parece alguien que vive pendiente de gustar?",
      "¿Parece narcisista?",
      "¿Parece inseguro detrás del personaje?",
      "¿Parece alguien que compite por atención?",
      "¿Crees que vendería a su madre por dinero?",
      "¿Parece alguien que no soporta pasar desapercibido?",
      "¿Parece alguien que sube esta foto para oír algo concreto?",
    ],
  },
  {
    id: "G",
    label: "Estatus percibido",
    questions: [
      "¿Parece alguien con dinero?",
      "¿Parece alguien que quiere parecer que tiene dinero?",
      "¿Parece alguien con gusto o con presupuesto?",
      "¿Parece alguien que cuida el detalle?",
      "¿Parece alguien que mide lo que proyecta?",
      "¿Parece alguien acostumbrado a salirse con la suya?",
      "¿Parece alguien con poder social?",
      "¿Parece alguien que quiere impresionar por estatus?",
      "¿Parece más lujo que criterio?",
    ],
  },
  {
    id: "H",
    label: "Ambición y control",
    questions: [
      "¿Parece alguien ambicioso?",
      "¿Parece alguien con actitud chulesca?",
      "¿Te parece humilde?",
      "¿Parece alguien que sabe exactamente lo que hace?",
      "¿Parece alguien controlador?",
      "¿Parece alguien competitivo?",
      "¿Parece alguien que no improvisa nada?",
      "¿Parece alguien que se vigila mucho?",
      "¿Parece alguien que se vende bien?",
      "¿Parece alguien que sabe jugar el juego social?",
    ],
  },
  {
    id: "I",
    label: "Atractivo social",
    questions: [
      "¿Tiene magnetismo?",
      "¿Tiene encanto?",
      "¿Parece seductor?",
      "¿Parece accesible?",
      "¿Parece alguien con quien apetecería quedar?",
      "¿Te parece buena compañía para pasar un buen rato?",
      "¿Tiene pinta de cansino?",
      "¿Te genera curiosidad?",
      "¿Parece alguien que genera curiosidad?",
    ],
  },
  {
    id: "J",
    label: "Riesgo, intensidad y lectura final",
    questions: [
      "¿Parece alguien complicado?",
      "¿Parece alguien con doble fondo?",
      "¿Parece alguien con mala leche?",
      "¿Parece alguien que juzga mucho a los demás?",
      "¿Parece alguien que intimida sin querer?",
      "¿Parece alguien que usa la imagen como escudo?",
      "¿Parece alguien emocionalmente claro?",
      "¿Parece alguien que divide opiniones?",
      "¿Parece alguien que cae mejor en foto que en persona?",
    ],
  },
];

function slugify(input: string) {
  return input
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .toLowerCase();
}

export const perceptionQuestionGroups = rawQuestionGroups;

export const perceptionQuestions: PerceptionQuestion[] = rawQuestionGroups.flatMap(
  (group) =>
    group.questions.map((prompt, index) => {
      const scaleCopy = getScaleCopy(prompt);

      return {
        groupId: group.id,
        groupLabel: group.label,
        id: `${group.id}${String(index + 1).padStart(2, "0")}`,
        indexInGroup: index,
        leftLabel: scaleCopy.leftLabel,
        prompt,
        rightLabel: scaleCopy.rightLabel,
        statKey: `${group.id.toLowerCase()}_${slugify(prompt)}`,
        stepLabels: scaleCopy.stepLabels,
      };
    }),
);
