import { describe, it, expect } from 'vitest';
import { exitCodeFor } from '../src/jobs/dailyPoll.js';

const summary = (over = {}) => ({ fetched: 0, inserted: 0, skipped: [], errors: [], ...over });

// The scheduled job ran green every morning with three of its ten secrets set,
// so every price source skipped and nothing was collected. A green tick is
// exactly what stops anyone looking, and book prices cannot be backfilled.
describe('what counts as a healthy poll', () => {
    it('fails a run that collected nothing because sources were unconfigured', () => {
        expect(exitCodeFor(summary({ skipped: ['googlebooks', 'itad', 'kindle'] }))).toBe(1);
    });

    it('passes when a dormant source is skipped but others still collected', () => {
        // A permanently-dormant Kindle adapter must not paint every run red
        // while the sources that are configured are doing their job.
        expect(exitCodeFor(summary({ fetched: 158, skipped: ['kindle'] }))).toBe(0);
    });

    it('still fails on a real error', () => {
        expect(exitCodeFor(summary({ fetched: 158, errors: ['itad: 500'] }))).toBe(1);
    });

    it('passes a fully configured run that simply had nothing to fetch', () => {
        // Nothing tracked yet is not a misconfiguration. Only a skip makes
        // an empty run suspicious.
        expect(exitCodeFor(summary())).toBe(0);
    });

    it('passes a same-day re-run where every quote deduped', () => {
        // fetched counts what came back; inserted counts what was new. The
        // unique constraint doing its job is not a failure.
        expect(exitCodeFor(summary({ fetched: 158, inserted: 0 }))).toBe(0);
    });
});
