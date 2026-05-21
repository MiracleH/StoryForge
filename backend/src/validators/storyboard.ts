import { z } from 'zod';

export const createStoryboardSchema = z.object({
  scene_id: z.number().int().positive(),
  title: z.string().max(200).optional(),
  description: z.string().max(2000).optional(),
  image_url: z.string().max(500).optional(),
  duration: z.number().min(0.1).max(300).optional(),
  camera_angle: z.string().max(50).optional(),
  camera_movement: z.string().max(50).optional(),
  order_index: z.number().int().min(0).optional(),
  transition_type: z.string().max(50).optional(),
  transition_duration: z.number().min(0).max(10).optional(),
});

export const updateStoryboardSchema = z.object({
  title: z.string().max(200).optional(),
  description: z.string().max(2000).optional(),
  image_url: z.string().max(500).optional(),
  duration: z.number().min(0.1).max(300).optional(),
  camera_angle: z.string().max(50).optional(),
  camera_movement: z.string().max(50).optional(),
  order_index: z.number().int().min(0).optional(),
  transition_type: z.string().max(50).optional(),
  transition_duration: z.number().min(0).max(10).optional(),
});

export const addDialogueSchema = z.object({
  content: z.string().min(1, 'Content is required').max(1000),
  character_id: z.number().int().positive().optional(),
  position_x: z.number().min(0).max(100).optional(),
  position_y: z.number().min(0).max(100).optional(),
  style: z.enum(['speech', 'shout', 'whisper', 'thought']).optional(),
  order_index: z.number().int().min(0).optional(),
});
