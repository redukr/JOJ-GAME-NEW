import { useEffect } from 'react';
import type { BoardProps } from 'boardgame.io/react';
import type { JojGameState, ResourceKey } from '../game/types';
import { getReplacementUnitsForCard } from '../game/jojGame';
import type { Language } from './i18n';
import { cardTitle, categoryLabel, rankLabel, text } from './i18n';

type LocalizedBoardProps = BoardProps<JojGameState> & {
  lang?: Language;
  onStateChange?: (payload: {
    G: JojGameState;
    ctx: unknown;
  }) => void;
};

export const Board = ({ G, ctx, moves, playerID, lang = 'uk', onStateChange }: LocalizedBoardProps) => {
  const t = text(lang);
  const resourceLabels: Record<ResourceKey, string> = t.resources;
  const id = playerID ?? '0';
  const hand = G?.hands?.[id] ?? [];
  const resources = G?.resources?.[id];
  const rankId = G?.ranks?.[id];
  const rankName = rankLabel(rankId ?? '', lang);
  const isCurrentPlayer = ctx?.currentPlayer === id;
  const stage = ctx?.activePlayers?.[id];
  const canDraw = isCurrentPlayer && stage === 'draw';
  const canPlay = isCurrentPlayer && stage === 'play';
  const effectLabel = (resource: ResourceKey | 'rank') =>
    resource === 'rank' ? (lang === 'uk' ? 'Звання' : 'Rank') : resourceLabels[resource];
  const promptReplacementResources = (required: number): ResourceKey[] | null => {
    const options: ResourceKey[] = ['time', 'reputation', 'discipline', 'documents', 'tech'];
    const aliases: Record<string, ResourceKey> = {
      time: 'time',
      reputation: 'reputation',
      discipline: 'discipline',
      documents: 'documents',
      tech: 'tech',
      '1': 'time',
      '2': 'reputation',
      '3': 'discipline',
      '4': 'documents',
      '5': 'tech',
      час: 'time',
      авторитет: 'reputation',
      дисципліна: 'discipline',
      документи: 'documents',
      технології: 'tech',
    };
    const optionsHint = lang === 'uk'
      ? '1-time(час), 2-reputation(авторитет), 3-discipline(дисципліна), 4-documents(документи), 5-tech(технології)'
      : '1-time, 2-reputation, 3-discipline, 4-documents, 5-tech';
    const picked: ResourceKey[] = [];
    for (let i = 0; i < required; i += 1) {
      const value = window.prompt(
        `${lang === 'uk' ? 'Оберіть ресурс для заміни' : 'Choose replacement resource'} ${i + 1}/${required}: ${optionsHint}`,
      );
      if (value === null) return null;
      const normalized = value.trim().toLowerCase();
      const resolved = aliases[normalized];
      if (!resolved || !options.includes(resolved)) {
        i -= 1;
        continue;
      }
      picked.push(resolved);
    }
    return picked;
  };

  useEffect(() => {
    if (!G || !ctx) return;
    onStateChange?.({
      G,
      ctx,
    });
  }, [G, ctx, onStateChange, playerID]);

  if (!G || !ctx || !resources) {
    return (
      <section className="board">
        <p>{t.loading}</p>
      </section>
    );
  }

  return (
    <section className="board">
      <p>{t.currentPlayer}: {ctx.currentPlayer}</p>
      <p>{t.turnStage}: {stage === 'draw' ? t.stageDraw : stage === 'play' ? t.stagePlay : t.stageWaiting}</p>
      <p>{t.yourRank}: {rankName}</p>
      <p>{t.cardsInDeck}: {G.deck?.length ?? 0}</p>

      <div className="resources">
        {Object.entries(resourceLabels).map(([key, label]) => (
          <span key={key}>
            {label}: {resources[key as ResourceKey]}
          </span>
        ))}
      </div>

      <h2>{t.yourHand} ({hand.length}/8)</h2>
      <div className="hand">
        {hand.map((card) => {
          const effectEntries = card.effects ?? [];
          return (
          <button
            key={card.id}
            type="button"
            className="game-card"
            onClick={() => {
              if (!canPlay) return;
              const required = getReplacementUnitsForCard(resources, card);
              const replacements = required > 0 ? promptReplacementResources(required) : [];
              if (replacements === null) return;
              moves.playCard(card.id, replacements);
            }}
            disabled={!canPlay}
          >
            <div className="game-card-media">
              <img
                src={card.image ?? `/cards/${card.id}.png`}
                alt={cardTitle(card.id, card.title, lang)}
                onError={(e) => {
                  (e.currentTarget as HTMLImageElement).style.display = 'none';
                }}
              />
            </div>
            <div className="game-card-popover" aria-hidden="true">
              <img
                src={card.image ?? `/cards/${card.id}.png`}
                alt={cardTitle(card.id, card.title, lang)}
                onError={(e) => {
                  (e.currentTarget as HTMLImageElement).style.display = 'none';
                }}
              />
            </div>
            <div className="game-card-body">
              <strong>{cardTitle(card.id, card.title, lang)}</strong>
              <small>{categoryLabel(card.category, lang)}</small>
              {effectEntries.length ? (
                <div className="game-card-row">
                  {effectEntries.map((effect, index) => (
                    <span key={`effect-${card.id}-${effect.resource}-${index}`} className="pill pill-effect">
                      {effectLabel(effect.resource)}: {effect.value > 0 ? `+${effect.value}` : effect.value}
                    </span>
                  ))}
                </div>
              ) : null}
            </div>
          </button>
          );
        })}
      </div>

      <button type="button" onClick={() => moves.drawCard()} disabled={!canDraw}>
        {t.draw}
      </button>
      <button type="button" onClick={() => moves.promote()} disabled={!canPlay}>
        {t.promote}
      </button>
      <button type="button" onClick={() => moves.pass()} disabled={!canPlay}>
        {t.pass}
      </button>

      {ctx.gameover ? <p className="gameover">{t.winner}: {String(ctx.gameover.winner)}</p> : null}
    </section>
  );
};
