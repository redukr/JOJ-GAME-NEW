import { INVALID_MOVE } from 'boardgame.io/core';
import type { Ctx, Game } from 'boardgame.io';
import { baseDeck, legendaryCards } from './cards';
import { GENERAL_RANK_ID, ranks } from './ranks';
import type { CardDefinition, JojGameState, ResourceKey } from './types';

const STARTING_HAND_SIZE = 5;
const HAND_LIMIT = 8;
const DRAW_STAGE = 'draw';
const PLAY_STAGE = 'play';

const resourceKeys: ResourceKey[] = ['time', 'reputation', 'discipline', 'documents', 'tech'];

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
    resources[key] -= cost[key] ?? 0;
  });
};

const applyCardReward = (resources: Record<ResourceKey, number>, category: CardDefinition['category']) => {
  const map: Record<CardDefinition['category'], ResourceKey> = {
    LYAP: 'discipline',
    SCANDAL: 'reputation',
    SUPPORT: 'documents',
    DECISION: 'time',
    NEUTRAL: 'time',
    VVNZ: 'tech',
    LEGENDARY: 'reputation',
  };
  const key = map[category];
  resources[key] += category === 'LEGENDARY' ? 2 : 1;
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
  maxPlayers: 4,
  setup: ({ ctx }) => {
    const players = [...ctx.playOrder];
    const deck = shuffle(baseDeck);

    const state: JojGameState = {
      deck,
      discard: [],
      legendaryDeck: shuffle(legendaryCards),
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
      drawCards(state, playerID, STARTING_HAND_SIZE);
    });

    return state;
  },
  turn: {
    activePlayers: { currentPlayer: DRAW_STAGE },
    onBegin: ({ events }) => {
      events?.setActivePlayers({ currentPlayer: DRAW_STAGE });
    },
  },
  moves: {
    drawCard: (args) => {
      const playerID = args.playerID;
      if (!playerID || args.ctx.currentPlayer !== playerID) return INVALID_MOVE;
      if (args.ctx.activePlayers?.[playerID] !== DRAW_STAGE) return INVALID_MOVE;

      const hand = args.G.hands[playerID];
      if (hand.length >= HAND_LIMIT) return INVALID_MOVE;

      drawCards(args.G, playerID, 1);
      syncPlayerState(args.G, playerID);
      args.events?.setStage(PLAY_STAGE);
      return undefined;
    },
    playCard: (args, cardId: string) => {
      const playerID = args.playerID;
      if (!playerID || args.ctx.currentPlayer !== playerID) return INVALID_MOVE;
      if (args.ctx.activePlayers?.[playerID] !== PLAY_STAGE) return INVALID_MOVE;

      const hand = args.G.hands[playerID];
      const idx = hand.findIndex((card) => card.id === cardId);
      if (idx === -1) return INVALID_MOVE;

      const card = hand[idx];
      const playerResources = args.G.resources[playerID];

      if (!hasResources(playerResources, card.cost)) return INVALID_MOVE;

      spendResources(playerResources, card.cost);
      applyCardReward(playerResources, card.category);

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
  playerView: (G, ctx, playerID) => {
    if (!playerID) return G;
    const filteredHands: JojGameState['hands'] = {};
    Object.entries(G.hands).forEach(([pid, cards]) => {
      filteredHands[pid] = pid === playerID ? cards : cards.map(({ id, title, category, cost, image }) => ({
        id,
        title,
        category,
        cost,
        image,
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
      deck: ctx.gameover ? G.deck : new Array(G.deck.length).fill({ id: 'hidden', title: 'Hidden', category: 'NEUTRAL', cost: {} }),
    };
  },
};

export type JojCtx = Ctx;
