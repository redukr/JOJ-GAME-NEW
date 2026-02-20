import { useEffect, useRef, useState } from 'react';
import type { BoardProps } from 'boardgame.io/react';
import type { JojGameState, ResourceKey } from '../game/types';
import { getReplacementUnitsForCard, normalizeImagePath } from '../game/jojGame';
import type { Language } from './i18n';
import { cardTitle, categoryLabel, rankLabel, text } from './i18n';

type LocalizedBoardProps = BoardProps<JojGameState> & {
  lang?: Language;
  playerName?: string;
  onStateChange?: (payload: {
    G: JojGameState;
    ctx: unknown;
  }) => void;
};

export const Board = ({ G, ctx, moves, playerID, lang = 'uk', playerName = '', onStateChange }: LocalizedBoardProps) => {
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
  const deckBackImage = G?.deckBackImage ? normalizeImagePath(G.deckBackImage) : undefined;
  const lastDiscard = G?.discard?.length ? G.discard[G.discard.length - 1] : null;
  const effectLabel = (resource: ResourceKey | 'rank') =>
    resource === 'rank' ? (lang === 'uk' ? 'Звання' : 'Rank') : resourceLabels[resource];
  const [chatInput, setChatInput] = useState<string>('');
  const syncedNameRef = useRef<string>('');
  const chatLogRef = useRef<HTMLDivElement | null>(null);
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

  useEffect(() => {
    if (!playerID || !playerName.trim() || typeof moves.setPlayerName !== 'function') return;
    const trimmed = playerName.trim();
    if (syncedNameRef.current === trimmed) return;
    moves.setPlayerName(trimmed);
    syncedNameRef.current = trimmed;
  }, [moves, playerID, playerName]);

  useEffect(() => {
    if (!chatLogRef.current) return;
    chatLogRef.current.scrollTop = chatLogRef.current.scrollHeight;
  }, [G?.chat?.length]);

  const sendChatMessage = () => {
    const text = chatInput.trim();
    if (!text) return;
    if (typeof moves.sendChat === 'function') {
      moves.sendChat(text);
    }
    setChatInput('');
  };

  if (!G || !ctx || !resources) {
    return (
      <section className="board">
        <p>{t.loading}</p>
      </section>
    );
  }

  return (
    <section className="board board-layout">
      <div className="board-main">
      <p>{t.currentPlayer}: {ctx.currentPlayer}</p>
      <p>{t.turnStage}: {stage === 'draw' ? t.stageDraw : stage === 'play' ? t.stagePlay : t.stageWaiting}</p>
      <p>{t.yourRank}: {rankName}</p>
      <p>{t.cardsInDeck}: {G.deck?.length ?? 0}</p>

      <h2>{t.boardArea}</h2>
      <div className="play-area">
        <div className="pile">
          <p>{t.drawPile} ({G.deck?.length ?? 0})</p>
          <div className="pile-card">
            {deckBackImage ? (
              <img src={deckBackImage} alt={t.drawPile} />
            ) : (
              <div className="pile-back-fallback">JOJ</div>
            )}
          </div>
        </div>
        <div className="pile">
          <p>{t.discardPile} ({G.discard?.length ?? 0})</p>
          <div className="pile-card">
            {lastDiscard ? (
              <div className="pile-preview">
                <img
                  src={normalizeImagePath(lastDiscard.image) ?? `/cards/${lastDiscard.id}.png`}
                  alt={cardTitle(lastDiscard.id, lastDiscard.title, lang)}
                />
                <div className="game-card-popover" aria-hidden="true">
                  <img
                    src={normalizeImagePath(lastDiscard.image) ?? `/cards/${lastDiscard.id}.png`}
                    alt={cardTitle(lastDiscard.id, lastDiscard.title, lang)}
                  />
                </div>
              </div>
            ) : (
              <div className="pile-empty">{t.noCardsInDiscard}</div>
            )}
          </div>
          <p>
            {t.lastPlayedCard}:{' '}
            {lastDiscard ? cardTitle(lastDiscard.id, lastDiscard.title, lang) : t.noCardsInDiscard}
          </p>
        </div>
      </div>

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
                src={normalizeImagePath(card.image) ?? `/cards/${card.id}.png`}
                alt={cardTitle(card.id, card.title, lang)}
                onError={(e) => {
                  (e.currentTarget as HTMLImageElement).style.display = 'none';
                }}
              />
            </div>
            <div className="game-card-popover" aria-hidden="true">
              <img
                src={normalizeImagePath(card.image) ?? `/cards/${card.id}.png`}
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
      </div>
      <aside className="board-chat">
        <h3>{t.chatTitle}</h3>
        <div className="chat-log" ref={chatLogRef}>
          {(G.chat ?? []).map((row) => {
            const author = row.type === 'system'
              ? t.systemTag
              : (row.playerID ? (G.playerNames?.[row.playerID] ?? `#${row.playerID}`) : '#');
            return (
              <p key={row.id} className={row.type === 'system' ? 'chat-system' : 'chat-player'}>
                <strong>{author}:</strong> {row.text}
              </p>
            );
          })}
        </div>
        <form
          className="chat-input-row"
          onSubmit={(e) => {
            e.preventDefault();
            sendChatMessage();
          }}
        >
          <input
            value={chatInput}
            onChange={(e) => setChatInput(e.target.value)}
            placeholder={t.chatPlaceholder}
          />
          <button
            type="submit"
          >
            {t.sendMessage}
          </button>
        </form>
      </aside>
    </section>
  );
};
