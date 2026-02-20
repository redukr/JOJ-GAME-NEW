import type { CardDefinition } from './types';

const defaultCost = {};

export const baseDeck: CardDefinition[] = [
  { id: 'lyap-01', title: 'Protocol Slip', category: 'LYAP', cost: { discipline: 1 } },
  { id: 'scandal-01', title: 'Leaked Memo', category: 'SCANDAL', cost: { reputation: 1 } },
  { id: 'support-01', title: 'Quiet Ally', category: 'SUPPORT', cost: { documents: 1 } },
  { id: 'decision-01', title: 'Emergency Decree', category: 'DECISION', cost: { time: 1 } },
  { id: 'neutral-01', title: 'Coffee Break', category: 'NEUTRAL', cost: defaultCost },
  { id: 'vvnz-01', title: 'VVNZ Directive', category: 'VVNZ', cost: { tech: 1 } },
  { id: 'lyap-02', title: 'Delayed Signature', category: 'LYAP', cost: { time: 1 } },
  { id: 'support-02', title: 'Field Report', category: 'SUPPORT', cost: { documents: 1 } },
  { id: 'scandal-02', title: 'Whistleblower', category: 'SCANDAL', cost: { reputation: 2 } },
  { id: 'decision-02', title: 'Cabinet Vote', category: 'DECISION', cost: { discipline: 1, time: 1 } },
];

export const legendaryCards: CardDefinition[] = [
  { id: 'legendary-01', title: 'Iron Marshal', category: 'LEGENDARY', cost: { discipline: 2, reputation: 2 } },
  { id: 'legendary-02', title: 'Archive Ghost', category: 'LEGENDARY', cost: { documents: 2, tech: 1 } },
  { id: 'legendary-03', title: 'Crisis Regent', category: 'LEGENDARY', cost: { time: 2, discipline: 1 } },
  { id: 'legendary-04', title: 'Public Idol', category: 'LEGENDARY', cost: { reputation: 3 } },
  { id: 'legendary-05', title: 'System Architect', category: 'LEGENDARY', cost: { tech: 3 } },
];
