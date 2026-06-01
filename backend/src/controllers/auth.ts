import { Response } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { AuthRequest } from '../middleware/auth';
import { createError } from '../middleware/errorHandler';
import { UserModel } from '../models/user';

function generateToken(payload: { id: number; email: string; username: string }) {
  return jwt.sign(payload, process.env.JWT_SECRET!, {
    expiresIn: (process.env.JWT_EXPIRES_IN || '7d') as any,
    issuer: 'story-video',
    audience: 'story-video',
  });
}

export const AuthController = {
  async register(req: AuthRequest, res: Response) {
    const { username, email, password } = req.body;
    if (!username || !email || !password) throw createError('Username, email and password are required', 400);
    if (UserModel.existsByEmailOrUsername(email, username)) throw createError('User already exists', 409);

    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);
    const user = UserModel.create({ username, email, password: hashedPassword });
    const token = generateToken({ id: user.id as number, email, username });

    res.status(201).json({ success: true, data: { user, token } });
  },

  async login(req: AuthRequest, res: Response) {
    const { email, password } = req.body;
    if (!email || !password) throw createError('Email and password are required', 400);

    const user = UserModel.findByEmail(email) as any;
    if (!user) throw createError('Invalid credentials', 401);

    const isValid = await bcrypt.compare(password, user.password);
    if (!isValid) throw createError('Invalid credentials', 401);

    const token = generateToken({ id: user.id, email: user.email, username: user.username });
    res.json({ success: true, data: { user: { id: user.id, username: user.username, email: user.email, avatar: user.avatar }, token } });
  },

  getMe(req: AuthRequest, res: Response) {
    const user = UserModel.findById(req.user!.id);
    if (!user) throw createError('User not found', 404);
    res.json({ success: true, data: user });
  },

  updateProfile(req: AuthRequest, res: Response) {
    const { username, email, avatar } = req.body;
    const userId = req.user!.id;
    if (!username && !email && !avatar) throw createError('No fields to update', 400);
    if ((username || email) && UserModel.existsByEmailOrUsernameExcluding(email || '', username || '', userId)) {
      throw createError('Username or email already in use', 409);
    }
    UserModel.updateProfile(userId, { username, email, avatar });
    res.json({ success: true, data: UserModel.findById(userId) });
  },

  async updatePassword(req: AuthRequest, res: Response) {
    const { currentPassword, newPassword } = req.body;
    if (!currentPassword || !newPassword) throw createError('Current password and new password are required', 400);

    const user = UserModel.findByIdWithPassword(req.user!.id) as any;
    if (!user) throw createError('User not found', 404);

    const isValid = await bcrypt.compare(currentPassword, user.password);
    if (!isValid) throw createError('Current password is incorrect', 401);

    const salt = await bcrypt.genSalt(10);
    UserModel.updatePassword(req.user!.id, await bcrypt.hash(newPassword, salt));
    res.json({ success: true, message: 'Password updated successfully' });
  },
};
