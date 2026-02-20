import type { RankDefinition } from './types';

export const ranks: RankDefinition[] = [
  {
    id: 'cadet',
    name: 'Cadet',
    requirement: {},
    cost: {},
  },
  {
    id: 'captain',
    name: 'Captain',
    requirement: { reputation: 3, discipline: 3 },
    cost: { time: 1 },
  },
  {
    id: 'colonel',
    name: 'Colonel',
    requirement: { reputation: 5, discipline: 5, documents: 3 },
    cost: { time: 2, tech: 1 },
  },
  {
    id: 'general',
    name: 'General',
    requirement: { reputation: 8, discipline: 8, documents: 5, tech: 4 },
    cost: { time: 3 },
  },
];

export const GENERAL_RANK_ID = 'general';
