import { z } from 'zod';

export const createCharacterSchema = z.object({
  project_id: z.number().int().positive(),
  name: z.string().min(1, 'Name is required').max(100),
  description: z.string().max(2000).optional(),
  personality: z.string().max(1000).optional(),
  appearance: z.string().max(2000).optional(),
  style: z.enum(['anime', 'manga', 'realistic', 'cartoon']).optional(),
});

export const updateCharacterSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  description: z.string().max(2000).optional(),
  personality: z.string().max(1000).optional(),
  appearance: z.string().max(2000).optional(),
  style: z.enum(['anime', 'manga', 'realistic', 'cartoon']).optional(),
});
