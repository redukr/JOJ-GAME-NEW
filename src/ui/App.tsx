import { useEffect, useMemo, useState } from 'react';
import { LobbyClient } from 'boardgame.io/client';
import { Client } from 'boardgame.io/react';
import { SocketIO } from 'boardgame.io/multiplayer';
import type { CardDefinition } from '../game/types';
import {
  addCustomCardToSharedDeckTemplate,
  addCardToSharedDeckTemplate,
  type DeckTarget,
  exportSharedDeckTemplateJson,
  getCardCatalog,
  getSharedDeckTemplate,
  getSharedDeckTemplateStats,
  importSharedDeckTemplateJson,
  jojGame,
  removeCardAtFromSharedDeckTemplate,
  resetSharedDeckTemplate,
  shuffleSharedDeckTemplate,
  updateCardAtInSharedDeckTemplate,
} from '../game/jojGame';
import { AdminPage } from './AdminPage';
import { Board } from './Board';
import type { Language } from './i18n';
import { defaultLanguage, text } from './i18n';

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
const ADMIN_RESTART_API = `${SERVER_URL}/api/admin/restart`;

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
};

type Session = {
  matchID: string;
  playerID: string;
  credentials: string;
};

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

  const [, setSharedDeckVersion] = useState<number>(0);
  const [sharedDeckTemplate, setSharedDeckTemplate] = useState<SharedDeckTemplate>(getSharedDeckTemplate);
  const [cardCatalog, setCardCatalog] = useState<CardDefinition[]>(getCardCatalog);

  const t = text(lang);
  const sharedDeckStats = getSharedDeckTemplateStats();

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
      setSession(null);
      window.localStorage.removeItem(SESSION_STORAGE_KEY);
      await refreshMatches();
    } catch {
      setError(t.leaveFailed);
    } finally {
      setLoading(false);
    }
  };

  const activeMatch = useMemo(
    () => matches.find((match) => match.matchID === session?.matchID) ?? null,
    [matches, session?.matchID],
  );

  const canStart = Boolean(activeMatch && activeMatch.players.every((player) => Boolean(player.name)));

  useEffect(() => {
    void (async () => {
      const saved = window.localStorage.getItem(SHARED_TEMPLATE_STORAGE_KEY);
      let loadedLocal = false;
      if (saved) {
        const result = importSharedDeckTemplateJson(saved);
        if (result.ok) {
          refreshSharedDeckTemplate(false);
          loadedLocal = true;
        }
      }
      if (loadedLocal) {
        void syncTemplateToServer(exportSharedDeckTemplateJson());
      } else {
        await loadTemplateFromServer();
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
      <p>
        {t.language}:{' '}
        <button type="button" onClick={() => setLang('uk')} disabled={lang === 'uk'}>
          {t.langUk}
        </button>{' '}
        <button type="button" onClick={() => setLang('en')} disabled={lang === 'en'}>
          {t.langEn}
        </button>
      </p>
      <p>
        {isAdminRoute ? <a href="/">{t.openGame}</a> : <a href="/admin">{t.openAdmin}</a>}
      </p>

      {!isAdminRoute && !session ? (
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

      <div style={{ display: !isAdminRoute && session && canStart ? 'block' : 'none' }}>
        {session ? (
          <NetworkClient
            key={`${session.matchID}:${session.playerID}`}
            matchID={session.matchID}
            playerID={session.playerID}
            credentials={session.credentials}
            lang={lang}
          />
        ) : null}
      </div>

      {isAdminRoute ? (
        <AdminPage
          lang={lang}
          matches={matches.map((m) => ({ id: m.matchID, createdAt: Date.now() }))}
          activeMatchId={session?.matchID ?? ''}
          playerID={session?.playerID ?? '0'}
          snapshot={null}
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
          onPlayerChange={(next) => {
            if (!session) return;
            setSession({ ...session, playerID: next });
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
          onExportTemplate={() => exportSharedDeckTemplateJson()}
          onImportTemplate={(json: string) => {
            const result = importSharedDeckTemplateJson(json);
            if (!result.ok) return result.error;
            refreshSharedDeckTemplate();
            return null;
          }}
        />
      ) : null}
    </main>
  );
};
