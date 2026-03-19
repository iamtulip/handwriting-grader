import { Request, Response, NextFunction } from 'express';
import { getServiceSupabase } from '../lib/supabase';
import { User } from '@supabase/supabase-js';

export interface AuthRequest extends Request {
  user?: User;
}

// ฟังก์ชันที่ 1 สำหรับนักศึกษา
export const requireAuth = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) return res.status(401).json({ error: 'Unauthorized' });
    const token = authHeader.split(' ')[1];
    const { data: { user }, error } = await getServiceSupabase().auth.getUser(token);
    if (error || !user) return res.status(401).json({ error: 'Unauthorized' });
    req.user = user;
    next();
  } catch (err) {
    return res.status(500).json({ error: 'Internal server error' });
  }
};

// ฟังก์ชันที่ 2 สำหรับอาจารย์
export const requireReviewer = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) return res.status(401).json({ error: 'Unauthorized' });
    const token = authHeader.split(' ')[1];
    const supa = getServiceSupabase();
    const { data: { user }, error } = await supa.auth.getUser(token);
    if (error || !user) return res.status(401).json({ error: 'Unauthorized' });

    const { data: profile } = await supa.from('profiles').select('role').eq('id', user.id).single();
    if (!profile || !['reviewer', 'admin', 'instructor'].includes(profile.role)) {
      return res.status(403).json({ error: 'Forbidden' });
    }
    req.user = user;
    next();
  } catch (err) {
    return res.status(500).json({ error: 'Internal server error' });
  }
};