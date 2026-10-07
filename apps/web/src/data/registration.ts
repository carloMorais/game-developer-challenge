import { MutationObserver } from '@tanstack/react-query';
import { create } from 'zustand';
import { useShallow } from 'zustand/react/shallow';
import type { MatchRecordInput, RegisterMatchResponse } from '@pirate/contracts';
import { isRecord, readJson, writeJson } from '../lib/storage';
import { toApiError, type ApiError } from './apiClient';
import { invalidateMatchLists } from './queries';
import { queryClient } from './queryClient';
import { repositories } from './repositories';

const PENDING_KEY = 'pirate-battle:pending-matches:v1';
const RECORDED_KEY = 'pirate-battle:recorded-matches:v1';
const MAX_RECORDED = 50;

export type RegistrationStatus = 'pending' | 'sending' | 'recorded' | 'failed';

export interface PendingMatch {
  input: MatchRecordInput;
  attempts: number;
  lastError: string | null;
}

interface RegistrationState {
  /** Matches not yet confirmed by the server, persisted across reloads. */
  pending: PendingMatch[];
  /** Ids confirmed by the server (recent), persisted so results show it. */
  recorded: string[];
  sending: string[];
}

function parsePending(raw: unknown): PendingMatch[] | null {
  if (!Array.isArray(raw)) return null;
  return raw.filter(
    (item): item is PendingMatch =>
      isRecord(item) && isRecord(item.input) && typeof item.input.matchId === 'string',
  );
}

function parseRecorded(raw: unknown): string[] | null {
  return Array.isArray(raw) ? raw.filter((id): id is string => typeof id === 'string') : null;
}

export const useRegistrationStore = create<RegistrationState>(() => ({
  pending: readJson(PENDING_KEY, parsePending) ?? [],
  recorded: readJson(RECORDED_KEY, parseRecorded) ?? [],
  sending: [],
}));

function setState(update: (state: RegistrationState) => Partial<RegistrationState>): void {
  useRegistrationStore.setState(update);
  const { pending, recorded } = useRegistrationStore.getState();
  writeJson(PENDING_KEY, pending);
  writeJson(RECORDED_KEY, recorded);
}

export function getRegistrationStatus(
  state: RegistrationState,
  matchId: string,
): RegistrationStatus | null {
  if (state.recorded.includes(matchId)) return 'recorded';
  if (state.sending.includes(matchId)) return 'sending';
  const entry = state.pending.find((p) => p.input.matchId === matchId);
  if (!entry) return null;
  return entry.lastError ? 'failed' : 'pending';
}

export function useRegistration(matchId: string | null) {
  return useRegistrationStore(
    useShallow((state) => {
      if (!matchId) return { status: null, error: null };
      const entry = state.pending.find((p) => p.input.matchId === matchId);
      return { status: getRegistrationStatus(state, matchId), error: entry?.lastError ?? null };
    }),
  );
}

function registerOptions() {
  return {
    mutationKey: ['registerMatch'] as const,
    mutationFn: (input: MatchRecordInput) => repositories.matches.register(input),
    // Registrations run one at a time: repeated clicks queue instead of racing.
    scope: { id: 'register-match' },
    onSuccess: (_response: RegisterMatchResponse, input: MatchRecordInput) => {
      setState((s) => ({
        pending: s.pending.filter((p) => p.input.matchId !== input.matchId),
        recorded: [input.matchId, ...s.recorded.filter((id) => id !== input.matchId)].slice(
          0,
          MAX_RECORDED,
        ),
      }));
      void invalidateMatchLists();
    },
    onError: (error: ApiError, input: MatchRecordInput) => {
      setState((s) => ({
        pending: s.pending.map((p) =>
          p.input.matchId === input.matchId ? { ...p, lastError: toApiError(error).message } : p,
        ),
      }));
    },
    onSettled: (_d: unknown, _e: unknown, input: MatchRecordInput) => {
      useRegistrationStore.setState((s) => ({
        sending: s.sending.filter((id) => id !== input.matchId),
      }));
    },
  };
}

/**
 * Queues a completed match (persisted first, so a crash or refresh never loses
 * it) and sends it. Safe to call repeatedly: an in-flight match is not resent,
 * and the server deduplicates by matchId anyway.
 */
export function registerMatch(input: MatchRecordInput): Promise<void> {
  const state = useRegistrationStore.getState();
  if (state.recorded.includes(input.matchId) || state.sending.includes(input.matchId)) {
    return Promise.resolve();
  }

  setState((s) => ({
    pending: s.pending.some((p) => p.input.matchId === input.matchId)
      ? s.pending.map((p) =>
          p.input.matchId === input.matchId ? { ...p, attempts: p.attempts + 1 } : p,
        )
      : [...s.pending, { input, attempts: 1, lastError: null }],
    sending: [...s.sending, input.matchId],
  }));

  const observer = new MutationObserver(queryClient, registerOptions());
  return observer
    .mutate(input)
    .then(() => undefined)
    .catch(() => undefined);
}

/** Retries every pending match (app start, reconnect, manual retry). */
export function flushPendingMatches(): Promise<void> {
  const { pending } = useRegistrationStore.getState();
  return Promise.all(pending.map((p) => registerMatch(p.input))).then(() => undefined);
}

/** Retry pending matches when connectivity or focus returns. */
export function watchConnectivity(): () => void {
  const flush = () => void flushPendingMatches();
  const onVisible = () => {
    if (document.visibilityState === 'visible') flush();
  };
  window.addEventListener('online', flush);
  document.addEventListener('visibilitychange', onVisible);
  return () => {
    window.removeEventListener('online', flush);
    document.removeEventListener('visibilitychange', onVisible);
  };
}
