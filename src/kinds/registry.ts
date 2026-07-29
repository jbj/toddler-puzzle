/**
 * Which kind plays a level.
 *
 * The level table (`levels.ts`) says what each of the thirty levels is by
 * naming a `PuzzleKindId`; the registry is what turns that name into the kind
 * that implements it. Every kind registers itself here, and every id the table
 * uses is registered - `tests/levels.test.ts` holds the table and the registry
 * to each other, so a level naming a kind nobody wrote is caught by the tests
 * rather than by a child.
 *
 * There used to be a stand-in here: a level whose kind did not exist yet was
 * played as shape-match, so the whole ramp was playable while the kinds were
 * still being written. Shatter was the last of them, and the stand-in went with
 * it. See
 * [decision 20260728T205627](../../docs/decisions/20260728T205627-unbuilt-kinds-play-as-stand-ins.md).
 */
import type { LevelSpec, PuzzleKindId } from "../levels";
import type { PuzzleKind } from "../puzzle";
import { jigsaw } from "./jigsaw";
import { play } from "./play";
import { polygon } from "./polygon";
import { shapeMatch } from "./shape-match";
import { shatter } from "./shatter";
import { sliced } from "./sliced";

const registry = new Map<PuzzleKindId, PuzzleKind>();

/** Add a kind, under the id the level table names it by. */
export function registerKind(kind: PuzzleKind): void {
  registry.set(kind.id, kind);
}

registerKind(shapeMatch);
registerKind(sliced);
registerKind(polygon);
registerKind(play);
registerKind(jigsaw);
registerKind(shatter);

/** Is there a kind registered under this id? */
export const isKindRegistered = (id: PuzzleKindId): boolean => registry.has(id);

/**
 * The kind that plays this level. Throws rather than falls back: a level naming
 * a kind that does not exist is a mistake in the table, and one the tests catch
 * long before a child could.
 */
export function kindFor(spec: LevelSpec): PuzzleKind {
  const kind = registry.get(spec.kind);
  if (!kind) {
    throw new Error(`Level ${spec.level} names "${spec.kind}", which no kind is registered under.`);
  }
  return kind;
}
