// The detail panel's building blocks, shared by its sections.

import type { ReactNode } from 'react';
import { fmt } from '../../lib/format';

export const Section = ({ title, children }: { title: string; children: ReactNode }) => (
  <div className="section">
    <h3>{title}</h3>
    {children}
  </div>
);

export const Stat = ({ label, value }: { label: string; value: ReactNode }) => (
  <div>
    <dt>{label}</dt>
    <dd>{value}</dd>
  </div>
);

export const KV = ({ k, v }: { k: string; v: ReactNode }) => (
  <>
    <dt>{k}</dt>
    <dd>{v}</dd>
  </>
);

// Coloured per resource, since an ongoing rate is read at a glance far more
// often than it is read carefully.
export const rateLine = (r: { alloys: number; energy: number }) => (
  <>
    {r.alloys ? <span className="alloy-val">{fmt(r.alloys)}/s alloy</span> : null}
    {r.alloys && r.energy ? ' · ' : null}
    {r.energy ? <span className="energy-val">{fmt(r.energy)}/s energy</span> : null}
  </>
);
