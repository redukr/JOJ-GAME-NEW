import { Server } from 'boardgame.io/server';
import { jojGame } from '../src/game/jojGame';

const server = Server({
  games: [jojGame],
});

const port = Number(process.env.PORT ?? 8000);

server.run(port, () => {
  // eslint-disable-next-line no-console
  console.log(`boardgame.io server running at http://localhost:${port}`);
});
