import type { Ctx, Game } from 'boardgame.io';
import { baseDeck, legendaryCards } from './cards';
import { GENERAL_RANK_ID, ranks as baseRanks } from './ranks';
import type { CardDefinition, JojGameState, RankDefinition, ResourceKey } from './types';

const INVALID_MOVE = 'INVALID_MOVE' as const;
const STARTING_HAND_SIZE = 5;
const HAND_LIMIT = 8;
const DRAW_STAGE = 'draw';
const PLAY_STAGE = 'play';
const END_STAGE = 'end';
const IDLE_STAGE = 'idle';
const CHAT_LIMIT = 200;

const resourceKeys: ResourceKey[] = ['time', 'reputation', 'discipline', 'documents', 'tech'];
const resourceLabelsUk: Record<ResourceKey, string> = {
  time: 'Час',
  reputation: 'Авторитет',
  discipline: 'Дисципліна',
  documents: 'Документи',
  tech: 'Технології',
};
const lyapIntros = [
  'Бюрократичний всесвіт тихо поплескав у долоні',
  'Канцелярський маятник хитнувся не в той бік',
  'Архівні боги перегорнули сторінку з виразом "ой-йой"',
  'Службовий таймер ввічливо нагадав, що ідеальність переоцінена',
  'Печатка долі поставила штамп "з несподіванкою"',
];
const scandalIntros = [
  'Інфопривід вийшов у прямий ефір без попередження',
  'Редакція внутрішніх мемів отримала новий сюжет',
  'Пресслужба попросила всіх дихати рівно, але запізно',
  'Новина дня постукала в двері й одразу зайшла',
  'У стрічці подій раптом зʼявився розділ "гаряче"',
];
const lyapClosers = [
  'Кава зробила вигляд, що це просто планове тренування.',
  'Папки зберегли спокій, але нервово.',
  'Протокол зітхнув і пішов на другу ітерацію.',
  'Саркастичний метроном урочисто відбив такт.',
  'Усе під контролем. Майже.',
];
const scandalClosers = [
  'Нарада офіційно отримала новий порядок денний.',
  'Система не панікує, вона "динамічно адаптується".',
  'Журнали попросили додаткову закладку для епічних моментів.',
  'Офіційна версія: так і було задумано.',
  'Робоча атмосфера стала помітно сюжетнішою.',
];
const supportIntros = [
  'Штаб добрих намірів увімкнув режим допомоги',
  'Логістика посміхнулась і кивнула',
  'Канцелярський всесвіт раптом став трохи людянішим',
  'Система зробила вигляд, що все під контролем, і це спрацювало',
  'Внутрішній відділ підтримки відповів швидше, ніж очікували',
];
export const normalizeImagePath = (input?: string): string | undefined => {
  if (!input) return undefined;
  const raw = input.trim();
  if (!raw) return undefined;

  const normalized = raw.replace(/\\/g, '/');
  if (/^(https?:\/\/|data:|blob:)/i.test(normalized)) return normalized;
  if (normalized.startsWith('/cards/')) return normalized;
  if (normalized.startsWith('cards/')) return `/${normalized}`;
  if (normalized.startsWith('/public/cards/')) return normalized.replace('/public', '');
  if (normalized.startsWith('public/cards/')) return `/${normalized.replace(/^public\//, '')}`;
  if (/^[^/]+\.(png|webp|jpg|jpeg|gif|svg)$/i.test(normalized)) return `/cards/${normalized}`;
  return normalized.startsWith('/') ? normalized : `/${normalized}`;
};

const cloneCard = (card: CardDefinition): CardDefinition => ({
  ...card,
  cost: card.cost ? { ...card.cost } : undefined,
  image: normalizeImagePath(card.image),
  effects: card.effects?.map((effect) => ({ ...effect })),
});

const cloneRank = (rank: RankDefinition): RankDefinition => ({
  ...rank,
  requirement: { ...rank.requirement },
  cost: { ...rank.cost },
  bonus: { ...rank.bonus },
});

const getPlayerLabel = (G: JojGameState, playerID: string) => {
  const name = G.playerNames[playerID]?.trim();
  return name || 'Гравець';
};

const appendChat = (
  G: JojGameState,
  entry: { type: 'player' | 'system'; text: string; playerID?: string },
) => {
  const row = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    createdAt: Date.now(),
    ...entry,
  };
  G.chat.push(row);
  if (G.chat.length > CHAT_LIMIT) {
    G.chat = G.chat.slice(-CHAT_LIMIT);
  }
};

const nextSystemMessageSeq = (G: JojGameState): number => {
  const next = (G.systemMessageSeq ?? 0) + 1;
  G.systemMessageSeq = next;
  return next;
};

const stableIndex = (seed: string, modulo: number): number => {
  let h = 0;
  for (let i = 0; i < seed.length; i += 1) {
    h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  }
  return modulo > 0 ? h % modulo : 0;
};

type SharedDeckTemplate = {
  deck: CardDefinition[];
  legendaryDeck: CardDefinition[];
  deckBackImage?: string;
};

export type DeckTarget = 'deck' | 'legendaryDeck';
export type SharedRanks = RankDefinition[];

const defaultSharedDeckTemplate = (): SharedDeckTemplate => ({
  deck: baseDeck.map(cloneCard),
  legendaryDeck: legendaryCards.map(cloneCard),
  deckBackImage: undefined,
});

let sharedDeckTemplate: SharedDeckTemplate = defaultSharedDeckTemplate();
let sharedRanks: SharedRanks = baseRanks.map(cloneRank);

const getActiveRanks = (): SharedRanks => sharedRanks;
const getTopRankId = (): string => {
  const active = getActiveRanks();
  return active[active.length - 1]?.id ?? GENERAL_RANK_ID;
};

const isValidRank = (rank: unknown): rank is RankDefinition => {
  if (!rank || typeof rank !== 'object') return false;
  const raw = rank as Record<string, unknown>;
  if (typeof raw.id !== 'string' || !raw.id.trim()) return false;
  if (typeof raw.name !== 'string' || !raw.name.trim()) return false;
  if (!raw.requirement || typeof raw.requirement !== 'object') return false;
  if (raw.cost !== undefined && (!raw.cost || typeof raw.cost !== 'object')) return false;
  if (raw.bonus !== undefined && (!raw.bonus || typeof raw.bonus !== 'object')) return false;
  const req = raw.requirement as Record<string, unknown>;
  const costSource = (raw.cost as Record<string, unknown> | undefined) ?? {};
  const bonusSource = (raw.bonus as Record<string, unknown> | undefined) ?? {};
  for (const key of Object.keys(req)) {
    if (!resourceKeys.includes(key as ResourceKey)) return false;
    if (typeof req[key] !== 'number') return false;
  }
  for (const key of Object.keys(costSource)) {
    if (!resourceKeys.includes(key as ResourceKey)) return false;
    if (typeof costSource[key] !== 'number') return false;
  }
  for (const key of Object.keys(bonusSource)) {
    if (!resourceKeys.includes(key as ResourceKey)) return false;
    if (typeof bonusSource[key] !== 'number') return false;
  }
  return true;
};

export const getSharedRanks = (): SharedRanks => sharedRanks.map(cloneRank);

export const setSharedRanks = (next: SharedRanks): boolean => {
  if (!Array.isArray(next) || next.length === 0) return false;
  if (!next.every((rank) => isValidRank(rank))) return false;
  const ids = next.map((rank) => rank.id.trim());
  if (new Set(ids).size !== ids.length) return false;
  sharedRanks = next.map((rank) => {
    const cost = rank.cost ? { ...rank.cost } : {};
    const bonus = rank.bonus ? { ...rank.bonus } : {};
    return cloneRank({
      ...rank,
      id: rank.id.trim(),
      name: rank.name.trim(),
      cost,
      bonus,
    });
  });
  return true;
};

export const resetSharedRanks = () => {
  sharedRanks = baseRanks.map(cloneRank);
};

const buildCardCatalog = (template: SharedDeckTemplate): CardDefinition[] => {
  const byId = new Map<string, CardDefinition>();
  [...template.deck, ...template.legendaryDeck].forEach((card) => {
    if (!byId.has(card.id)) {
      byId.set(card.id, cloneCard(card));
    }
  });
  return [...byId.values()];
};

export const getSharedDeckTemplateStats = () => ({
  deck: sharedDeckTemplate.deck.length,
  legendary: sharedDeckTemplate.legendaryDeck.length,
});

export const getSharedDeckTemplate = (): SharedDeckTemplate => ({
  deck: sharedDeckTemplate.deck.map(cloneCard),
  legendaryDeck: sharedDeckTemplate.legendaryDeck.map(cloneCard),
  deckBackImage: sharedDeckTemplate.deckBackImage,
});

export const getCardCatalog = (): CardDefinition[] => buildCardCatalog(sharedDeckTemplate);

export const exportSharedDeckTemplateJson = (): string =>
  JSON.stringify(getSharedDeckTemplate(), null, 2);

const validCategories = new Set<CardDefinition['category']>([
  'LYAP',
  'SCANDAL',
  'SUPPORT',
  'DECISION',
  'NEUTRAL',
  'VVNZ',
  'LEGENDARY',
]);
const validEffectResources = new Set<string>([
  'time',
  'reputation',
  'discipline',
  'documents',
  'tech',
  'rank',
]);

const parseCard = (value: unknown): CardDefinition | null => {
  if (!value || typeof value !== 'object') return null;
  const raw = value as Record<string, unknown>;
  if (typeof raw.id !== 'string' || typeof raw.title !== 'string') return null;
  if (!validCategories.has(raw.category as CardDefinition['category'])) return null;
  const image = normalizeImagePath(typeof raw.image === 'string' ? raw.image : undefined);
  let effects: CardDefinition['effects'];
  if (raw.effects !== undefined) {
    if (!Array.isArray(raw.effects)) return null;
    const parsedEffects: NonNullable<CardDefinition['effects']> = [];
    for (const effect of raw.effects) {
      if (!effect || typeof effect !== 'object') return null;
      const row = effect as Record<string, unknown>;
      if (typeof row.resource !== 'string' || !validEffectResources.has(row.resource)) return null;
      if (typeof row.value !== 'number') return null;
      parsedEffects.push({ resource: row.resource as 'rank' | ResourceKey, value: row.value });
    }
    effects = parsedEffects;
  }
  const flavor = typeof raw.flavor === 'string' ? raw.flavor : undefined;
  return {
    id: raw.id,
    title: raw.title,
    category: raw.category as CardDefinition['category'],
    image,
    effects,
    flavor,
  };
};

export const importSharedDeckTemplateJson = (
  text: string,
): { ok: true } | { ok: false; error: string } => {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return { ok: false, error: 'Invalid JSON' };
  }
  if (!parsed || typeof parsed !== 'object') {
    return { ok: false, error: 'Template must be an object' };
  }

  const raw = parsed as Record<string, unknown>;
  if (!Array.isArray(raw.deck) || !Array.isArray(raw.legendaryDeck)) {
    return { ok: false, error: 'Template must contain deck and legendaryDeck arrays' };
  }

  const deck = raw.deck.map(parseCard);
  const legendaryDeck = raw.legendaryDeck.map(parseCard);
  if (deck.some((card) => !card) || legendaryDeck.some((card) => !card)) {
    return { ok: false, error: 'One or more cards have invalid schema' };
  }
  const typedDeck = deck as CardDefinition[];
  const typedLegendaryDeck = legendaryDeck as CardDefinition[];
  const deckBackImage = normalizeImagePath(
    typeof raw.deckBackImage === 'string' ? raw.deckBackImage : undefined,
  );

  sharedDeckTemplate = {
    deck: typedDeck.map(cloneCard),
    legendaryDeck: typedLegendaryDeck.map(cloneCard),
    deckBackImage,
  };
  return { ok: true };
};

export const resetSharedDeckTemplate = () => {
  sharedDeckTemplate = defaultSharedDeckTemplate();
};

export const shuffleSharedDeckTemplate = () => {
  sharedDeckTemplate = {
    ...sharedDeckTemplate,
    deck: shuffle(sharedDeckTemplate.deck),
  };
};

export const setSharedDeckBackImage = (path?: string) => {
  sharedDeckTemplate = {
    ...sharedDeckTemplate,
    deckBackImage: normalizeImagePath(path),
  };
};

export const addCardToSharedDeckTemplate = (target: DeckTarget, cardId: string): boolean => {
  const card = getCardCatalog().find((item) => item.id === cardId);
  if (!card) return false;
  sharedDeckTemplate = {
    ...sharedDeckTemplate,
    [target]: [...sharedDeckTemplate[target], cloneCard(card)],
  };
  return true;
};

export const addCustomCardToSharedDeckTemplate = (target: DeckTarget, card: CardDefinition): void => {
  sharedDeckTemplate = {
    ...sharedDeckTemplate,
    [target]: [...sharedDeckTemplate[target], cloneCard(card)],
  };
};

export const removeCardAtFromSharedDeckTemplate = (target: DeckTarget, index: number): boolean => {
  if (index < 0 || index >= sharedDeckTemplate[target].length) return false;
  sharedDeckTemplate = {
    ...sharedDeckTemplate,
    [target]: sharedDeckTemplate[target].filter((_, i) => i !== index),
  };
  return true;
};

export const updateCardAtInSharedDeckTemplate = (
  target: DeckTarget,
  index: number,
  card: CardDefinition,
): boolean => {
  if (index < 0 || index >= sharedDeckTemplate[target].length) return false;
  sharedDeckTemplate = {
    ...sharedDeckTemplate,
    [target]: sharedDeckTemplate[target].map((item, i) => (i === index ? cloneCard(card) : item)),
  };
  return true;
};

const shuffle = <T,>(items: T[]): T[] => {
  const next = [...items];
  for (let i = next.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [next[i], next[j]] = [next[j], next[i]];
  }
  return next;
};

const hasResources = (resources: Record<ResourceKey, number>, cost: Partial<Record<ResourceKey, number>>): boolean =>
  resourceKeys.every((key) => (resources[key] ?? 0) >= (cost[key] ?? 0));

const spendResources = (resources: Record<ResourceKey, number>, cost: Partial<Record<ResourceKey, number>>) => {
  resourceKeys.forEach((key) => {
    const value = Math.max(0, cost[key] ?? 0);
    if (value > 0) resources[key] -= value;
  });
};

const applyResourceDelta = (
  resources: Record<ResourceKey, number>,
  delta: Partial<Record<ResourceKey, number>>,
) => {
  resourceKeys.forEach((key) => {
    resources[key] += delta[key] ?? 0;
  });
};

const clampNonNegativeResources = (resources: Record<ResourceKey, number>) => {
  resourceKeys.forEach((key) => {
    if (resources[key] < 0) resources[key] = 0;
  });
};

const replacementCostUnits = (
  resources: Record<ResourceKey, number>,
  effects: CardDefinition['effects'],
): number => {
  if (!effects?.length) return 0;
  const virtual = { ...resources };
  let needed = 0;
  effects.forEach((effect) => {
    if (effect.resource === 'rank') return;
    if (effect.value >= 0) {
      virtual[effect.resource] += effect.value;
      return;
    }

    let required = Math.abs(effect.value);
    const available = Math.max(0, virtual[effect.resource]);
    const direct = Math.min(available, required);
    virtual[effect.resource] -= direct;
    required -= direct;
    if (required > 0) {
      needed += required * 2;
    }
  });
  return needed;
};

const planReplacementResources = (
  resources: Record<ResourceKey, number>,
  effects: CardDefinition['effects'],
): ResourceKey[] | null => {
  if (!effects?.length) return [];
  const virtual = { ...resources };
  const replacements: ResourceKey[] = [];

  for (const effect of effects) {
    if (effect.resource === 'rank' || effect.value >= 0) continue;
    let required = Math.abs(effect.value);
    const available = Math.max(0, virtual[effect.resource]);
    const direct = Math.min(available, required);
    virtual[effect.resource] -= direct;
    required -= direct;

    while (required > 0) {
      for (let i = 0; i < 2; i += 1) {
        const pick = [...resourceKeys]
          .sort((a, b) => virtual[b] - virtual[a])
          .find((key) => virtual[key] > 0);
        if (!pick) return null;
        virtual[pick] -= 1;
        replacements.push(pick);
      }
      required -= 1;
    }
  }

  return replacements;
};

export const getReplacementUnitsForCard = (
  resources: Record<ResourceKey, number>,
  card: CardDefinition,
): number => replacementCostUnits(resources, card.effects);

const shiftRank = (G: JojGameState, playerID: string, delta: number) => {
  if (delta === 0) return;
  const ranks = getActiveRanks();
  const currentRankId = G.ranks[playerID];
  const currentRankIdx = Math.max(0, ranks.findIndex((r) => r.id === currentRankId));
  const nextIdx = Math.max(0, Math.min(ranks.length - 1, currentRankIdx + delta));
  G.ranks[playerID] = ranks[nextIdx].id;
};

const applyCardEffects = (
  G: JojGameState,
  playerID: string,
  effects: CardDefinition['effects'],
  replacementResources: ResourceKey[] = [],
): boolean => {
  if (!effects?.length) return true;
  const playerResources = G.resources[playerID];
  const needed = replacementCostUnits(playerResources, effects);
  if (replacementResources.length !== needed) return false;
  let replacementIndex = 0;

  effects.forEach((effect) => {
    if (effect.resource === 'rank') {
      return;
    }

    if (effect.value < 0) {
      let required = Math.abs(effect.value);
      const available = Math.max(0, playerResources[effect.resource]);
      const direct = Math.min(available, required);
      playerResources[effect.resource] -= direct;
      required -= direct;

      while (required > 0) {
        for (let i = 0; i < 2; i += 1) {
          const replacement = replacementResources[replacementIndex];
          replacementIndex += 1;
          if (!replacement || playerResources[replacement] <= 0) {
            throw new Error('INVALID_REPLACEMENT');
          }
          playerResources[replacement] -= 1;
        }
        required -= 1;
      }
      return;
    }

    playerResources[effect.resource] += effect.value;
  });
  effects.forEach((effect) => {
    if (effect.resource === 'rank') {
      shiftRank(G, playerID, effect.value);
    }
  });
  clampNonNegativeResources(playerResources);
  return true;
};

const applyCardEffectsSoft = (
  G: JojGameState,
  playerID: string,
  effects: CardDefinition['effects'],
): { resources: Partial<Record<ResourceKey, number>>; rank: number } => {
  const summary: { resources: Partial<Record<ResourceKey, number>>; rank: number } = { resources: {}, rank: 0 };
  if (!effects?.length) return summary;
  const beforeResources = { ...G.resources[playerID] };
  const beforeRankId = G.ranks[playerID];
  const replacements = planReplacementResources(G.resources[playerID], effects);
  if (replacements) {
    try {
      const applied = applyCardEffects(G, playerID, effects, replacements);
      if (applied) {
        return summarizeAppliedDiff(
          beforeResources,
          G.resources[playerID],
          beforeRankId,
          G.ranks[playerID],
        );
      }
    } catch {
      // fallback to safe clamp below
    }
  }

  const resources = G.resources[playerID];
  effects.forEach((effect) => {
    if (effect.resource === 'rank') return;
    if (effect.value < 0) {
      const next = Math.max(0, resources[effect.resource] + effect.value);
      const delta = next - resources[effect.resource];
      resources[effect.resource] = next;
      summary.resources[effect.resource] = (summary.resources[effect.resource] ?? 0) + delta;
      return;
    }
    resources[effect.resource] += effect.value;
    summary.resources[effect.resource] = (summary.resources[effect.resource] ?? 0) + effect.value;
  });
  effects.forEach((effect) => {
    if (effect.resource === 'rank') {
      shiftRank(G, playerID, effect.value);
      summary.rank += effect.value;
    }
  });
  clampNonNegativeResources(resources);
  return summary;
};

const effectSummaryToText = (summary: { resources: Partial<Record<ResourceKey, number>>; rank: number }) => {
  const parts: string[] = [];
  resourceKeys.forEach((key) => {
    const value = summary.resources[key] ?? 0;
    if (value !== 0) {
      parts.push(`${resourceLabelsUk[key]} ${value > 0 ? `+${value}` : value}`);
    }
  });
  if (summary.rank !== 0) {
    parts.push(`Звання ${summary.rank > 0 ? `+${summary.rank}` : summary.rank}`);
  }
  return parts.length > 0 ? parts.join(', ') : 'без змін';
};

const summarizeAppliedDiff = (
  beforeResources: Record<ResourceKey, number>,
  afterResources: Record<ResourceKey, number>,
  beforeRankId: string,
  afterRankId: string,
): { resources: Partial<Record<ResourceKey, number>>; rank: number } => {
  const summary: { resources: Partial<Record<ResourceKey, number>>; rank: number } = { resources: {}, rank: 0 };
  resourceKeys.forEach((key) => {
    const delta = (afterResources[key] ?? 0) - (beforeResources[key] ?? 0);
    if (delta !== 0) summary.resources[key] = delta;
  });
  const ranks = getActiveRanks();
  const from = ranks.findIndex((row) => row.id === beforeRankId);
  const to = ranks.findIndex((row) => row.id === afterRankId);
  if (from >= 0 && to >= 0) {
    summary.rank = to - from;
  }
  return summary;
};

const categoryLabelUk = (category: CardDefinition['category']) => {
  switch (category) {
    case 'LYAP':
      return 'ЛЯП';
    case 'SCANDAL':
      return 'СКАНДАЛ';
    case 'SUPPORT':
      return 'ПІДТРИМКА';
    case 'DECISION':
      return 'РІШЕННЯ';
    case 'NEUTRAL':
      return 'НЕЙТРАЛЬНА';
    case 'VVNZ':
      return 'ВВНЗ';
    case 'LEGENDARY':
      return 'ЛЕГЕНДАРНА';
    default:
      return category;
  }
};

const rankNameById = (rankId: string): string =>
  getActiveRanks().find((row) => row.id === rankId)?.name ?? rankId;

const resourceDeltaToText = (delta: Partial<Record<ResourceKey, number>>) => {
  const parts = resourceKeys
    .map((key) => {
      const value = delta[key] ?? 0;
      if (value === 0) return null;
      return `${resourceLabelsUk[key]} ${value > 0 ? `+${value}` : value}`;
    })
    .filter((part): part is string => Boolean(part));
  return parts.length > 0 ? parts.join(', ') : 'без змін';
};

const costToDelta = (cost: Partial<Record<ResourceKey, number>>): Partial<Record<ResourceKey, number>> => {
  const delta: Partial<Record<ResourceKey, number>> = {};
  resourceKeys.forEach((key) => {
    const value = cost[key] ?? 0;
    if (value > 0) delta[key] = -value;
  });
  return delta;
};

const cardFlavorSnippet = (card: CardDefinition) => {
  const raw = card.flavor?.trim();
  if (!raw) return 'без офіційного коментаря';
  return raw.length > 120 ? `${raw.slice(0, 117)}...` : raw;
};

const buildLyapSystemMessage = (
  seq: number,
  playerLabel: string,
  card: CardDefinition,
  summary: { resources: Partial<Record<ResourceKey, number>>; rank: number },
) => {
  const seed = `${seq}:${card.id}:${card.title}:lyap`;
  const intro = lyapIntros[stableIndex(seed, lyapIntros.length)];
  const closer = lyapClosers[stableIndex(`${seed}:closer`, lyapClosers.length)];
  const category = categoryLabelUk(card.category);
  const flavor = cardFlavorSnippet(card);
  return `⚠️ [${seq}] ${intro}: ${playerLabel} дістав «${card.title}» (${category}). Цитата з польового щоденника: "${flavor}". Ефект: ${effectSummaryToText(summary)}. ${closer}`;
};

const buildScandalSystemMessage = (
  seq: number,
  playerLabel: string,
  card: CardDefinition,
  targetSummaries: string[],
) => {
  const seed = `${seq}:${card.id}:${card.title}:scandal`;
  const intro = scandalIntros[stableIndex(seed, scandalIntros.length)];
  const closer = scandalClosers[stableIndex(`${seed}:closer`, scandalClosers.length)];
  const category = categoryLabelUk(card.category);
  const flavor = cardFlavorSnippet(card);
  return `🗞️ [${seq}] ${intro}: ${playerLabel} підняв «${card.title}» (${category}). Нотатка редакції: "${flavor}". Кому прилетіло: ${targetSummaries.join(' | ')}. ${closer}`;
};

const buildSupportSystemMessage = (
  seq: number,
  playerLabel: string,
  card: CardDefinition,
  summary: { resources: Partial<Record<ResourceKey, number>>; rank: number },
) => {
  const seed = `${seq}:${card.id}:${card.title}:support`;
  const intro = supportIntros[stableIndex(seed, supportIntros.length)];
  const category = categoryLabelUk(card.category);
  const flavor = cardFlavorSnippet(card);
  return `🤝 [${seq}] ${intro}: ${playerLabel} розіграв «${card.title}» (${category}). Коментар: "${flavor}". Ефект: ${effectSummaryToText(summary)}.`;
};

const buildPlayedLyapSystemMessage = (
  seq: number,
  sourcePlayerLabel: string,
  targetPlayerLabel: string,
  card: CardDefinition,
  summary: { resources: Partial<Record<ResourceKey, number>>; rank: number },
) => {
  const category = categoryLabelUk(card.category);
  const flavor = cardFlavorSnippet(card);
  return `🎯 [${seq}] ${sourcePlayerLabel} розіграв «${card.title}» (${category}) на ${targetPlayerLabel}. "${flavor}". Ефект: ${effectSummaryToText(summary)}.`;
};

const buildPlayedScandalSystemMessage = (
  seq: number,
  sourcePlayerLabel: string,
  card: CardDefinition,
  targetSummaries: string[],
) => {
  const category = categoryLabelUk(card.category);
  const flavor = cardFlavorSnippet(card);
  return `📣 [${seq}] ${sourcePlayerLabel} запустив «${card.title}» (${category}) по столу. "${flavor}". Кому прилетіло: ${targetSummaries.join(' | ')}.`;
};

const buildPlayedDecisionSystemMessage = (
  seq: number,
  sourcePlayerLabel: string,
  card: CardDefinition,
  targetSummaries: string[],
) => {
  const flavor = cardFlavorSnippet(card);
  return `🧭 [${seq}] ${sourcePlayerLabel} оголосив «${card.title}» (РІШЕННЯ КОМАНДУВАННЯ). "${flavor}". Наслідки для столу: ${targetSummaries.join(' | ')}.`;
};

const buildPromotionSystemMessage = (
  seq: number,
  playerLabel: string,
  fromRankId: string,
  toRankId: string,
  cost: Partial<Record<ResourceKey, number>>,
  bonus: Partial<Record<ResourceKey, number>>,
  summary: { resources: Partial<Record<ResourceKey, number>>; rank: number },
) => {
  const costText = resourceDeltaToText(costToDelta(cost));
  const bonusText = resourceDeltaToText(bonus);
  const totalText = effectSummaryToText(summary);
  return `🎖️ [${seq}] ${playerLabel} підвищився: ${rankNameById(fromRankId)} → ${rankNameById(toRankId)}. Вартість: ${costText}. Бонус: ${bonusText}. Підсумок: ${totalText}.`;
};

const drawCards = (G: JojGameState, playerID: string, amount: number): void => {
  for (let i = 0; i < amount; i += 1) {
    if (G.deck.length === 0) break;
    const card = G.deck.pop();
    if (card) G.hands[playerID].push(card);
  }
};

const syncPlayerState = (G: JojGameState, playerID: string): void => {
  G.players[playerID].hand = G.hands[playerID];
  G.players[playerID].rankId = G.ranks[playerID];
  G.players[playerID].resources = G.resources[playerID];
};

const rankSeatLimit = (playerCount: number): number => {
  if (playerCount <= 2) return 1;
  if (playerCount <= 4) return 2;
  return 3;
};

const promoteRank = (G: JojGameState, playerID: string, playerCount: number): boolean => {
  const ranks = getActiveRanks();
  const currentRankId = G.ranks[playerID];
  const currentRankIdx = Math.max(0, ranks.findIndex((r) => r.id === currentRankId));
  const nextRank = ranks[currentRankIdx + 1];
  if (!nextRank) return false;

  const occupied = Object.entries(G.ranks)
    .filter(([pid, rankId]) => pid !== playerID && rankId === nextRank.id)
    .length;
  if (occupied >= rankSeatLimit(playerCount)) return false;

  const playerResources = G.resources[playerID];
  if (!hasResources(playerResources, nextRank.requirement)) return false;
  if (!hasResources(playerResources, nextRank.cost)) return false;
  spendResources(playerResources, nextRank.cost);
  applyResourceDelta(playerResources, nextRank.bonus);
  clampNonNegativeResources(playerResources);
  G.ranks[playerID] = nextRank.id;
  syncPlayerState(G, playerID);
  return true;
};

const getWinner = (G: JojGameState): string | undefined => {
  const topRankId = getTopRankId();
  const generalPlayer = Object.entries(G.ranks).find(([, rankId]) => rankId === topRankId)?.[0];
  if (generalPlayer) return generalPlayer;
  if (G.deck.length === 0) {
    const hasCardsInHands = Object.values(G.hands).some((hand) => hand.length > 0);
    if (hasCardsInHands) return undefined;
    return Object.entries(G.resources)
      .sort(([, a], [, b]) =>
        resourceKeys.reduce((sum, key) => sum + (b[key] - a[key]), 0),
      )
      .at(0)?.[0];
  }
  return undefined;
};

export type SimulationReport = {
  input: {
    players: number;
    simulations: number;
    maxTurns: number;
  };
  generatedAt: string;
  summary: {
    finished: number;
    stalled: number;
    avgTurns: number;
    avgDeckDepletionTurn: number;
    rankWins: number;
    scoreWins: number;
    avgPassesPerGame: number;
  };
  seatWinRates: Array<{
    playerID: string;
    wins: number;
    winRatePct: number;
  }>;
  rankReached: Record<string, number>;
  topReachedRanks: Array<{
    rankId: string;
    games: number;
    pct: number;
  }>;
  topReachedRanksByPct: Array<{
    rankId: string;
    games: number;
    pct: number;
  }>;
  lastGame: {
    winnerPlayerID: string;
    winnerRankId: string;
    winnerResources: Record<ResourceKey, number>;
    turns: number;
  };
  issues: string[];
};

const chooseLyapTarget = (G: JojGameState, sourcePlayerID: string): string | null => {
  const activeRanks = getActiveRanks();
  const rankIndex = (playerID: string) => activeRanks.findIndex((r) => r.id === G.ranks[playerID]);
  const score = (playerID: string) =>
    resourceKeys.reduce((sum, key) => sum + (G.resources[playerID][key] ?? 0), 0) + rankIndex(playerID) * 2;
  const candidates = Object.keys(G.players).filter((pid) => pid !== sourcePlayerID);
  if (!candidates.length) return null;
  return [...candidates].sort((a, b) => score(b) - score(a))[0];
};

const buildReplacementPlan = (
  resources: Record<ResourceKey, number>,
  effects: CardDefinition['effects'],
): ResourceKey[] | null => planReplacementResources(resources, effects);

const simulateSingleMatch = (
  numPlayers: number,
  maxTurns: number,
): {
  winner: string;
  turns: number;
  stalled: boolean;
  deckDepletionTurn: number;
  wonByRank: boolean;
  passes: number;
  reachedRanks: Record<string, string>;
  finalResources: Record<string, Record<ResourceKey, number>>;
} => {
  const playerIDs = Array.from({ length: numPlayers }, (_, i) => String(i));
  const G: JojGameState = {
    deck: shuffle(sharedDeckTemplate.deck.map(cloneCard)),
    discard: [],
    legendaryDeck: shuffle(sharedDeckTemplate.legendaryDeck.map(cloneCard)),
    deckBackImage: sharedDeckTemplate.deckBackImage,
    systemMessageSeq: 0,
    playerNames: {},
    chat: [],
    players: {},
    hands: {},
    ranks: {},
    resources: {},
    promotedThisTurn: {},
  };

  playerIDs.forEach((pid, index) => {
    G.hands[pid] = [];
    G.ranks[pid] = getActiveRanks()[0]?.id ?? 'cadet';
    G.resources[pid] = { time: 2, reputation: 2, discipline: 2, documents: 2, tech: 2 };
    G.players[pid] = { hand: G.hands[pid], rankId: G.ranks[pid], resources: G.resources[pid] };
    G.playerNames[pid] = `P${index + 1}`;
    G.promotedThisTurn[pid] = false;
    drawCards(G, pid, STARTING_HAND_SIZE);
    syncPlayerState(G, pid);
  });

  let currentIdx = 0;
  let turns = 0;
  let deckDepletionTurn = -1;
  let passes = 0;
  const tryPromoteOnce = (pid: string) => promoteRank(G, pid, numPlayers);

  while (turns < maxTurns) {
    const playerID = playerIDs[currentIdx];
    const hand = G.hands[playerID];
    let stage: 'play' | 'end' = 'play';

    if (G.deck.length > 0) {
      const card = G.deck.pop();
      if (card) {
        if (card.category === 'LYAP') {
          applyCardEffectsSoft(G, playerID, card.effects);
          G.discard.push(card);
          stage = 'end';
        } else if (card.category === 'SCANDAL') {
          playerIDs.forEach((pid) => {
            applyCardEffectsSoft(G, pid, card.effects);
            syncPlayerState(G, pid);
          });
          G.discard.push(card);
          stage = 'end';
        } else {
          hand.push(card);
          stage = 'play';
        }
      }
      if (G.deck.length === 0 && deckDepletionTurn < 0) {
        deckDepletionTurn = turns + 1;
      }
    }

    if (stage === 'play') {
      let promotedThisTurn = tryPromoteOnce(playerID);
      let played = false;
      for (let i = 0; i < hand.length; i += 1) {
        const card = hand[i];
        const allPlayerIDs = playerIDs;

        if (card.category === 'LYAP') {
          const target = chooseLyapTarget(G, playerID);
          if (!target) continue;
          applyCardEffectsSoft(G, target, card.effects);
          syncPlayerState(G, target);
        } else if (card.category === 'SCANDAL') {
          allPlayerIDs.filter((pid) => pid !== playerID).forEach((pid) => {
            applyCardEffectsSoft(G, pid, card.effects);
            syncPlayerState(G, pid);
          });
        } else if (card.category === 'DECISION') {
          allPlayerIDs.forEach((pid) => {
            applyCardEffectsSoft(G, pid, card.effects);
            syncPlayerState(G, pid);
          });
        } else {
          const replacement = buildReplacementPlan(G.resources[playerID], card.effects);
          if (replacement === null) continue;
          try {
            const ok = applyCardEffects(G, playerID, card.effects, replacement);
            if (!ok) continue;
          } catch {
            continue;
          }
        }

        hand.splice(i, 1);
        G.discard.push(card);
        syncPlayerState(G, playerID);
        if (!promotedThisTurn) {
          promotedThisTurn = tryPromoteOnce(playerID);
        }
        played = true;
        break;
      }

      if (!played) {
        passes += 1;
      }
    } else {
      passes += 1;
    }

    turns += 1;
    const winner = getWinner(G);
    if (winner) {
      return {
        winner,
        turns,
        stalled: false,
        deckDepletionTurn,
        wonByRank: G.ranks[winner] === getTopRankId(),
        passes,
        reachedRanks: { ...G.ranks },
        finalResources: Object.fromEntries(
          Object.entries(G.resources).map(([pid, row]) => [pid, { ...row }]),
        ) as Record<string, Record<ResourceKey, number>>,
      };
    }

    currentIdx = (currentIdx + 1) % playerIDs.length;
  }

  const fallbackWinner = Object.entries(G.resources)
    .sort(([, a], [, b]) => resourceKeys.reduce((sum, key) => sum + (b[key] - a[key]), 0))
    .at(0)?.[0] ?? '0';

  return {
    winner: fallbackWinner,
    turns: maxTurns,
    stalled: true,
    deckDepletionTurn,
    wonByRank: G.ranks[fallbackWinner] === getTopRankId(),
    passes,
    reachedRanks: { ...G.ranks },
    finalResources: Object.fromEntries(
      Object.entries(G.resources).map(([pid, row]) => [pid, { ...row }]),
    ) as Record<string, Record<ResourceKey, number>>,
  };
};

export const runGameSimulations = (
  players: number,
  simulations: number,
  maxTurns = 600,
): SimulationReport => {
  const clampedPlayers = Math.max(2, Math.min(6, Math.floor(players || 2)));
  const clampedSims = Math.max(1, Math.min(5000, Math.floor(simulations || 1)));
  const clampedMaxTurns = Math.max(20, Math.min(4000, Math.floor(maxTurns || 600)));
  const wins: Record<string, number> = {};
  const rankReached: Record<string, number> = {};
  let totalTurns = 0;
  let stalled = 0;
  let rankWins = 0;
  let scoreWins = 0;
  let passesTotal = 0;
  let deckDepletionTotal = 0;
  let deckDepletionKnown = 0;
  const highestRankReachedByGame: Record<string, number> = {};
  let lastGame: SimulationReport['lastGame'] = {
    winnerPlayerID: '0',
    winnerRankId: getActiveRanks()[0]?.id ?? 'cadet',
    winnerResources: { time: 0, reputation: 0, discipline: 0, documents: 0, tech: 0 },
    turns: 0,
  };

  for (let i = 0; i < clampedSims; i += 1) {
    const result = simulateSingleMatch(clampedPlayers, clampedMaxTurns);
    wins[result.winner] = (wins[result.winner] ?? 0) + 1;
    totalTurns += result.turns;
    passesTotal += result.passes;
    if (result.stalled) stalled += 1;
    if (result.wonByRank) rankWins += 1;
    else scoreWins += 1;
    if (result.deckDepletionTurn >= 0) {
      deckDepletionTotal += result.deckDepletionTurn;
      deckDepletionKnown += 1;
    }
    Object.values(result.reachedRanks).forEach((rankId) => {
      rankReached[rankId] = (rankReached[rankId] ?? 0) + 1;
    });
    const activeRanks = getActiveRanks();
    const highest = Object.values(result.reachedRanks)
      .map((rankId) => ({ rankId, idx: activeRanks.findIndex((r) => r.id === rankId) }))
      .sort((a, b) => b.idx - a.idx)[0];
    if (highest?.rankId) {
      highestRankReachedByGame[highest.rankId] = (highestRankReachedByGame[highest.rankId] ?? 0) + 1;
    }
    lastGame = {
      winnerPlayerID: result.winner,
      winnerRankId: result.reachedRanks[result.winner] ?? (getActiveRanks()[0]?.id ?? 'cadet'),
      winnerResources: { ...result.finalResources[result.winner] },
      turns: result.turns,
    };
  }

  const activeRanks = getActiveRanks();
  const topReachedRanks = Object.entries(highestRankReachedByGame)
    .map(([rankId, games]) => ({
      rankId,
      games,
      pct: Number(((games / clampedSims) * 100).toFixed(2)),
      idx: activeRanks.findIndex((r) => r.id === rankId),
    }))
    .sort((a, b) => b.idx - a.idx || b.games - a.games)
    .slice(0, 3)
    .map(({ rankId, games, pct }) => ({ rankId, games, pct }));
  const topReachedRanksByPct = Object.entries(highestRankReachedByGame)
    .map(([rankId, games]) => ({
      rankId,
      games,
      pct: Number(((games / clampedSims) * 100).toFixed(2)),
      idx: activeRanks.findIndex((r) => r.id === rankId),
    }))
    .sort((a, b) => b.games - a.games || b.pct - a.pct || b.idx - a.idx)
    .slice(0, 3)
    .map(({ rankId, games, pct }) => ({ rankId, games, pct }));

  const seatWinRates = Array.from({ length: clampedPlayers }, (_, i) => String(i)).map((playerID) => {
    const seatWins = wins[playerID] ?? 0;
    return {
      playerID,
      wins: seatWins,
      winRatePct: Number(((seatWins / clampedSims) * 100).toFixed(2)),
    };
  });

  const issues: string[] = [];
  if (stalled > 0) {
    issues.push(
      `Виявлено ${stalled} зациклених/довгих матчів із ${clampedSims} (ліміт ${clampedMaxTurns} ходів).`,
    );
  }
  const bestSeat = [...seatWinRates].sort((a, b) => b.winRatePct - a.winRatePct)[0];
  const worstSeat = [...seatWinRates].sort((a, b) => a.winRatePct - b.winRatePct)[0];
  if (bestSeat && worstSeat && bestSeat.winRatePct - worstSeat.winRatePct >= 12) {
    issues.push(
      `Можлива перевага порядку ходу: seat ${bestSeat.playerID} (${bestSeat.winRatePct}%) vs seat ${worstSeat.playerID} (${worstSeat.winRatePct}%).`,
    );
  }
  if (rankWins === 0) {
    issues.push('У симуляціях не зафіксовано перемог через звання Генерала (можливо завеликі вимоги або замалий темп ресурсів).');
  }

  return {
    input: {
      players: clampedPlayers,
      simulations: clampedSims,
      maxTurns: clampedMaxTurns,
    },
    generatedAt: new Date().toISOString(),
    summary: {
      finished: clampedSims - stalled,
      stalled,
      avgTurns: Number((totalTurns / clampedSims).toFixed(2)),
      avgDeckDepletionTurn: Number(
        (deckDepletionKnown > 0 ? deckDepletionTotal / deckDepletionKnown : 0).toFixed(2),
      ),
      rankWins,
      scoreWins,
      avgPassesPerGame: Number((passesTotal / clampedSims).toFixed(2)),
    },
    seatWinRates,
    rankReached,
    topReachedRanks,
    topReachedRanksByPct,
    lastGame,
    issues,
  };
};

export const jojGame: Game<JojGameState> = {
  name: 'joj-game',
  minPlayers: 2,
  maxPlayers: 6,
  setup: ({ ctx }) => {
    const players = [...ctx.playOrder];
    const deck = shuffle(sharedDeckTemplate.deck.map(cloneCard));

    const state: JojGameState = {
      deck,
      discard: [],
      legendaryDeck: shuffle(sharedDeckTemplate.legendaryDeck.map(cloneCard)),
      deckBackImage: sharedDeckTemplate.deckBackImage,
      systemMessageSeq: 0,
      playerNames: {},
      chat: [],
      players: {},
      hands: {},
      ranks: {},
      resources: {},
      promotedThisTurn: {},
    };

    players.forEach((playerID) => {
      state.hands[playerID] = [];
      state.ranks[playerID] = getActiveRanks()[0]?.id ?? 'cadet';
      state.resources[playerID] = {
        time: 2,
        reputation: 2,
        discipline: 2,
        documents: 2,
        tech: 2,
      };
      state.players[playerID] = {
        hand: state.hands[playerID],
        rankId: state.ranks[playerID],
        resources: state.resources[playerID],
      };
      state.promotedThisTurn[playerID] = false;
      state.playerNames[playerID] = '';
      drawCards(state, playerID, STARTING_HAND_SIZE);
    });

    return state;
  },
  turn: {
    activePlayers: { currentPlayer: DRAW_STAGE },
    onBegin: ({ G, ctx, events }) => {
      Object.keys(G.promotedThisTurn).forEach((pid) => {
        G.promotedThisTurn[pid] = false;
      });
      const value: Record<string, string> = {};
      ctx.playOrder.forEach((pid) => {
        value[pid] = IDLE_STAGE;
      });
      value[ctx.currentPlayer] = G.deck.length > 0 ? DRAW_STAGE : PLAY_STAGE;
      events?.setActivePlayers({ value });
    },
  },
  moves: {
    syncPlayerNames: (args, names: Record<string, string>) => {
      if (!names || typeof names !== 'object') return INVALID_MOVE;
      Object.entries(names).forEach(([pid, value]) => {
        if (!(pid in args.G.players)) return;
        const trimmed = value.trim();
        if (!trimmed) return;
        args.G.playerNames[pid] = trimmed.slice(0, 32);
      });
      return undefined;
    },
    setPlayerName: (args, name: string) => {
      const playerID = args.playerID;
      if (!playerID) return INVALID_MOVE;
      const trimmed = name.trim();
      if (!trimmed) return INVALID_MOVE;
      args.G.playerNames[playerID] = trimmed.slice(0, 32);
      return undefined;
    },
    sendChat: (args, text: string) => {
      const playerID = args.playerID;
      if (!playerID) return INVALID_MOVE;
      const trimmed = text.trim();
      if (!trimmed) return INVALID_MOVE;
      appendChat(args.G, {
        type: 'player',
        playerID,
        text: trimmed.slice(0, 280),
      });
      return undefined;
    },
    drawCard: (args) => {
      const playerID = args.playerID;
      if (!playerID || args.ctx.currentPlayer !== playerID) return INVALID_MOVE;
      if (args.ctx.activePlayers?.[playerID] !== DRAW_STAGE) return INVALID_MOVE;

      const hand = args.G.hands[playerID];
      if (hand.length >= HAND_LIMIT) return INVALID_MOVE;
      let autoPlayed = false;
      const card = args.G.deck.pop();
      if (card) {
        if (card.category === 'LYAP') {
          // Drawn LYAP auto-triggers on the player who drew it.
          const summary = applyCardEffectsSoft(args.G, playerID, card.effects);
          const seq = nextSystemMessageSeq(args.G);
          appendChat(args.G, {
            type: 'system',
            text: buildLyapSystemMessage(seq, getPlayerLabel(args.G, playerID), card, summary),
          });
          args.G.discard.push(card);
          autoPlayed = true;
        } else if (card.category === 'SCANDAL') {
          // Drawn SCANDAL auto-triggers on all players at the table.
          const targetSummaries: string[] = [];
          Object.keys(args.G.players).forEach((pid) => {
            const summary = applyCardEffectsSoft(args.G, pid, card.effects);
            targetSummaries.push(`${getPlayerLabel(args.G, pid)}: ${effectSummaryToText(summary)}`);
            syncPlayerState(args.G, pid);
          });
          const seq = nextSystemMessageSeq(args.G);
          appendChat(args.G, {
            type: 'system',
            text: buildScandalSystemMessage(seq, getPlayerLabel(args.G, playerID), card, targetSummaries),
          });
          args.G.discard.push(card);
          autoPlayed = true;
        } else {
          hand.push(card);
        }
      }
      syncPlayerState(args.G, playerID);
      args.events?.setStage(autoPlayed ? END_STAGE : PLAY_STAGE);
      return undefined;
    },
    playCard: (
      args,
      cardId: string,
      replacementResources: ResourceKey[] = [],
      targetPlayerID?: string,
    ) => {
      const playerID = args.playerID;
      if (!playerID || args.ctx.currentPlayer !== playerID) return INVALID_MOVE;
      if (args.ctx.activePlayers?.[playerID] !== PLAY_STAGE) return INVALID_MOVE;

      const hand = args.G.hands[playerID];
      const idx = hand.findIndex((card) => card.id === cardId);
      if (idx === -1) return INVALID_MOVE;

      const card = hand[idx];
      const allPlayerIDs = Object.keys(args.G.players);
      const applySoftTo = (pid: string) => {
        const summary = applyCardEffectsSoft(args.G, pid, card.effects);
        syncPlayerState(args.G, pid);
        return summary;
      };

      if (card.category === 'LYAP') {
        if (!targetPlayerID || targetPlayerID === playerID || !(targetPlayerID in args.G.players)) {
          return INVALID_MOVE;
        }
        const summary = applySoftTo(targetPlayerID);
        const seq = nextSystemMessageSeq(args.G);
        appendChat(args.G, {
          type: 'system',
          text: buildPlayedLyapSystemMessage(
            seq,
            getPlayerLabel(args.G, playerID),
            getPlayerLabel(args.G, targetPlayerID),
            card,
            summary,
          ),
        });
      } else if (card.category === 'SCANDAL') {
        const targetSummaries: string[] = [];
        allPlayerIDs
          .filter((pid) => pid !== playerID)
          .forEach((pid) => {
            const summary = applySoftTo(pid);
            targetSummaries.push(`${getPlayerLabel(args.G, pid)}: ${effectSummaryToText(summary)}`);
          });
        const seq = nextSystemMessageSeq(args.G);
        appendChat(args.G, {
          type: 'system',
          text: buildPlayedScandalSystemMessage(seq, getPlayerLabel(args.G, playerID), card, targetSummaries),
        });
      } else if (card.category === 'SUPPORT') {
        const beforeResources = { ...args.G.resources[playerID] };
        const beforeRankId = args.G.ranks[playerID];
        try {
          const applied = applyCardEffects(args.G, playerID, card.effects, replacementResources);
          if (!applied) return INVALID_MOVE;
        } catch {
          return INVALID_MOVE;
        }
        const summary = summarizeAppliedDiff(
          beforeResources,
          args.G.resources[playerID],
          beforeRankId,
          args.G.ranks[playerID],
        );
        const seq = nextSystemMessageSeq(args.G);
        appendChat(args.G, {
          type: 'system',
          text: buildSupportSystemMessage(seq, getPlayerLabel(args.G, playerID), card, summary),
        });
      } else if (card.category === 'DECISION') {
        const targetSummaries: string[] = [];
        let invalidDecisionReplacement = false;
        allPlayerIDs.forEach((pid) => {
          if (invalidDecisionReplacement) return;
          if (pid === playerID) {
            const beforeResources = { ...args.G.resources[playerID] };
            const beforeRankId = args.G.ranks[playerID];
            try {
              const applied = applyCardEffects(args.G, playerID, card.effects, replacementResources);
              if (!applied) {
                invalidDecisionReplacement = true;
                return;
              }
            } catch {
              invalidDecisionReplacement = true;
              return;
            }
            const summary = summarizeAppliedDiff(
              beforeResources,
              args.G.resources[playerID],
              beforeRankId,
              args.G.ranks[playerID],
            );
            targetSummaries.push(`${getPlayerLabel(args.G, pid)}: ${effectSummaryToText(summary)}`);
            syncPlayerState(args.G, pid);
            return;
          }
          const summary = applySoftTo(pid);
          targetSummaries.push(`${getPlayerLabel(args.G, pid)}: ${effectSummaryToText(summary)}`);
        });
        if (invalidDecisionReplacement) return INVALID_MOVE;
        const seq = nextSystemMessageSeq(args.G);
        appendChat(args.G, {
          type: 'system',
          text: buildPlayedDecisionSystemMessage(seq, getPlayerLabel(args.G, playerID), card, targetSummaries),
        });
      } else {
        try {
          const applied = applyCardEffects(args.G, playerID, card.effects, replacementResources);
          if (!applied) return INVALID_MOVE;
        } catch {
          return INVALID_MOVE;
        }
      }

      hand.splice(idx, 1);
      args.G.discard.push(card);

      while (hand.length > HAND_LIMIT) {
        const overflow = hand.shift();
        if (overflow) args.G.discard.push(overflow);
      }

      syncPlayerState(args.G, playerID);
      args.events?.setStage(END_STAGE);
      return undefined;
    },
    promote: (args) => {
      const playerID = args.playerID;
      if (!playerID || args.ctx.currentPlayer !== playerID) return INVALID_MOVE;
      if (args.ctx.activePlayers?.[playerID] !== PLAY_STAGE) return INVALID_MOVE;
      if (args.G.promotedThisTurn[playerID]) return INVALID_MOVE;
      const beforeResources = { ...args.G.resources[playerID] };
      const beforeRankId = args.G.ranks[playerID];
      const playerCount = Object.keys(args.G.players).length || Number(args.ctx.numPlayers ?? 0) || 2;
      if (!promoteRank(args.G, playerID, playerCount)) return INVALID_MOVE;
      args.G.promotedThisTurn[playerID] = true;
      const afterRankId = args.G.ranks[playerID];
      const promotedRank = getActiveRanks().find((row) => row.id === afterRankId);
      const summary = summarizeAppliedDiff(
        beforeResources,
        args.G.resources[playerID],
        beforeRankId,
        afterRankId,
      );
      const seq = nextSystemMessageSeq(args.G);
      appendChat(args.G, {
        type: 'system',
        text: buildPromotionSystemMessage(
          seq,
          getPlayerLabel(args.G, playerID),
          beforeRankId,
          afterRankId,
          promotedRank?.cost ?? {},
          promotedRank?.bonus ?? {},
          summary,
        ),
      });
      return undefined;
    },
    pass: (args) => {
      const playerID = args.playerID;
      if (!playerID || args.ctx.currentPlayer !== playerID) return INVALID_MOVE;
      if (![PLAY_STAGE, END_STAGE].includes(args.ctx.activePlayers?.[playerID] as string)) return INVALID_MOVE;
      args.events?.endTurn();
      return undefined;
    },
  },
  endIf: ({ G }) => {
    const winner = getWinner(G);
    if (!winner) return undefined;
    return { winner };
  },
  ai: {
    enumerate: (G, ctx, playerID) => {
      const currentPlayer = playerID ?? ctx.currentPlayer;
      const hand = G.hands[currentPlayer] ?? [];
      const stage = ctx.activePlayers?.[currentPlayer];
      if (stage === DRAW_STAGE) {
        return [{ move: 'drawCard' as const }];
      }
      if (stage === END_STAGE) {
        return [{ move: 'pass' as const }];
      }
      return [
        ...hand.map((card) => ({ move: 'playCard' as const, args: [card.id] })),
        { move: 'promote' as const },
        { move: 'pass' as const },
      ];
    },
  },
  playerView: ({ G, ctx, playerID }) => {
    if (!playerID) return G;
    const filteredHands: JojGameState['hands'] = {};
    Object.entries(G.hands as Record<string, CardDefinition[]>).forEach(([pid, cards]) => {
      filteredHands[pid] = pid === playerID ? cards : cards.map(({ id, title, category, image, effects, flavor }) => ({
        id,
        title,
        category,
        image,
        effects,
        flavor,
      }));
    });
    const filteredPlayers: JojGameState['players'] = {};
    Object.entries(G.players).forEach(([pid, state]) => {
      filteredPlayers[pid] = {
        ...state,
        hand: filteredHands[pid],
      };
    });

    return {
      ...G,
      players: filteredPlayers,
      hands: filteredHands,
      deck: ctx.gameover ? G.deck : new Array(G.deck.length).fill({ id: 'hidden', title: 'Hidden', category: 'NEUTRAL' }),
    };
  },
};

export type JojCtx = Ctx;
