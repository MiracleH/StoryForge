import { describe, it, expect, afterAll } from 'vitest';
import request from 'supertest';
import { createTestApp, closeTestDb } from './app';
import { createTestUser, generateToken } from './helpers';

const app = createTestApp();
afterAll(() => closeTestDb());

describe('Project API', () => {
  describe('POST /api/projects', () => {
    it('should create a project', async () => {
      const user = createTestUser();
      const token = generateToken(user);

      const res = await request(app)
        .post('/api/projects')
        .set('Authorization', `Bearer ${token}`)
        .send({ title: 'Test Project', description: 'A test project' });

      expect(res.status).toBe(201);
      expect(res.body.data.title).toBe('Test Project');
    });
  });

  describe('GET /api/projects', () => {
    it('should list only user projects', async () => {
      const user1 = createTestUser({ email: 'u1@example.com', username: 'u1' });
      const user2 = createTestUser({ email: 'u2@example.com', username: 'u2' });
      const token1 = generateToken(user1);
      const token2 = generateToken(user2);

      await request(app).post('/api/projects').set('Authorization', `Bearer ${token1}`).send({ title: 'P1' });
      await request(app).post('/api/projects').set('Authorization', `Bearer ${token2}`).send({ title: 'P2' });

      const res = await request(app)
        .get('/api/projects')
        .set('Authorization', `Bearer ${token1}`);

      expect(res.status).toBe(200);
      expect(res.body.data.projects.every((p: any) => p.user_id === user1.id)).toBe(true);
    });
  });

  describe('PUT /api/projects/:id', () => {
    it('should update own project', async () => {
      const user = createTestUser();
      const token = generateToken(user);
      const createRes = await request(app).post('/api/projects').set('Authorization', `Bearer ${token}`).send({ title: 'Old' });

      const res = await request(app)
        .put(`/api/projects/${createRes.body.data.id}`)
        .set('Authorization', `Bearer ${token}`)
        .send({ title: 'New' });

      expect(res.status).toBe(200);
      expect(res.body.data.title).toBe('New');
    });

    it('should reject updating others project', async () => {
      const user1 = createTestUser();
      const user2 = createTestUser({ email: 'other@example.com', username: 'other' });
      const token1 = generateToken(user1);
      const token2 = generateToken(user2);

      const createRes = await request(app).post('/api/projects').set('Authorization', `Bearer ${token1}`).send({ title: 'Mine' });

      const res = await request(app)
        .put(`/api/projects/${createRes.body.data.id}`)
        .set('Authorization', `Bearer ${token2}`)
        .send({ title: 'Hacked' });

      expect(res.status).toBe(404);
    });
  });

  describe('DELETE /api/projects/:id', () => {
    it('should delete own project', async () => {
      const user = createTestUser();
      const token = generateToken(user);
      const createRes = await request(app).post('/api/projects').set('Authorization', `Bearer ${token}`).send({ title: 'ToDelete' });

      const res = await request(app)
        .delete(`/api/projects/${createRes.body.data.id}`)
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
    });
  });
});
