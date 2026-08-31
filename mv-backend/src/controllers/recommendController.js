import { recommendFor } from '../services/recommendService.js';

/**
 * GET /recommendations
 *
 * Every result carries a `why`. SPEC 9: always show why something was
 * recommended, never a black box - which is also why this is similarity
 * scoring rather than a model.
 */
export const listRecommendations = async (req, res) => {
    const { recommendations, reason } = await recommendFor(req.user.id);

    return res.status(200).json({
        status: 'Success',
        results: recommendations.length,
        // Told plainly rather than dressed up as an empty list: a new account
        // has nothing to recommend from, and saying so is more useful than
        // showing nothing without explanation.
        reason,
        data: {
            recommendations: recommendations.map((r) => ({
                item: r.item,
                why: r.why,
                matchedGenres: r.matchedGenres,
            })),
        },
    });
};
