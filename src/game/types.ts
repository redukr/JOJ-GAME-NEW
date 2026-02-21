export type ResourceKey = 'time' | 'reputation' | 'discipline' | 'documents' | 'tech';
export type EffectResource = ResourceKey | 'rank';

export type CardCategory =
  | 'LYAP'
  | 'SCANDAL'
  | 'SUPPORT'
  | 'DECISION'
  | 'NEUTRAL'
  | 'VVNZ'
  | 'LEGENDARY';

export interface PlayerState {
  hand: Card[];
  rankId: string;
  resources: Record<ResourceKey, number>;
}

export interface Card {
  id: string;
  title: string;
  category: CardCategory;
  cost?: Partial<Record<ResourceKey, number>>;
  image?: string;
  effects?: Array<{
    resource: EffectResource;
    value: number;
  }>;
  flavor?: string;
}

export interface Rank {
  id: string;
  name: string;
  requirement: Partial<Record<ResourceKey, number>>;
  cost: Partial<Record<ResourceKey, number>>;
  bonus: Partial<Record<ResourceKey, number>>;
}

export interface JOJState {
  deck: Card[];
  discard: Card[];
  legendaryDeck: Card[];
  deckBackImage?: string;
  systemMessageSeq: number;
  playerNames: Record<string, string>;
  chat: Array<{
    id: string;
    type: 'player' | 'system';
    text: string;
    playerID?: string;
    createdAt: number;
  }>;
  players: Record<string, PlayerState>;
  hands: Record<string, Card[]>;
  ranks: Record<string, string>;
  resources: Record<string, Record<ResourceKey, number>>;
  promotedThisTurn: Record<string, boolean>;
}

// Backward-compatible aliases for existing code.
export type CardDefinition = Card;
export type RankDefinition = Rank;
export type JojGameState = JOJState;
