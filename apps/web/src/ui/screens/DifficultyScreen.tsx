import { useEffect, useId, useRef, useState } from 'react';
import {
  CUSTOM_DIFFICULTY,
  DIFFICULTY_PRESETS,
  PRESET_DIFFICULTIES,
  UNLOCK_GRADE,
  resolveMatchSetup,
  type Difficulty,
} from '@pirate/game-core';
import { navigate } from '../../app/router';
import { useProgressStore } from '../../store/progressStore';
import { useSettingsStore } from '../../store/settingsStore';
import { ControlsHelp } from '../components/ControlsHelp';
import { Dialog } from '../components/Dialog';
import { GameButton } from '../components/GameButton';
import { Panel } from '../components/Panel';
import { formatTime } from '../format';
import { gradeTone } from '../grade';
import { OptionsForm } from './OptionsForm';
import { ScreenLayout } from './ScreenLayout';

function LockIcon() {
  return (
    <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true">
      <path
        fill="currentColor"
        d="M8 1a4 4 0 0 0-4 4v2H3a1 1 0 0 0-1 1v6a1 1 0 0 0 1 1h10a1 1 0 0 0 1-1V8a1 1 0 0 0-1-1h-1V5a4 4 0 0 0-4-4Zm-2 6V5a2 2 0 1 1 4 0v2H6Z"
      />
    </svg>
  );
}

function PencilIcon() {
  return (
    <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true">
      <path
        fill="currentColor"
        d="M11.3 1.3a1 1 0 0 1 1.4 0l2 2a1 1 0 0 1 0 1.4l-8.5 8.5-3.4.9a.5.5 0 0 1-.6-.6l.9-3.4 8.2-8.8Zm-7.1 9.4-.5 1.6 1.6-.5 7.2-7.2-1.1-1.1-7.2 7.2Z"
      />
    </svg>
  );
}

interface CardProps {
  difficulty: Difficulty;
  group: string;
  selected: boolean;
  onSelect(): void;
}

function DifficultyCard({ difficulty, group, selected, onSelect }: CardProps) {
  const customOptions = useSettingsStore((s) => s.options);
  const isUnlocked = useProgressStore((s) => s.isUnlocked);
  const best = useProgressStore((s) => s.best);
  const locked = !isUnlocked(difficulty);
  const info = difficulty === 'custom' ? CUSTOM_DIFFICULTY : DIFFICULTY_PRESETS[difficulty];
  const { options } = resolveMatchSetup(difficulty, customOptions);
  const previous =
    difficulty === 'custom'
      ? null
      : PRESET_DIFFICULTIES[PRESET_DIFFICULTIES.indexOf(difficulty) - 1];
  const grade = best[difficulty];
  const detailsId = `${group}-${difficulty}`;

  return (
    <label
      className={`setup-card setup-card--${difficulty} ${locked ? 'is-locked' : ''}`}
      data-testid={`difficulty-${difficulty}`}
    >
      <input
        type="radio"
        name={group}
        value={difficulty}
        checked={selected}
        disabled={locked}
        onChange={onSelect}
        // A short name; the rest of the card is read as its description.
        aria-label={`${info.name}, ${info.level}`}
        aria-describedby={detailsId}
      />
      <span className="setup-card__level" aria-hidden="true">
        {info.level}
      </span>
      <span className="setup-card__name" aria-hidden="true">
        {info.name}
      </span>
      <span id={detailsId} className="setup-card__details">
        <span className="setup-card__desc">{info.description}</span>
        <span className="setup-card__meta">
          {formatTime(options.sessionTime * 1000)} · enemy every {options.spawnInterval} s
        </span>
        {locked && previous ? (
          <span className="setup-card__lock">
            <LockIcon /> Survive {DIFFICULTY_PRESETS[previous].name} with grade {UNLOCK_GRADE} or
            better
          </span>
        ) : (
          grade && (
            <span className="setup-card__best">
              Best <span className={`grade-chip grade-chip--${gradeTone(grade)}`}>{grade}</span>
            </span>
          )
        )}
      </span>
    </label>
  );
}

/**
 * Picks the waters for the next battle: four presets that unlock one after
 * another, and a Custom battle whose settings can be edited in place.
 */
export function DifficultyScreen({ onStart }: { onStart(difficulty: Difficulty): void }) {
  const saved = useSettingsStore((s) => s.difficulty);
  const isUnlocked = useProgressStore((s) => s.isUnlocked);
  const [selected, setSelected] = useState<Difficulty>(() => (isUnlocked(saved) ? saved : 'easy'));
  const [editing, setEditing] = useState(false);
  const group = useId();
  const cardsRef = useRef<HTMLFieldSetElement>(null);
  /** Card nearest the carousel centre (phones), for the dots. */
  const [visible, setVisible] = useState(0);
  const firstScroll = useRef(true);

  // Phones show the cards as a carousel: keep the selected card in view
  // (on open, and when arrow keys move the selection). Desktop never scrolls.
  useEffect(() => {
    const cards = cardsRef.current;
    if (!cards || cards.scrollWidth <= cards.clientWidth) return;
    const card = cards.querySelector('input:checked')?.closest('.setup-card');
    card?.scrollIntoView({
      inline: 'center',
      block: 'nearest',
      behavior: firstScroll.current ? 'instant' : 'smooth',
    });
    firstScroll.current = false;
  }, [selected]);

  const onCardsScroll = () => {
    const cards = cardsRef.current;
    if (!cards) return;
    const centre = cards.getBoundingClientRect().left + cards.clientWidth / 2;
    let best = 0;
    let bestDistance = Infinity;
    cards.querySelectorAll('.setup-card').forEach((card, i) => {
      const box = card.getBoundingClientRect();
      const distance = Math.abs(box.left + box.width / 2 - centre);
      if (distance < bestDistance) {
        bestDistance = distance;
        best = i;
      }
    });
    setVisible(best);
  };

  return (
    <ScreenLayout>
      <Panel wide labelledBy="setup-title" className="setup-panel">
        <h1 id="setup-title" className="panel-title">
          Choose your waters
        </h1>
        <form
          className="setup"
          onSubmit={(event) => {
            event.preventDefault();
            onStart(selected);
          }}
        >
          <fieldset
            ref={cardsRef}
            className="setup__cards"
            data-testid="difficulty-cards"
            onScroll={onCardsScroll}
          >
            <legend className="sr-only">Difficulty</legend>
            {PRESET_DIFFICULTIES.map((difficulty) => (
              <DifficultyCard
                key={difficulty}
                difficulty={difficulty}
                group={group}
                selected={selected === difficulty}
                onSelect={() => setSelected(difficulty)}
              />
            ))}
            <div className="setup__separator" role="separator" aria-orientation="vertical" />
            <div className="setup-card-wrap">
              <DifficultyCard
                difficulty="custom"
                group={group}
                selected={selected === 'custom'}
                onSelect={() => setSelected('custom')}
              />
              <button
                type="button"
                className="setup-card__edit"
                aria-label="Edit custom battle settings"
                title="Edit custom battle settings"
                onClick={() => setEditing(true)}
              >
                <PencilIcon />
              </button>
            </div>
          </fieldset>
          <ol className="setup__dots" aria-hidden="true">
            {[...PRESET_DIFFICULTIES, 'custom'].map((difficulty, i) => (
              <li key={difficulty} className={i === visible ? 'is-active' : undefined} />
            ))}
          </ol>
          <div className="menu-actions">
            <GameButton type="submit" sound="ui_open" data-autofocus>
              Set sail
            </GameButton>
            <GameButton
              variant="secondary"
              size="small"
              sound="ui_back"
              onClick={() => navigate({ name: 'menu' })}
            >
              Main menu
            </GameButton>
          </div>
        </form>
        <ControlsHelp />
      </Panel>

      {editing && (
        <Dialog titleId="custom-title">
          <h2 id="custom-title" className="panel-title">
            Custom battle
          </h2>
          <OptionsForm
            note="Saving selects the Custom battle."
            backLabel="Back"
            onBack={() => setEditing(false)}
            onSaved={() => {
              setSelected('custom');
              setEditing(false);
            }}
          />
        </Dialog>
      )}
    </ScreenLayout>
  );
}
