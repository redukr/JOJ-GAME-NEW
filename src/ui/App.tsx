import React from 'react';
import { Client } from 'boardgame.io/react';
import { Local } from 'boardgame.io/multiplayer';
import { jojGame } from '../game/jojGame';
import { Board } from './Board';

const LocalClient = Client({
  game: jojGame,
  board: Board,
  debug: false,
  numPlayers: 2,
  multiplayer: Local(),
});

export const App = () => (
  <main className="app">
    <h1>Журнал Журналів</h1>
    <LocalClient playerID="0" />
  </main>
);
