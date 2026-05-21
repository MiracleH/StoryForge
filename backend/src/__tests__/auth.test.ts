import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { createTestApp, testDb, closeTestDb } from './app';
import { createTestUser, generateToken } from './helpers';

const app = createTestApp();

afterAll(() => closeTestDb());

describe('Auth API', () => {
  describe('POST /api/auth/register', () => {
    it('should register a new user', async () => {
      const res = await request(app)
        .post('/api/auth/register')
        .send({ username: 'newuser', email: 'new@example.com', password: 'Test1234!' });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.user).toBeDefined();
      expect(res.body.data.token).toBeDefined();
    });

    it('should reject duplicate email', async () => {
      createTestUser({ email: 'dup@example.com', username: 'dupuser' });

      const res = await request(app)
        .post('/api/auth/register')
        .send({ username: 'another', email: 'dup@example.com', password: 'Test1234!' });

      expect(res.status).toBe(409);
    });

    it('should reject missing fields', async () => {
      const res = await request(app)
        .post('/api/auth/register')
        .send({ email: 'test@test.com' });

      expect(res.status).toBe(400);
    });
  });

  describe('POST /api/auth/login', () => {
    it('should login with valid credentials', async () => {
      const user = createTestUser({ email: 'login@example.com', username: 'loginuser', password: 'Pass1234!' });

      const res = await request(app)
        .post('/api/auth/login')
        .send({ email: 'login@example.com', password: 'Pass1234!' });

      expect(res.status).toBe(200);
      expect(res.body.data.token).toBeDefined();
    });

    it('should reject wrong password', async () => {
      createTestUser({ email: 'wrong@example.com', username: 'wronguser', password: 'Correct1!' });

      const res = await request(app)
        .post('/api/auth/login')
        .send({ email: 'wrong@example.com', password: 'Wrong1234!' });

      expect(res.status).toBe(401);
    });

    it('should reject non-existent user', async () => {
      const res = await request(app)
        .post('/api/auth/login')
        .send({ email: 'nobody@example.com', password: 'Test1234!' });

      expect(res.status).toBe(401);
    });
  });

  describe('GET /api/auth/me', () => {
    it('should return user info with valid token', async () => {
      const user = createTestUser({ email: 'me@example.com', username: 'meuser' });
      const token = generateToken(user);

      const res = await request(app)
        .get('/api/auth/me')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.data.email).toBe('me@example.com');
    });

    it('should reject without token', async () => {
      const res = await request(app).get('/api/auth/me');
      expect(res.status).toBe(401);
    });

    it('should reject invalid token', async () => {
      const res = await request(app)
        .get('/api/auth/me')
        .set('Authorization', 'Bearer invalid-token');

      expect(res.status).toBe(401);
    });
  });

  describe('PUT /api/auth/password', () => {
    it('should update password', async () => {
      const user = createTestUser({ email: 'pw@example.com', username: 'pwuser', password: 'OldPass1!' });
      const token = generateToken(user);

      const res = await request(app)
        .put('/api/auth/password')
        .set('Authorization', `Bearer ${token}`)
        .send({ currentPassword: 'OldPass1!', newPassword: 'NewPass1!' });

      expect(res.status).toBe(200);

      // 验证新密码能登录
      const loginRes = await request(app)
        .post('/api/auth/login')
        .send({ email: 'pw@example.com', password: 'NewPass1!' });
      expect(loginRes.status).toBe(200);
    });
  });
});
