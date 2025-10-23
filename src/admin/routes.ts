import { Router, Request, Response } from 'express';
import { Admin } from '../models/Admin';
import { User } from '../models/User';
import { Subscription } from '../models/Subscription';
import { Payment } from '../models/Payment';
import { requireAuth, requireAuthWeb } from '../middleware/auth';
import { logger } from '../index';

const router: Router = Router();

// ==================== Pages HTML ====================

// Page de login
router.get('/login', (req: Request, res: Response) => {
  if (req.session.adminId) {
    res.redirect('/admin/dashboard');
    return;
  }

  res.send(`
    <!DOCTYPE html>
    <html lang="fr">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Admin - Connexion</title>
      <style>
        * {
          margin: 0;
          padding: 0;
          box-sizing: border-box;
        }
        body {
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
          background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
          min-height: 100vh;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 20px;
        }
        .login-container {
          background: white;
          border-radius: 10px;
          box-shadow: 0 10px 25px rgba(0,0,0,0.2);
          padding: 40px;
          width: 100%;
          max-width: 400px;
        }
        h1 {
          color: #333;
          margin-bottom: 10px;
          text-align: center;
        }
        .subtitle {
          color: #666;
          text-align: center;
          margin-bottom: 30px;
          font-size: 14px;
        }
        .form-group {
          margin-bottom: 20px;
        }
        label {
          display: block;
          margin-bottom: 5px;
          color: #333;
          font-weight: 500;
          font-size: 14px;
        }
        input {
          width: 100%;
          padding: 12px;
          border: 1px solid #ddd;
          border-radius: 5px;
          font-size: 14px;
          transition: border-color 0.3s;
        }
        input:focus {
          outline: none;
          border-color: #667eea;
        }
        button {
          width: 100%;
          padding: 12px;
          background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
          color: white;
          border: none;
          border-radius: 5px;
          font-size: 16px;
          font-weight: 600;
          cursor: pointer;
          transition: transform 0.2s;
        }
        button:hover {
          transform: translateY(-2px);
        }
        button:active {
          transform: translateY(0);
        }
        .error {
          background: #fee;
          color: #c33;
          padding: 10px;
          border-radius: 5px;
          margin-bottom: 20px;
          font-size: 14px;
          display: none;
        }
        .error.show {
          display: block;
        }
      </style>
    </head>
    <body>
      <div class="login-container">
        <h1>🔐 Administration</h1>
        <p class="subtitle">Connectez-vous pour accéder au panneau d'administration</p>

        <div id="error" class="error"></div>

        <form id="loginForm">
          <div class="form-group">
            <label for="username">Nom d'utilisateur</label>
            <input type="text" id="username" name="username" required autocomplete="username">
          </div>

          <div class="form-group">
            <label for="password">Mot de passe</label>
            <input type="password" id="password" name="password" required autocomplete="current-password">
          </div>

          <button type="submit">Se connecter</button>
        </form>
      </div>

      <script>
        document.getElementById('loginForm').addEventListener('submit', async (e) => {
          e.preventDefault();

          const username = document.getElementById('username').value;
          const password = document.getElementById('password').value;
          const errorDiv = document.getElementById('error');

          try {
            const response = await fetch('/admin/api/login', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ username, password })
            });

            const data = await response.json();

            if (response.ok) {
              window.location.href = '/admin/dashboard';
            } else {
              errorDiv.textContent = data.error || 'Erreur de connexion';
              errorDiv.classList.add('show');
            }
          } catch (error) {
            errorDiv.textContent = 'Erreur de connexion au serveur';
            errorDiv.classList.add('show');
          }
        });
      </script>
    </body>
    </html>
  `);
});

// Redirection vers simple-routes pour le dashboard
router.get('/dashboard', requireAuthWeb, (_req: Request, res: Response) => {
  res.redirect('/admin/simple/dashboard');
});

// ==================== API Routes ====================

// Login
router.post('/api/login', async (req: Request, res: Response) => {
  try {
    const { username, password } = req.body;

    if (!username || !password) {
      res.status(400).json({ error: 'Nom d\'utilisateur et mot de passe requis' });
      return;
    }

    const admin = await Admin.findOne({ username });
    if (!admin || !admin.isActive) {
      res.status(401).json({ error: 'Identifiants invalides' });
      return;
    }

    const isMatch = await admin.comparePassword(password);
    if (!isMatch) {
      res.status(401).json({ error: 'Identifiants invalides' });
      return;
    }

    // Mettre à jour la date de dernière connexion
    admin.lastLogin = new Date();
    await admin.save();

    // Créer la session
    req.session.adminId = (admin._id as any).toString();
    req.session.username = admin.username;
    req.session.role = admin.role;

    logger.info(`Admin ${username} logged in`);

    res.json({
      success: true,
      admin: {
        username: admin.username,
        role: admin.role,
        email: admin.email,
      },
    });
  } catch (error) {
    logger.error({ error }, 'Login error');
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// Logout
router.post('/api/logout', requireAuth, (req: Request, res: Response) => {
  const username = req.session.username;
  req.session.destroy((err) => {
    if (err) {
      logger.error({ error: err }, 'Logout error');
      res.status(500).json({ error: 'Erreur lors de la déconnexion' });
      return;
    }
    logger.info(`Admin ${username} logged out`);
    res.json({ success: true });
  });
});

// Stats
router.get('/api/stats', requireAuth, async (_req: Request, res: Response) => {
  try {
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

    const [totalUsers, vipUsers, activeSubscriptions, completedPayments, monthlyIncomeResult, totalIncomeResult] = await Promise.all([
      User.countDocuments(),
      User.countDocuments({ isVip: true }),
      Subscription.countDocuments({ status: 'active' }),
      Payment.countDocuments({ status: 'completed' }),
      Payment.aggregate([
        {
          $match: {
            status: 'completed',
            createdAt: { $gte: startOfMonth },
          },
        },
        {
          $group: {
            _id: null,
            total: { $sum: '$amount' },
          },
        },
      ]),
      Payment.aggregate([
        {
          $match: {
            status: 'completed',
          },
        },
        {
          $group: {
            _id: null,
            total: { $sum: '$amount' },
          },
        },
      ]),
    ]);

    const monthlyIncome = monthlyIncomeResult[0]?.total || 0;
    const totalIncome = totalIncomeResult[0]?.total || 0;

    res.json({
      totalUsers,
      vipUsers,
      activeSubscriptions,
      completedPayments,
      monthlyIncome,
      totalIncome,
    });
  } catch (error) {
    logger.error({ error }, 'Stats error');
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// Liste des utilisateurs
router.get('/api/users', requireAuth, async (req: Request, res: Response) => {
  try {
    const { search = '', vipFilter = 'all', limit = 100, skip = 0 } = req.query;

    const query: any = {};

    // Filtre de recherche
    if (search) {
      const searchRegex = new RegExp(search as string, 'i');
      query.$or = [
        { username: searchRegex },
        { firstName: searchRegex },
        { lastName: searchRegex },
        { telegramId: isNaN(Number(search)) ? undefined : Number(search) },
      ].filter((q) => q.telegramId !== undefined || q.username || q.firstName || q.lastName);
    }

    // Filtre VIP
    if (vipFilter === 'vip') {
      query.isVip = true;
    } else if (vipFilter === 'non-vip') {
      query.isVip = false;
    }

    const users = await User.find(query)
      .sort({ createdAt: -1 })
      .limit(Number(limit))
      .skip(Number(skip))
      .lean();

    res.json(users);
  } catch (error) {
    logger.error({ error }, 'Users list error');
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// Détails d'un utilisateur
router.get('/api/users/:id', requireAuth, async (req: Request, res: Response) => {
  try {
    const user = await User.findById(req.params.id).lean();
    if (!user) {
      res.status(404).json({ error: 'Utilisateur non trouvé' });
      return;
    }

    const [subscriptions, payments] = await Promise.all([
      Subscription.find({ userId: user._id }).sort({ createdAt: -1 }).lean(),
      Payment.find({ userId: user._id }).sort({ createdAt: -1 }).lean(),
    ]);

    res.json({
      user,
      subscriptions,
      payments,
    });
  } catch (error) {
    logger.error({ error }, 'User details error');
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// Modifier un utilisateur
router.put('/api/users/:id', requireAuth, async (req: Request, res: Response) => {
  try {
    const { isVip, vipUntil } = req.body;

    const user = await User.findById(req.params.id);
    if (!user) {
      res.status(404).json({ error: 'Utilisateur non trouvé' });
      return;
    }

    user.isVip = isVip;
    user.vipUntil = vipUntil ? new Date(vipUntil) : undefined;

    await user.save();

    logger.info(`User ${req.params.id} updated by admin ${req.session.username}`);

    res.json({ success: true, user });
  } catch (error) {
    logger.error({ error }, 'User update error');
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// Supprimer un utilisateur
router.delete('/api/users/:id', requireAuth, async (req: Request, res: Response) => {
  try {
    const user = await User.findById(req.params.id);
    if (!user) {
      res.status(404).json({ error: 'Utilisateur non trouvé' });
      return;
    }

    // Supprimer aussi les abonnements et paiements liés
    await Promise.all([
      Subscription.deleteMany({ userId: user._id }),
      Payment.deleteMany({ userId: user._id }),
      User.findByIdAndDelete(req.params.id),
    ]);

    logger.info(`User ${req.params.id} deleted by admin ${req.session.username}`);

    res.json({ success: true });
  } catch (error) {
    logger.error({ error }, 'User deletion error');
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// Liste des abonnements
router.get('/api/subscriptions', requireAuth, async (req: Request, res: Response) => {
  try {
    const { limit = 50, skip = 0, status } = req.query;

    const query: any = {};
    if (status) {
      query.status = status;
    }

    const subscriptions = await Subscription.find(query)
      .sort({ createdAt: -1 })
      .limit(Number(limit))
      .skip(Number(skip))
      .lean();

    res.json(subscriptions);
  } catch (error) {
    logger.error({ error }, 'Subscriptions list error');
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// Liste des paiements
router.get('/api/payments', requireAuth, async (req: Request, res: Response) => {
  try {
    const { limit = 50, skip = 0, status } = req.query;

    const query: any = {};
    if (status) {
      query.status = status;
    }

    const payments = await Payment.find(query)
      .populate('userId', 'firstName lastName username')
      .sort({ createdAt: -1 })
      .limit(Number(limit))
      .skip(Number(skip))
      .lean();

    res.json(payments);
  } catch (error) {
    logger.error({ error }, 'Payments list error');
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// Détails d'un abonnement
router.get('/api/subscriptions/:id', requireAuth, async (req: Request, res: Response) => {
  try {
    const subscription = await Subscription.findById(req.params.id).lean();
    if (!subscription) {
      res.status(404).json({ error: 'Abonnement non trouvé' });
      return;
    }

    res.json(subscription);
  } catch (error) {
    logger.error({ error }, 'Subscription details error');
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// Modifier un abonnement
router.put('/api/subscriptions/:id', requireAuth, async (req: Request, res: Response) => {
  try {
    const { startDate, endDate, status } = req.body;

    if (!startDate || !endDate || !status) {
      res.status(400).json({ error: 'Données manquantes' });
      return;
    }

    const subscription = await Subscription.findById(req.params.id);
    if (!subscription) {
      res.status(404).json({ error: 'Abonnement non trouvé' });
      return;
    }

    subscription.startDate = new Date(startDate);
    subscription.endDate = new Date(endDate);
    subscription.status = status;

    await subscription.save();

    // Mettre à jour le statut VIP de l'utilisateur si nécessaire
    if (status === 'active') {
      await User.findOneAndUpdate(
        { telegramId: subscription.telegramId },
        {
          isVip: true,
          vipUntil: new Date(endDate),
        }
      );
    } else if (status === 'expired' || status === 'cancelled') {
      await User.findOneAndUpdate(
        { telegramId: subscription.telegramId },
        {
          isVip: false,
        }
      );
    }

    logger.info(`Subscription ${req.params.id} updated by admin ${req.session.username}`);

    res.json({ success: true, subscription });
  } catch (error) {
    logger.error({ error }, 'Subscription update error');
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// Supprimer un abonnement
router.delete('/api/subscriptions/:id', requireAuth, async (req: Request, res: Response) => {
  try {
    const subscription = await Subscription.findById(req.params.id);
    if (!subscription) {
      res.status(404).json({ error: 'Abonnement non trouvé' });
      return;
    }

    await Subscription.findByIdAndDelete(req.params.id);

    logger.info(`Subscription ${req.params.id} deleted by admin ${req.session.username}`);

    res.json({ success: true });
  } catch (error) {
    logger.error({ error }, 'Subscription deletion error');
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// Supprimer un paiement
router.delete('/api/payments/:id', requireAuth, async (req: Request, res: Response) => {
  try {
    const payment = await Payment.findById(req.params.id);
    if (!payment) {
      res.status(404).json({ error: 'Paiement non trouvé' });
      return;
    }

    await Payment.findByIdAndDelete(req.params.id);

    logger.info(`Payment ${req.params.id} deleted by admin ${req.session.username}`);

    res.json({ success: true });
  } catch (error) {
    logger.error({ error }, 'Payment deletion error');
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

export default router;
