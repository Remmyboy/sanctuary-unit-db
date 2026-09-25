import { describe, expect, it } from 'vitest';
import {
  COUNTDOWN_S,
  LAUNCHABLE_WINDOW_S,
  deriveMmStatus,
  isLaunchableState,
  launchProgress,
  parseModSignal,
} from './mm';

describe('isLaunchableState', () => {
  it('is true wherever the mod can launch from: menu, lobby, replay', () => {
    expect(isLaunchableState('menu')).toBe(true);
    expect(isLaunchableState('lobby')).toBe(true);
    expect(isLaunchableState('replay')).toBe(true);
  });
  it('is false while a game is loading or being played, or nothing was seen', () => {
    expect(isLaunchableState('loading')).toBe(false);
    expect(isLaunchableState('ingame')).toBe(false);
    expect(isLaunchableState(null)).toBe(false);
  });
});

describe('deriveMmStatus', () => {
  it('follows the ladder status once a match is settled', () => {
    expect(deriveMmStatus({ status: 'completed', mmMode: 'auto', mmStatus: 'launch' })).toBe('done');
    expect(deriveMmStatus({ status: 'completed', mmMode: 'manual', mmStatus: null })).toBe('done');
    expect(deriveMmStatus({ status: 'cancelled', mmMode: 'auto', mmStatus: 'cancelled' })).toBe('cancelled');
    expect(deriveMmStatus({ status: 'cancelled', mmMode: 'auto', mmStatus: 'countdown' })).toBe('cancelled');
    expect(deriveMmStatus({ status: 'cancelled', mmMode: 'manual', mmStatus: null })).toBe('cancelled');
  });
  it('keeps a failure distinct from a cancel', () => {
    expect(deriveMmStatus({ status: 'cancelled', mmMode: 'auto', mmStatus: 'failed' })).toBe('failed');
  });
  it('reports the auto lifecycle while open', () => {
    expect(deriveMmStatus({ status: 'in_progress', mmMode: 'auto', mmStatus: 'countdown' })).toBe(
      'countdown',
    );
    expect(deriveMmStatus({ status: 'in_progress', mmMode: 'auto', mmStatus: 'launch' })).toBe('launch');
    expect(deriveMmStatus({ status: 'reported', mmMode: 'auto', mmStatus: 'launch' })).toBe('launch');
  });
  it('is manual for every open manual match, including a fallen-back one', () => {
    expect(deriveMmStatus({ status: 'in_progress', mmMode: 'manual', mmStatus: null })).toBe('manual');
    expect(deriveMmStatus({ status: 'reported', mmMode: 'manual', mmStatus: null })).toBe('manual');
  });
});

describe('launchProgress', () => {
  const host = 'h';
  const joiner = 'j';
  it('starts with nothing', () => {
    expect(launchProgress([], host, joiner)).toEqual({ lobbyCreated: false, joined: false, started: false });
  });
  it('only counts each event from the right side', () => {
    expect(launchProgress([{ type: 'lobby_created', playerId: joiner }], host, joiner).lobbyCreated).toBe(
      false,
    );
    expect(launchProgress([{ type: 'joined', playerId: host }], host, joiner).joined).toBe(false);
    expect(launchProgress([{ type: 'lobby_created', playerId: host }], host, joiner).lobbyCreated).toBe(true);
    expect(launchProgress([{ type: 'joined', playerId: joiner }], host, joiner).joined).toBe(true);
  });
  it('needs both starts', () => {
    expect(launchProgress([{ type: 'started', playerId: host }], host, joiner).started).toBe(false);
    expect(
      launchProgress(
        [
          { type: 'started', playerId: host },
          { type: 'started', playerId: joiner },
        ],
        host,
        joiner,
      ).started,
    ).toBe(true);
  });
});

// Pinned so a change here is a deliberate one made together with the SQL.
it('pins the timings mirrored in 0009_matchmaking.sql', () => {
  expect(COUNTDOWN_S).toBe(10);
  expect(LAUNCHABLE_WINDOW_S).toBe(15);
});

describe('parseModSignal', () => {
  it('keeps a well-formed signal, trimming the version strings', () => {
    expect(parseModSignal({ state: 'menu', modVersion: '0.3.0', gameVersion: 'x'.repeat(80) })).toEqual({
      state: 'menu',
      modVersion: '0.3.0',
      gameVersion: 'x'.repeat(40),
    });
  });
  it('tolerates missing versions', () => {
    expect(parseModSignal({ state: 'ingame' })).toEqual({
      state: 'ingame',
      modVersion: null,
      gameVersion: null,
    });
  });
  it('is null, never an error, for anything else', () => {
    expect(parseModSignal(null)).toBeNull();
    expect(parseModSignal(undefined)).toBeNull();
    expect(parseModSignal('menu')).toBeNull();
    expect(parseModSignal({ state: 'dancing' })).toBeNull();
    expect(parseModSignal({ modVersion: '0.3.0' })).toBeNull();
  });
});
