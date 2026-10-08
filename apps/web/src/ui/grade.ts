import type { Grade } from '@pirate/game-core';

export type GradeTone = 'top' | 'good' | 'fair' | 'low';

/** Colour family for a grade badge. */
export function gradeTone(grade: Grade): GradeTone {
  switch (grade) {
    case 'S':
    case 'A+':
      return 'top';
    case 'A':
    case 'B':
      return 'good';
    case 'C':
      return 'fair';
    case 'D':
      return 'low';
  }
}
