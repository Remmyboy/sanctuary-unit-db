import { fmt } from '../../lib/format';

// A net rate in a readout: signed, green while it holds and red once it drains.
export const Net = ({ v }: { v: number }) => (
  <div className={`rv ${v < 0 ? 'bad' : 'good'}`}>
    {v > 0 ? '+' : ''}
    {fmt(v)}
  </div>
);
