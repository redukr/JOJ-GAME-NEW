import { useEffect, useMemo, useState } from 'react';
import type { SyntheticEvent } from 'react';
import type { DeckTarget } from '../game/jojGame';
import type { CardCategory, CardDefinition, EffectResource } from '../game/types';
import { cardTitle, categoryLabel } from './i18n';
import type { Language } from './i18n';
import { text } from './i18n';

type MatchInfo = {
  id: string;
  createdAt: number;
};

type Snapshot = {
  G: unknown;
  ctx: unknown;
  updatedAt: number;
};

type DeckStats = {
  deck: number;
  discard: number;
  legendary: number;
};

type SharedDeckTemplate = {
  deck: CardDefinition[];
  legendaryDeck: CardDefinition[];
};

type AdminPageProps = {
  lang: Language;
  matches: MatchInfo[];
  activeMatchId: string;
  playerID: string;
  snapshot: Snapshot | null;
  deckStats: DeckStats;
  sharedDeckTemplate: SharedDeckTemplate;
  cardCatalog: CardDefinition[];
  onCreateMatch: () => void;
  onResetMatch: () => void;
  onDeleteMatch: () => void;
  onResetAll: () => void;
  onRestartServer: () => Promise<boolean>;
  onPlayerChange: (playerID: string) => void;
  onShuffleDeck: () => void;
  onAddCard: (target: DeckTarget, cardId: string) => void;
  onAddCustomCard: (target: DeckTarget, card: CardDefinition) => void;
  onUpdateCard: (target: DeckTarget, index: number, card: CardDefinition) => void;
  onRemoveCard: (target: DeckTarget, index: number) => void;
  onResetTemplate: () => void;
  onExportTemplate: () => string;
  onImportTemplate: (json: string) => string | null;
};

const categories: CardCategory[] = ['LYAP', 'SCANDAL', 'SUPPORT', 'DECISION', 'NEUTRAL', 'VVNZ', 'LEGENDARY'];
const effectResourceKeys: EffectResource[] = ['time', 'reputation', 'discipline', 'documents', 'tech', 'rank'];
const zeroEffectValues = (): Record<EffectResource, number> => ({
  time: 0,
  reputation: 0,
  discipline: 0,
  documents: 0,
  tech: 0,
  rank: 0,
});

const effectsToValues = (effects: CardDefinition['effects']): Record<EffectResource, number> => {
  const next = zeroEffectValues();
  (effects ?? []).forEach((effect) => {
    next[effect.resource] = effect.value;
  });
  return next;
};

const valuesToEffects = (values: Record<EffectResource, number>): NonNullable<CardDefinition['effects']> =>
  effectResourceKeys
    .filter((key) => values[key] !== 0)
    .map((key) => ({ resource: key, value: values[key] }));

const blankCard = (): CardDefinition => ({
  id: '',
  title: '',
  category: 'NEUTRAL',
  image: '',
});

type HoverImageProps = {
  src: string;
  alt: string;
  className?: string;
  onLoad?: (e: SyntheticEvent<HTMLImageElement>) => void;
  onError?: (e: SyntheticEvent<HTMLImageElement>) => void;
};

const HoverImage = ({ src, alt, className = 'admin-thumb', onLoad, onError }: HoverImageProps) => (
  <span className="admin-hover-image">
    <img className={className} src={src} alt={alt} onLoad={onLoad} onError={onError} />
    <span className="admin-hover-popover" aria-hidden="true">
      <img src={src} alt={alt} />
    </span>
  </span>
);

export const AdminPage = ({
  lang,
  matches,
  activeMatchId,
  playerID,
  snapshot,
  deckStats,
  sharedDeckTemplate,
  cardCatalog,
  onCreateMatch,
  onResetMatch,
  onDeleteMatch,
  onResetAll,
  onRestartServer,
  onPlayerChange,
  onShuffleDeck,
  onAddCard,
  onAddCustomCard,
  onUpdateCard,
  onRemoveCard,
  onResetTemplate,
  onExportTemplate,
  onImportTemplate,
}: AdminPageProps) => {
  const t = text(lang);
  const activeMatch = matches.find((m) => m.id === activeMatchId);
  const [target, setTarget] = useState<DeckTarget>('deck');
  const [selectedCardId, setSelectedCardId] = useState<string>(cardCatalog[0]?.id ?? '');
  const selectedCard = useMemo(
    () => cardCatalog.find((card) => card.id === selectedCardId),
    [cardCatalog, selectedCardId],
  );
  useEffect(() => {
    const exists = cardCatalog.some((card) => card.id === selectedCardId);
    if (!exists) {
      setSelectedCardId(cardCatalog[0]?.id ?? '');
    }
  }, [cardCatalog, selectedCardId]);

  const [editTarget, setEditTarget] = useState<DeckTarget>('deck');
  const [editIndex, setEditIndex] = useState<number>(-1);
  const [editCard, setEditCard] = useState<CardDefinition>(blankCard());
  const [editEffectValues, setEditEffectValues] = useState<Record<EffectResource, number>>(zeroEffectValues());
  const [editEffectsText, setEditEffectsText] = useState<string>('[]');
  const [editError, setEditError] = useState<string>('');
  const [importJson, setImportJson] = useState<string>('');
  const [importError, setImportError] = useState<string>('');
  const [imagePreviewNonce, setImagePreviewNonce] = useState<number>(0);
  const [restartingServer, setRestartingServer] = useState<boolean>(false);
  const [adminActionError, setAdminActionError] = useState<string>('');

  const beginEdit = (nextTarget: DeckTarget, index: number, card: CardDefinition) => {
    setEditTarget(nextTarget);
    setEditIndex(index);
    setEditCard({
      ...card,
      image: card.image ?? '',
      flavor: card.flavor ?? '',
      effects: card.effects?.map((effect) => ({ ...effect })),
    });
    const nextEffectValues = effectsToValues(card.effects);
    setEditEffectValues(nextEffectValues);
    setEditEffectsText(JSON.stringify(valuesToEffects(nextEffectValues), null, 2));
    setEditError('');
  };

  const parseEffects = (): CardDefinition['effects'] | null => {
    let parsed: unknown;
    try {
      parsed = JSON.parse(editEffectsText || '[]');
    } catch {
      setEditError('Invalid effects JSON');
      return null;
    }
    if (!Array.isArray(parsed)) {
      setEditError('effects must be an array');
      return null;
    }
    const effects: NonNullable<CardDefinition['effects']> = [];
    for (const item of parsed) {
      if (!item || typeof item !== 'object') {
        setEditError('Invalid effect item');
        return null;
      }
      const row = item as Record<string, unknown>;
      if (typeof row.resource !== 'string' || !effectResourceKeys.includes(row.resource as EffectResource)) {
        setEditError('Invalid effect.resource');
        return null;
      }
      if (typeof row.value !== 'number') {
        setEditError('Invalid effect.value');
        return null;
      }
      effects.push({ resource: row.resource as EffectResource, value: row.value });
    }
    setEditEffectValues(effectsToValues(effects));
    setEditError('');
    return effects;
  };

  const saveEdit = () => {
    if (editIndex < 0) return;
    if (!editCard.id.trim() || !editCard.title.trim()) return;
    const effects = parseEffects();
    if (effects === null) return;
    onUpdateCard(editTarget, editIndex, {
      ...editCard,
      id: editCard.id.trim(),
      title: editCard.title.trim(),
      image: editCard.image?.trim() || undefined,
      flavor: editCard.flavor?.trim() || undefined,
      effects,
    });
  };

  const addFromForm = () => {
    if (!editCard.id.trim() || !editCard.title.trim()) return;
    const effects = parseEffects();
    if (effects === null) return;
    onAddCustomCard(editTarget, {
      ...editCard,
      id: editCard.id.trim(),
      title: editCard.title.trim(),
      image: editCard.image?.trim() || undefined,
      flavor: editCard.flavor?.trim() || undefined,
      effects,
    });
  };

  const runImport = () => {
    const error = onImportTemplate(importJson);
    setImportError(error ?? '');
  };
  const attachImageFile = async (file: File | null) => {
    if (!file) return;
    const reader = new FileReader();
    const dataUrl = await new Promise<string>((resolve) => {
      reader.onload = () => resolve(typeof reader.result === 'string' ? reader.result : '');
      reader.onerror = () => resolve('');
      reader.readAsDataURL(file);
    });
    if (!dataUrl) {
      setEditError('Failed to read image file');
      return;
    }
    try {
      const response = await fetch('/api/upload-card-image', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          filename: file.name,
          dataUrl,
        }),
      });
      const payload = (await response.json()) as { path?: string; error?: string };
      if (!response.ok || !payload.path) {
        setEditError(payload.error ?? 'Upload failed');
        return;
      }
      setEditError('');
      setEditCard((prev) => ({ ...prev, image: payload.path }));
      setImagePreviewNonce((v) => v + 1);
    } catch {
      setEditError('Upload failed');
    }
  };
  const importFromFile = (file: File | null) => {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const text = typeof reader.result === 'string' ? reader.result : '';
      setImportJson(text);
    };
    reader.readAsText(file);
  };

  const withCacheBust = (src: string) => `${src}${src.includes('?') ? '&' : '?'}v=${imagePreviewNonce}`;
  const imageSrc = selectedCard?.image ?? (selectedCard ? `/cards/${selectedCard.id}.png` : '');
  const getImageSrc = (card: CardDefinition) => card.image ?? `/cards/${card.id}.png`;

  return (
    <section className="board admin-panel">
      <h2>{t.adminTitle}</h2>
      <p>Path: <code>/admin</code></p>
      <p>Mode: local</p>
      <hr />
      <p>
        {t.matches}: {matches.length}
      </p>
      <p>
        {t.activeMatch}: <code>{activeMatchId || t.notSelected}</code>
      </p>
      <p>
        {t.createdAt}: {activeMatch ? new Date(activeMatch.createdAt).toLocaleString() : t.notSelected}
      </p>
      <p>
        {t.playerView}:{' '}
        <select value={playerID} onChange={(e) => onPlayerChange(e.target.value)}>
          <option value="0">0</option>
          <option value="1">1</option>
          <option value="2">2</option>
          <option value="3">3</option>
        </select>
      </p>
      <p className="admin-controls">
        <button type="button" onClick={onCreateMatch}>{t.createMatch}</button>
        <button type="button" onClick={onResetMatch}>{t.resetMatch}</button>
        <button type="button" onClick={onDeleteMatch} disabled={matches.length <= 1}>{t.deleteMatch}</button>
        <button type="button" onClick={onResetAll}>{t.resetAll}</button>
        <button
          type="button"
          onClick={() => {
            setAdminActionError('');
            setRestartingServer(true);
            void onRestartServer().then((ok) => {
              setRestartingServer(false);
              if (!ok) setAdminActionError(t.restartServerFailed);
            });
          }}
          disabled={restartingServer}
        >
          {restartingServer ? t.restartingServer : t.restartServer}
        </button>
      </p>
      {adminActionError ? <p className="admin-error">{adminActionError}</p> : null}

      <hr />
      <h3>{t.deckControls}</h3>
      <p>
        {t.deckCount}: {deckStats.deck} | {t.discardCount}: {deckStats.discard} | {t.legendaryCount}: {deckStats.legendary}
      </p>
      <p className="admin-controls">
        <select value={target} onChange={(e) => setTarget(e.target.value as DeckTarget)}>
          <option value="deck">{t.mainDeck}</option>
          <option value="legendaryDeck">{t.legendaryDeckLabel}</option>
        </select>
        <select value={selectedCardId} onChange={(e) => setSelectedCardId(e.target.value)}>
          {cardCatalog.map((card) => (
            <option key={card.id} value={card.id}>
              {card.id} | {cardTitle(card.id, card.title, lang)}
            </option>
          ))}
        </select>
        <button type="button" onClick={() => selectedCardId && onAddCard(target, selectedCardId)} disabled={!selectedCardId}>
          {t.addCardById}
        </button>
      </p>
      {selectedCard ? (
        <div className="admin-card-preview">
          <p>
            <strong>{cardTitle(selectedCard.id, selectedCard.title, lang)}</strong> ({categoryLabel(selectedCard.category, lang)})
          </p>
          <HoverImage
            src={withCacheBust(imageSrc)}
            alt={cardTitle(selectedCard.id, selectedCard.title, lang)}
            className="admin-card-preview-image"
            onLoad={(e) => {
              (e.currentTarget as HTMLImageElement).style.display = 'block';
              (e.currentTarget as HTMLImageElement).style.visibility = 'visible';
            }}
            onError={(e) => {
              (e.currentTarget as HTMLImageElement).style.display = 'none';
            }}
          />
        </div>
      ) : null}
      <p className="admin-controls">
        <button type="button" onClick={onShuffleDeck}>{t.shuffleDeck}</button>
        <button type="button" onClick={onResetTemplate}>{t.recycleDiscard}</button>
      </p>

      <h4>{t.cardEditor}</h4>
      <div className="admin-editor-grid">
        <label>ID<input value={editCard.id} onChange={(e) => setEditCard((prev) => ({ ...prev, id: e.target.value }))} /></label>
        <label>Title<input value={editCard.title} onChange={(e) => setEditCard((prev) => ({ ...prev, title: e.target.value }))} /></label>
        <label>Category
          <select value={editCard.category} onChange={(e) => setEditCard((prev) => ({ ...prev, category: e.target.value as CardCategory }))}>
            {categories.map((cat) => <option key={cat} value={cat}>{cat}</option>)}
          </select>
        </label>
        <label>Image URL/Path
          <input value={editCard.image ?? ''} onChange={(e) => setEditCard((prev) => ({ ...prev, image: e.target.value }))} />
        </label>
        <label>Image file
          <input type="file" accept="image/*" onChange={(e) => attachImageFile(e.target.files?.[0] ?? null)} />
        </label>
        {editCard.image ? (
          <label>Image preview
            <HoverImage
              src={withCacheBust(editCard.image)}
              className="admin-thumb"
              alt="Card preview"
              onLoad={(e) => {
                (e.currentTarget as HTMLImageElement).style.display = 'inline-block';
                (e.currentTarget as HTMLImageElement).style.visibility = 'visible';
              }}
              onError={(e) => {
                (e.currentTarget as HTMLImageElement).style.display = 'none';
              }}
            />
          </label>
        ) : null}
        <label>Quick image path
          <span className="admin-controls">
            <button type="button" onClick={() => setEditCard((prev) => ({ ...prev, image: `/cards/${prev.id || 'card-id'}.png` }))}>
              /cards/&lt;id&gt;.png
            </button>
            <button type="button" onClick={() => setEditCard((prev) => ({ ...prev, image: `/cards/${prev.id || 'card-id'}.webp` }))}>
              /cards/&lt;id&gt;.webp
            </button>
          </span>
        </label>
        <label>Flavor
          <input value={editCard.flavor ?? ''} onChange={(e) => setEditCard((prev) => ({ ...prev, flavor: e.target.value }))} />
        </label>
      </div>
      <label>
        Effects JSON
        <textarea
          className="admin-textarea"
          value={editEffectsText}
          onChange={(e) => {
            const next = e.target.value;
            setEditEffectsText(next);
            try {
              const parsed = JSON.parse(next || '[]');
              if (Array.isArray(parsed)) {
                const effects: NonNullable<CardDefinition['effects']> = [];
                for (const item of parsed) {
                  if (!item || typeof item !== 'object') continue;
                  const row = item as Record<string, unknown>;
                  if (
                    typeof row.resource === 'string' &&
                    effectResourceKeys.includes(row.resource as EffectResource) &&
                    typeof row.value === 'number'
                  ) {
                    effects.push({ resource: row.resource as EffectResource, value: row.value });
                  }
                }
                setEditEffectValues(effectsToValues(effects));
              }
            } catch {
              // keep current numeric values while JSON is being typed
            }
          }}
        />
      </label>
      <h5>Effects (resource delta)</h5>
      <div className="admin-editor-grid">
        {effectResourceKeys.map((key) => (
          <label key={`effect-${key}`}>{key}
            <input
              type="number"
              value={editEffectValues[key]}
              onChange={(e) => {
                const value = Number(e.target.value || 0);
                setEditEffectValues((prev) => {
                  const next = { ...prev, [key]: value };
                  setEditEffectsText(JSON.stringify(valuesToEffects(next), null, 2));
                  return next;
                });
              }}
            />
          </label>
        ))}
      </div>
      {editError ? <p className="admin-error">{editError}</p> : null}
      <p className="admin-controls">
        <button type="button" onClick={saveEdit} disabled={editIndex < 0}>{t.saveCard}</button>
        <button type="button" onClick={addFromForm}>{t.addCustomCard}</button>
      </p>

      <div className="admin-deck-list">
        <h4>{t.mainDeck}</h4>
        <ul>
          {sharedDeckTemplate.deck.map((card, index) => (
            <li key={`deck-${index}-${card.id}`}>
              <span>
                <HoverImage
                  src={withCacheBust(getImageSrc(card))}
                  className="admin-thumb"
                  alt={card.id}
                  onLoad={(e) => {
                    (e.currentTarget as HTMLImageElement).style.visibility = 'visible';
                    (e.currentTarget as HTMLImageElement).style.display = 'inline-block';
                  }}
                  onError={(e) => {
                    (e.currentTarget as HTMLImageElement).style.visibility = 'hidden';
                  }}
                />
                {index + 1}. {card.id} | {cardTitle(card.id, card.title, lang)}{card.effects?.length ? ` | effects: ${card.effects.length}` : ''}
              </span>
              <span className="admin-controls">
                <button type="button" onClick={() => beginEdit('deck', index, card)}>{t.editCard}</button>
                <button type="button" onClick={() => onRemoveCard('deck', index)}>{t.removeCard}</button>
              </span>
            </li>
          ))}
        </ul>

        <h4>{t.legendaryDeckLabel}</h4>
        <ul>
          {sharedDeckTemplate.legendaryDeck.map((card, index) => (
            <li key={`legendary-${index}-${card.id}`}>
              <span>
                <HoverImage
                  src={withCacheBust(getImageSrc(card))}
                  className="admin-thumb"
                  alt={card.id}
                  onLoad={(e) => {
                    (e.currentTarget as HTMLImageElement).style.visibility = 'visible';
                    (e.currentTarget as HTMLImageElement).style.display = 'inline-block';
                  }}
                  onError={(e) => {
                    (e.currentTarget as HTMLImageElement).style.visibility = 'hidden';
                  }}
                />
                {index + 1}. {card.id} | {cardTitle(card.id, card.title, lang)}{card.effects?.length ? ` | effects: ${card.effects.length}` : ''}
              </span>
              <span className="admin-controls">
                <button type="button" onClick={() => beginEdit('legendaryDeck', index, card)}>{t.editCard}</button>
                <button type="button" onClick={() => onRemoveCard('legendaryDeck', index)}>{t.removeCard}</button>
              </span>
            </li>
          ))}
        </ul>
      </div>

      <hr />
      <h3>{t.importExport}</h3>
      <p className="admin-controls">
        <button type="button" onClick={() => setImportJson(onExportTemplate())}>{t.exportJson}</button>
        <button type="button" onClick={runImport}>{t.importJson}</button>
        <label>
          {t.importFile}
          <input type="file" accept="application/json,.json" onChange={(e) => importFromFile(e.target.files?.[0] ?? null)} />
        </label>
      </p>
      {importError ? <p className="admin-error">{importError}</p> : null}
      <textarea className="admin-textarea" value={importJson} onChange={(e) => setImportJson(e.target.value)} />

      <hr />
      <h3>{t.stateSnapshot}</h3>
      <p>
        {t.updatedAt}: {snapshot ? new Date(snapshot.updatedAt).toLocaleString() : t.notSelected}
      </p>
      <pre className="admin-json">
        {snapshot ? JSON.stringify({ G: snapshot.G, ctx: snapshot.ctx }, null, 2) : t.noStateYet}
      </pre>
      <p>
        <a href="/">{t.openGame}</a>
      </p>
    </section>
  );
};
