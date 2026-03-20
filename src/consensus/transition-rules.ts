/**
 * State transition rules for the enhanced consensus engine.
 *
 * Defines all valid transitions, required conditions, and hysteresis durations.
 */

import type { OutageStateType, TransitionRule } from './types.js';
import { GeographicScope, OutageState } from './types.js';

/** Hysteresis durations in milliseconds per transition. */
export const HYSTERESIS_DURATIONS: Record<string, number> = {
  'OPERATIONAL->INVESTIGATING': 0,
  'INVESTIGATING->DEGRADED': 5 * 60 * 1000,       // 5 minutes sustained
  'INVESTIGATING->OPERATIONAL': 10 * 60 * 1000,    // 10 minutes no signals
  'DEGRADED->MAJOR_OUTAGE': 3 * 60 * 1000,         // 3 minutes sustained
  'DEGRADED->RECOVERING': 2 * 60 * 1000,            // 2 minutes declining
  'MAJOR_OUTAGE->RECOVERING': 2 * 60 * 1000,        // 2 minutes declining
  'RECOVERING->RESOLVED': 15 * 60 * 1000,           // 15 minutes baseline
  'RECOVERING->MAJOR_OUTAGE': 0,                     // immediate re-escalation
};

/**
 * All valid state transitions with their required conditions.
 */
export const TRANSITION_RULES: Map<string, TransitionRule> = new Map([
  [
    'OPERATIONAL->INVESTIGATING',
    {
      from: OutageState.OPERATIONAL,
      to: OutageState.INVESTIGATING,
      requiredSources: 1,
      minConfidence: 0,
      minDuration: 0,
      description: 'Any signal score exceeds threshold, begin investigation',
    },
  ],
  [
    'INVESTIGATING->DEGRADED',
    {
      from: OutageState.INVESTIGATING,
      to: OutageState.DEGRADED,
      requiredSources: 2,
      minConfidence: 0.7,
      minDuration: 5 * 60 * 1000,
      description: '2+ independent sources AND confidence > 0.7 sustained for 5 minutes',
    },
  ],
  [
    'INVESTIGATING->OPERATIONAL',
    {
      from: OutageState.INVESTIGATING,
      to: OutageState.OPERATIONAL,
      requiredSources: 0,
      minConfidence: 0,
      minDuration: 10 * 60 * 1000,
      description: 'No signals for 10 minutes, return to operational',
    },
  ],
  [
    'DEGRADED->MAJOR_OUTAGE',
    {
      from: OutageState.DEGRADED,
      to: OutageState.MAJOR_OUTAGE,
      requiredSources: 3,
      minConfidence: 0.9,
      minDuration: 3 * 60 * 1000,
      geographicRequirement: GeographicScope.REGIONAL,
      description: '3+ sources AND confidence > 0.9 AND geographic spread >= regional',
    },
  ],
  [
    'DEGRADED->RECOVERING',
    {
      from: OutageState.DEGRADED,
      to: OutageState.RECOVERING,
      requiredSources: 0,
      minConfidence: 0,
      minDuration: 2 * 60 * 1000,
      description: 'Declining signals and improving probes for 2 minutes',
    },
  ],
  [
    'MAJOR_OUTAGE->RECOVERING',
    {
      from: OutageState.MAJOR_OUTAGE,
      to: OutageState.RECOVERING,
      requiredSources: 0,
      minConfidence: 0,
      minDuration: 2 * 60 * 1000,
      description: 'Declining signals AND improving probes',
    },
  ],
  [
    'RECOVERING->RESOLVED',
    {
      from: OutageState.RECOVERING,
      to: OutageState.RESOLVED,
      requiredSources: 0,
      minConfidence: 0,
      minDuration: 15 * 60 * 1000,
      description: 'All signals at baseline for 15 minutes',
    },
  ],
  [
    'RECOVERING->MAJOR_OUTAGE',
    {
      from: OutageState.RECOVERING,
      to: OutageState.MAJOR_OUTAGE,
      requiredSources: 2,
      minConfidence: 0.7,
      minDuration: 0,
      description: 'Re-escalation during recovery, signals worsen again',
    },
  ],
]);

/**
 * Check if a state transition is valid.
 */
export function isValidTransition(from: OutageStateType, to: OutageStateType): boolean {
  const key = `${from}->${to}`;
  return TRANSITION_RULES.has(key);
}

/**
 * Get the required conditions for a state transition.
 * Returns null if the transition is not valid.
 */
export function getRequiredConditions(
  from: OutageStateType,
  to: OutageStateType,
): TransitionRule | null {
  const key = `${from}->${to}`;
  return TRANSITION_RULES.get(key) ?? null;
}

/**
 * Get the hysteresis duration for a transition in milliseconds.
 * Returns 0 for immediate transitions or unknown transitions.
 */
export function getHysteresisDuration(from: OutageStateType, to: OutageStateType): number {
  const key = `${from}->${to}`;
  return HYSTERESIS_DURATIONS[key] ?? 0;
}
