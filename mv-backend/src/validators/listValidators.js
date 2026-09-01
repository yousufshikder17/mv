import { z } from "zod";

const NAME_MAX = 80;
const DESCRIPTION_MAX = 1000;
const NOTE_MAX = 500;

export const createListSchema = z.object({
    name: z.string({ required_error: 'A list needs a name' })
        .trim()
        .min(1, 'A list needs a name')
        .max(NAME_MAX, `A list name is limited to ${NAME_MAX} characters`),
    description: z.string().trim().max(DESCRIPTION_MAX, `A description is limited to ${DESCRIPTION_MAX} characters`).optional(),
    // Private unless asked otherwise. A list is a draft far more often than a
    // publication, and the other default publishes half-finished thinking.
    isPublic: z.boolean().optional().default(false),
});

export const updateListSchema = z.object({
    name: z.string().trim().min(1, 'A list needs a name').max(NAME_MAX).optional(),
    description: z.string().trim().max(DESCRIPTION_MAX).nullable().optional(),
    isPublic: z.boolean().optional(),
}).refine((v) => Object.keys(v).length > 0, { message: 'Nothing to update' });

export const addItemSchema = z.object({
    mediaItemId: z.string({ required_error: 'Which item?' }).uuid('That is not a valid item id'),
    note: z.string().trim().max(NOTE_MAX, `A note is limited to ${NOTE_MAX} characters`).optional(),
});

export const updateItemSchema = z.object({
    note: z.string().trim().max(NOTE_MAX).nullable().optional(),
    // The id to sit after, or null for the front of the list. One primitive
    // that serves both drag-and-drop and a pair of up/down buttons.
    moveAfter: z.string().uuid('That is not a valid item id').nullable().optional(),
}).refine((v) => 'note' in v || 'moveAfter' in v, { message: 'Nothing to update' });
