import type { Ctx, Game } from 'boardgame.io';
import { baseDeck, legendaryCards } from './cards';
import { GENERAL_RANK_ID, ranks } from './ranks';
import type { CardDefinition, JojGameState, ResourceKey } from './types';

const INVALID_MOVE = 'INVALID_MOVE' as const;
const STARTING_HAND_SIZE = 5;
const HAND_LIMIT = 8;
const DRAW_STAGE = 'draw';
const PLAY_STAGE = 'play';
const CHAT_LIMIT = 200;

const resourceKeys: ResourceKey[] = ['time', 'reputation', 'discipline', 'documents', 'tech'];
const resourceLabelsUk: Record<ResourceKey, string> = {
  time: 'Час',
  reputation: 'Авторитет',
  discipline: 'Дисципліна',
  documents: 'Документи',
  tech: 'Технології',
};

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

const getPlayerLabel = (G: JojGameState, playerID: string) => G.playerNames[playerID] || `Гравець #${playerID}`;

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

type SharedDeckTemplate = {
  deck: CardDefinition[];
  legendaryDeck: CardDefinition[];
  deckBackImage?: string;
};

export type DeckTarget = keyof SharedDeckTemplate;

const defaultSharedDeckTemplate = (): SharedDeckTemplate => ({
  deck: baseDeck.map(cloneCard),
  legendaryDeck: legendaryCards.map(cloneCard),
  deckBackImage: undefined,
});

let sharedDeckTemplate: SharedDeckTemplate = defaultSharedDeckTemplate();

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
    const value = cost[key] ?? 0;
    resources[key] -= Math.abs(value);
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

export const getReplacementUnitsForCard = (
  resources: Record<ResourceKey, number>,
  card: CardDefinition,
): number => replacementCostUnits(resources, card.effects);

const shiftRank = (G: JojGameState, playerID: string, delta: number) => {
  if (delta === 0) return;
  const currentRankId = G.ranks[playerID];
  const currentRankIdx = ranks.findIndex((r) => r.id === currentRankId);
  if (currentRankIdx < 0) return;
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
  return true;
};

const applyCardEffectsSoft = (
  G: JojGameState,
  playerID: string,
  effects: CardDefinition['effects'],
): { resources: Partial<Record<ResourceKey, number>>; rank: number } => {
  const summary: { resources: Partial<Record<ResourceKey, number>>; rank: number } = { resources: {}, rank: 0 };
  if (!effects?.length) return summary;
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

const promoteRank = (G: JojGameState, playerID: string): boolean => {
  const currentRankId = G.ranks[playerID];
  const currentRankIdx = ranks.findIndex((r) => r.id === currentRankId);
  const nextRank = ranks[currentRankIdx + 1];
  if (!nextRank) return false;

  const playerResources = G.resources[playerID];
  if (!hasResources(playerResources, nextRank.requirement)) return false;
  if (!hasResources(playerResources, nextRank.cost)) return false;

  spendResources(playerResources, nextRank.cost);
  G.ranks[playerID] = nextRank.id;
  syncPlayerState(G, playerID);
  return true;
};

const getWinner = (G: JojGameState): string | undefined => {
  const generalPlayer = Object.entries(G.ranks).find(([, rankId]) => rankId === GENERAL_RANK_ID)?.[0];
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
      playerNames: {},
      chat: [],
      players: {},
      hands: {},
      ranks: {},
      resources: {},
    };

    players.forEach((playerID) => {
      state.hands[playerID] = [];
      state.ranks[playerID] = 'cadet';
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
      state.playerNames[playerID] = `Гравець #${playerID}`;
      drawCards(state, playerID, STARTING_HAND_SIZE);
    });

    return state;
  },
  turn: {
    activePlayers: { currentPlayer: DRAW_STAGE },
    onBegin: ({ G, events }) => {
      events?.setActivePlayers({ currentPlayer: G.deck.length > 0 ? DRAW_STAGE : PLAY_STAGE });
    },
  },
  moves: {
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
          appendChat(args.G, {
            type: 'system',
            text: `⚠️ ${getPlayerLabel(args.G, playerID)} витягнув ЛЯП «${card.title}». Система посміхнулась і нарахувала: ${effectSummaryToText(summary)}.`,
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
          appendChat(args.G, {
            type: 'system',
            text: `🗞️ ${getPlayerLabel(args.G, playerID)} витягнув СКАНДАЛ «${card.title}». Грянув загальний розбір польотів: ${targetSummaries.join(' | ')}.`,
          });
          args.G.discard.push(card);
          autoPlayed = true;
        } else {
          hand.push(card);
        }
      }
      syncPlayerState(args.G, playerID);
      if (autoPlayed) {
        args.events?.endTurn();
      } else {
        args.events?.setStage(PLAY_STAGE);
      }
      return undefined;
    },
    playCard: (args, cardId: string, replacementResources: ResourceKey[] = []) => {
      const playerID = args.playerID;
      if (!playerID || args.ctx.currentPlayer !== playerID) return INVALID_MOVE;
      if (args.ctx.activePlayers?.[playerID] !== PLAY_STAGE) return INVALID_MOVE;

      const hand = args.G.hands[playerID];
      const idx = hand.findIndex((card) => card.id === cardId);
      if (idx === -1) return INVALID_MOVE;

      const card = hand[idx];
      try {
        const applied = applyCardEffects(args.G, playerID, card.effects, replacementResources);
        if (!applied) return INVALID_MOVE;
      } catch {
        return INVALID_MOVE;
      }

      hand.splice(idx, 1);
      args.G.discard.push(card);

      while (hand.length > HAND_LIMIT) {
        const overflow = hand.shift();
        if (overflow) args.G.discard.push(overflow);
      }

      syncPlayerState(args.G, playerID);
      args.events?.endTurn();
      return undefined;
    },
    promote: (args) => {
      const playerID = args.playerID;
      if (!playerID || args.ctx.currentPlayer !== playerID) return INVALID_MOVE;
      if (args.ctx.activePlayers?.[playerID] !== PLAY_STAGE) return INVALID_MOVE;
      if (!promoteRank(args.G, playerID)) return INVALID_MOVE;
      return undefined;
    },
    pass: (args) => {
      const playerID = args.playerID;
      if (!playerID || args.ctx.currentPlayer !== playerID) return INVALID_MOVE;
      if (args.ctx.activePlayers?.[playerID] !== PLAY_STAGE) return INVALID_MOVE;
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
