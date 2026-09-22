// The everything zip on the mods page: the loader and every mod in one
// download. Build-time only — vite.config.ts is the one importer.
//
// GitHub serves release assets without CORS headers, so the page can't stitch
// the zips together in the browser. Instead the site's build fetches the
// release zips named in src/lib/mods.ts and merges them into one static file,
// so it always holds exactly the versions the page shows.
//
// What goes in is what you'd get extracting the zips by hand: the Mod Loader
// zip (BepInEx, the newest loader, an empty SanctuaryMods folder), then every
// mod's drop-in zip, the Mod Manager's included. Each of those carries its
// release notes as a README.txt at the root, so they are dropped for one
// README of our own that lists what's inside.

import { strToU8, unzipSync, zipSync } from 'fflate';
import type { Plugin } from 'vite';
import {
  ENGINE_PATH,
  EVERYTHING_HREF,
  LOADER_VERSION,
  MODS,
  MODS_REPO,
  loaderHref,
  managerHref,
} from './mods.ts';

export interface BundlePart {
  label: string;
  url: string;
}

export function bundleParts(): BundlePart[] {
  return [
    { label: `Mod Loader ${LOADER_VERSION}`, url: loaderHref() },
    ...MODS.map((m) => ({ label: `${m.name} ${m.version}`, url: managerHref(m) })),
  ];
}

/** Merge zips as extracting them one after another would — except that two
 *  parts disagreeing about a file is an error rather than last-one-wins. That
 *  would mean the releases are out of step, and nobody should get whichever
 *  copy happened to come last. */
export function mergeZips(parts: { label: string; data: Uint8Array }[], readme: string): Uint8Array {
  const files: Record<string, Uint8Array> = {};
  const from: Record<string, string> = {};
  for (const { label, data } of parts) {
    for (const [path, bytes] of Object.entries(unzipSync(data))) {
      if (path.endsWith('/') || path === 'README.txt') continue;
      const prior = files[path];
      if (prior && !sameBytes(prior, bytes)) {
        throw new Error(`${label} and ${from[path]} both ship ${path}, and they differ`);
      }
      files[path] = bytes;
      from[path] = label;
    }
  }
  // Notepad is where most people will open it.
  files['README.txt'] = strToU8(readme.replace(/\r?\n/g, '\r\n'));
  return zipSync(files, { level: 9 });
}

function sameBytes(a: Uint8Array, b: Uint8Array): boolean {
  return a.length === b.length && a.every((byte, i) => byte === b[i]);
}

export function bundleReadme(parts: BundlePart[], site: string): string {
  return `SanctuaryDB mods - everything
=============================

Every SanctuaryDB mod in one zip, with the Mod Manager and the loader they
run on:

${parts.map((p) => `  ${p.label}`).join('\n')}

INSTALL
1. Extract this zip into your Sanctuary 'engine' folder, so that
   winhttp.dll sits next to Sanctuary.exe. Default location:
   ${ENGINE_PATH}
2. Launch the game. Every mod is on. To switch one off or change its
   settings, open Mods from the menu's sidebar (the cube icon), or press
   F8 - in the menu or mid-match.

Already have some of these? Extract over the top. You get the versions
above, and your mod settings are kept.

What each mod does, and newer versions: ${site}/mods
Source and release notes: ${MODS_REPO}/releases

ALREADY RUNNING BEPINEX?
Copy BepInEx\\plugins\\ModLoader.dll and the SanctuaryMods folder from this
zip into your engine folder - AND make sure BepInEx\\config\\BepInEx.cfg has
    HideManagerGameObject = true
under [Chainloader]. Sanctuary destroys BepInEx's manager object after
start-up otherwise, and every plugin on it stops running right after it
loads.

MULTIPLAYER AND TRUST
These mods run client-side and never change the game's Lua files or the
simulation, so you can still join lobbies with players who don't have
them. Like every BepInEx plugin they run as full-trust code inside the
game, with your Windows account's permissions, so only install mods from
a source you trust.

UNINSTALL
Delete winhttp.dll, doorstop_config.ini, .doorstop_version and the BepInEx
and SanctuaryMods folders from the engine folder.
`;
}

async function download(part: BundlePart): Promise<Uint8Array> {
  let failure: unknown;
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const res = await fetch(part.url);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return new Uint8Array(await res.arrayBuffer());
    } catch (err) {
      failure = err;
      await new Promise((resolve) => setTimeout(resolve, attempt * 1000));
    }
  }
  throw new Error(`Couldn't download ${part.label} for the everything zip (${part.url}): ${failure}`);
}

export async function buildBundle(site: string): Promise<Uint8Array> {
  const parts = bundleParts();
  const zips = await Promise.all(parts.map(async (p) => ({ label: p.label, data: await download(p) })));
  return mergeZips(zips, bundleReadme(parts, site));
}

/** Emits the everything zip into the client build, which Nitro serves as a
 *  static file, and serves it from memory under `vite dev`. A build that
 *  can't fetch a release fails rather than ship a page whose biggest button
 *  is a dead link. */
export function modBundle(site: string): Plugin {
  let built: Promise<Uint8Array> | undefined;
  const bundle = () => {
    built ??= buildBundle(site).catch((err: unknown) => {
      built = undefined; // let the next request try again
      throw err;
    });
    return built;
  };

  return {
    name: 'sanctuary-mod-bundle',
    configureServer(server) {
      server.middlewares.use(EVERYTHING_HREF, (_req, res, next) => {
        bundle().then((zip) => {
          res.setHeader('Content-Type', 'application/zip');
          res.end(zip);
        }, next);
      });
    },
    async generateBundle() {
      if (this.environment.name !== 'client') return;
      this.emitFile({ type: 'asset', fileName: EVERYTHING_HREF.slice(1), source: await bundle() });
    },
  };
}
