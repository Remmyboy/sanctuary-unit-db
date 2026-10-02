import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { loadData } from '../lib/data';
import { duration, fmt, isCommander, resourceName, tierTag } from '../lib/format';
import type { ResourceRates, Unit } from '../lib/types';
import { str } from '../lib/search';
import { UnitIcon } from '../components/UnitIcon';
import { FACTION_COLOURS, FACTION_ORDER } from '../lib/faction-colours';
import { FactionEmblem } from '../components/FactionEmblem';
import { GameVersion } from '../components/GameVersion';
import { PageHead } from '../components/PageHead';
import { label } from '../components/calc/names';
import { Net } from '../components/calc/Net';
import { PickerPanel } from '../components/calc/PickerPanel';
import { QueueReadout } from '../components/calc/QueueReadout';
import { StepperList } from '../components/calc/StepperList';
import { Timeline } from '../components/calc/Timeline';
import { Verdict } from '../components/calc/Verdict';
import { useCalculatorState, type CalcSearch } from '../components/calc/use-calculator-state';

export const Route = createFileRoute('/calculator')({
  ssr: false,
  validateSearch: (raw: Record<string, unknown>): CalcSearch => ({
    t: str(raw.t),
    p: str(raw.p),
    a: str(raw.a),
    e: str(raw.e),
    f: str(raw.f),
    m: str(raw.m),
    q: str(raw.q),
    b: str(raw.b),
    s: str(raw.s),
  }),
  head: () => ({
    meta: [
      { title: 'Calculator — SanctuaryDB' },
      {
        name: 'description',
        content:
          "Build time, resource drain and economy planning for Sanctuary: Shattered Sun, using the game's own formulas.",
      },
    ],
  }),
  loader: () => loadData(),
  component: CalculatorPage,
});

/* ---------------- naming & detail lines ---------------- */

// A builder chip's name, tier first: "T2 Engineer". The tier matters, since
// factions have same-named engineers at several tiers.
const chipLabel = (u: Unit): string => (tierTag(u) ? `${tierTag(u)} ` : '') + label(u);

// "T2 · EDA · 3,200a · 48,000e" — the sub line under a pickable unit.
const subLine = (u: Unit): string =>
  [tierTag(u), u.faction, `${fmt(u.cost.alloys, 0)}a · ${fmt(u.cost.energy, 0)}e`]
    .filter(Boolean)
    .join(' · ');

const rateBits = (o: ResourceRates | null, sign: string): string | null => {
  const bits = Object.entries(o ?? {})
    .filter(([, v]) => v)
    .map(([k, v]) => `${sign}${fmt(v)} ${resourceName(k)}/s`);
  return bits.length ? bits.join(' ') : null;
};

// "+18 energy/s · −2 alloy/s · 500 energy store" — what a structure does.
const econDetail = (u: Unit): string =>
  [
    rateBits(u.production, '+'),
    rateBits(u.upkeep, '−'),
    u.storage
      ? Object.entries(u.storage)
          .filter(([, v]) => v)
          .map(([k, v]) => `${fmt(v, 0)} ${resourceName(k)} store`)
          .join(' ')
      : null,
  ]
    .filter(Boolean)
    .join(' · ');

const econSub = (u: Unit): string =>
  `${[tierTag(u), u.faction].filter(Boolean).join(' ')} · ${econDetail(u)}`;

/* ---------------- page ---------------- */

function CalculatorPage() {
  const loaded = Route.useLoaderData();
  const { data, byId, iconManifest } = loaded;
  const navigate = useNavigate({ from: Route.fullPath });
  const {
    patch,
    panel,
    setPanel,
    togglePanel,
    faction,
    targetPool,
    assistPool,
    target,
    builders,
    primary,
    assists,
    queueMode,
    queueFaction,
    producerPool,
    consumerPool,
    storagePool,
    economy,
    addRow,
    bumpRow,
    dropRow,
    build,
    econ,
    queueRows,
    addToQueue,
    moveQueueRow,
    commander,
    queueBuilders,
    queueBuilder,
    queuePool,
    startRows,
    startCap,
    startStock,
    setStartStock,
    queue,
    plan,
    copied,
    copyLink,
    reset,
  } = useCalculatorState(loaded, Route.useSearch(), (next) => navigate({ search: next, replace: true }));

  return (
    <>
      <PageHead eyebrow="Database" title="Build Calculator" art="calculator">
        How long a build takes, what it drains, and whether your economy keeps up — worked from the game's own
        formulas. The setup lives in the URL, so copy the link to share it.
      </PageHead>
      <div className="toolbar">
        <span className="toolbar-summary">
          {queueMode
            ? plan
              ? `${queue.length} build${queue.length === 1 ? '' : 's'} · ${fmt(plan.power)} build power · ${
                  Number.isFinite(plan.finish) ? duration(plan.finish) : 'never finishes'
                }`
              : 'Build order planning'
            : build
              ? `${label(build.target)} · ${fmt(build.power)} build power · ${duration(build.seconds)}`
              : 'Build time, drain and economy planning'}
        </span>
        <span className="toolbar-controls">
          <GameVersion game={data.meta.game} generatedAt={data.meta.generatedAt} />
          <button type="button" className="linkish" onClick={copyLink}>
            {copied ? 'Copied ✓' : 'Copy link'}
          </button>
          <button type="button" className="linkish" onClick={reset}>
            Reset
          </button>
        </span>
      </div>

      <main className="calc">
        <section className="calc-col">
          <div className="mode-row" role="group" aria-label="Calculator mode">
            <button
              type="button"
              aria-pressed={!queueMode}
              onClick={() => {
                setPanel(null);
                patch({ m: undefined });
              }}
            >
              Single build
            </button>
            <button
              type="button"
              aria-pressed={queueMode}
              onClick={() => {
                setPanel(null);
                patch({ m: 'q' });
              }}
            >
              Build order
            </button>
          </div>

          <h2>{queueMode ? 'Build order' : 'Build'}</h2>

          <div className="calc-step">
            <b>1</b>Faction
          </div>
          <div className="chip-row">
            {FACTION_ORDER.map((fc) => (
              <button
                type="button"
                className="fac-chip"
                key={fc}
                aria-pressed={(queueMode ? queueFaction : faction) === fc}
                // In build-order mode the builder decides the faction too, so
                // it's cleared with the chip or the old faction would linger.
                onClick={() => {
                  setPanel(null);
                  if (queueMode) patch({ f: queueFaction === fc ? undefined : fc, b: undefined });
                  else patch({ f: faction === fc ? undefined : fc });
                }}
              >
                <FactionEmblem faction={fc} colour={FACTION_COLOURS[fc] ?? FACTION_COLOURS.Unknown} />
                {fc}
              </button>
            ))}
          </div>

          {queueMode ? (
            <>
              <div className="calc-step">
                <b>2</b>Who builds it?
              </div>
              {!queueFaction && <div className="col-empty">Pick a faction first.</div>}
              <div className="chip-row">
                {queueBuilders.map((u) => (
                  <button
                    type="button"
                    className="builder-chip"
                    key={u.id}
                    aria-pressed={u.id === queueBuilder?.id}
                    onClick={() => patch({ b: u.id })}
                  >
                    {chipLabel(u)} <small>{fmt(u.buildPower)} bp</small>
                  </button>
                ))}
              </div>

              <div className="calc-step">
                <b>3</b>Queue, in order
              </div>
              {queueBuilder && queueRows.length === 0 && (
                <div className="col-empty">Nothing queued — add the first build.</div>
              )}
              <StepperList
                rows={queueRows}
                byId={byId}
                iconManifest={iconManifest}
                numbered
                detail={(u) =>
                  queueBuilder && !u.builtBy.includes(queueBuilder.id)
                    ? `${label(queueBuilder)} can't build this — skipped`
                    : `${fmt(u.cost.alloys, 0)}a · ${fmt(u.cost.energy, 0)}e · ${fmt(u.buildTime, 0)} build time`
                }
                onBump={(i, d) => bumpRow('q', queueRows, i, d)}
                onDrop={(i) => dropRow('q', queueRows, i)}
                onMoveUp={moveQueueRow}
              />
              {queueBuilder && (
                <button type="button" className="add-btn" onClick={() => togglePanel('queue')}>
                  + Add to queue
                </button>
              )}
              {panel === 'queue' && (
                <PickerPanel
                  units={queuePool}
                  subFor={subLine}
                  placeholder={`Search what ${queueBuilder ? label(queueBuilder) : 'it'} can build…`}
                  listMax={264}
                  iconManifest={iconManifest}
                  onPick={(u) => addToQueue(u.id)}
                  onClose={() => setPanel(null)}
                />
              )}
            </>
          ) : (
            <>
              <div className="calc-step">
                <b>2</b>What are you building?
              </div>
              <button
                type="button"
                className="select-btn"
                aria-expanded={panel === 'target'}
                onClick={() => togglePanel('target')}
              >
                {target ? (
                  <>
                    <UnitIcon icon={target.icon} faction={target.faction} manifest={iconManifest} size={36} />
                    <span className="select-who">
                      <span className="select-name">{label(target)}</span>
                      <small>{subLine(target)}</small>
                    </span>
                  </>
                ) : (
                  <span className="select-empty">Pick a unit or structure…</span>
                )}
                <span className="caret">▾</span>
              </button>
              {panel === 'target' && (
                <PickerPanel
                  units={targetPool}
                  subFor={subLine}
                  placeholder="Search buildable units…"
                  listMax={264}
                  iconManifest={iconManifest}
                  // A new target invalidates the builder choice — its builtBy list
                  // is a different set, so fall back to that list's first chip.
                  onPick={(u) => {
                    patch({ t: u.id, p: undefined });
                    setPanel(null);
                  }}
                  onClose={() => setPanel(null)}
                />
              )}

              <div className="calc-step">
                <b>3</b>Who starts it?
              </div>
              {!target && <div className="col-empty">Pick a build target first.</div>}
              <div className="chip-row">
                {builders.map((u) => (
                  <button
                    type="button"
                    className="builder-chip"
                    key={u.id}
                    aria-pressed={u.id === primary?.id}
                    title={
                      u.upgradesTo === target?.id ? `Upgrades in place into ${label(target)}` : undefined
                    }
                    onClick={() => patch({ p: u.id })}
                  >
                    {chipLabel(u)}{' '}
                    <small>
                      {u.upgradesTo === target?.id ? 'upgrade · ' : ''}
                      {fmt(u.buildPower)} bp
                    </small>
                  </button>
                ))}
              </div>
            </>
          )}

          <div className="calc-step">
            <b>4</b>Assisted by <span className="opt">(optional)</span>
          </div>
          {assists.length === 0 && <div className="col-empty">None — the builder works alone.</div>}
          <StepperList
            rows={assists}
            byId={byId}
            iconManifest={iconManifest}
            detail={(u) => `${fmt(u.buildPower)} bp each`}
            onBump={(i, d) => bumpRow('a', assists, i, d)}
            onDrop={(i) => dropRow('a', assists, i)}
          />
          <button type="button" className="add-btn" onClick={() => togglePanel('assist')}>
            + Add assisting unit
          </button>
          {panel === 'assist' && (
            <PickerPanel
              units={assistPool}
              subFor={(u) => `${subLine(u)} · ${fmt(u.buildPower)} bp`}
              placeholder="Search assisting units…"
              listMax={220}
              iconManifest={iconManifest}
              onPick={(u) => addRow('a', assists, u.id)}
              onClose={() => setPanel(null)}
            />
          )}
        </section>

        <section className="calc-col">
          <h2>{queueMode ? 'Starting economy' : 'Economy'}</h2>
          {queueMode ? (
            <>
              {commander ? (
                <div className="stepper-list">
                  <div className="stepper">
                    <UnitIcon
                      icon={commander.icon}
                      faction={commander.faction}
                      manifest={iconManifest}
                      size={24}
                    />
                    <span className="who">
                      <span>{label(commander)}</span>
                      <small>{econDetail(commander)}</small>
                    </span>
                    <span className="stepper-note">always there</span>
                  </div>
                </div>
              ) : (
                <div className="col-empty">Pick a faction — every game starts from its commander.</div>
              )}
              <div className="calc-step">
                Already built <span className="opt">(optional)</span>
              </div>
              <StepperList
                rows={startRows}
                byId={byId}
                iconManifest={iconManifest}
                detail={econDetail}
                onBump={(i, d) => bumpRow('e', startRows, i, d)}
                onDrop={(i) => dropRow('e', startRows, i)}
              />
            </>
          ) : (
            <>
              {economy.length === 0 && (
                <div className="col-empty">No structures — add your generators and extractors.</div>
              )}
              <StepperList
                rows={economy}
                byId={byId}
                iconManifest={iconManifest}
                detail={econDetail}
                onBump={(i, d) => bumpRow('e', economy, i, d)}
                onDrop={(i) => dropRow('e', economy, i)}
              />
            </>
          )}
          <div className="add-btns">
            <button type="button" className="add-btn" onClick={() => togglePanel('econ')}>
              + Add generator / extractor
            </button>
            <button type="button" className="add-btn secondary" onClick={() => togglePanel('drain')}>
              + Energy users…
            </button>
            {/* Storage only matters where there's a stockpile to hold, so
                the single-build mode doesn't offer it. */}
            {queueMode && (
              <button type="button" className="add-btn secondary" onClick={() => togglePanel('storage')}>
                + Storage…
              </button>
            )}
          </div>
          {panel === 'econ' && (
            <PickerPanel
              units={queueMode ? producerPool.filter((u) => !isCommander(u)) : producerPool}
              subFor={econSub}
              placeholder="Search economy structures…"
              listMax={264}
              iconManifest={iconManifest}
              onPick={(u) => addRow('e', queueMode ? startRows : economy, u.id)}
              onClose={() => setPanel(null)}
            />
          )}
          {panel === 'drain' && (
            <PickerPanel
              units={consumerPool}
              subFor={econSub}
              placeholder="Search energy users…"
              explainer="Structures that consume alloy or energy — usually not needed, add only if they're part of your base."
              listMax={220}
              iconManifest={iconManifest}
              onPick={(u) => addRow('e', queueMode ? startRows : economy, u.id)}
              onClose={() => setPanel(null)}
            />
          )}
          {panel === 'storage' && (
            <PickerPanel
              units={storagePool}
              subFor={econSub}
              placeholder="Search storage and factories…"
              explainer="Structures that raise your storage cap — storages, and factories, which each hold some energy."
              listMax={220}
              iconManifest={iconManifest}
              onPick={(u) => addRow('e', startRows, u.id)}
              onClose={() => setPanel(null)}
            />
          )}

          {queueMode && commander && (
            <>
              <div className="calc-step">Starting stockpile</div>
              <div className="stock-inputs">
                {(['alloys', 'energy'] as const).map((k) => (
                  <label key={k}>
                    <span className={k === 'alloys' ? 'alloy-val' : 'energy-val'}>{resourceName(k)}</span>
                    <input
                      type="number"
                      min={0}
                      max={startCap[k]}
                      step={k === 'alloys' ? 50 : 500}
                      value={startStock[k]}
                      onChange={(e) =>
                        setStartStock({
                          ...startStock,
                          [k]: Math.max(0, Math.round(Number(e.target.value) || 0)),
                        })
                      }
                    />
                    <small>of {fmt(startCap[k], 0)} storage</small>
                  </label>
                ))}
              </div>
            </>
          )}

          {queueMode && plan && plan.steps.length > 0 && (
            <>
              <h2 className="section-gap">Timeline</h2>
              <Timeline plan={plan} />
            </>
          )}
        </section>

        <aside className="calc-rail">
          <div className="rail-inner">
            {queueMode ? (
              <QueueReadout plan={plan} />
            ) : (
              <>
                <h2>Can I afford it?</h2>
                <Verdict build={build} econ={econ} hasEconomy={economy.length > 0} />

                {build && (
                  <>
                    <h2>Build readout</h2>
                    <div className="rgrid">
                      <div>
                        <div className="rk">Time</div>
                        <div className="rv">{duration(build.seconds)}</div>
                      </div>
                      <div>
                        <div className="rk">Build power</div>
                        <div className="rv">
                          {fmt(build.power)}
                          {build.assistPower
                            ? ` (${fmt(build.primary.buildPower)}+${fmt(build.assistPower)})`
                            : ''}
                        </div>
                      </div>
                      <div>
                        <div className="rk">Alloy/s</div>
                        <div className="rv alloy-val">{fmt(build.alloysPerSec)}</div>
                      </div>
                      <div>
                        <div className="rk">Energy/s</div>
                        <div className="rv energy-val">{fmt(build.energyPerSec)}</div>
                      </div>
                      <div>
                        <div className="rk">Total alloy</div>
                        <div className="rv alloy-val">{fmt(build.target.cost.alloys, 0)}</div>
                      </div>
                      <div>
                        <div className="rk">Total energy</div>
                        <div className="rv energy-val">{fmt(build.target.cost.energy, 0)}</div>
                      </div>
                    </div>
                  </>
                )}

                {economy.length > 0 && (
                  <>
                    <h2>Economy readout</h2>
                    <div className="rgrid tight">
                      <div>
                        <div className="rk">Net alloy/s</div>
                        <Net v={econ.alloysNet} />
                      </div>
                      <div>
                        <div className="rk">Net energy/s</div>
                        <Net v={econ.energyNet} />
                      </div>
                    </div>
                    <div className="rlines">
                      <div>
                        Gross {fmt(econ.alloysIn)} alloy/s · {fmt(econ.energyIn)} energy/s
                      </div>
                      <div>
                        Upkeep {fmt(econ.alloysOut)} alloy/s · {fmt(econ.energyOut)} energy/s
                      </div>
                    </div>
                  </>
                )}
              </>
            )}
          </div>
        </aside>
      </main>
    </>
  );
}
