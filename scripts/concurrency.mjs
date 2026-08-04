/**
 * Browser processes are the expensive part of verification. Keep Chrome below
 * half the machine's memory even when every available CPU could run one, and
 * leave one CPU for the parent process and the rest of the check.
 *
 * This local copy is the contract shared with the parallel verify workstream.
 * The branch that introduces the shared browser budget owns its final wording.
 */
import { availableParallelism, totalmem } from "node:os";

export const PER_CHROME = 1536 * 1024 * 1024;

export function browserSlots() {
  const detected = Math.max(
    1,
    Math.min(availableParallelism() - 1, Math.floor(totalmem() / 2 / PER_CHROME), 6),
  );
  const shared = Number.parseInt(process.env.VERIFY_BROWSER_SLOTS ?? "", 10);
  return Number.isFinite(shared) && shared > 0 ? Math.min(shared, detected) : detected;
}
