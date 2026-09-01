import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { api, createSchema, resetTables, registerUser } from './helpers/testDb.js';
beforeAll(createSchema); beforeEach(resetTables);
describe('malformed ids on routes without a body validator', () => {
    it('answers 4xx, never 500', async () => {
        const u = await registerUser();
        const cases = [
            ['POST /social/follow/:bad', await u.auth(api().post('/social/follow/not-a-uuid'))],
            ['DELETE /social/follow/:bad', await u.auth(api().delete('/social/follow/not-a-uuid'))],
            ['POST /deals/:bad/vote', await u.auth(api().post('/deals/not-a-uuid/vote')).send({ value: 1 })],
            ['GET /lists/:bad', await api().get('/lists/not-a-uuid')],
            ['GET /social/profile/:bad', await api().get('/social/profile/not-a-uuid')],
        ];
        for (const [name, res] of cases) {
            expect(res.status, `${name} -> ${res.status}`).toBeLessThan(500);
        }
    });
});
