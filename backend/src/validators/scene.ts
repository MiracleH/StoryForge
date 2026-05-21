import { z } from 'zod';

export const createSceneSchema = z.object({
  chapter_id: z.number().int().positive(),
  title: z.string().max(200).optional(),
  description: z.string().max(2000).optional(),
  background_image: z.string().max(500).optional(),
  order_index: z.number().int().min(0).optional(),
});

export const updateSceneSchema = z.object({
  title: z.string().max(200).optional(),
  description: z.string().max(2000).optional(),
  background_image: z.string().max(500).optional(),
  order_index: z.number().int().min(0).optional(),
});
