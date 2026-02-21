import { useEffect, useMemo, useState } from 'react';
import { LobbyClient } from 'boardgame.io/client';
import { Client } from 'boardgame.io/react';
import { SocketIO } from 'boardgame.io/multiplayer';
import type { CardDefinition, RankDefinition } from '../game/types';
import {
  addCustomCardToSharedDeckTemplate,
  addCardToSharedDeckTemplate,
  type DeckTarget,
  exportSharedDeckTemplateJson,
  getCardCatalog,
  getSharedRanks,
  getSharedDeckTemplate,
  getSharedDeckTemplateStats,
  importSharedDeckTemplateJson,
  jojGame,
  normalizeImagePath,
  removeCardAtFromSharedDeckTemplate,
  runGameSimulations,
  setSharedRanks,
  resetSharedRanks,
  resetSharedDeckTemplate,
  setSharedDeckBackImage,
  shuffleSharedDeckTemplate,
  updateCardAtInSharedDeckTemplate,
} from '../game/jojGame';
import { AdminPage } from './AdminPage';
import { Board } from './Board';
import type { Language } from './i18n';
import { cardTitle, categoryLabel, defaultLanguage, text } from './i18n';

const SERVER_URL = `http://${window.location.hostname}:8000`;
const GAME_NAME = 'joj-game';

const NetworkClient = Client({
  game: jojGame,
  board: Board,
  debug: false,
  numPlayers: 6,
  multiplayer: SocketIO({ server: SERVER_URL }),
});

const lobbyClient = new LobbyClient({ server: SERVER_URL });

const SHARED_TEMPLATE_STORAGE_KEY = 'joj-shared-deck-template-v1';
const PLAYER_NAME_STORAGE_KEY = 'joj-player-name-v1';
const SESSION_STORAGE_KEY = 'joj-network-session-v1';
const TEMPLATE_API = `${SERVER_URL}/api/shared-deck-template`;
const RANKS_STORAGE_KEY = 'joj-shared-ranks-v1';
const RANKS_API = `${SERVER_URL}/api/shared-ranks`;
const ADMIN_RESTART_API = `${SERVER_URL}/api/admin/restart`;
const ADMIN_MATCH_STATE_API = `${SERVER_URL}/api/admin/match-state`;

type LobbyPlayer = {
  id: number;
  name?: string;
};

type LobbyMatch = {
  matchID: string;
  players: LobbyPlayer[];
};

type SharedDeckTemplate = {
  deck: CardDefinition[];
  legendaryDeck: CardDefinition[];
  deckBackImage?: string;
};

type Snapshot = {
  G: unknown;
  ctx: unknown;
  updatedAt: number;
};

type Session = {
  matchID: string;
  playerID: string;
  credentials: string;
};

type UserTab = 'games' | 'gallery' | 'rules';
type GalleryCategoryFilter = CardDefinition['category'] | 'ALL';
const galleryCategories: CardDefinition['category'][] = ['LYAP', 'SCANDAL', 'SUPPORT', 'DECISION', 'NEUTRAL', 'VVNZ', 'LEGENDARY'];

const parseSession = (raw: string | null): Session | null => {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    if (
      typeof parsed.matchID === 'string' &&
      typeof parsed.playerID === 'string' &&
      typeof parsed.credentials === 'string'
    ) {
      return {
        matchID: parsed.matchID,
        playerID: parsed.playerID,
        credentials: parsed.credentials,
      };
    }
  } catch {
    // ignore
  }
  return null;
};

export const App = () => {
  const isAdminRoute = window.location.pathname.startsWith('/admin');
  const [lang, setLang] = useState<Language>(() => {
    const stored = window.localStorage.getItem('joj-lang');
    return stored === 'en' || stored === 'uk' ? stored : defaultLanguage;
  });
  const [playerName, setPlayerName] = useState<string>(() => window.localStorage.getItem(PLAYER_NAME_STORAGE_KEY) ?? '');
  const [roomCapacity, setRoomCapacity] = useState<number>(2);
  const [matches, setMatches] = useState<LobbyMatch[]>([]);
  const [session, setSession] = useState<Session | null>(() => parseSession(window.localStorage.getItem(SESSION_STORAGE_KEY)));
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string>('');
  const [matchesSynced, setMatchesSynced] = useState<boolean>(false);
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);

  const [, setSharedDeckVersion] = useState<number>(0);
  const [sharedDeckTemplate, setSharedDeckTemplate] = useState<SharedDeckTemplate>(getSharedDeckTemplate);
  const [cardCatalog, setCardCatalog] = useState<CardDefinition[]>(getCardCatalog);
  const [sharedRanks, setSharedRanksState] = useState<RankDefinition[]>(getSharedRanks);
  const [activeUserTab, setActiveUserTab] = useState<UserTab>('games');
  const [galleryCategoryFilter, setGalleryCategoryFilter] = useState<GalleryCategoryFilter>('ALL');

  const t = text(lang);
  const sharedDeckStats = getSharedDeckTemplateStats();
  const galleryCards = useMemo(() => (
    [...cardCatalog]
      .filter((card) => galleryCategoryFilter === 'ALL' || card.category === galleryCategoryFilter)
      .sort((a, b) => a.category.localeCompare(b.category) || a.title.localeCompare(b.title))
  ), [cardCatalog, galleryCategoryFilter]);
  const effectLabel = (resource: 'time' | 'reputation' | 'discipline' | 'documents' | 'tech' | 'rank') =>
    resource === 'rank' ? t.rankResource : t.resources[resource];
  const rules = t.rulesList;

  const syncTemplateToServer = async (json: string) => {
    try {
      const response = await fetch(`${TEMPLATE_API}/import`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ json }),
      });
      if (!response.ok) return false;
      return true;
    } catch {
      return false;
    }
  };

  const syncRanksToServer = async (ranks: RankDefinition[]) => {
    try {
      const response = await fetch(RANKS_API, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ranks }),
      });
      return response.ok;
    } catch {
      return false;
    }
  };

  const loadTemplateFromServer = async (): Promise<boolean> => {
    try {
      const response = await fetch(TEMPLATE_API);
      if (!response.ok) return false;
      const payload = (await response.json()) as { json?: string };
      if (typeof payload.json !== 'string') return false;
      const result = importSharedDeckTemplateJson(payload.json);
      if (!result.ok) return false;
      setSharedDeckTemplate(getSharedDeckTemplate());
      setCardCatalog(getCardCatalog());
      window.localStorage.setItem(SHARED_TEMPLATE_STORAGE_KEY, exportSharedDeckTemplateJson());
      setSharedDeckVersion((v) => v + 1);
      return true;
    } catch {
      return false;
    }
  };

  const loadRanksFromServer = async (): Promise<boolean> => {
    try {
      const response = await fetch(RANKS_API);
      if (!response.ok) return false;
      const payload = (await response.json()) as { ranks?: RankDefinition[] };
      if (!Array.isArray(payload.ranks)) return false;
      if (!setSharedRanks(payload.ranks)) return false;
      setSharedRanksState(getSharedRanks());
      window.localStorage.setItem(RANKS_STORAGE_KEY, JSON.stringify(getSharedRanks()));
      return true;
    } catch {
      return false;
    }
  };

  const refreshSharedDeckTemplate = (sync = true) => {
    setSharedDeckTemplate(getSharedDeckTemplate());
    setCardCatalog(getCardCatalog());
    const json = exportSharedDeckTemplateJson();
    window.localStorage.setItem(SHARED_TEMPLATE_STORAGE_KEY, json);
    setSharedDeckVersion((v) => v + 1);
    if (sync) {
      void syncTemplateToServer(json);
    }
  };

  const refreshMatches = async () => {
    setLoading(true);
    setError('');
    try {
      const response = (await lobbyClient.listMatches(GAME_NAME)) as { matches: LobbyMatch[] };
      setMatches(response.matches ?? []);
      setMatchesSynced(true);
    } catch {
      setError(t.serverUnavailable);
    } finally {
      setLoading(false);
    }
  };

  const createRoom = async () => {
    const name = playerName.trim();
    if (!name) {
      setError(t.enterName);
      return;
    }
    setLoading(true);
    setError('');
    try {
      const result = await lobbyClient.createMatch(GAME_NAME, {
        numPlayers: Math.max(2, Math.min(6, roomCapacity)),
      });
      const matchID = result.matchID;
      const joined = await lobbyClient.joinMatch(GAME_NAME, matchID, {
        playerID: '0',
        playerName: name,
      });
      const nextSession: Session = {
        matchID,
        playerID: joined.playerID,
        credentials: joined.playerCredentials,
      };
      setSession(nextSession);
      window.localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(nextSession));
      await refreshMatches();
    } catch {
      setError(t.createFailed);
    } finally {
      setLoading(false);
    }
  };

  const joinRoom = async (match: LobbyMatch) => {
    const name = playerName.trim();
    if (!name) {
      setError(t.enterName);
      return;
    }

    const freePlayer = match.players.find((player) => !player.name);
    if (!freePlayer) {
      setError(t.roomFull);
      return;
    }

    setLoading(true);
    setError('');
    try {
      const joined = await lobbyClient.joinMatch(GAME_NAME, match.matchID, {
        playerID: String(freePlayer.id),
        playerName: name,
      });
      const nextSession: Session = {
        matchID: match.matchID,
        playerID: joined.playerID,
        credentials: joined.playerCredentials,
      };
      setSession(nextSession);
      window.localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(nextSession));
      await refreshMatches();
    } catch {
      setError(t.joinFailed);
    } finally {
      setLoading(false);
    }
  };

  const leaveRoom = async () => {
    if (!session) return;
    setLoading(true);
    setError('');
    try {
      await lobbyClient.leaveMatch(GAME_NAME, session.matchID, {
        playerID: session.playerID,
        credentials: session.credentials,
      });
    } catch {
      // match may already be gone; continue clearing local session
    } finally {
      setSession(null);
      window.localStorage.removeItem(SESSION_STORAGE_KEY);
      await refreshMatches();
      setLoading(false);
    }
  };

  const activeMatch = useMemo(
    () => matches.find((match) => match.matchID === session?.matchID) ?? null,
    [matches, session?.matchID],
  );
  const adminMatchID = useMemo(() => session?.matchID ?? matches[0]?.matchID ?? '', [matches, session?.matchID]);
  const roomPlayerNames = useMemo<Record<string, string>>(() => {
    if (!activeMatch) return {};
    return activeMatch.players.reduce<Record<string, string>>((acc, player) => {
      const name = player.name?.trim();
      if (name) acc[String(player.id)] = name;
      return acc;
    }, {});
  }, [activeMatch]);

  const canStart = Boolean(activeMatch && activeMatch.players.every((player) => Boolean(player.name)));
  const sessionBroken = Boolean(session && matchesSynced && !activeMatch && !loading);

  useEffect(() => {
    void (async () => {
      const loadedFromServer = await loadTemplateFromServer();
      if (!loadedFromServer) {
        const saved = window.localStorage.getItem(SHARED_TEMPLATE_STORAGE_KEY);
        if (saved) {
          const result = importSharedDeckTemplateJson(saved);
          if (result.ok) {
            refreshSharedDeckTemplate(false);
          }
        }
      }
      const loadedRanksFromServer = await loadRanksFromServer();
      if (!loadedRanksFromServer) {
        const saved = window.localStorage.getItem(RANKS_STORAGE_KEY);
        if (saved) {
          try {
            const parsed = JSON.parse(saved) as RankDefinition[];
            if (setSharedRanks(parsed)) {
              setSharedRanksState(getSharedRanks());
            }
          } catch {
            // ignore
          }
        }
      }
    })();
  }, []);

  useEffect(() => {
    refreshMatches();
    const id = window.setInterval(() => {
      refreshMatches();
    }, 4000);
    return () => window.clearInterval(id);
  }, []);

  useEffect(() => {
    if (!sessionBroken) return;
    setSession(null);
    window.localStorage.removeItem(SESSION_STORAGE_KEY);
  }, [sessionBroken]);

  useEffect(() => {
    if (!isAdminRoute) return;
    if (!adminMatchID) {
      setSnapshot(null);
      return;
    }

    let cancelled = false;
    const fetchSnapshot = async () => {
      try {
        const response = await fetch(`${ADMIN_MATCH_STATE_API}?matchID=${encodeURIComponent(adminMatchID)}`);
        if (!response.ok) {
          if (!cancelled) setSnapshot(null);
          return;
        }
        const payload = (await response.json()) as {
          snapshot?: { G: unknown; ctx: unknown; updatedAt?: number };
        };
        if (!cancelled && payload.snapshot) {
          setSnapshot({
            G: payload.snapshot.G,
            ctx: payload.snapshot.ctx,
            updatedAt: payload.snapshot.updatedAt ?? Date.now(),
          });
        }
      } catch {
        if (!cancelled) setSnapshot(null);
      }
    };

    void fetchSnapshot();
    const timer = window.setInterval(() => {
      void fetchSnapshot();
    }, 2500);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [adminMatchID, isAdminRoute]);

  useEffect(() => {
    window.localStorage.setItem('joj-lang', lang);
    document.documentElement.lang = lang;
    document.title = isAdminRoute ? t.adminTitle : t.gameTitle;
  }, [isAdminRoute, lang, t.adminTitle, t.gameTitle]);

  useEffect(() => {
    window.localStorage.setItem(PLAYER_NAME_STORAGE_KEY, playerName);
  }, [playerName]);

  return (
    <main className="app">
      <h1>{isAdminRoute ? t.adminTitle : t.gameTitle}</h1>
      <p className="app-top-row">
        {t.language}:{' '}
        <button type="button" onClick={() => setLang('uk')} disabled={lang === 'uk'}>
          {t.langUk}
        </button>{' '}
        <button type="button" onClick={() => setLang('en')} disabled={lang === 'en'}>
          {t.langEn}
        </button>
      </p>
      <p className="app-link-row">
        {isAdminRoute ? <a href="/">{t.openGame}</a> : <a href="/admin">{t.openAdmin}</a>}
      </p>

      {!isAdminRoute ? (
        <p className="user-tabs">
          <button type="button" onClick={() => setActiveUserTab('games')} disabled={activeUserTab === 'games'}>
            {t.userTabGames}
          </button>
          <button type="button" onClick={() => setActiveUserTab('gallery')} disabled={activeUserTab === 'gallery'}>
            {t.userTabGallery}
          </button>
          <button type="button" onClick={() => setActiveUserTab('rules')} disabled={activeUserTab === 'rules'}>
            {t.userTabRules}
          </button>
        </p>
      ) : null}

      {!isAdminRoute && activeUserTab === 'games' && !session ? (
        <section className="board">
          <h2>{t.lobbyTitle}</h2>
          <p>
            {t.playerName}:{' '}
            <input
              value={playerName}
              onChange={(e) => setPlayerName(e.target.value)}
              placeholder={t.playerNamePlaceholder}
            />
          </p>
          <p>
            {t.roomCapacity}:{' '}
            <select value={roomCapacity} onChange={(e) => setRoomCapacity(Number(e.target.value))}>
              <option value={2}>2</option>
              <option value={3}>3</option>
              <option value={4}>4</option>
              <option value={5}>5</option>
              <option value={6}>6</option>
            </select>{' '}
            <button type="button" onClick={createRoom} disabled={!playerName.trim() || loading}>
              {t.createRoom}
            </button>{' '}
            <button type="button" onClick={refreshMatches} disabled={loading}>
              {t.refreshRooms}
            </button>
          </p>

          {error ? <p className="admin-error">{error}</p> : null}
          {loading ? <p>{t.loadingRooms}</p> : null}

          <h3>{t.availableRooms}</h3>
          {matches.length === 0 ? <p>{t.noRooms}</p> : null}
          {matches.map((match) => {
            const taken = match.players.filter((player) => Boolean(player.name)).length;
            const capacity = match.players.length;
            const hasFree = taken < capacity;
            return (
              <p key={match.matchID}>
                {match.matchID} | {taken}/{capacity}{' '}
                <button
                  type="button"
                  onClick={() => joinRoom(match)}
                  disabled={!playerName.trim() || loading || !hasFree}
                >
                  {t.joinRoom}
                </button>
              </p>
            );
          })}

        </section>
      ) : null}

      {!isAdminRoute && activeUserTab === 'games' && session ? (
        <section className="board">
          <h2>
            {t.activeRoom}: {session.matchID}
          </h2>
          <p>
            {t.joinedAs}: {playerName || '-'} (#{session.playerID})
          </p>
          {sessionBroken ? <p>{t.noRooms}</p> : null}
          {!sessionBroken && !canStart ? <p>{t.waitingForPlayers}</p> : null}
          <button type="button" onClick={leaveRoom} disabled={loading}>
            {t.leaveRoom}
          </button>
        </section>
      ) : null}

      <div style={{ display: !isAdminRoute && activeUserTab === 'games' && session && canStart ? 'block' : 'none' }}>
        {session ? (
          <NetworkClient
            key={`${session.matchID}:${session.playerID}`}
            matchID={session.matchID}
            playerID={session.playerID}
            credentials={session.credentials}
            lang={lang}
            playerName={playerName}
            knownPlayerNames={roomPlayerNames}
            sharedRanks={sharedRanks}
          />
        ) : null}
      </div>

      {!isAdminRoute && activeUserTab === 'gallery' ? (
        <section className="board">
          <h2>{t.galleryTitle}</h2>
          <p>{t.galleryDescription}</p>
          <p className="gallery-category-tabs">
            <button
              type="button"
              onClick={() => setGalleryCategoryFilter('ALL')}
              disabled={galleryCategoryFilter === 'ALL'}
            >
              {t.allCategories}
            </button>
              {galleryCategories.map((cat) => (
                <button
                  type="button"
                  key={`gallery-filter-${cat}`}
                  onClick={() => setGalleryCategoryFilter(cat)}
                  disabled={galleryCategoryFilter === cat}
                >
                  {categoryLabel(cat, lang)}
                </button>
              ))}
          </p>
          {galleryCards.length === 0 ? <p>{t.noCardsYet}</p> : null}
          <div className="gallery-grid">
            {galleryCards.map((card) => (
              <article key={card.id} className="gallery-card">
                <div className="gallery-card-image">
                  <img
                    src={normalizeImagePath(card.image) ?? `/cards/${card.id}.png`}
                    alt={cardTitle(card.id, card.title, lang)}
                    onError={(e) => {
                      (e.currentTarget as HTMLImageElement).style.display = 'none';
                    }}
                  />
                  <div className="gallery-card-popover" aria-hidden="true">
                    <img
                      src={normalizeImagePath(card.image) ?? `/cards/${card.id}.png`}
                      alt={cardTitle(card.id, card.title, lang)}
                    />
                  </div>
                </div>
                <h3>{cardTitle(card.id, card.title, lang)}</h3>
                <p>{card.flavor ?? ''}</p>
                <div className="gallery-effects">
                  {(card.effects ?? []).length === 0 ? (
                    <span className="pill pill-cost">0</span>
                  ) : (card.effects ?? []).map((effect, idx) => (
                    <span key={`${card.id}-effect-${idx}`} className="pill pill-effect">
                      {effectLabel(effect.resource)}: {effect.value > 0 ? `+${effect.value}` : effect.value}
                    </span>
                  ))}
                </div>
              </article>
            ))}
          </div>
        </section>
      ) : null}

      {!isAdminRoute && activeUserTab === 'rules' ? (
        <section className="board">
          <h2>{t.rulesTitle}</h2>
          <ol className="rules-list">
            {rules.map((rule, index) => (
              <li key={`rule-${index}`}>{rule}</li>
            ))}
          </ol>
        </section>
      ) : null}

      {isAdminRoute ? (
        <AdminPage
          lang={lang}
          matches={matches.map((m) => ({ id: m.matchID, createdAt: Date.now() }))}
          activeMatchId={adminMatchID}
          snapshot={snapshot}
          deckStats={{
            deck: sharedDeckStats.deck,
            discard: 0,
            legendary: sharedDeckStats.legendary,
          }}
          sharedDeckTemplate={sharedDeckTemplate}
          cardCatalog={cardCatalog}
          onCreateMatch={createRoom}
          onResetMatch={() => {}}
          onDeleteMatch={() => {}}
          onResetAll={() => {
            window.localStorage.removeItem(SESSION_STORAGE_KEY);
            window.localStorage.removeItem(PLAYER_NAME_STORAGE_KEY);
            setSession(null);
            setPlayerName('');
            setError('');
            void refreshMatches();
          }}
          onRestartServer={async () => {
            try {
              const response = await fetch(ADMIN_RESTART_API, { method: 'POST' });
              return response.ok;
            } catch {
              return false;
            }
          }}
          onShuffleDeck={() => {
            shuffleSharedDeckTemplate();
            refreshSharedDeckTemplate();
          }}
          onAddCard={(target: DeckTarget, cardId: string) => {
            addCardToSharedDeckTemplate(target, cardId);
            refreshSharedDeckTemplate();
          }}
          onAddCustomCard={(target: DeckTarget, card: CardDefinition) => {
            addCustomCardToSharedDeckTemplate(target, card);
            refreshSharedDeckTemplate();
          }}
          onUpdateCard={(target: DeckTarget, index: number, card: CardDefinition) => {
            updateCardAtInSharedDeckTemplate(target, index, card);
            refreshSharedDeckTemplate();
          }}
          onRemoveCard={(target: DeckTarget, index: number) => {
            removeCardAtFromSharedDeckTemplate(target, index);
            refreshSharedDeckTemplate();
          }}
          onResetTemplate={() => {
            resetSharedDeckTemplate();
            refreshSharedDeckTemplate();
          }}
          onSetDeckBackImage={(path?: string) => {
            setSharedDeckBackImage(path);
            refreshSharedDeckTemplate();
          }}
          onExportTemplate={() => exportSharedDeckTemplateJson()}
          onImportTemplate={(json: string) => {
            const result = importSharedDeckTemplateJson(json);
            if (!result.ok) return result.error;
            refreshSharedDeckTemplate();
            return null;
          }}
          sharedRanks={sharedRanks}
          onUpdateRanks={(nextRanks: RankDefinition[]) => {
            const ok = setSharedRanks(nextRanks);
            if (!ok) return false;
            const normalized = getSharedRanks();
            setSharedRanksState(normalized);
            window.localStorage.setItem(RANKS_STORAGE_KEY, JSON.stringify(normalized));
            void syncRanksToServer(normalized);
            return true;
          }}
          onResetRanks={() => {
            resetSharedRanks();
            const normalized = getSharedRanks();
            setSharedRanksState(normalized);
            window.localStorage.setItem(RANKS_STORAGE_KEY, JSON.stringify(normalized));
            void fetch(`${RANKS_API}/reset`, { method: 'POST' });
          }}
          onRunSimulations={(players: number, simulations: number) =>
            runGameSimulations(players, simulations)
          }
        />
      ) : null}
    </main>
  );
};
