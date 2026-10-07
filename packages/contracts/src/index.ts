/**
 * Transport-agnostic DTOs shared by the web client, the MSW mocks and the server.
 * Every payload is plain, serializable data so it can travel over REST today and
 * WebSocket messages later.
 */
export const CONTRACTS_VERSION = 1 as const;

export * from './api';
export * from './matches';
export * from './ranking';
export * from './validation';
