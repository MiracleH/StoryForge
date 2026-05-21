import { describe, it, expect, afterAll } from 'vitest';
import request from 'supertest';
import { createTestApp, closeTestDb } from './app';
import { createTestUser, generateToken, createTestProject, createTestChapter, createTestScene } from './helpers';

const app = createTestApp();
afterAll(() => closeTestDb());

describe('Storyboard API', () => {
  describe('POST /api/storyboards', () => {
    it('should create a storyboard', async () => {
      const user = createTestUser();
      const token = generateToken(user);
      const project = createTestProject(user.id);
      const chapter = createTestChapter(project.id);
      const scene = createTestScene(chapter.id);

      const res = await request(app)
        .post('/api/storyboards')
        .set('Authorization', `Bearer ${token}`)
        .send({ scene_id: scene.id, title: 'Frame 1', duration: 5, camera_angle: 'medium' });

      expect(res.status).toBe(201);
      expect(res.body.data.title).toBe('Frame 1');
    });
  });

  describe('GET /api/storyboards/scene/:sceneId', () => {
    it('should list storyboards for scene', async () => {
      const user = createTestUser();
      const token = generateToken(user);
      const project = createTestProject(user.id);
      const chapter = createTestChapter(project.id);
      const scene = createTestScene(chapter.id);

      await request(app).post('/api/storyboards').set('Authorization', `Bearer ${token}`).send({ scene_id: scene.id, title: 'SB1' });
      await request(app).post('/api/storyboards').set('Authorization', `Bearer ${token}`).send({ scene_id: scene.id, title: 'SB2' });

      const res = await request(app)
        .get(`/api/storyboards/scene/${scene.id}`)
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.data).toHaveLength(2);
    });
  });

  describe('POST /api/storyboards/:id/dialogues', () => {
    it('should add dialogue to storyboard', async () => {
      const user = createTestUser();
      const token = generateToken(user);
      const project = createTestProject(user.id);
      const chapter = createTestChapter(project.id);
      const scene = createTestScene(chapter.id);
      const sbRes = await request(app).post('/api/storyboards').set('Authorization', `Bearer ${token}`).send({ scene_id: scene.id, title: 'SB' });

      const res = await request(app)
        .post(`/api/storyboards/${sbRes.body.data.id}/dialogues`)
        .set('Authorization', `Bearer ${token}`)
        .send({ content: 'Hello!', style: 'speech' });

      expect(res.status).toBe(201);
      expect(res.body.data.content).toBe('Hello!');
    });
  });

  describe('DELETE /api/storyboards/dialogues/:id', () => {
    it('should delete dialogue', async () => {
      const user = createTestUser();
      const token = generateToken(user);
      const project = createTestProject(user.id);
      const chapter = createTestChapter(project.id);
      const scene = createTestScene(chapter.id);
      const sbRes = await request(app).post('/api/storyboards').set('Authorization', `Bearer ${token}`).send({ scene_id: scene.id, title: 'SB' });
      const dRes = await request(app).post(`/api/storyboards/${sbRes.body.data.id}/dialogues`).set('Authorization', `Bearer ${token}`).send({ content: 'Bye!' });

      const res = await request(app)
        .delete(`/api/storyboards/dialogues/${dRes.body.data.id}`)
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
    });
  });
});
