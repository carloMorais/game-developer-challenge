import { useEffect, useId, useRef, useState, type FormEvent } from 'react';
import { createPortal } from 'react-dom';
import { OPTION_LIMITS, validateMatchOptions, type MatchOptions } from '@pirate/game-core';
import {
  PLAYER_NAME_LIMITS,
  useSettingsStore,
  validatePlayerName,
} from '../../store/settingsStore';
import {
  HULL_NAMES,
  HULL_TYPES,
  SHIP_COLORS,
  SHIP_COLOR_NAMES,
  type ShipColor,
  type ShipLook,
} from '../../game/shipLook';
import { COARSE_POINTER_QUERY } from '../../lib/fullscreen';
import { Dialog } from '../components/Dialog';
import { GameButton } from '../components/GameButton';
import { ShipPreview } from '../components/ShipPreview';
import { RoundButton } from '../components/RoundButton';

interface OptionsFormProps {
  /** Label and action of the secondary (leave) button. */
  backLabel: string;
  onBack(): void;
  /** Shown under the title, e.g. when editing from the pause menu. */
  note?: string;
  /** Called after a successful save (e.g. to close a dialog). */
  onSaved?(): void;
}

type Field = 'playerName' | 'sessionTime' | 'spawnInterval';

const SESSION_BUTTON_STEP = 10;

function roundTo(value: number, step: number): number {
  return Math.round(value / step) * step;
}

/** Options with live validation; values persist on Save. */
export function OptionsForm({ backLabel, onBack, note, onSaved }: OptionsFormProps) {
  const saved = useSettingsStore();
  const [name, setName] = useState(saved.playerName);
  const [sessionTime, setSessionTime] = useState(String(saved.options.sessionTime));
  const [spawnInterval, setSpawnInterval] = useState(String(saved.options.spawnInterval));
  const [look, setLook] = useState<ShipLook>(saved.shipLook);
  const [autoFullscreen, setAutoFullscreen] = useState(saved.autoFullscreen);
  // Fullscreen is a touch-device feature: desktop players never see the switch.
  const [touch] = useState(() => window.matchMedia(COARSE_POINTER_QUERY).matches);
  const [touched, setTouched] = useState<Partial<Record<Field, boolean>>>({});
  const [status, setStatus] = useState<string | null>(null);
  const [confirmingLeave, setConfirmingLeave] = useState(false);
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
  const battleDirty =
    name.trim() !== saved.playerName ||
    options.sessionTime !== saved.options.sessionTime ||
    options.spawnInterval !== saved.options.spawnInterval;
  const lookDirty =
    look.sail !== saved.shipLook.sail ||
    look.flag !== saved.shipLook.flag ||
    look.hull !== saved.shipLook.hull;
  const fullscreenDirty = autoFullscreen !== saved.autoFullscreen;
  const isDirty = battleDirty || lookDirty || fullscreenDirty;

  // Leaving with unsaved changes asks first.
  const leave = () => {
    if (isDirty) setConfirmingLeave(true);
    else onBack();
  };

  // Esc is "back" in the screens hosting this form: catch it before they do.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || (!isDirty && !confirmingLeave)) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      setConfirmingLeave((open) => !open);
    };
    window.addEventListener('keydown', onKeyDown, true);
    return () => window.removeEventListener('keydown', onKeyDown, true);
  }, [isDirty, confirmingLeave]);

  const changeLook = (patch: Partial<ShipLook>) => {
    setStatus(null);
    setLook((current) => ({ ...current, ...patch }));
  };

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
    // A new ship alone keeps the chosen difficulty; battle values select Custom.
    let ok = true;
    if (lookDirty) ok = saved.setShipLook(look) && ok;
    if (fullscreenDirty) ok = saved.setAutoFullscreen(autoFullscreen) && ok;
    if (battleDirty) ok = saved.save(options, name) && ok;
    setStatus(ok ? 'Options saved.' : 'Options apply now, but could not be stored on this device.');
    if (ok) onSaved?.();
  };

  const { sessionTime: sessionLimits, spawnInterval: spawnLimits } = OPTION_LIMITS;

  return (
    <form ref={formRef} className="options-form" onSubmit={submit} noValidate>
      {note && <p className="options-form__note">{note}</p>}

      <div className="options-form__columns">
        <section className="options-form__column" aria-labelledby={`${id}-captain`}>
          <h2 id={`${id}-captain`} className="options-form__heading">
            Captain &amp; ship
          </h2>
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

          <fieldset className="field ship-designer">
            <legend>Your ship</legend>
            <ShipPreview look={look} />
            <div className="ship-designer__controls">
              <ColorChoice
                label="Sail"
                name={`${id}-sail`}
                value={look.sail}
                onChange={(sail) => changeLook({ sail })}
              />
              <ColorChoice
                label="Pennant"
                name={`${id}-flag`}
                value={look.flag}
                onChange={(flag) => changeLook({ flag })}
              />
              <div className="choice-group" role="radiogroup" aria-label="Hull">
                <span className="choice-group__label" aria-hidden="true">
                  Hull
                </span>
                <div className="choice-group__options">
                  {HULL_TYPES.map((hull) => (
                    <label key={hull} className="hull-choice">
                      <input
                        type="radio"
                        name={`${id}-hull`}
                        value={hull}
                        checked={look.hull === hull}
                        onChange={() => changeLook({ hull })}
                      />
                      <span>{HULL_NAMES[hull]}</span>
                    </label>
                  ))}
                </div>
              </div>
            </div>
          </fieldset>
        </section>
        <section className="options-form__column" aria-labelledby={`${id}-battle`}>
          <h2 id={`${id}-battle`} className="options-form__heading">
            Battle
          </h2>
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

          {touch && (
            <label className="toggle-field">
              <input
                type="checkbox"
                checked={autoFullscreen}
                onChange={(e) => {
                  setStatus(null);
                  setAutoFullscreen(e.target.checked);
                }}
              />
              <span>Fullscreen when a battle starts</span>
            </label>
          )}
        </section>
      </div>

      {/* One reserved line for both messages, so the form never changes height. */}
      <div className="options-form__feedback">
        <p className="options-form__status" role="status" aria-live="polite">
          {status}
        </p>
        <p className="options-form__dirty" hidden={!!status || !isDirty}>
          You have unsaved changes.
        </p>
      </div>

      <div className="options-form__actions">
        {/* Nothing to save until something changes (invalid edits still count). */}
        <GameButton type="submit" size="small" disabled={!isDirty}>
          Save
        </GameButton>
        <GameButton variant="secondary" size="small" sound="ui_back" onClick={leave}>
          {backLabel}
        </GameButton>
      </div>

      {confirmingLeave &&
        createPortal(
          <Dialog
            titleId={`${id}-discard-title`}
            describedBy={`${id}-discard-desc`}
            className="dialog-backdrop--top"
          >
            <h2 id={`${id}-discard-title`} className="panel-title">
              Discard changes?
            </h2>
            <p id={`${id}-discard-desc`} className="tagline">
              Your unsaved changes will be lost.
            </p>
            <div className="menu-actions discard-actions">
              {/* Same size; the safe choice stands out by colour and comes first. */}
              <GameButton onClick={() => setConfirmingLeave(false)} data-autofocus>
                Keep editing
              </GameButton>
              <GameButton variant="secondary" sound="ui_back" onClick={onBack}>
                Discard
              </GameButton>
            </div>
          </Dialog>,
          document.body,
        )}
    </form>
  );
}

function ColorChoice({
  label,
  name,
  value,
  onChange,
}: {
  label: string;
  name: string;
  value: ShipColor;
  onChange(color: ShipColor): void;
}) {
  return (
    <div className="choice-group" role="radiogroup" aria-label={label}>
      <span className="choice-group__label" aria-hidden="true">
        {label}
      </span>
      <div className="choice-group__options">
        {SHIP_COLORS.map((color) => (
          <label key={color} className={`swatch swatch--${color}`} title={SHIP_COLOR_NAMES[color]}>
            <input
              type="radio"
              name={name}
              value={color}
              checked={value === color}
              aria-label={`${label}: ${SHIP_COLOR_NAMES[color]}`}
              onChange={() => onChange(color)}
            />
          </label>
        ))}
      </div>
    </div>
  );
}
