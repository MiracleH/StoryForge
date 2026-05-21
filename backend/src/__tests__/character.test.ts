import { describe, it, expect, afterAll } from 'vitest';
import request from 'supertest';
import { createTestApp, closeTestDb } from './app';
import { createTestUser, generateToken, createTestProject } from './helpers';

const app = createTestApp();
afterAll(() => closeTestDb());

describe('Character API', () => {
  describe('POST /api/characters', () => {
    it('should create a character', async () => {
      const user = createTestUser();
      const token = generateToken(user);
      const project = createTestProject(user.id);

      const res = await request(app)
        .post('/api/characters')
        .set('Authorization', `Bearer ${token}`)
        .send({ project_id: project.id, name: 'Hero', description: 'Main character', style: 'anime' });

      expect(res.status).toBe(201);
      expect(res.body.data.name).toBe('Hero');
    });
  });

  describe('GET /api/characters/project/:projectId', () => {
    it('should list characters for project', async () => {
      const user = createTestUser();
      const token = generateToken(user);
      const project = createTestProject(user.id);

      await request(app).post('/api/characters').set('Authorization', `Bearer ${token}`).send({ project_id: project.id, name: 'C1' });
      await request(app).post('/api/characters').set('Authorization', `Bearer ${token}`).send({ project_id: project.id, name: 'C2' });

      const res = await request(app)
        .get(`/api/characters/project/${project.id}`)
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.data).toHaveLength(2);
    });
  });

  describe('PUT /api/characters/:id', () => {
    it('should reject updating others character', async () => {
      const user1 = createTestUser();
      const user2 = createTestUser({ email: 'c-other@example.com', username: 'c-other' });
      const token1 = generateToken(user1);
      const token2 = generateToken(user2);
      const project = createTestProject(user1.id);

      const createRes = await request(app).post('/api/characters').set('Authorization', `Bearer ${token1}`).send({ project_id: project.id, name: 'Mine' });

      const res = await request(app)
        .put(`/api/characters/${createRes.body.data.id}`)
        .set('Authorization', `Bearer ${token2}`)
        .send({ name: 'Hacked' });

      expect(res.status).toBe(404);
    });
  });

  describe('DELETE /api/characters/:id', () => {
    it('should delete own character', async () => {
      const user = createTestUser();
      const token = generateToken(user);
      const project = createTestProject(user.id);
      const createRes = await request(app).post('/api/characters').set('Authorization', `Bearer ${token}`).send({ project_id: project.id, name: 'ToDelete' });

      const res = await request(app)
        .delete(`/api/characters/${createRes.body.data.id}`)
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
    });
  });
});
