import { useEffect, useMemo, useRef, useState } from 'react';
import type { SyntheticEvent } from 'react';
import { normalizeImagePath, type DeckTarget, type SimulationReport } from '../game/jojGame';
import type { CardCategory, CardDefinition, EffectResource, RankDefinition, ResourceKey } from '../game/types';
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
  deckBackImage?: string;
};

type AdminPageProps = {
  lang: Language;
  matches: MatchInfo[];
  activeMatchId: string;
  snapshot: Snapshot | null;
  deckStats: DeckStats;
  sharedDeckTemplate: SharedDeckTemplate;
  cardCatalog: CardDefinition[];
  sharedRanks: RankDefinition[];
  onCreateMatch: () => void;
  onResetMatch: () => void;
  onDeleteMatch: () => void;
  onResetAll: () => void;
  onRestartServer: () => Promise<boolean>;
  onShuffleDeck: () => void;
  onAddCard: (target: DeckTarget, cardId: string) => void;
  onAddCustomCard: (target: DeckTarget, card: CardDefinition) => void;
  onUpdateCard: (target: DeckTarget, index: number, card: CardDefinition) => void;
  onRemoveCard: (target: DeckTarget, index: number) => void;
  onResetTemplate: () => void;
  onSetDeckBackImage: (path?: string) => void;
  onExportTemplate: () => string;
  onImportTemplate: (json: string) => string | null;
  onUpdateRanks: (nextRanks: RankDefinition[]) => boolean;
  onResetRanks: () => void;
  onRunSimulations: (players: number, simulations: number) => SimulationReport;
};

const categories: CardCategory[] = ['LYAP', 'SCANDAL', 'SUPPORT', 'DECISION', 'NEUTRAL', 'VVNZ', 'LEGENDARY'];
const effectResourceKeys: EffectResource[] = ['time', 'reputation', 'discipline', 'documents', 'tech', 'rank'];
const rankResourceKeys: ResourceKey[] = ['time', 'reputation', 'discipline', 'documents', 'tech'];
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

type ImportCategoryMode = CardCategory | 'AS_IS';
type CategoryFilter = CardCategory | 'ALL';
type AdminTab = 'matches' | 'deck' | 'import' | 'state' | 'ranks' | 'simulation';
type CropDraft = {
  filename: string;
  sourceBlob: Blob;
  sourceUrl: string;
  mime: string;
  sourceWidth: number;
  sourceHeight: number;
  topPx: number;
  rightPx: number;
  bottomPx: number;
  leftPx: number;
};

const CARD_ASPECT_RATIO = 352 / 540; // width / height

const clampPx = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

const getAspectLockedCropRect = (draft: CropDraft, imageWidth: number, imageHeight: number) => {
  const topPx = clampPx(draft.topPx, 0, Math.max(0, imageHeight - 1));
  const rightPx = clampPx(draft.rightPx, 0, Math.max(0, imageWidth - 1));
  const bottomPx = clampPx(draft.bottomPx, 0, Math.max(0, imageHeight - 1));
  const leftPx = clampPx(draft.leftPx, 0, Math.max(0, imageWidth - 1));

  const availablePw = Math.max(1, imageWidth - leftPx - rightPx);
  const availablePh = Math.max(1, imageHeight - topPx - bottomPx);

  let cropPw = availablePw;
  let cropPh = availablePh;
  if (cropPw / cropPh > CARD_ASPECT_RATIO) {
    cropPw = Math.max(1, Math.floor(cropPh * CARD_ASPECT_RATIO));
  } else {
    cropPh = Math.max(1, Math.floor(cropPw / CARD_ASPECT_RATIO));
  }

  const sx = leftPx + Math.floor((availablePw - cropPw) / 2);
  const sy = topPx + Math.floor((availablePh - cropPh) / 2);
  const maxSw = Math.max(1, imageWidth - sx);
  const maxSh = Math.max(1, imageHeight - sy);
  const sw = Math.max(1, Math.min(maxSw, cropPw));
  const sh = Math.max(1, Math.min(maxSh, cropPh));

  return { sx, sy, sw, sh };
};

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
  snapshot,
  deckStats,
  sharedDeckTemplate,
  cardCatalog,
  sharedRanks,
  onCreateMatch,
  onResetMatch,
  onDeleteMatch,
  onResetAll,
  onRestartServer,
  onShuffleDeck,
  onAddCard,
  onAddCustomCard,
  onUpdateCard,
  onRemoveCard,
  onResetTemplate,
  onSetDeckBackImage,
  onExportTemplate,
  onImportTemplate,
  onUpdateRanks,
  onResetRanks,
  onRunSimulations,
}: AdminPageProps) => {
  const t = text(lang);
  const activeMatch = matches.find((m) => m.id === activeMatchId);
  const [target, setTarget] = useState<DeckTarget>('deck');
  const [categoryFilter, setCategoryFilter] = useState<CategoryFilter>('ALL');
  const [selectedCardId, setSelectedCardId] = useState<string>(cardCatalog[0]?.id ?? '');
  const filteredCatalog = useMemo(
    () => (categoryFilter === 'ALL' ? cardCatalog : cardCatalog.filter((card) => card.category === categoryFilter)),
    [cardCatalog, categoryFilter],
  );
  const selectedCard = useMemo(
    () => filteredCatalog.find((card) => card.id === selectedCardId),
    [filteredCatalog, selectedCardId],
  );
  useEffect(() => {
    const exists = filteredCatalog.some((card) => card.id === selectedCardId);
    if (!exists) {
      setSelectedCardId(filteredCatalog[0]?.id ?? '');
    }
  }, [filteredCatalog, selectedCardId]);

  const [editTarget, setEditTarget] = useState<DeckTarget>('deck');
  const [editIndex, setEditIndex] = useState<number>(-1);
  const [editCard, setEditCard] = useState<CardDefinition>(blankCard());
  const [editEffectValues, setEditEffectValues] = useState<Record<EffectResource, number>>(zeroEffectValues());
  const [editEffectsText, setEditEffectsText] = useState<string>('[]');
  const [editError, setEditError] = useState<string>('');
  const [importJson, setImportJson] = useState<string>('');
  const [importError, setImportError] = useState<string>('');
  const [importStatus, setImportStatus] = useState<string>('');
  const [importTarget, setImportTarget] = useState<DeckTarget>('deck');
  const [importCategoryMode, setImportCategoryMode] = useState<ImportCategoryMode>('AS_IS');
  const [imagePreviewNonce, setImagePreviewNonce] = useState<number>(0);
  const [restartingServer, setRestartingServer] = useState<boolean>(false);
  const [adminActionError, setAdminActionError] = useState<string>('');
  const [activeTab, setActiveTab] = useState<AdminTab>('matches');
  const [deckBackImageInput, setDeckBackImageInput] = useState<string>(sharedDeckTemplate.deckBackImage ?? '');
  const [cropDraft, setCropDraft] = useState<CropDraft | null>(null);
  const cropPreviewRef = useRef<HTMLCanvasElement | null>(null);
  const cropObjectUrlRef = useRef<string | null>(null);
  const [simulationPlayers, setSimulationPlayers] = useState<number>(4);
  const [simulationCount, setSimulationCount] = useState<number>(500);
  const [simulationReport, setSimulationReport] = useState<SimulationReport | null>(null);
  const [simulationRunning, setSimulationRunning] = useState<boolean>(false);
  const [rankDraft, setRankDraft] = useState<RankDefinition>({
    id: '',
    name: '',
    requirement: {},
    bonus: {},
  });

  useEffect(() => {
    setDeckBackImageInput(sharedDeckTemplate.deckBackImage ?? '');
  }, [sharedDeckTemplate.deckBackImage]);

  useEffect(() => {
    const current = cropDraft?.sourceUrl ?? null;
    const prev = cropObjectUrlRef.current;
    if (prev && prev !== current) {
      URL.revokeObjectURL(prev);
    }
    cropObjectUrlRef.current = current;
  }, [cropDraft?.sourceUrl]);

  useEffect(() => () => {
    if (cropObjectUrlRef.current) {
      URL.revokeObjectURL(cropObjectUrlRef.current);
    }
  }, []);

  useEffect(() => {
    if (!cropDraft || !cropPreviewRef.current) return;
    const canvas = cropPreviewRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const image = new Image();
    image.onload = () => {
      if (
        cropDraft.sourceWidth !== image.width ||
        cropDraft.sourceHeight !== image.height
      ) {
        setCropDraft((prev) => (prev
          ? {
              ...prev,
              sourceWidth: image.width,
              sourceHeight: image.height,
            }
          : prev));
      }
      const { sx, sy, sw, sh } = getAspectLockedCropRect(cropDraft, image.width, image.height);

      canvas.width = sw;
      canvas.height = sh;
      ctx.clearRect(0, 0, sw, sh);
      ctx.drawImage(image, sx, sy, sw, sh, 0, 0, sw, sh);
    };
    image.src = cropDraft.sourceUrl;
  }, [cropDraft]);

  const blobToDataUrl = async (blob: Blob): Promise<string> =>
    new Promise<string>((resolve) => {
      const reader = new FileReader();
      reader.onload = () => resolve(typeof reader.result === 'string' ? reader.result : '');
      reader.onerror = () => resolve('');
      reader.readAsDataURL(blob);
    });

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
      setEditError(t.invalidEffectsJson);
      return null;
    }
    if (!Array.isArray(parsed)) {
      setEditError(t.effectsMustBeArray);
      return null;
    }
    const effects: NonNullable<CardDefinition['effects']> = [];
    for (const item of parsed) {
      if (!item || typeof item !== 'object') {
        setEditError(t.invalidEffectItem);
        return null;
      }
      const row = item as Record<string, unknown>;
      if (typeof row.resource !== 'string' || !effectResourceKeys.includes(row.resource as EffectResource)) {
        setEditError(t.invalidEffectResource);
        return null;
      }
      if (typeof row.value !== 'number') {
        setEditError(t.invalidEffectValue);
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
      image: normalizeImagePath(editCard.image?.trim()),
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
      image: normalizeImagePath(editCard.image?.trim()),
      flavor: editCard.flavor?.trim() || undefined,
      effects,
    });
  };

  const runImport = () => {
    setImportStatus('');
    let parsed: unknown;
    try {
      parsed = JSON.parse(importJson);
    } catch {
      setImportError(t.invalidJson);
      return;
    }

    const toCardList = (value: unknown): CardDefinition[] | null => {
      if (Array.isArray(value)) return value as CardDefinition[];
      if (!value || typeof value !== 'object') return null;
      const raw = value as Record<string, unknown>;
      const deck = Array.isArray(raw.deck) ? (raw.deck as CardDefinition[]) : [];
      const legendaryDeck = Array.isArray(raw.legendaryDeck) ? (raw.legendaryDeck as CardDefinition[]) : [];
      if (deck.length === 0 && legendaryDeck.length === 0) return null;
      return [...deck, ...legendaryDeck];
    };

    const cards = toCardList(parsed);
    if (!cards) {
      setImportError(t.importShapeError);
      return;
    }

    const normalizedCards = cards.map((card) => ({
      ...card,
      category: importCategoryMode === 'AS_IS' ? card.category : importCategoryMode,
      image: normalizeImagePath(card.image),
    }));

    const nextTemplate: SharedDeckTemplate = {
      deck: sharedDeckTemplate.deck.map((card) => ({ ...card })),
      legendaryDeck: sharedDeckTemplate.legendaryDeck.map((card) => ({ ...card })),
      deckBackImage: sharedDeckTemplate.deckBackImage,
      [importTarget]: [...sharedDeckTemplate[importTarget], ...normalizedCards],
    };

    const error = onImportTemplate(JSON.stringify(nextTemplate, null, 2));
    if (error) {
      setImportError(error);
      setImportStatus('');
      return;
    }
    setImportError('');
    const targetLabel = importTarget === 'deck' ? t.mainDeck : t.legendaryDeckLabel;
    const suffix = importCategoryMode === 'AS_IS' ? t.importCategoryAsIs : importCategoryMode;
    setImportStatus(
      lang === 'uk'
        ? `Імпорт успішний: додано ${normalizedCards.length} карт у «${targetLabel}» (категорія: ${suffix}).`
        : `Import successful: added ${normalizedCards.length} cards to "${targetLabel}" (category: ${suffix}).`,
    );
  };
  const exportToFile = () => {
    const json = onExportTemplate();
    const blob = new Blob([json], { type: 'application/json;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    const filename = `joj-shared-deck-template-${stamp}.json`;
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
    setImportJson(json);
  };
  const uploadDataUrl = async (filename: string, dataUrl: string, cardId?: string): Promise<string | null> => {
    try {
      const response = await fetch('/api/upload-card-image', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          filename,
          dataUrl,
          cardId,
        }),
      });
      const payload = (await response.json()) as { path?: string; error?: string };
      if (!response.ok || !payload.path) {
        setEditError(payload.error ?? (lang === 'uk' ? 'Помилка завантаження' : 'Upload failed'));
        return null;
      }
      return payload.path;
    } catch {
      setEditError(lang === 'uk' ? 'Помилка завантаження' : 'Upload failed');
      return null;
    }
  };
  const attachImageFile = async (file: File | null) => {
    if (!file) return;
    const sourceUrl = URL.createObjectURL(file);
    setCropDraft({
      filename: file.name,
      sourceBlob: file,
      sourceUrl,
      mime: file.type || 'image/png',
      sourceWidth: 0,
      sourceHeight: 0,
      topPx: 0,
      rightPx: 0,
      bottomPx: 0,
      leftPx: 0,
    });
    setEditError('');
  };
  const startCropFromCurrentImage = async () => {
    const src = normalizeImagePath(editCard.image?.trim());
    if (!src) return;
    try {
      const response = await fetch(src);
      if (!response.ok) {
        setEditError(lang === 'uk' ? 'Не вдалося завантажити поточне зображення' : 'Failed to load current image');
        return;
      }
      const blob = await response.blob();
      const nameFromPath = src.split('/').pop() || `${editCard.id || 'card-image'}.png`;
      const sourceUrl = URL.createObjectURL(blob);
      setCropDraft({
        filename: nameFromPath,
        sourceBlob: blob,
        sourceUrl,
        mime: blob.type || 'image/png',
        sourceWidth: 0,
        sourceHeight: 0,
        topPx: 0,
        rightPx: 0,
        bottomPx: 0,
        leftPx: 0,
      });
      setEditError('');
    } catch {
      setEditError(lang === 'uk' ? 'Не вдалося завантажити поточне зображення' : 'Failed to load current image');
    }
  };
  const uploadOriginalFromCropDraft = async () => {
    if (!cropDraft) return;
    const dataUrl = await blobToDataUrl(cropDraft.sourceBlob);
    if (!dataUrl) {
      setEditError(lang === 'uk' ? 'Не вдалося прочитати зображення' : 'Failed to read image');
      return;
    }
    const path = await uploadDataUrl(cropDraft.filename, dataUrl);
    if (!path) return;
    setEditError('');
    setEditCard((prev) => ({ ...prev, image: path }));
    setImagePreviewNonce((v) => v + 1);
    setCropDraft(null);
  };
  const applyCropAndUpload = async () => {
    if (!cropDraft) return;
    const image = new Image();
    const loaded = await new Promise<boolean>((resolve) => {
      image.onload = () => resolve(true);
      image.onerror = () => resolve(false);
      image.src = cropDraft.sourceUrl;
    });
    if (!loaded) {
      setEditError(lang === 'uk' ? 'Не вдалося обробити зображення' : 'Failed to process image');
      return;
    }

    const { sx, sy, sw, sh } = getAspectLockedCropRect(cropDraft, image.width, image.height);

    const canvas = document.createElement('canvas');
    canvas.width = sw;
    canvas.height = sh;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      setEditError(lang === 'uk' ? 'Не вдалося обробити зображення' : 'Failed to process image');
      return;
    }
    ctx.drawImage(image, sx, sy, sw, sh, 0, 0, sw, sh);

    const outDataUrl = canvas.toDataURL(cropDraft.mime);
    const path = await uploadDataUrl(cropDraft.filename, outDataUrl);
    if (!path) return;
    setEditError('');
    setEditCard((prev) => ({ ...prev, image: path }));
    setImagePreviewNonce((v) => v + 1);
    setCropDraft(null);
  };
  const cancelCropDraft = () => {
    setCropDraft(null);
    setEditError('');
  };
  const uploadDeckBackImage = async (file: File | null) => {
    if (!file) return;
    const reader = new FileReader();
    const dataUrl = await new Promise<string>((resolve) => {
      reader.onload = () => resolve(typeof reader.result === 'string' ? reader.result : '');
      reader.onerror = () => resolve('');
      reader.readAsDataURL(file);
    });
    if (!dataUrl) {
      setEditError(lang === 'uk' ? 'Не вдалося прочитати файл зображення' : 'Failed to read image file');
      return;
    }
    const path = await uploadDataUrl(file.name, dataUrl, 'deck-back');
    if (!path) {
      return;
    }
    onSetDeckBackImage(path);
    setDeckBackImageInput(path);
    setImagePreviewNonce((v) => v + 1);
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
  const imageSrc = normalizeImagePath(selectedCard?.image) ?? (selectedCard ? `/cards/${selectedCard.id}.png` : '');
  const getImageSrc = (card: CardDefinition) => normalizeImagePath(card.image) ?? `/cards/${card.id}.png`;
  const closeEditor = () => {
    setEditIndex(-1);
    setEditError('');
  };
  const updateRankAt = (index: number, updater: (rank: RankDefinition) => RankDefinition) => {
    const next = sharedRanks.map((rank, i) => (i === index ? updater({
      ...rank,
      requirement: { ...rank.requirement },
      bonus: { ...rank.bonus },
    }) : rank));
    onUpdateRanks(next);
  };
  const addRank = () => {
    const id = rankDraft.id.trim();
    const name = rankDraft.name.trim();
    if (!id || !name) return;
    const next: RankDefinition[] = [
      ...sharedRanks.map((row) => ({ ...row, requirement: { ...row.requirement }, bonus: { ...row.bonus } })),
      {
        id,
        name,
        requirement: { ...rankDraft.requirement },
        bonus: { ...rankDraft.bonus },
      },
    ];
    const ok = onUpdateRanks(next);
    if (!ok) return;
    setRankDraft({ id: '', name: '', requirement: {}, bonus: {} });
  };
  const removeRankAt = (index: number) => {
    if (sharedRanks.length <= 1) return;
    const next = sharedRanks.filter((_, i) => i !== index);
    onUpdateRanks(next);
  };

  const inlineEditor = (
    <div className="admin-inline-editor">
      <h4>{t.cardEditor}</h4>
      <div className="admin-editor-grid">
        <label>{t.fieldId}<input value={editCard.id} onChange={(e) => setEditCard((prev) => ({ ...prev, id: e.target.value }))} /></label>
        <label>{t.fieldTitle}<input value={editCard.title} onChange={(e) => setEditCard((prev) => ({ ...prev, title: e.target.value }))} /></label>
        <label>{t.fieldCategory}
          <select value={editCard.category} onChange={(e) => setEditCard((prev) => ({ ...prev, category: e.target.value as CardCategory }))}>
            {categories.map((cat) => <option key={cat} value={cat}>{cat}</option>)}
          </select>
        </label>
        <label>{t.fieldImagePath}
          <input value={editCard.image ?? ''} onChange={(e) => setEditCard((prev) => ({ ...prev, image: e.target.value }))} />
        </label>
        <label>{t.fieldImageFile}
          <input type="file" accept="image/*" onChange={(e) => attachImageFile(e.target.files?.[0] ?? null)} />
        </label>
        {cropDraft ? (
          <div className="admin-crop-editor">
            <p><strong>{t.cropEditorTitle}</strong></p>
            <p>{t.cropAspectLocked}</p>
            {cropDraft.sourceWidth > 0 && cropDraft.sourceHeight > 0 ? (
              <p>{t.cropSourceSize}: {cropDraft.sourceWidth}x{cropDraft.sourceHeight}px</p>
            ) : null}
            <div className="admin-crop-grid">
              <label>{t.cropTop}
                <input
                  type="number"
                  min={0}
                  max={Math.max(0, cropDraft.sourceHeight - 1)}
                  value={cropDraft.topPx}
                  onChange={(e) => setCropDraft((prev) => (prev ? { ...prev, topPx: Number(e.target.value || 0) } : prev))}
                />
              </label>
              <label>{t.cropRight}
                <input
                  type="number"
                  min={0}
                  max={Math.max(0, cropDraft.sourceWidth - 1)}
                  value={cropDraft.rightPx}
                  onChange={(e) => setCropDraft((prev) => (prev ? { ...prev, rightPx: Number(e.target.value || 0) } : prev))}
                />
              </label>
              <label>{t.cropBottom}
                <input
                  type="number"
                  min={0}
                  max={Math.max(0, cropDraft.sourceHeight - 1)}
                  value={cropDraft.bottomPx}
                  onChange={(e) => setCropDraft((prev) => (prev ? { ...prev, bottomPx: Number(e.target.value || 0) } : prev))}
                />
              </label>
              <label>{t.cropLeft}
                <input
                  type="number"
                  min={0}
                  max={Math.max(0, cropDraft.sourceWidth - 1)}
                  value={cropDraft.leftPx}
                  onChange={(e) => setCropDraft((prev) => (prev ? { ...prev, leftPx: Number(e.target.value || 0) } : prev))}
                />
              </label>
            </div>
            <canvas className="admin-crop-preview" ref={cropPreviewRef} />
            <p className="admin-controls">
              <button type="button" onClick={applyCropAndUpload}>{t.applyCropUpload}</button>
              <button type="button" onClick={uploadOriginalFromCropDraft}>{t.uploadWithoutCrop}</button>
              <button type="button" onClick={cancelCropDraft}>{t.cancelCrop}</button>
            </p>
          </div>
        ) : null}
        {editCard.image ? (
          <label>{t.fieldImagePreview}
            <HoverImage
              src={withCacheBust(editCard.image)}
              className="admin-thumb"
              alt={t.fieldImagePreview}
              onLoad={(e) => {
                (e.currentTarget as HTMLImageElement).style.display = 'inline-block';
                (e.currentTarget as HTMLImageElement).style.visibility = 'visible';
              }}
              onError={(e) => {
                (e.currentTarget as HTMLImageElement).style.display = 'none';
              }}
            />
            <span className="admin-controls">
              <button type="button" onClick={startCropFromCurrentImage}>
                {t.cropCurrentImage}
              </button>
            </span>
          </label>
        ) : null}
        <label>{t.fieldQuickImagePath}
          <span className="admin-controls">
            <button type="button" onClick={() => setEditCard((prev) => ({ ...prev, image: `/cards/${prev.id || 'card-id'}.png` }))}>
              /cards/&lt;id&gt;.png
            </button>
            <button type="button" onClick={() => setEditCard((prev) => ({ ...prev, image: `/cards/${prev.id || 'card-id'}.webp` }))}>
              /cards/&lt;id&gt;.webp
            </button>
          </span>
        </label>
        <label>{t.fieldFlavor}
          <input value={editCard.flavor ?? ''} onChange={(e) => setEditCard((prev) => ({ ...prev, flavor: e.target.value }))} />
        </label>
      </div>
      <label>
        {t.effectsJson}
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
      <h5>{t.effectsDelta}</h5>
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
        <button type="button" onClick={saveEdit}>{t.saveCard}</button>
        <button type="button" onClick={addFromForm}>{t.addCustomCard}</button>
        <button type="button" onClick={closeEditor}>{t.close}</button>
      </p>
    </div>
  );

  return (
    <section className="board admin-panel">
      <h2>{t.adminTitle}</h2>
      <p>{t.adminPath}: <code>/admin</code></p>
      <p>{t.adminMode}: {t.adminModeLocal}</p>
      <p className="admin-controls">
        <button type="button" onClick={() => setActiveTab('matches')} disabled={activeTab === 'matches'}>{t.tabMatches}</button>
        <button type="button" onClick={() => setActiveTab('deck')} disabled={activeTab === 'deck'}>{t.tabDeck}</button>
        <button type="button" onClick={() => setActiveTab('import')} disabled={activeTab === 'import'}>{t.tabImportExport}</button>
        <button type="button" onClick={() => setActiveTab('ranks')} disabled={activeTab === 'ranks'}>{t.tabRanks}</button>
        <button type="button" onClick={() => setActiveTab('state')} disabled={activeTab === 'state'}>{t.tabState}</button>
        <button type="button" onClick={() => setActiveTab('simulation')} disabled={activeTab === 'simulation'}>{t.tabSimulation}</button>
      </p>
      <hr />
      {activeTab === 'matches' ? (
        <>
          <p>
            {t.matches}: {matches.length}
          </p>
          <p>
            {t.activeMatch}: <code>{activeMatchId || t.notSelected}</code>
          </p>
          <p>
            {t.createdAt}: {activeMatch ? new Date(activeMatch.createdAt).toLocaleString() : t.notSelected}
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
        </>
      ) : null}

      {activeTab === 'deck' ? (
        <>
          <h3>{t.deckControls}</h3>
          <p>
            {t.deckCount}: {deckStats.deck} | {t.discardCount}: {deckStats.discard} | {t.legendaryCount}: {deckStats.legendary}
          </p>
          <p className="admin-controls">
            <select value={target} onChange={(e) => setTarget(e.target.value as DeckTarget)}>
              <option value="deck">{t.mainDeck}</option>
              <option value="legendaryDeck">{t.legendaryDeckLabel}</option>
            </select>
            <label>
              {t.categoryFilter}
              <select value={categoryFilter} onChange={(e) => setCategoryFilter(e.target.value as CategoryFilter)}>
                <option value="ALL">{t.allCategories}</option>
                {categories.map((cat) => (
                  <option key={`filter-${cat}`} value={cat}>{cat}</option>
                ))}
              </select>
            </label>
            <select value={selectedCardId} onChange={(e) => setSelectedCardId(e.target.value)}>
              {filteredCatalog.map((card) => (
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
          <p className="admin-controls">
            <label>
              {t.deckBackImageLabel}
              <input
                value={deckBackImageInput}
                onChange={(e) => setDeckBackImageInput(e.target.value)}
                placeholder="/cards/deck-back.png"
              />
            </label>
            <button
              type="button"
              onClick={() => onSetDeckBackImage(deckBackImageInput)}
            >
              {t.saveCard}
            </button>
            <label>
              {t.deckBackImageFile}
              <input type="file" accept="image/*" onChange={(e) => uploadDeckBackImage(e.target.files?.[0] ?? null)} />
            </label>
            <button type="button" onClick={() => onSetDeckBackImage(undefined)}>
              {t.clearDeckBackImage}
            </button>
          </p>
          {sharedDeckTemplate.deckBackImage ? (
            <div className="admin-card-preview">
              <HoverImage
                src={withCacheBust(sharedDeckTemplate.deckBackImage)}
                alt={t.deckBackImageLabel}
                className="admin-card-preview-image"
              />
            </div>
          ) : null}

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
                  {editTarget === 'deck' && editIndex === index ? inlineEditor : null}
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
                  {editTarget === 'legendaryDeck' && editIndex === index ? inlineEditor : null}
                </li>
              ))}
            </ul>
          </div>
        </>
      ) : null}

      {activeTab === 'import' ? (
        <>
          <h3>{t.importExport}</h3>
          <p className="admin-controls">
            <button type="button" onClick={exportToFile}>{t.exportJson}</button>
            <label>
              {t.importToDeck}
              <select
                value={importTarget}
                onChange={(e) => {
                  setImportTarget(e.target.value as DeckTarget);
                  setImportStatus('');
                }}
              >
                <option value="deck">{t.mainDeck}</option>
                <option value="legendaryDeck">{t.legendaryDeckLabel}</option>
              </select>
            </label>
            <label>
              {t.importCategoryLabel}
              <select
                value={importCategoryMode}
                onChange={(e) => {
                  setImportCategoryMode(e.target.value as ImportCategoryMode);
                  setImportStatus('');
                }}
              >
                <option value="AS_IS">{t.importCategoryAsIs}</option>
                {categories.map((cat) => (
                  <option key={`import-cat-${cat}`} value={cat}>{cat}</option>
                ))}
              </select>
            </label>
            <button type="button" onClick={runImport}>{t.importJson}</button>
            <label>
              {t.importFile}
              <input type="file" accept="application/json,.json" onChange={(e) => importFromFile(e.target.files?.[0] ?? null)} />
            </label>
          </p>
          {importError ? <p className="admin-error">{importError}</p> : null}
          {importStatus ? <p className="admin-success">{importStatus}</p> : null}
          <textarea
            className="admin-textarea"
            value={importJson}
            onChange={(e) => {
              setImportJson(e.target.value);
              setImportStatus('');
            }}
          />
        </>
      ) : null}

      {activeTab === 'state' ? (
        <>
          <h3>{t.stateSnapshot}</h3>
          <p>
            {t.updatedAt}: {snapshot ? new Date(snapshot.updatedAt).toLocaleString() : t.notSelected}
          </p>
          <pre className="admin-json">
            {snapshot ? JSON.stringify({ G: snapshot.G, ctx: snapshot.ctx }, null, 2) : t.noStateYet}
          </pre>
        </>
      ) : null}
      {activeTab === 'ranks' ? (
        <>
          <h3>{t.ranksTitle}</h3>
          <p>{t.ranksHint}</p>
          <div className="admin-deck-list">
            <ul>
              {sharedRanks.map((rank, index) => (
                <li key={`rank-${rank.id}-${index}`}>
                  <div className="admin-inline-editor">
                    <div className="admin-editor-grid">
                      <label>
                        ID
                        <input
                          value={rank.id}
                          onChange={(e) => updateRankAt(index, (row) => ({ ...row, id: e.target.value }))}
                        />
                      </label>
                      <label>
                        {lang === 'uk' ? 'Назва' : 'Name'}
                        <input
                          value={rank.name}
                          onChange={(e) => updateRankAt(index, (row) => ({ ...row, name: e.target.value }))}
                        />
                      </label>
                      {rankResourceKeys.map((key) => (
                        <label key={`req-${rank.id}-${key}`}>
                          {t.resources[key]}
                          <input
                            type="number"
                            min={0}
                            value={rank.requirement[key] ?? 0}
                            onChange={(e) => updateRankAt(index, (row) => ({
                              ...row,
                              requirement: {
                                ...row.requirement,
                                [key]: Math.max(0, Number(e.target.value || 0)),
                              },
                            }))}
                          />
                        </label>
                      ))}
                      {rankResourceKeys.map((key) => (
                        <label key={`bonus-${rank.id}-${key}`}>
                          {`${t.rankBonusLabel} ${t.resources[key]}`}
                          <input
                            type="number"
                            value={rank.bonus[key] ?? 0}
                            onChange={(e) => updateRankAt(index, (row) => ({
                              ...row,
                              bonus: {
                                ...row.bonus,
                                [key]: Number(e.target.value || 0),
                              },
                            }))}
                          />
                        </label>
                      ))}
                    </div>
                    <p className="admin-controls">
                      <button type="button" onClick={() => removeRankAt(index)} disabled={sharedRanks.length <= 1}>
                        {t.removeCard}
                      </button>
                    </p>
                  </div>
                </li>
              ))}
            </ul>
          </div>

          <h4>{t.addRank}</h4>
          <div className="admin-inline-editor">
            <div className="admin-editor-grid">
              <label>
                ID
                <input value={rankDraft.id} onChange={(e) => setRankDraft((prev) => ({ ...prev, id: e.target.value }))} />
              </label>
              <label>
                {lang === 'uk' ? 'Назва' : 'Name'}
                <input value={rankDraft.name} onChange={(e) => setRankDraft((prev) => ({ ...prev, name: e.target.value }))} />
              </label>
              {rankResourceKeys.map((key) => (
                <label key={`draft-req-${key}`}>
                  {t.resources[key]}
                  <input
                    type="number"
                    min={0}
                    value={rankDraft.requirement[key] ?? 0}
                    onChange={(e) => setRankDraft((prev) => ({
                      ...prev,
                      requirement: {
                        ...prev.requirement,
                        [key]: Math.max(0, Number(e.target.value || 0)),
                      },
                    }))}
                  />
                </label>
              ))}
              {rankResourceKeys.map((key) => (
                <label key={`draft-bonus-${key}`}>
                  {`${t.rankBonusLabel} ${t.resources[key]}`}
                  <input
                    type="number"
                    value={rankDraft.bonus[key] ?? 0}
                    onChange={(e) => setRankDraft((prev) => ({
                      ...prev,
                      bonus: {
                        ...prev.bonus,
                        [key]: Number(e.target.value || 0),
                      },
                    }))}
                  />
                </label>
              ))}
            </div>
            <p className="admin-controls">
              <button type="button" onClick={addRank}>{t.addRank}</button>
              <button type="button" onClick={onResetRanks}>{t.resetRanks}</button>
            </p>
          </div>
        </>
      ) : null}
      {activeTab === 'simulation' ? (
        <>
          <h3>{t.simulationTitle}</h3>
          <p className="admin-controls">
            <label>
              {t.simulationPlayers}
              <select
                value={simulationPlayers}
                onChange={(e) => setSimulationPlayers(Number(e.target.value))}
                disabled={simulationRunning}
              >
                <option value={2}>2</option>
                <option value={3}>3</option>
                <option value={4}>4</option>
                <option value={5}>5</option>
                <option value={6}>6</option>
              </select>
            </label>
            <label>
              {t.simulationCount}
              <input
                type="number"
                min={1}
                max={5000}
                step={1}
                value={simulationCount}
                onChange={(e) => setSimulationCount(Number(e.target.value || 1))}
                disabled={simulationRunning}
              />
            </label>
            <button
              type="button"
              disabled={simulationRunning}
              onClick={() => {
                setSimulationRunning(true);
                setTimeout(() => {
                  const report = onRunSimulations(simulationPlayers, simulationCount);
                  setSimulationReport(report);
                  setSimulationRunning(false);
                }, 0);
              }}
            >
              {simulationRunning ? t.simulationRunning : t.simulationRun}
            </button>
          </p>
          <h4>{t.simulationReport}</h4>
          {!simulationReport ? <p>{t.simulationNoReport}</p> : (
            <div>
              <p>
                {lang === 'uk'
                  ? `Виконано симуляцій: ${simulationReport.input.simulations} (гравців у матчі: ${simulationReport.input.players}).`
                  : `Simulations: ${simulationReport.input.simulations} (players per game: ${simulationReport.input.players}).`}
              </p>
              <p>
                {lang === 'uk'
                  ? `Завершені: ${simulationReport.summary.finished}, завислі: ${simulationReport.summary.stalled}, середня кількість ходів: ${simulationReport.summary.avgTurns}.`
                  : `Finished: ${simulationReport.summary.finished}, stalled: ${simulationReport.summary.stalled}, average turns: ${simulationReport.summary.avgTurns}.`}
              </p>
              <p>
                {lang === 'uk'
                  ? `Перемоги за званням: ${simulationReport.summary.rankWins}, за очками: ${simulationReport.summary.scoreWins}.`
                  : `Rank wins: ${simulationReport.summary.rankWins}, score wins: ${simulationReport.summary.scoreWins}.`}
              </p>
              <p>
                {lang === 'uk'
                  ? `Winrate за місцями: ${simulationReport.seatWinRates.map((row) => `#${Number(row.playerID) + 1} ${row.winRatePct}%`).join(' | ')}`
                  : `Seat winrate: ${simulationReport.seatWinRates.map((row) => `#${Number(row.playerID) + 1} ${row.winRatePct}%`).join(' | ')}`}
              </p>
              <p>
                {lang === 'uk'
                  ? `Переміг гравець №${Number(simulationReport.lastGame.winnerPlayerID) + 1}.`
                  : `Winner: player #${Number(simulationReport.lastGame.winnerPlayerID) + 1}.`}
              </p>
              <p>
                {lang === 'uk'
                  ? `Досягнуте звання: ${simulationReport.lastGame.winnerRankId}.`
                  : `Reached rank: ${simulationReport.lastGame.winnerRankId}.`}
              </p>
              <p>
                {lang === 'uk'
                  ? `Накопичені ресурси: час ${simulationReport.lastGame.winnerResources.time}, авторитет ${simulationReport.lastGame.winnerResources.reputation}, дисципліна ${simulationReport.lastGame.winnerResources.discipline}, документи ${simulationReport.lastGame.winnerResources.documents}, технології ${simulationReport.lastGame.winnerResources.tech}.`
                  : `Resources: time ${simulationReport.lastGame.winnerResources.time}, reputation ${simulationReport.lastGame.winnerResources.reputation}, discipline ${simulationReport.lastGame.winnerResources.discipline}, documents ${simulationReport.lastGame.winnerResources.documents}, tech ${simulationReport.lastGame.winnerResources.tech}.`}
              </p>
              <p>
                {lang === 'uk'
                  ? `Ходів у симуляції: ${simulationReport.lastGame.turns}.`
                  : `Turns in simulation: ${simulationReport.lastGame.turns}.`}
              </p>
              {simulationReport.issues.length ? (
                <pre className="admin-json">{simulationReport.issues.join('\n')}</pre>
              ) : null}
            </div>
          )}
        </>
      ) : null}
      <p>
        <a href="/">{t.openGame}</a>
      </p>
    </section>
  );
};
