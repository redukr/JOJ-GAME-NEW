import React from 'react';
import type { BoardProps } from 'boardgame.io/react';
import type { JojGameState, ResourceKey } from '../game/types';
import { ranks } from '../game/ranks';

const resourceLabels: Record<ResourceKey, string> = {
  time: '🕓 Time',
  reputation: '⭐ Reputation',
  discipline: '⚖️ Discipline',
  documents: '📂 Documents',
  tech: '💻 Tech',
};

export const Board = ({ G, ctx, moves, playerID }: BoardProps<JojGameState>) => {
  const id = playerID ?? '0';
  const hand = G.hands[id] ?? [];
  const resources = G.resources[id];
  const rankId = G.ranks[id];
  const rankName = ranks.find((r) => r.id === rankId)?.name ?? rankId;
  const isCurrentPlayer = ctx.currentPlayer === id;
  const stage = ctx.activePlayers?.[id];
  const canDraw = isCurrentPlayer && stage === 'draw';
  const canPlay = isCurrentPlayer && stage === 'play';

  return (
    <section className="board">
      <p>Current player: {ctx.currentPlayer}</p>
      <p>Turn stage: {stage ?? 'waiting'}</p>
      <p>Your rank: {rankName}</p>
      <p>Cards left in deck: {G.deck.length}</p>

      <div className="resources">
        {Object.entries(resourceLabels).map(([key, label]) => (
          <span key={key}>
            {label}: {resources[key as ResourceKey]}
          </span>
        ))}
      </div>

      <h2>Your hand ({hand.length}/8)</h2>
      <div className="hand">
        {hand.map((card) => (
          <button key={card.id} type="button" onClick={() => moves.playCard(card.id)} disabled={!canPlay}>
            <strong>{card.title}</strong>
            <small>{card.category}</small>
          </button>
        ))}
      </div>

      <button type="button" onClick={() => moves.drawCard()} disabled={!canDraw}>
        Draw
      </button>
      <button type="button" onClick={() => moves.promote()} disabled={!canPlay}>
        Promote
      </button>
      <button type="button" onClick={() => moves.pass()} disabled={!canPlay}>
        Pass
      </button>

      {ctx.gameover ? <p className="gameover">Winner: {String(ctx.gameover.winner)}</p> : null}
    </section>
  );
};
