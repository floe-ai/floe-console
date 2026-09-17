/**
 * The surfaces mechanism (A3).
 *
 * A "surface" is a way a person touches Floe. Console is one — the terminal
 * client — but it is deliberately not the only shape the design allows for, so
 * this is a list of several surfaces rather than a single hard-coded console.
 *
 * Where this runs: at Floe's first install, the installer presents this list so
 * a newcomer can choose what to install alongside the substrate. Each surface is
 * its own repository and an optional dependency of Floe, never absorbed into it;
 * at least one is recommended so someone who does not yet know what they want is
 * not left with nothing, while someone who does can decline and build their own.
 *
 * Console is the only current entry and is recommended by default. Adding a
 * future surface is a matter of appending to this list — the presentation and
 * the "recommend at least one" rule do not change.
 *
 * The install-time picker itself lives in the Floe launcher (floe-cli), because
 * choosing what to install happens before the console exists on disk. This
 * module is the shape that list is built from and the console's own entry in it;
 * it does not install anything.
 */

export interface Surface {
  /** Stable id, used by the installer to track a choice. */
  readonly id: string;
  /** What a person sees in the install list. */
  readonly name: string;
  /** One honest line about what this surface is for. */
  readonly description: string;
  /** The package a newcomer installs to get it; its own repository. */
  readonly package: string;
  /** True if offered pre-selected so a newcomer is not left with nothing. */
  readonly recommended: boolean;
}

/** Every surface the installer can offer. Console is the only current entry. */
export const AVAILABLE_SURFACES: readonly Surface[] = [
  {
    id: "console",
    name: "Floe Console",
    description: "A terminal client to watch the substrate, send work to actors, and answer what they ask.",
    package: "@floe/console",
    recommended: true,
  },
];

/**
 * The surfaces to pre-select in the installer. Enforces the A3 rule that at
 * least one surface is recommended: if nothing were flagged, the first entry is
 * offered so the list is never presented with everything unchecked.
 */
export function recommendedSurfaces(surfaces: readonly Surface[] = AVAILABLE_SURFACES): readonly Surface[] {
  const flagged = surfaces.filter((s) => s.recommended);
  if (flagged.length > 0) return flagged;
  return surfaces.length > 0 ? [surfaces[0]!] : [];
}
