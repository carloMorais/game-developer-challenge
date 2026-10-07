import Fastify, { type FastifyInstance } from 'fastify';
import { CONTRACTS_VERSION } from '@pirate/contracts';

/**
 * Backend skeleton. Ranking/history routes (REST) and a WebSocket gateway are
 * planned here; for the challenge the client is served by MSW mocks instead.
 */
export function buildApp(): FastifyInstance {
  const app = Fastify({ logger: true });
  app.get('/health', () => ({ status: 'ok', contractsVersion: CONTRACTS_VERSION }));
  return app;
}
