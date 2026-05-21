import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import { getDatabase } from '../database/setup';

const JWT_SECRET = process.env.JWT_SECRET || 'test-secret-key-that-is-long-enough-32ch';

export function getTestDb() {
  return getDatabase();
}

export function createTestUser(overrides?: { email?: string; username?: string; password?: string }) {
  const db = getDatabase();
  const email = overrides?.email || `test-${Date.now()}@example.com`;
  const username = overrides?.username || `user-${Date.now()}`;
  const password = overrides?.password || 'Test1234!';

  const salt = bcrypt.genSaltSync(10);
  const hashedPassword = bcrypt.hashSync(password, salt);

  const result = db.prepare(
    'INSERT INTO users (username, email, password) VALUES (?, ?, ?)'
  ).run(username, email, hashedPassword);

  return {
    id: result.lastInsertRowid as number,
    email,
    username,
    password, // plain text for login tests
  };
}

export function generateToken(user: { id: number; email: string; username: string }) {
  return jwt.sign(user, JWT_SECRET, {
    expiresIn: '1h',
    issuer: 'story-video',
    audience: 'story-video',
  });
}

export function createTestProject(userId: number, overrides?: { title?: string }) {
  const db = getDatabase();
  const title = overrides?.title || `Project-${Date.now()}`;
  const result = db.prepare(
    'INSERT INTO projects (user_id, title, description) VALUES (?, ?, ?)'
  ).run(userId, title, 'Test description');
  return { id: result.lastInsertRowid as number, title };
}

export function createTestChapter(projectId: number) {
  const db = getDatabase();
  const result = db.prepare(
    'INSERT INTO chapters (project_id, title, order_index) VALUES (?, ?, ?)'
  ).run(projectId, `Chapter-${Date.now()}`, 0);
  return { id: result.lastInsertRowid as number };
}

export function createTestScene(chapterId: number) {
  const db = getDatabase();
  const result = db.prepare(
    'INSERT INTO scenes (chapter_id, title, order_index) VALUES (?, ?, ?)'
  ).run(chapterId, `Scene-${Date.now()}`, 0);
  return { id: result.lastInsertRowid as number };
}

export function createTestCharacter(projectId: number) {
  const db = getDatabase();
  const result = db.prepare(
    'INSERT INTO characters (project_id, name, description, style) VALUES (?, ?, ?, ?)'
  ).run(projectId, `Char-${Date.now()}`, 'Test character', 'anime');
  return { id: result.lastInsertRowid as number };
}

export function createTestStoryboard(sceneId: number) {
  const db = getDatabase();
  const result = db.prepare(
    'INSERT INTO storyboards (scene_id, title, description, duration, camera_angle, order_index) VALUES (?, ?, ?, ?, ?, ?)'
  ).run(sceneId, `SB-${Date.now()}`, 'Test', 5, 'medium', 0);
  return { id: result.lastInsertRowid as number };
}
