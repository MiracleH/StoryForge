import { describe, it, expect, afterAll } from 'vitest';
import request from 'supertest';
import { createTestApp, closeTestDb } from './app';
import { createTestUser, generateToken } from './helpers';

const app = createTestApp();
afterAll(() => closeTestDb());

describe('AI API', () => {
  describe('GET /api/ai/config', () => {
    it('should return AI config with availability', async () => {
      const user = createTestUser();
      const token = generateToken(user);

      const res = await request(app)
        .get('/api/ai/config')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.data).toHaveProperty('available');
      expect(res.body.data).toHaveProperty('text');
      expect(res.body.data).toHaveProperty('image');
      expect(res.body.data).toHaveProperty('video');
      expect(res.body.data).toHaveProperty('tts');
      expect(res.body.data.image).toHaveProperty('available');
      expect(res.body.data.image).toHaveProperty('model');
    });

    it('should reject without token', async () => {
      const res = await request(app).get('/api/ai/config');
      expect(res.status).toBe(401);
    });
  });

  describe('POST /api/ai/generate/character-image', () => {
    it('should return 503 when AI not configured', async () => {
      const user = createTestUser();
      const token = generateToken(user);

      const res = await request(app)
        .post('/api/ai/generate/character-image')
        .set('Authorization', `Bearer ${token}`)
        .send({ character_id: 1 });

      expect(res.status).toBe(503);
    });
  });

  describe('POST /api/ai/generate/scene-image', () => {
    it('should return 503 when AI not configured', async () => {
      const user = createTestUser();
      const token = generateToken(user);

      const res = await request(app)
        .post('/api/ai/generate/scene-image')
        .set('Authorization', `Bearer ${token}`)
        .send({ scene_id: 1 });

      expect(res.status).toBe(503);
    });
  });

  describe('POST /api/ai/generate/tts', () => {
    it('should return 503 when AI not configured', async () => {
      const user = createTestUser();
      const token = generateToken(user);

      const res = await request(app)
        .post('/api/ai/generate/tts')
        .set('Authorization', `Bearer ${token}`)
        .send({ dialogue_id: 1 });

      expect(res.status).toBe(503);
    });
  });
});
