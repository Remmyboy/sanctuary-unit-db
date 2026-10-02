import { useEffect, useEffectEvent, useRef, useState } from 'react';
import { tierTag } from '../../lib/format';
import type { Unit } from '../../lib/types';
import { UnitIcon } from '../UnitIcon';
import { byTierName, label } from './names';

// Ids and internal names are searchable too, since people quote them; so are
// "T2" and the faction, which the old combobox labels used to carry.
const haystacks = new WeakMap<Unit, string>();
const haystack = (u: Unit): string => {
  let h = haystacks.get(u);
  if (!h) {
    h = [u.name, u.displayName, u.internalName, u.id, u.role, tierTag(u), u.faction]
      .filter(Boolean)
      .join(' ')
      .toLowerCase();
    haystacks.set(u, h);
  }
  return h;
};

// Inline dropdown panel: search on top, scrolling icon rows below. Keyboard
// follows the old combobox conventions — arrows move, Enter picks, Escape
// closes — and a click anywhere outside closes it.
export function PickerPanel({
  units,
  subFor,
  placeholder,
  explainer,
  listMax,
  iconManifest,
  onPick,
  onClose,
}: {
  units: Unit[];
  subFor: (u: Unit) => string;
  placeholder: string;
  explainer?: string;
  listMax: number;
  iconManifest: Set<string>;
  onPick: (u: Unit) => void;
  onClose: () => void;
}) {
  const [q, setQ] = useState('');
  const [active, setActive] = useState(0);
  const mount = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  // mousedown, not click — it fires before the opener button's own click, so
  // switching panels closes this one without the two toggles cancelling out.
  // Callers pass onClose inline, so it's read through an effect event rather
  // than re-subscribing the listener on every render.
  const closeOutside = useEffectEvent(onClose);
  useEffect(() => {
    const onDocDown = (e: MouseEvent) => {
      if (!mount.current?.contains(e.target as Node)) closeOutside();
    };
    document.addEventListener('mousedown', onDocDown);
    return () => document.removeEventListener('mousedown', onDocDown);
  }, []);

  const needle = q.trim().toLowerCase();
  const rows = units
    .filter((u) => !needle || haystack(u).includes(needle))
    .sort(byTierName)
    .slice(0, 80);
  const activeIdx = Math.min(active, rows.length - 1);

  // Keep the highlighted row in view as the arrows move it, or as typing
  // changes which row that is.
  useEffect(() => {
    listRef.current?.querySelector('.picker-item.active')?.scrollIntoView({ block: 'nearest' });
  }, [activeIdx, needle]);

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      setActive((activeIdx + (e.key === 'ArrowDown' ? 1 : -1) + rows.length) % Math.max(rows.length, 1));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (rows[activeIdx]) onPick(rows[activeIdx]);
    } else if (e.key === 'Escape') {
      onClose();
    }
  };

  return (
    <div className="picker" ref={mount} onKeyDown={onKeyDown}>
      {explainer && <div className="picker-note">{explainer}</div>}
      <input
        ref={inputRef}
        type="text"
        placeholder={placeholder}
        autoComplete="off"
        spellCheck={false}
        role="combobox"
        aria-expanded="true"
        value={q}
        onChange={(e) => {
          setQ(e.target.value);
          setActive(0);
        }}
      />
      <div className="picker-list" style={{ maxHeight: listMax }} ref={listRef}>
        {rows.length ? (
          rows.map((u, i) => (
            <button
              type="button"
              key={u.id}
              className={`picker-item${i === activeIdx ? ' active' : ''}`}
              onClick={() => onPick(u)}
            >
              <UnitIcon icon={u.icon} faction={u.faction} manifest={iconManifest} size={26} />
              <span className="who">
                <span>{label(u)}</span>
                <small>{subFor(u)}</small>
              </span>
            </button>
          ))
        ) : (
          <p className="picker-empty">No matches</p>
        )}
      </div>
    </div>
  );
}
