import { Request, Response, NextFunction } from 'express';
import { Admin } from '../models/Admin';

// Étendre le type Request pour inclure les sessions
declare module 'express-session' {
  interface SessionData {
    adminId?: string;
    username?: string;
    role?: string;
  }
}

// Middleware pour vérifier si l'admin est authentifié
export const requireAuth = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    if (!req.session.adminId) {
      res.status(401).json({ error: 'Non authentifié' });
      return;
    }

    // Vérifier que l'admin existe toujours et est actif
    const admin = await Admin.findById(req.session.adminId);
    if (!admin || !admin.isActive) {
      req.session.destroy(() => {});
      res.status(401).json({ error: 'Session invalide' });
      return;
    }

    next();
  } catch (error) {
    res.status(500).json({ error: 'Erreur serveur' });
  }
};

// Middleware pour vérifier le rôle super_admin
export const requireSuperAdmin = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    if (!req.session.adminId) {
      res.status(401).json({ error: 'Non authentifié' });
      return;
    }

    const admin = await Admin.findById(req.session.adminId);
    if (!admin || !admin.isActive) {
      req.session.destroy(() => {});
      res.status(401).json({ error: 'Session invalide' });
      return;
    }

    if (admin.role !== 'super_admin') {
      res.status(403).json({ error: 'Accès refusé - Super admin requis' });
      return;
    }

    next();
  } catch (error) {
    res.status(500).json({ error: 'Erreur serveur' });
  }
};

// Middleware pour les pages web (redirige vers login)
export const requireAuthWeb = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    if (!req.session.adminId) {
      res.redirect('/admin/login');
      return;
    }

    // Vérifier que l'admin existe toujours et est actif
    const admin = await Admin.findById(req.session.adminId);
    if (!admin || !admin.isActive) {
      req.session.destroy(() => {});
      res.redirect('/admin/login');
      return;
    }

    next();
  } catch (error) {
    res.status(500).send('Erreur serveur');
  }
};
