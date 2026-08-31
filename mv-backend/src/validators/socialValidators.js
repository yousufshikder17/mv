import { z } from "zod";

// Long-form is the point of a review, but "long-form" is not "unbounded" —
// without a ceiling the body column is an open door for anyone who can POST.
const REVIEW_MAX = 10000;
const COMMENT_MAX = 2000;

const prose = (max, noun) =>
    z.string({ required_error: `A ${noun} needs some text` })
        .trim()
        .min(1, `A ${noun} needs some text`)
        .max(max, `A ${noun} is limited to ${max} characters`);

export const reviewSchema = z.object({
    body: prose(REVIEW_MAX, 'review'),
    hasSpoilers: z.boolean().optional().default(false),
});

export const commentSchema = z.object({
    body: prose(COMMENT_MAX, 'comment'),
    hasSpoilers: z.boolean().optional().default(false),
    parentId: z.string().uuid('That reply target is not a valid id').optional().nullable(),
});

export const voteSchema = z.object({
    // No default: an omitted vote is a mistake, not an unhelpful one.
    helpful: z.boolean({ required_error: 'A vote is helpful or unhelpful' }),
});

export const privacySchema = z.object({
    profilePublic: z.boolean().optional(),
    bio: z.string().trim().max(500, 'A bio is limited to 500 characters').optional(),
}).refine((v) => v.profilePublic !== undefined || v.bio !== undefined, {
    message: 'Nothing to update',
});
