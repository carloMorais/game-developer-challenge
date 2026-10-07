import { useId, useRef, useState, type FormEvent } from 'react';
import { OPTION_LIMITS, validateMatchOptions, type MatchOptions } from '@pirate/game-core';
import {
  PLAYER_NAME_LIMITS,
  useSettingsStore,
  validatePlayerName,
} from '../../store/settingsStore';
import { GameButton } from '../components/GameButton';
import { RoundButton } from '../components/RoundButton';

interface OptionsFormProps {
  /** Label and action of the secondary (leave) button. */
  backLabel: string;
  onBack(): void;
  /** Shown under the title, e.g. when editing from the pause menu. */
  note?: string;
}

type Field = 'playerName' | 'sessionTime' | 'spawnInterval';

const SESSION_BUTTON_STEP = 10;

function roundTo(value: number, step: number): number {
  return Math.round(value / step) * step;
}

/** Options with live validation; values persist on Save. */
export function OptionsForm({ backLabel, onBack, note }: OptionsFormProps) {
  const saved = useSettingsStore();
  const [name, setName] = useState(saved.playerName);
  const [sessionTime, setSessionTime] = useState(String(saved.options.sessionTime));
  const [spawnInterval, setSpawnInterval] = useState(String(saved.options.spawnInterval));
  const [touched, setTouched] = useState<Partial<Record<Field, boolean>>>({});
  const [status, setStatus] = useState<string | null>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const id = useId();

  const options: MatchOptions = {
    sessionTime: sessionTime.trim() === '' ? Number.NaN : Number(sessionTime),
    spawnInterval: spawnInterval.trim() === '' ? Number.NaN : Number(spawnInterval),
  };
  const errors: Partial<Record<Field, string>> = { ...validateMatchOptions(options) };
  const nameError = validatePlayerName(name);
  if (nameError) errors.playerName = nameError;
  const isValid = Object.keys(errors).length === 0;
  const isDirty =
    name.trim() !== saved.playerName ||
    options.sessionTime !== saved.options.sessionTime ||
    options.spawnInterval !== saved.options.spawnInterval;

  const visibleError = (field: Field) => (touched[field] ? errors[field] : undefined);

  const change = (field: Field, value: string) => {
    setStatus(null);
    setTouched((t) => ({ ...t, [field]: true }));
    if (field === 'playerName') setName(value);
    if (field === 'sessionTime') setSessionTime(value);
    if (field === 'spawnInterval') setSpawnInterval(value);
  };

  const stepSession = (direction: 1 | -1) => {
    const { min, max } = OPTION_LIMITS.sessionTime;
    const current = Number.isFinite(options.sessionTime)
      ? options.sessionTime
      : saved.options.sessionTime;
    const next = Math.min(
      max,
      Math.max(min, roundTo(current, SESSION_BUTTON_STEP) + direction * SESSION_BUTTON_STEP),
    );
    change('sessionTime', String(next));
  };

  const stepSpawn = (direction: 1 | -1) => {
    const { min, max, step } = OPTION_LIMITS.spawnInterval;
    const current = Number.isFinite(options.spawnInterval)
      ? options.spawnInterval
      : saved.options.spawnInterval;
    const next = Math.min(max, Math.max(min, roundTo(current, step) + direction * step));
    change('spawnInterval', String(next));
  };

  const submit = (event: FormEvent) => {
    event.preventDefault();
    setTouched({ playerName: true, sessionTime: true, spawnInterval: true });
    if (!isValid) {
      setStatus(null);
      // Move focus to the first invalid field so the error is read out.
      formRef.current?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus();
      return;
    }
    const ok = saved.save(options, name);
    setStatus(ok ? 'Options saved.' : 'Options apply now, but could not be stored on this device.');
  };

  const { sessionTime: sessionLimits, spawnInterval: spawnLimits } = OPTION_LIMITS;

  return (
    <form ref={formRef} className="options-form" onSubmit={submit} noValidate>
      {note && <p className="options-form__note">{note}</p>}

      <div className="field">
        <label htmlFor={`${id}-name`}>Captain name</label>
        <input
          id={`${id}-name`}
          type="text"
          value={name}
          maxLength={PLAYER_NAME_LIMITS.max + 5}
          autoComplete="nickname"
          aria-invalid={visibleError('playerName') ? 'true' : 'false'}
          aria-describedby={`${id}-name-hint ${visibleError('playerName') ? `${id}-name-error` : ''}`}
          onChange={(e) => change('playerName', e.target.value)}
        />
        <p id={`${id}-name-hint`} className="field__hint">
          Shown on the ranking. Up to {PLAYER_NAME_LIMITS.max} characters.
        </p>
        {visibleError('playerName') && (
          <p id={`${id}-name-error`} className="field__error" role="alert">
            {visibleError('playerName')}
          </p>
        )}
      </div>

      <div className="field">
        <label htmlFor={`${id}-session`}>Game session time</label>
        <div className="stepper">
          <RoundButton
            icon="icon_minus"
            label="Decrease game session time"
            size={44}
            onClick={() => stepSession(-1)}
          />
          <span className="stepper__value">
            <input
              id={`${id}-session`}
              type="number"
              inputMode="numeric"
              min={sessionLimits.min}
              max={sessionLimits.max}
              step={sessionLimits.step}
              value={sessionTime}
              aria-invalid={visibleError('sessionTime') ? 'true' : 'false'}
              aria-describedby={`${id}-session-hint ${visibleError('sessionTime') ? `${id}-session-error` : ''}`}
              onChange={(e) => change('sessionTime', e.target.value)}
            />
            <span aria-hidden="true">s</span>
          </span>
          <RoundButton
            icon="icon_plus"
            label="Increase game session time"
            size={44}
            onClick={() => stepSession(1)}
          />
        </div>
        <p id={`${id}-session-hint`} className="field__hint">
          {sessionLimits.min}–{sessionLimits.max} seconds of active play.
        </p>
        {visibleError('sessionTime') && (
          <p id={`${id}-session-error`} className="field__error" role="alert">
            {visibleError('sessionTime')}
          </p>
        )}
      </div>

      <div className="field">
        <label htmlFor={`${id}-spawn`}>Enemy spawn time</label>
        <div className="stepper">
          <RoundButton
            icon="icon_minus"
            label="Decrease enemy spawn time"
            size={44}
            onClick={() => stepSpawn(-1)}
          />
          <span className="stepper__value">
            <input
              id={`${id}-spawn`}
              type="number"
              inputMode="decimal"
              min={spawnLimits.min}
              max={spawnLimits.max}
              step={spawnLimits.step}
              value={spawnInterval}
              aria-invalid={visibleError('spawnInterval') ? 'true' : 'false'}
              aria-describedby={`${id}-spawn-hint ${visibleError('spawnInterval') ? `${id}-spawn-error` : ''}`}
              onChange={(e) => change('spawnInterval', e.target.value)}
            />
            <span aria-hidden="true">s</span>
          </span>
          <RoundButton
            icon="icon_plus"
            label="Increase enemy spawn time"
            size={44}
            onClick={() => stepSpawn(1)}
          />
        </div>
        <p id={`${id}-spawn-hint`} className="field__hint">
          A new enemy every {spawnLimits.min}–{spawnLimits.max} seconds, in steps of{' '}
          {spawnLimits.step}.
        </p>
        {visibleError('spawnInterval') && (
          <p id={`${id}-spawn-error`} className="field__error" role="alert">
            {visibleError('spawnInterval')}
          </p>
        )}
      </div>

      <p className="options-form__status" role="status" aria-live="polite">
        {status}
      </p>
      {!status && isDirty && <p className="options-form__dirty">You have unsaved changes.</p>}

      <div className="options-form__actions">
        <GameButton type="submit" size="small">
          Save
        </GameButton>
        <GameButton variant="secondary" size="small" sound="ui_back" onClick={onBack}>
          {backLabel}
        </GameButton>
      </div>
    </form>
  );
}
