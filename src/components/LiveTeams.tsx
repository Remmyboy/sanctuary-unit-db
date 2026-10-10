// 'A vs B' for a live game, from the streaming player's lobby (observers left out).

import { liveTeams, type LiveListRow } from '../lib/live-replay';

export function LiveTeams({ row }: { row: Pick<LiveListRow, 'players'> }) {
  const teams = liveTeams(row.players);
  if (teams.length === 0) return <span className="dim">—</span>;
  return (
    <>
      {teams.map((team, i) => (
        <span key={i}>
          {i > 0 && <span className="vs"> vs </span>}
          {team.map((p, j) => (
            <span key={j}>
              {j > 0 && ', '}
              {p.name}
            </span>
          ))}
        </span>
      ))}
    </>
  );
}
