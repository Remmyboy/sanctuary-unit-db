// The lobby list is read from what the game advertises to Steam, in the
// game's own format. The fixture is a real row from GetServerList
// (2026-09-22), so a change to how the game writes its tags shows up here.

import { describe, expect, it } from 'vitest';
import { isFull, joinHref, mapLabel, parseTags, toLobbies, toLobby, type SteamServer } from './lobbies';

const live: SteamServer = {
  steamid: '90293222530572314',
  name: 'New Game',
  appid: 4511930,
  players: 1,
  max_players: 8,
  map: '~FFA-12P_Tropical_2048_80433',
  dedicated: false,
  gametype: 'sid:90293222530572314;v:0.0.1.15#37b91;p:4/8;hn:neezy',
};

const row = (sid: string, p: string, name = 'Lobby'): SteamServer => ({
  ...live,
  name,
  gametype: `sid:${sid};v:0.0.1.15#37b91;p:${p};hn:host`,
});

describe('toLobby', () => {
  it('reads a live row the way the game does', () => {
    expect(toLobby(live)).toEqual({
      id: '90293222530572314',
      appId: 4511930,
      name: 'New Game',
      host: 'neezy',
      map: '~FFA-12P_Tropical_2048_80433',
      players: 4,
      maxPlayers: 8,
      version: '0.0.1.15#37b91',
      dedicated: false,
    });
  });

  it("takes the player count from the tag, not Steam's field", () => {
    // Steam said 1; the lobby had 4.
    expect(toLobby(live)?.players).toBe(4);
  });

  it("falls back to Steam's fields when the tag is missing or garbled", () => {
    const l = toLobby({ ...live, gametype: 'sid:123;p:lots' });
    expect(l).toMatchObject({ players: 1, maxPlayers: 8, host: '', version: '' });
  });

  it('drops rows with no session id to join', () => {
    expect(toLobby({ ...live, gametype: 'v:1;p:1/2' })).toBeNull();
    expect(toLobby({ ...live, gametype: 'sid:0;p:1/2' })).toBeNull();
    expect(toLobby({ ...live, gametype: 'sid:abc;p:1/2' })).toBeNull();
    expect(toLobby({ ...live, gametype: undefined })).toBeNull();
  });

  it('names an unnamed lobby', () => {
    expect(toLobby({ ...live, name: '  ' })?.name).toBe('Unnamed lobby');
  });
});

describe('parseTags', () => {
  it('splits on the first colon only', () => {
    expect(parseTags('v:0.0.1#ab:cd;hn:x')).toEqual({ v: '0.0.1#ab:cd', hn: 'x' });
  });

  it('ignores empty and keyless parts', () => {
    expect(parseTags(';:x;y;a:1;')).toEqual({ a: '1' });
  });
});

describe('toLobbies', () => {
  it('puts joinable lobbies first, fullest first, full ones last', () => {
    const list = toLobbies([row('1', '8/8', 'Full'), row('2', '1/4', 'Quiet'), row('3', '3/4', 'Busy')]);
    expect(list.map((l) => l.name)).toEqual(['Busy', 'Quiet', 'Full']);
    expect(list.map(isFull)).toEqual([false, false, true]);
  });

  it('keeps one row per session', () => {
    expect(toLobbies([row('5', '1/2', 'Old'), row('5', '2/2', 'New')])).toHaveLength(1);
  });
});

describe('display helpers', () => {
  it("shows hand-made map names as the game's list does", () => {
    expect(mapLabel('Daroza_s_Sanctuary')).toBe('Daroza s Sanctuary');
    expect(mapLabel('~TEAM-1v1_Tropical_256_47940')).toBe('~TEAM-1v1_Tropical_256_47940');
  });

  it('builds the Steam launch link the game parses as a session id', () => {
    expect(joinHref(toLobby(live)!)).toBe('steam://run/4511930//90293222530572314/');
  });
});
