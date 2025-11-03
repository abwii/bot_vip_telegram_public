import { Router, Request, Response } from 'express';
import { Admin } from '../models/Admin';
import { User } from '../models/User';
import { Subscription } from '../models/Subscription';
import { Payment } from '../models/Payment';
import { PricingConfig } from '../models/PricingConfig';
import { PaymentProvider } from '../models/PaymentProvider';
import { requireAuth, requireAuthWeb, requireSuperAdmin } from '../middleware/auth';
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
        .hint {
          text-align: center;
          margin-top: 15px;
          font-size: 12px;
          color: #666;
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
          <div class="hint">Utilisez la commande 'pnpm run create-admin' pour créer un compte admin</div>
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

// Page du dashboard
router.get('/dashboard', requireAuthWeb, (req: Request, res: Response) => {
  res.send(`
    <!DOCTYPE html>
    <html lang="fr">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Admin - Dashboard</title>
      <script src="https://cdn.jsdelivr.net/npm/chart.js@4.4.0/dist/chart.umd.min.js"></script>
        <style>
        :root {
          --bg-primary: #f5f5f5;
          --bg-secondary: #ffffff;
          --text-primary: #333;
          --text-secondary: #666;
          --text-tertiary: #999;
          --border-color: #e9ecef;
          --shadow: rgba(0,0,0,0.05);
          --shadow-medium: rgba(0,0,0,0.1);
          --shadow-heavy: rgba(0,0,0,0.2);
          --header-bg: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
          --hover-bg: #f8f9fa;
        }

        body.dark-mode {
          --bg-primary: #1a1a1a;
          --bg-secondary: #2d2d2d;
          --text-primary: #e0e0e0;
          --text-secondary: #b0b0b0;
          --text-tertiary: #808080;
          --border-color: #404040;
          --shadow: rgba(0,0,0,0.3);
          --shadow-medium: rgba(0,0,0,0.4);
          --shadow-heavy: rgba(0,0,0,0.5);
          --header-bg: linear-gradient(135deg, #4a5fc1 0%, #5c3a7a 100%);
          --hover-bg: #3a3a3a;
        }

        /* Reset et Base */
        * {
          margin: 0;
          padding: 0;
          box-sizing: border-box;
        }

        body {
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
          background: var(--bg-primary);
          color: var(--text-primary);
          transition: background-color 0.3s ease, color 0.3s ease;
        }

        /* Header */
        .header {
          background: var(--header-bg);
          color: white;
          padding: 20px 40px;
          display: flex;
          justify-content: space-between;
          align-items: center;
          box-shadow: 0 2px 10px var(--shadow-medium);
          transition: background 0.3s ease;
        }

        .header h1 {
          font-size: 24px;
          font-weight: 600;
        }

        .header-right {
          display: flex;
          gap: 20px;
          align-items: center;
        }

        .username {
          font-weight: 500;
          font-size: 14px;
        }

        .logout-btn,
        .dark-mode-btn {
          background: rgba(255,255,255,0.2);
          color: white;
          border: none;
          padding: 8px 16px;
          border-radius: 5px;
          cursor: pointer;
          font-size: 14px;
          font-weight: 500;
          transition: background 0.3s ease, transform 0.2s ease;
          display: flex;
          align-items: center;
          gap: 8px;
        }

        .logout-btn:hover,
        .dark-mode-btn:hover {
          background: rgba(255,255,255,0.3);
          transform: translateY(-1px);
        }

        .logout-btn:active,
        .dark-mode-btn:active {
          transform: translateY(0);
        }

        .dark-mode-btn::before {
          content: '🌙';
          font-size: 16px;
        }

        body.dark-mode .dark-mode-btn::before {
          content: '☀️';
        }

        /* Container */
        .container {
          max-width: 1400px;
          margin: 0 auto;
          padding: 40px 20px;
        }

        /* Tabs Navigation */
        .tabs {
          display: flex;
          gap: 10px;
          margin-bottom: 30px;
          border-bottom: 2px solid var(--border-color);
          transition: border-color 0.3s ease;
        }

        .tab {
          padding: 12px 24px;
          background: transparent;
          border: none;
          border-bottom: 3px solid transparent;
          cursor: pointer;
          font-size: 16px;
          font-weight: 600;
          color: var(--text-secondary);
          transition: all 0.3s ease;
        }

        .tab:hover {
          color: #667eea;
        }

        .tab.active {
          color: #667eea;
          border-bottom-color: #667eea;
        }

        .tab-content {
          display: none;
          animation: fadeIn 0.3s ease;
        }

        .tab-content.active {
          display: block;
        }

        @keyframes fadeIn {
          from {
            opacity: 0;
            transform: translateY(10px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }

        /* Stats Grid */
        .stats {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
          gap: 20px;
          margin-bottom: 40px;
        }

        .stat-card {
          background: var(--bg-secondary);
          padding: 25px;
          border-radius: 10px;
          box-shadow: 0 2px 10px var(--shadow);
          transition: all 0.3s ease;
        }

        .stat-card:hover {
          transform: translateY(-5px);
          box-shadow: 0 4px 20px var(--shadow-medium);
        }

        .stat-card .icon {
          font-size: 24px;
          margin-bottom: 10px;
        }

        .stat-card h3 {
          color: var(--text-secondary);
          font-size: 14px;
          font-weight: 500;
          margin-bottom: 10px;
          text-transform: uppercase;
          letter-spacing: 0.5px;
        }

        .stat-card .value {
          color: var(--text-primary);
          font-size: 32px;
          font-weight: 700;
          transition: color 0.3s ease;
        }

        /* Section */
        .section {
          background: var(--bg-secondary);
          border-radius: 10px;
          padding: 30px;
          margin-bottom: 20px;
          box-shadow: 0 2px 10px var(--shadow);
          transition: all 0.3s ease;
        }

        .section h2 {
          margin-bottom: 20px;
          color: var(--text-primary);
          font-size: 20px;
          font-weight: 600;
          transition: color 0.3s ease;
        }

        /* Filters */
        .filters {
          display: flex;
          gap: 15px;
          margin-bottom: 20px;
          flex-wrap: wrap;
        }

        .filters input,
        .filters select {
          padding: 10px 15px;
          border: 1px solid var(--border-color);
          border-radius: 5px;
          font-size: 14px;
          background: var(--bg-secondary);
          color: var(--text-primary);
          transition: all 0.3s ease;
        }

        .filters input:focus,
        .filters select:focus {
          outline: none;
          border-color: #667eea;
          box-shadow: 0 0 0 3px rgba(102, 126, 234, 0.1);
        }

        .filters button {
          padding: 10px 20px;
          background: #667eea;
          color: white;
          border: none;
          border-radius: 5px;
          cursor: pointer;
          font-size: 14px;
          font-weight: 600;
          transition: all 0.3s ease;
        }

        .filters button:hover {
          background: #5568d3;
          transform: translateY(-2px);
          box-shadow: 0 4px 12px rgba(102, 126, 234, 0.3);
        }

        .filters button:active {
          transform: translateY(0);
        }

        /* Tables */
        table {
          width: 100%;
          border-collapse: collapse;
          background: var(--bg-secondary);
          transition: background-color 0.3s ease;
        }

        th {
          background: var(--bg-primary);
          padding: 12px 15px;
          text-align: left;
          font-weight: 600;
          color: var(--text-primary);
          border-bottom: 2px solid var(--border-color);
          font-size: 14px;
          text-transform: uppercase;
          letter-spacing: 0.5px;
          transition: all 0.3s ease;
        }

        td {
          padding: 12px 15px;
          border-bottom: 1px solid var(--border-color);
          color: var(--text-primary);
          font-size: 14px;
          transition: all 0.3s ease;
        }

        tr:hover {
          background: var(--hover-bg);
        }

        tr:last-child td {
          border-bottom: none;
        }

        /* Badges */
        .badge {
          display: inline-block;
          padding: 4px 12px;
          border-radius: 12px;
          font-size: 12px;
          font-weight: 600;
          transition: all 0.3s ease;
        }

        .badge-success {
          background: #d4edda;
          color: #155724;
        }

        .badge-danger {
          background: #f8d7da;
          color: #721c24;
        }

        .badge-warning {
          background: #fff3cd;
          color: #856404;
        }

        .badge-info {
          background: #d1ecf1;
          color: #0c5460;
        }

        body.dark-mode .badge-success {
          background: #1e4620;
          color: #4ade80;
        }

        body.dark-mode .badge-danger {
          background: #4a1515;
          color: #f87171;
        }

        body.dark-mode .badge-warning {
          background: #4a3a15;
          color: #fbbf24;
        }

        body.dark-mode .badge-info {
          background: #15324a;
          color: #60a5fa;
        }

        /* Loading & Empty States */
        .loading,
        .empty {
          text-align: center;
          padding: 40px;
          color: var(--text-tertiary);
          font-size: 14px;
          transition: color 0.3s ease;
        }

        .loading::before {
          content: '⏳';
          font-size: 24px;
          display: block;
          margin-bottom: 10px;
        }

        .empty::before {
          content: '📭';
          font-size: 24px;
          display: block;
          margin-bottom: 10px;
        }

        /* Action Buttons */
        .action-btn {
          background: transparent;
          border: 1px solid #667eea;
          color: #667eea;
          padding: 4px 12px;
          border-radius: 4px;
          cursor: pointer;
          font-size: 12px;
          font-weight: 600;
          margin-right: 5px;
          transition: all 0.3s ease;
        }

        .action-btn:hover {
          background: #667eea;
          color: white;
          transform: translateY(-2px);
          box-shadow: 0 2px 8px rgba(102, 126, 234, 0.3);
        }

        .action-btn:active {
          transform: translateY(0);
        }

        .action-btn-danger {
          border-color: #dc3545;
          color: #dc3545;
        }

        .action-btn-danger:hover {
          background: #dc3545;
          color: white;
          box-shadow: 0 2px 8px rgba(220, 53, 69, 0.3);
        }

        body.dark-mode .action-btn {
          border-color: #667eea;
          color: #667eea;
        }

        body.dark-mode .action-btn:hover {
          background: #667eea;
          color: white;
        }

        body.dark-mode .action-btn-danger {
          border-color: #dc3545;
          color: #dc3545;
        }

        body.dark-mode .action-btn-danger:hover {
          background: #dc3545;
          color: white;
        }

        /* Modal */
        .modal {
          display: none;
          position: fixed;
          z-index: 1000;
          left: 0;
          top: 0;
          width: 100%;
          height: 100%;
          background: rgba(0,0,0,0.5);
          align-items: center;
          justify-content: center;
          transition: background 0.3s ease;
        }

        body.dark-mode .modal {
          background: rgba(0,0,0,0.85);
        }

        .modal.show {
          display: flex;
          animation: fadeIn 0.3s ease;
        }

        .modal-content {
          background: var(--bg-secondary);
          border-radius: 10px;
          padding: 30px;
          max-width: 500px;
          width: 90%;
          box-shadow: 0 10px 40px var(--shadow-heavy);
          transition: all 0.3s ease;
          animation: slideUp 0.3s ease;
        }

        @keyframes slideUp {
          from {
            opacity: 0;
            transform: translateY(30px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }

        .modal-header {
          margin-bottom: 20px;
        }

        .modal-header h3 {
          margin: 0;
          color: var(--text-primary);
          font-size: 20px;
          font-weight: 600;
          transition: color 0.3s ease;
        }

        .modal-body {
          margin-bottom: 20px;
        }

        .modal-body .form-group {
          margin-bottom: 15px;
        }

        .modal-body label {
          display: block;
          margin-bottom: 5px;
          font-weight: 600;
          color: var(--text-primary);
          font-size: 14px;
          transition: color 0.3s ease;
        }

        .modal-body input,
        .modal-body select {
          width: 100%;
          padding: 10px 15px;
          border: 1px solid var(--border-color);
          border-radius: 5px;
          font-size: 14px;
          background: var(--bg-secondary);
          color: var(--text-primary);
          transition: all 0.3s ease;
        }

        .modal-body input:focus,
        .modal-body select:focus {
          outline: none;
          border-color: #667eea;
          box-shadow: 0 0 0 3px rgba(102, 126, 234, 0.1);
        }

        .modal-footer {
          display: flex;
          gap: 10px;
          justify-content: flex-end;
        }

        .modal-footer button {
          padding: 10px 20px;
          border: none;
          border-radius: 5px;
          cursor: pointer;
          font-size: 14px;
          font-weight: 600;
          transition: all 0.3s ease;
        }

        .btn-primary {
          background: #667eea;
          color: white;
        }

        .btn-primary:hover {
          background: #5568d3;
          transform: translateY(-2px);
          box-shadow: 0 4px 12px rgba(102, 126, 234, 0.3);
        }

        .btn-primary:active {
          transform: translateY(0);
        }

        .btn-secondary {
          background: #6c757d;
          color: white;
        }

        .btn-secondary:hover {
          background: #5a6268;
          transform: translateY(-2px);
        }

        .btn-secondary:active {
          transform: translateY(0);
        }

        .btn-danger {
          background: #dc3545;
          color: white;
        }

        .btn-danger:hover {
          background: #c82333;
          transform: translateY(-2px);
          box-shadow: 0 4px 12px rgba(220, 53, 69, 0.3);
        }

        .btn-danger:active {
          transform: translateY(0);
        }

        /* Charts */
        .charts-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(500px, 1fr));
          gap: 30px;
          margin-bottom: 40px;
        }

        .chart-card {
          background: var(--bg-secondary);
          padding: 25px;
          border-radius: 10px;
          box-shadow: 0 2px 10px var(--shadow);
          transition: all 0.3s ease;
        }

        .chart-card:hover {
          transform: translateY(-5px);
          box-shadow: 0 4px 20px var(--shadow-medium);
        }

        .chart-card h3 {
          margin-bottom: 20px;
          color: var(--text-primary);
          font-size: 18px;
          font-weight: 600;
          transition: color 0.3s ease;
        }

        .chart-container {
          position: relative;
          height: 300px;
        }

        body.dark-mode canvas {
          filter: brightness(0.95);
        }

        /* Export Section */
        .export-section {
          background: var(--bg-secondary);
          padding: 30px;
          border-radius: 10px;
          box-shadow: 0 2px 10px var(--shadow);
          margin-bottom: 20px;
          transition: all 0.3s ease;
        }

        .export-controls {
          display: flex;
          gap: 15px;
          align-items: center;
          margin-bottom: 20px;
          flex-wrap: wrap;
        }

        .export-controls label {
          font-weight: 600;
          color: var(--text-primary);
          font-size: 14px;
          transition: color 0.3s ease;
        }

        .export-controls select {
          padding: 10px 15px;
          border: 1px solid var(--border-color);
          border-radius: 5px;
          font-size: 14px;
          background: var(--bg-secondary);
          color: var(--text-primary);
          transition: all 0.3s ease;
        }

        .export-controls select:focus {
          outline: none;
          border-color: #667eea;
          box-shadow: 0 0 0 3px rgba(102, 126, 234, 0.1);
        }

        .export-buttons {
          display: flex;
          gap: 10px;
          flex-wrap: wrap;
        }

        .export-btn {
          padding: 12px 24px;
          background: #10b981;
          color: white;
          border: none;
          border-radius: 5px;
          cursor: pointer;
          font-size: 14px;
          font-weight: 600;
          transition: all 0.3s ease;
        }

        .export-btn:hover {
          background: #059669;
          transform: translateY(-2px);
          box-shadow: 0 4px 12px rgba(16, 185, 129, 0.3);
        }

        .export-btn:active {
          transform: translateY(0);
        }

        .export-btn:disabled {
          background: #ccc;
          cursor: not-allowed;
          transform: none;
          box-shadow: none;
        }

        body.dark-mode .export-section ul {
          color: var(--text-secondary);
        }

        body.dark-mode .export-section p {
          color: var(--text-tertiary);
        }

        body.dark-mode .export-section h3 {
          color: var(--text-primary);
        }

        /* Status classes */
        .status-active {
          color: #10b981;
          font-weight: 600;
        }

        .status-expired {
          color: #dc3545;
          font-weight: 600;
        }

        /* Responsive Design */
        @media (max-width: 1024px) {
          .charts-grid {
            grid-template-columns: 1fr;
          }
          
          .header {
            padding: 15px 20px;
          }
          
          .header h1 {
            font-size: 20px;
          }
        }

        @media (max-width: 768px) {
          .stats {
            grid-template-columns: 1fr;
          }
          
          .header-right {
            flex-direction: column;
            gap: 10px;
            align-items: flex-end;
          }
          
          .tabs {
            overflow-x: auto;
            -webkit-overflow-scrolling: touch;
          }
          
          .tab {
            white-space: nowrap;
          }
          
          .filters {
            flex-direction: column;
          }
          
          .filters input,
          .filters select,
          .filters button {
            width: 100%;
          }
          
          .export-controls {
            flex-direction: column;
            align-items: flex-start;
          }
          
          .export-controls select {
            width: 100%;
          }
          
          .export-buttons {
            width: 100%;
          }
          
          .export-btn {
            flex: 1;
          }
          
          table {
            font-size: 12px;
          }
          
          th, td {
            padding: 8px 10px;
          }
          
          .action-btn {
            padding: 3px 8px;
            font-size: 11px;
          }
          
          .modal-content {
            width: 95%;
            padding: 20px;
          }
          
          .container {
            padding: 20px 10px;
          }
        }

        @media (max-width: 480px) {
          .header {
            flex-direction: column;
            gap: 15px;
            text-align: center;
          }
          
          .header-right {
            width: 100%;
            justify-content: center;
            align-items: center;
          }
          
          .stat-card {
            padding: 20px;
          }
          
          .stat-card .value {
            font-size: 28px;
          }
          
          .section {
            padding: 20px;
          }
          
          table {
            display: block;
            overflow-x: auto;
            -webkit-overflow-scrolling: touch;
          }
        }

        /* Animations supplémentaires */
        @keyframes pulse {
          0%, 100% {
            opacity: 1;
          }
          50% {
            opacity: 0.5;
          }
        }

        .loading::before {
          animation: pulse 1.5s ease-in-out infinite;
        }

        /* Scrollbar personnalisée */
        ::-webkit-scrollbar {
          width: 10px;
          height: 10px;
        }

        ::-webkit-scrollbar-track {
          background: var(--bg-primary);
        }

        ::-webkit-scrollbar-thumb {
          background: var(--border-color);
          border-radius: 5px;
        }

        ::-webkit-scrollbar-thumb:hover {
          background: var(--text-tertiary);
        }

        body.dark-mode ::-webkit-scrollbar-thumb {
          background: #404040;
        }

        body.dark-mode ::-webkit-scrollbar-thumb:hover {
          background: #505050;
        }

        /* Print styles */
        @media print {
          .header,
          .filters,
          .action-btn,
          .tabs,
          .export-section,
          .logout-btn,
          .dark-mode-btn {
            display: none !important;
          }
          
          body {
            background: white;
            color: black;
          }
          
          .stat-card,
          .section,
          .chart-card {
            box-shadow: none;
            border: 1px solid #ddd;
          }
        }

        /* Focus visible pour accessibilité */
        button:focus-visible,
        input:focus-visible,
        select:focus-visible {
          outline: 2px solid #667eea;
          outline-offset: 2px;
        }

        /* Hint text */
        .hint {
          text-align: center;
          margin-top: 15px;
          font-size: 12px;
          color: var(--text-tertiary);
          transition: color 0.3s ease;
        }

        /* Info box dans export section */
        .export-section > div:last-child {
          margin-top: 30px;
          padding: 20px;
          background: var(--bg-primary);
          border-radius: 5px;
          transition: background-color 0.3s ease;
        }

        .export-section > div:last-child h3 {
          margin-bottom: 10px;
          color: var(--text-primary);
          font-size: 16px;
        }

        .export-section > div:last-child ul {
          color: var(--text-secondary);
          line-height: 1.8;
          list-style-position: inside;
        }

        .export-section > div:last-child p {
          margin-top: 15px;
          color: var(--text-tertiary);
          font-size: 14px;
        }

        /* Smooth scrolling */
        html {
          scroll-behavior: smooth;
        }

        /* Selection color */
        ::selection {
          background: #667eea;
          color: white;
        }

        ::-moz-selection {
          background: #667eea;
          color: white;
        }

                /* Export Info Box */
        .export-info-box {
          margin-top: 30px;
          padding: 20px;
          background: var(--bg-primary);
          border-radius: 5px;
          border: 1px solid var(--border-color);
          transition: all 0.3s ease;
        }

        .export-info-box h3 {
          margin-bottom: 10px;
          color: var(--text-primary);
          font-size: 16px;
          font-weight: 600;
          transition: color 0.3s ease;
        }

        .export-info-box ul {
          color: var(--text-secondary);
          line-height: 1.8;
          list-style-position: inside;
          margin: 0;
          padding: 0;
          transition: color 0.3s ease;
        }

        .export-info-box ul li {
          margin-bottom: 8px;
        }

        .export-info-box ul li:last-child {
          margin-bottom: 0;
        }

        .export-info-box ul strong {
          color: var(--text-primary);
          font-weight: 600;
        }

        .export-info-note {
          margin-top: 15px;
          margin-bottom: 0;
          color: var(--text-tertiary);
          font-size: 14px;
          font-style: italic;
          transition: color 0.3s ease;
        }

        /* Styles spécifiques dark mode */
        body.dark-mode .export-info-box {
          background: #242424;
          border-color: #404040;
        }

        body.dark-mode .export-info-box h3 {
          color: #e0e0e0;
        }

        body.dark-mode .export-info-box ul {
          color: #b0b0b0;
        }

        body.dark-mode .export-info-box ul strong {
          color: #e0e0e0;
        }

        body.dark-mode .export-info-note {
          color: #808080;
        }
      </style>
    </head>
    <body>
      <div class="header">
        <h1>📊 Panneau d'administration</h1>
        <div class="header-right">
          <span class="username">👤 ${req.session.username || 'Admin'}</span>
          <button class="logout-btn" onclick="logout()">Déconnexion</button>
          <button class="dark-mode-btn" onclick="toggleDarkMode()">Mode Sombre</button>
        </div>
      </div>

      <div class="container">
        <!-- Navigation par onglets -->
        <div class="tabs">
          <button class="tab active" onclick="switchTab('dashboard')">📊 Tableau de bord</button>
          <button class="tab" onclick="switchTab('charts')">📈 Graphiques</button>
          <button class="tab" onclick="switchTab('exports')">📥 Exports CSV</button>
          ${req.session.role === 'super_admin' ? '<button class="tab" onclick="switchTab(\'admins\')">👥 Gestion Admins</button>' : ''}
        </div>

        <!-- Onglet Tableau de bord -->
        <div id="dashboard-tab" class="tab-content active">
        <!-- Statistiques -->
        <div class="stats">
          <div class="stat-card">
            <div class="icon">👥</div>
            <h3>Total Utilisateurs</h3>
            <div class="value" id="totalUsers">-</div>
          </div>
          <div class="stat-card">
            <div class="icon">⭐</div>
            <h3>Utilisateurs VIP</h3>
            <div class="value" id="vipUsers">-</div>
          </div>
          <div class="stat-card">
            <div class="icon">📝</div>
            <h3>Abonnements Actifs</h3>
            <div class="value" id="activeSubscriptions">-</div>
          </div>
          <div class="stat-card">
            <div class="icon">💰</div>
            <h3>Paiements Complétés</h3>
            <div class="value" id="completedPayments">-</div>
          </div>
          <div class="stat-card">
            <div class="icon">📊</div>
            <h3>Revenu Mensuel</h3>
            <div class="value" id="monthlyIncome">-</div>
          </div>
          <div class="stat-card">
            <div class="icon">💵</div>
            <h3>Revenu Total</h3>
            <div class="value" id="totalIncome">-</div>
          </div>
        </div>

        <!-- Liste des utilisateurs -->
        <div class="section">
          <h2>👥 Liste des clients</h2>

          <div class="filters">
            <input type="text" id="searchInput" placeholder="Rechercher par nom, username, Telegram ID...">
            <select id="vipFilter">
              <option value="all">Tous les utilisateurs</option>
              <option value="vip">VIP uniquement</option>
              <option value="non-vip">Non-VIP uniquement</option>
            </select>
            <button onclick="loadUsers()">Rechercher</button>
          </div>

          <div id="usersTable">
            <div class="loading">Chargement...</div>
          </div>
        </div>

        <!-- Abonnements récents -->
        <div class="section">
          <h2>📝 Abonnements récents</h2>
          <div id="subscriptionsTable">
            <div class="loading">Chargement...</div>
          </div>
        </div>

        <!-- Paiements récents -->
        <div class="section">
          <h2>💳 Paiements récents</h2>
          <div id="paymentsTable">
            <div class="loading">Chargement...</div>
          </div>
        </div>

        <!-- Gestion des prix -->
        <div class="section">
          <h2>💲 Gestion des Prix</h2>
          <div style="margin-bottom: 1rem;">
            <button class="btn-primary" onclick="initializePricing()">Initialiser les prix par défaut</button>
          </div>
          <div id="pricingTable">
            <div class="loading">Chargement...</div>
          </div>
        </div>

        <div class="section">
          <h2>💳 Méthodes de Paiement</h2>
          <div style="margin-bottom: 1rem;">
            <button class="btn-primary" onclick="initializeProviders()">Initialiser les providers par défaut</button>
          </div>
          <div id="providersTable">
            <div class="loading">Chargement...</div>
          </div>
        </div>
        </div>
        <!-- Fin Onglet Tableau de bord -->

        <!-- Onglet Graphiques -->
        <div id="charts-tab" class="tab-content">
          <div class="charts-grid">
            <div class="chart-card">
              <h3>📊 Évolution des Revenus (12 derniers mois)</h3>
              <div class="chart-container">
                <canvas id="revenueChart"></canvas>
              </div>
            </div>

            <div class="chart-card">
              <h3>👥 Croissance des Utilisateurs (12 derniers mois)</h3>
              <div class="chart-container">
                <canvas id="usersChart"></canvas>
              </div>
            </div>

            <div class="chart-card">
              <h3>📝 Distribution des Plans d'Abonnement</h3>
              <div class="chart-container">
                <canvas id="plansChart"></canvas>
              </div>
            </div>

            <div class="chart-card">
              <h3>💳 Répartition des Paiements par Provider</h3>
              <div class="chart-container">
                <canvas id="providersChart"></canvas>
              </div>
            </div>
          </div>
        </div>
        <!-- Fin Onglet Graphiques -->

        <!-- Onglet Exports CSV -->
        <div id="exports-tab" class="tab-content">
          <div class="export-section">
            <h2>📥 Exporter les données en CSV</h2>
            <p style="margin-bottom: 20px; color: #666;">
              Sélectionnez un mois et une année pour filtrer les exports, ou laissez vide pour exporter toutes les données.
            </p>

            <div class="export-controls">
              <label for="exportMonth">Mois :</label>
              <select id="exportMonth">
                <option value="">Tous</option>
                <option value="1">Janvier</option>
                <option value="2">Février</option>
                <option value="3">Mars</option>
                <option value="4">Avril</option>
                <option value="5">Mai</option>
                <option value="6">Juin</option>
                <option value="7">Juillet</option>
                <option value="8">Août</option>
                <option value="9">Septembre</option>
                <option value="10">Octobre</option>
                <option value="11">Novembre</option>
                <option value="12">Décembre</option>
              </select>

              <label for="exportYear">Année :</label>
              <select id="exportYear">
                <option value="">Toutes</option>
              </select>
            </div>

            <div class="export-buttons">
              <button class="export-btn" onclick="exportData('users')">
                📥 Exporter Utilisateurs
              </button>
              <button class="export-btn" onclick="exportData('payments')">
                📥 Exporter Paiements
              </button>
              <button class="export-btn" onclick="exportData('subscriptions')">
                📥 Exporter Abonnements
              </button>
            </div>

            <div class="export-info-box">
              <h3>ℹ️ Informations sur les exports</h3>
              <ul>
                <li><strong>Utilisateurs :</strong> Telegram ID, Nom, Username, Statut VIP, VIP jusqu'à, Date de création</li>
                <li><strong>Paiements :</strong> Telegram ID, Nom complet, Username, Montant, Devise, Provider, Statut, Date</li>
                <li><strong>Abonnements :</strong> Telegram ID, Plan, Statut, Dates début/fin, Provider, Auto-renouvellement, Date de création</li>
              </ul>
              <p class="export-info-note">
                Les fichiers CSV sont encodés en UTF-8 avec BOM pour une compatibilité optimale avec Excel.
              </p>
            </div>
          </div>
        </div>
        <!-- Fin Onglet Exports CSV -->

        <!-- Onglet Gestion Admins (Super Admin Only) -->
        ${req.session.role === 'super_admin' ? `
        <div id="admins-tab" class="tab-content">
          <div class="section">
            <h2>👥 Gestion des Administrateurs</h2>
            <p style="margin-bottom: 20px; color: var(--text-secondary);">
              Liste de tous les administrateurs et super administrateurs du système.
            </p>

            <div class="table-container">
              <table>
                <thead>
                  <tr>
                    <th>Username</th>
                    <th>Email</th>
                    <th>Rôle</th>
                    <th>Statut</th>
                    <th>Dernière Connexion</th>
                    <th>Date de Création</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody id="adminsTableBody">
                  <tr>
                    <td colspan="7" style="text-align: center; padding: 40px;">
                      Chargement...
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </div>
        ` : ''}
        <!-- Fin Onglet Gestion Admins -->
      </div>

      <!-- Modal pour éditer un abonnement -->
      <div id="editModal" class="modal">
        <div class="modal-content">
          <div class="modal-header">
            <h3>Modifier l'abonnement</h3>
          </div>
          <div class="modal-body">
            <div class="form-group">
              <label for="editStartDate">Date de début</label>
              <input type="date" id="editStartDate" required>
            </div>
            <div class="form-group">
              <label for="editEndDate">Date de fin</label>
              <input type="date" id="editEndDate" required>
            </div>
            <div class="form-group">
              <label for="editStatus">Statut</label>
              <select id="editStatus">
                <option value="active">Actif</option>
                <option value="expired">Expiré</option>
                <option value="cancelled">Annulé</option>
                <option value="pending">En attente</option>
              </select>
            </div>
          </div>
          <div class="modal-footer">
            <button class="btn-secondary" onclick="closeEditModal()">Annuler</button>
            <button class="btn-primary" onclick="saveSubscription()">Enregistrer</button>
          </div>
        </div>
      </div>

      <!-- Modal pour éditer un utilisateur -->
      <div id="editUserModal" class="modal">
        <div class="modal-content">
          <div class="modal-header">
            <h3>Modifier l'utilisateur</h3>
          </div>
          <div class="modal-body">
            <div class="form-group">
              <label for="editUserVipStatus">Statut VIP</label>
              <select id="editUserVipStatus">
                <option value="true">VIP</option>
                <option value="false">Non-VIP</option>
              </select>
            </div>
            <div class="form-group">
              <label for="editUserVipUntil">VIP jusqu'au (laisser vide pour retirer le VIP)</label>
              <input type="date" id="editUserVipUntil">
            </div>
          </div>
          <div class="modal-footer">
            <button class="btn-secondary" onclick="closeEditUserModal()">Annuler</button>
            <button class="btn-primary" onclick="saveUser()">Enregistrer</button>
          </div>
        </div>
      </div>

      <!-- Modal pour éditer les prix -->
      <div id="editPricingModal" class="modal">
        <div class="modal-content">
          <div class="modal-header">
            <h3>Modifier le prix</h3>
          </div>
          <div class="modal-body">
            <div class="form-group">
              <label for="editPricePlan">Plan</label>
              <input type="text" id="editPricePlan" disabled>
            </div>
            <div class="form-group">
              <label for="editPriceProvider">Provider</label>
              <input type="text" id="editPriceProvider" disabled>
            </div>
            <div class="form-group">
              <label for="editPriceAmount">Prix</label>
              <input type="number" id="editPriceAmount" step="0.01" min="0" required>
            </div>
            <div class="form-group">
              <label for="editPriceCurrency">Devise</label>
              <input type="text" id="editPriceCurrency" disabled>
            </div>
            <div class="form-group">
              <label for="editPriceDescription">Description</label>
              <input type="text" id="editPriceDescription">
            </div>
          </div>
          <div class="modal-footer">
            <button class="btn-secondary" onclick="closeEditPricingModal()">Annuler</button>
            <button class="btn-primary" onclick="savePricing()">Enregistrer</button>
          </div>
        </div>
      </div>

      <script>
        let currentSubscriptionId = null;
        let currentUserId = null;

        // Charger les statistiques
        async function loadStats() {
          try {
            const response = await fetch('/admin/api/stats');
            const data = await response.json();

            document.getElementById('totalUsers').textContent = data.totalUsers;
            document.getElementById('vipUsers').textContent = data.vipUsers;
            document.getElementById('activeSubscriptions').textContent = data.activeSubscriptions;
            document.getElementById('completedPayments').textContent = data.completedPayments;
            document.getElementById('monthlyIncome').textContent = data.monthlyIncome ? data.monthlyIncome.toFixed(2) + '€' : '0.00€';
            document.getElementById('totalIncome').textContent = data.totalIncome ? data.totalIncome.toFixed(2) + '€' : '0.00€';
          } catch (error) {
            console.error('Erreur lors du chargement des stats:', error);
          }
        }

        // Charger les utilisateurs
        async function loadUsers() {
          const search = document.getElementById('searchInput').value;
          const vipFilter = document.getElementById('vipFilter').value;

          try {
            const response = await fetch(\`/admin/api/users?search=\${search}&vipFilter=\${vipFilter}\`);
            const users = await response.json();

            if (users.length === 0) {
              document.getElementById('usersTable').innerHTML = '<div class="empty">Aucun utilisateur trouvé</div>';
              return;
            }

            let html = '<table><thead><tr><th>Telegram ID</th><th>Nom</th><th>Username</th><th>Statut VIP</th><th>VIP jusqu\\'à</th><th>Date création</th><th>Actions</th></tr></thead><tbody>';

            const formatDate = (date) => {
              if (!date) return '-';
              const d = new Date(date);
              const day = String(d.getDate()).padStart(2, '0');
              const month = String(d.getMonth() + 1).padStart(2, '0');
              const year = d.getFullYear();
              return \`\${day}/\${month}/\${year}\`;
            };

            users.forEach(user => {
              const vipBadge = user.isVip
                ? '<span class="badge badge-success">VIP</span>'
                : '<span class="badge badge-danger">Non-VIP</span>';

              const vipUntil = formatDate(user.vipUntil);
              const createdAt = formatDate(user.createdAt);
              const userId = user._id.toString ? user._id.toString() : user._id;

              html += \`
                <tr>
                  <td>\${user.telegramId}</td>
                  <td>\${user.firstName || ''} \${user.lastName || ''}</td>
                  <td>@\${user.username || 'N/A'}</td>
                  <td>\${vipBadge}</td>
                  <td>\${vipUntil}</td>
                  <td>\${createdAt}</td>
                  <td>
                    <button class="action-btn" onclick="editUser('\${userId}')">Modifier</button>
                    <button class="action-btn action-btn-danger" onclick="deleteUser('\${userId}')">Supprimer</button>
                  </td>
                </tr>
              \`;
            });

            html += '</tbody></table>';
            document.getElementById('usersTable').innerHTML = html;
          } catch (error) {
            console.error('Erreur lors du chargement des utilisateurs:', error);
            document.getElementById('usersTable').innerHTML = '<div class="empty">Erreur lors du chargement</div>';
          }
        }

        // Charger les abonnements
        async function loadSubscriptions() {
          try {
            const response = await fetch('/admin/api/subscriptions?limit=10');
            const subscriptions = await response.json();

            if (subscriptions.length === 0) {
              document.getElementById('subscriptionsTable').innerHTML = '<div class="empty">Aucun abonnement trouvé</div>';
              return;
            }

            let html = '<table><thead><tr><th>Telegram ID</th><th>Plan</th><th>Statut</th><th>Début</th><th>Fin</th><th>Provider</th><th>Auto-renouvellement</th><th>Actions</th></tr></thead><tbody>';

            subscriptions.forEach(sub => {
              const statusBadges = {
                active: '<span class="badge badge-success">Actif</span>',
                expired: '<span class="badge badge-danger">Expiré</span>',
                cancelled: '<span class="badge badge-warning">Annulé</span>',
                pending: '<span class="badge badge-info">En attente</span>'
              };

              const planLabels = {
                monthly: 'Mensuel',
                quarterly: 'Trimestriel',
                sixmonth: '6 Mois',
                yearly: 'Annuel'
              };

              const formatDate = (date) => {
                const d = new Date(date);
                const day = String(d.getDate()).padStart(2, '0');
                const month = String(d.getMonth() + 1).padStart(2, '0');
                const year = d.getFullYear();
                return \`\${day}/\${month}/\${year}\`;
              };

              const subId = sub._id.toString ? sub._id.toString() : sub._id;

              html += \`
                <tr>
                  <td>\${sub.telegramId}</td>
                  <td>\${planLabels[sub.plan]}</td>
                  <td>\${statusBadges[sub.status]}</td>
                  <td>\${formatDate(sub.startDate)}</td>
                  <td>\${formatDate(sub.endDate)}</td>
                  <td>\${sub.paymentProvider}</td>
                  <td>\${sub.autoRenew ? '✅' : '❌'}</td>
                  <td>
                    <button class="action-btn" onclick="editSubscription('\${subId}')">Modifier</button>
                    <button class="action-btn action-btn-danger" onclick="deleteSubscription('\${subId}')">Supprimer</button>
                  </td>
                </tr>
              \`;
            });

            html += '</tbody></table>';
            document.getElementById('subscriptionsTable').innerHTML = html;
          } catch (error) {
            console.error('Erreur lors du chargement des abonnements:', error);
            document.getElementById('subscriptionsTable').innerHTML = '<div class="empty">Erreur lors du chargement</div>';
          }
        }

        // Charger les paiements
        async function loadPayments() {
          try {
            const response = await fetch('/admin/api/payments?limit=10');
            const payments = await response.json();

            if (payments.length === 0) {
              document.getElementById('paymentsTable').innerHTML = '<div class="empty">Aucun paiement trouvé</div>';
              return;
            }

            let html = '<table><thead><tr><th>Telegram ID</th><th>Nom</th><th>Montant</th><th>Devise</th><th>Provider</th><th>Statut</th><th>Date</th><th>Actions</th></tr></thead><tbody>';

            payments.forEach(payment => {
              const statusBadges = {
                completed: '<span class="badge badge-success">Complété</span>',
                pending: '<span class="badge badge-info">En attente</span>',
                failed: '<span class="badge badge-danger">Échoué</span>',
                refunded: '<span class="badge badge-warning">Remboursé</span>'
              };

              const formatDate = (date) => {
                const d = new Date(date);
                const day = String(d.getDate()).padStart(2, '0');
                const month = String(d.getMonth() + 1).padStart(2, '0');
                const year = d.getFullYear();
                return \`\${day}/\${month}/\${year}\`;
              };

              const paymentId = payment._id.toString ? payment._id.toString() : payment._id;
              const userName = payment.userId ? \`\${payment.userId.firstName || ''} \${payment.userId.lastName || ''}\`.trim() || 'N/A' : 'N/A';

              html += \`
                <tr>
                  <td>\${payment.telegramId}</td>
                  <td>\${userName}</td>
                  <td>\${payment.amount.toFixed(2)}</td>
                  <td>\${payment.currency}</td>
                  <td>\${payment.provider}</td>
                  <td>\${statusBadges[payment.status]}</td>
                  <td>\${formatDate(payment.createdAt)}</td>
                  <td>
                    <button class="action-btn action-btn-danger" onclick="deletePayment('\${paymentId}')">Supprimer</button>
                  </td>
                </tr>
              \`;
            });

            html += '</tbody></table>';
            document.getElementById('paymentsTable').innerHTML = html;
          } catch (error) {
            console.error('Erreur lors du chargement des paiements:', error);
            document.getElementById('paymentsTable').innerHTML = '<div class="empty">Erreur lors du chargement</div>';
          }
        }

        // Déconnexion
        async function logout() {
          try {
            await fetch('/admin/api/logout', { method: 'POST' });
            window.location.href = '/admin/login';
          } catch (error) {
            console.error('Erreur lors de la déconnexion:', error);
          }
        }

        // Éditer un abonnement
        async function editSubscription(subscriptionId) {
          console.log('Editing subscription:', subscriptionId);
          currentSubscriptionId = subscriptionId;

          try {
            const response = await fetch(\`/admin/api/subscriptions/\${subscriptionId}\`);

            if (!response.ok) {
              const error = await response.json();
              console.error('Failed to fetch subscription:', error);
              alert('Erreur lors du chargement de l\\'abonnement: ' + (error.error || 'Erreur inconnue'));
              return;
            }

            const subscription = await response.json();
            console.log('Subscription loaded:', subscription);

            // Convertir les dates au format YYYY-MM-DD pour les inputs
            const startDate = new Date(subscription.startDate);
            const endDate = new Date(subscription.endDate);

            document.getElementById('editStartDate').value = startDate.toISOString().split('T')[0];
            document.getElementById('editEndDate').value = endDate.toISOString().split('T')[0];
            document.getElementById('editStatus').value = subscription.status;

            document.getElementById('editModal').classList.add('show');
          } catch (error) {
            console.error('Erreur lors du chargement de l\\'abonnement:', error);
            alert('Erreur lors du chargement de l\\'abonnement');
          }
        }

        // Fermer la modale d'édition
        function closeEditModal() {
          document.getElementById('editModal').classList.remove('show');
          currentSubscriptionId = null;
        }

        // Sauvegarder les modifications
        async function saveSubscription() {
          if (!currentSubscriptionId) return;

          const startDate = document.getElementById('editStartDate').value;
          const endDate = document.getElementById('editEndDate').value;
          const status = document.getElementById('editStatus').value;

          if (!startDate || !endDate) {
            alert('Veuillez remplir toutes les dates');
            return;
          }

          try {
            const response = await fetch(\`/admin/api/subscriptions/\${currentSubscriptionId}\`, {
              method: 'PUT',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ startDate, endDate, status })
            });

            if (response.ok) {
              alert('Abonnement modifié avec succès');
              closeEditModal();
              loadSubscriptions();
            } else {
              const error = await response.json();
              alert('Erreur: ' + (error.error || 'Erreur lors de la modification'));
            }
          } catch (error) {
            console.error('Erreur lors de la sauvegarde:', error);
            alert('Erreur lors de la sauvegarde');
          }
        }

        // Supprimer un abonnement
        async function deleteSubscription(subscriptionId) {
          console.log('Deleting subscription:', subscriptionId);

          if (!confirm('Êtes-vous sûr de vouloir supprimer cet abonnement ?')) {
            return;
          }

          try {
            const response = await fetch(\`/admin/api/subscriptions/\${subscriptionId}\`, {
              method: 'DELETE'
            });

            console.log('Delete response status:', response.status);

            if (response.ok) {
              alert('Abonnement supprimé avec succès');
              loadSubscriptions();
              loadStats();
            } else {
              const error = await response.json();
              alert('Erreur: ' + (error.error || 'Erreur lors de la suppression'));
            }
          } catch (error) {
            console.error('Erreur lors de la suppression:', error);
            alert('Erreur lors de la suppression');
          }
        }

        // Supprimer un paiement
        async function deletePayment(paymentId) {
          console.log('Deleting payment:', paymentId);

          if (!confirm('Êtes-vous sûr de vouloir supprimer ce paiement ?')) {
            return;
          }

          try {
            const response = await fetch(\`/admin/api/payments/\${paymentId}\`, {
              method: 'DELETE'
            });

            console.log('Delete response status:', response.status);

            if (response.ok) {
              alert('Paiement supprimé avec succès');
              loadPayments();
              loadStats();
            } else {
              const error = await response.json();
              alert('Erreur: ' + (error.error || 'Erreur lors de la suppression'));
            }
          } catch (error) {
            console.error('Erreur lors de la suppression:', error);
            alert('Erreur lors de la suppression');
          }
        }

        // Éditer un utilisateur
        async function editUser(userId) {
          console.log('Editing user:', userId);
          currentUserId = userId;

          try {
            const response = await fetch(\`/admin/api/users/\${userId}\`);

            if (!response.ok) {
              const error = await response.json();
              console.error('Failed to fetch user:', error);
              alert('Erreur lors du chargement de l\\'utilisateur: ' + (error.error || 'Erreur inconnue'));
              return;
            }

            const data = await response.json();
            const user = data.user;
            console.log('User loaded:', user);

            document.getElementById('editUserVipStatus').value = user.isVip ? 'true' : 'false';

            if (user.vipUntil) {
              const vipDate = new Date(user.vipUntil);
              document.getElementById('editUserVipUntil').value = vipDate.toISOString().split('T')[0];
            } else {
              document.getElementById('editUserVipUntil').value = '';
            }

            document.getElementById('editUserModal').classList.add('show');
          } catch (error) {
            console.error('Erreur lors du chargement de l\\'utilisateur:', error);
            alert('Erreur lors du chargement de l\\'utilisateur');
          }
        }

        // Fermer la modale d'édition utilisateur
        function closeEditUserModal() {
          document.getElementById('editUserModal').classList.remove('show');
          currentUserId = null;
        }

        // Sauvegarder les modifications d'un utilisateur
        async function saveUser() {
          if (!currentUserId) return;

          const isVip = document.getElementById('editUserVipStatus').value === 'true';
          const vipUntil = document.getElementById('editUserVipUntil').value;

          try {
            const response = await fetch(\`/admin/api/users/\${currentUserId}\`, {
              method: 'PUT',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ isVip, vipUntil: vipUntil || null })
            });

            if (response.ok) {
              alert('Utilisateur modifié avec succès');
              closeEditUserModal();
              loadUsers();
              loadStats();
            } else {
              const error = await response.json();
              alert('Erreur: ' + (error.error || 'Erreur lors de la modification'));
            }
          } catch (error) {
            console.error('Erreur lors de la sauvegarde:', error);
            alert('Erreur lors de la sauvegarde');
          }
        }

        // Supprimer un utilisateur
        async function deleteUser(userId) {
          console.log('Deleting user:', userId);

          if (!confirm('Êtes-vous sûr de vouloir supprimer cet utilisateur ? Tous ses abonnements et paiements seront également supprimés.')) {
            return;
          }

          try {
            const response = await fetch(\`/admin/api/users/\${userId}\`, {
              method: 'DELETE'
            });

            console.log('Delete response status:', response.status);

            if (response.ok) {
              alert('Utilisateur supprimé avec succès');
              loadUsers();
              loadStats();
            } else {
              const error = await response.json();
              alert('Erreur: ' + (error.error || 'Erreur lors de la suppression'));
            }
          } catch (error) {
            console.error('Erreur lors de la suppression:', error);
            alert('Erreur lors de la suppression');
          }
        }

        // Fermer les modales en cliquant en dehors
        window.onclick = function(event) {
          const editModal = document.getElementById('editModal');
          const editUserModal = document.getElementById('editUserModal');
          const editPricingModal = document.getElementById('editPricingModal');

          if (event.target === editModal) {
            closeEditModal();
          }
          if (event.target === editUserModal) {
            closeEditUserModal();
          }
          if (event.target === editPricingModal) {
            closeEditPricingModal();
          }
        }

        // Charger les prix
        async function loadPricing() {
          try {
            const response = await fetch('/admin/api/pricing');
            const prices = await response.json();

            if (prices.length === 0) {
              document.getElementById('pricingTable').innerHTML = '<div class="empty">Aucun prix configuré. Cliquez sur "Initialiser les prix par défaut" pour commencer.</div>';
              return;
            }

            const planLabels = {
              monthly: 'Mensuel',
              quarterly: 'Trimestriel',
              sixmonth: '6 Mois',
              yearly: 'Annuel'
            };

            const providerLabels = {
              all: 'Tous',
              paypal: 'PayPal',
              revolut: 'Revolut',
              stripe: 'Stripe'
            };

            let html = '<table><thead><tr><th>Plan</th><th>Provider</th><th>Prix</th><th>Devise</th><th>Description</th><th>Actions</th></tr></thead><tbody>';

            prices.forEach(price => {
              const priceId = price._id.toString ? price._id.toString() : price._id;

              html += \`
                <tr>
                  <td>\${planLabels[price.plan]}</td>
                  <td>\${providerLabels[price.provider]}</td>
                  <td>\${price.price.toFixed(2)}</td>
                  <td>\${price.currency}</td>
                  <td>\${price.description || '-'}</td>
                  <td>
                    <button class="action-btn" onclick="editPricing('\${priceId}', '\${price.plan}', '\${price.provider}', \${price.price}, '\${price.currency}', '\${price.description || ''}')">Modifier</button>
                  </td>
                </tr>
              \`;
            });

            html += '</tbody></table>';
            document.getElementById('pricingTable').innerHTML = html;
          } catch (error) {
            console.error('Erreur lors du chargement des prix:', error);
            document.getElementById('pricingTable').innerHTML = '<div class="empty">Erreur lors du chargement</div>';
          }
        }

        // Initialiser les prix par défaut
        async function initializePricing() {
          if (!confirm('Êtes-vous sûr de vouloir initialiser les prix par défaut ? Cela ne fonctionnera que si aucun prix n\\'existe déjà.')) {
            return;
          }

          try {
            const response = await fetch('/admin/api/pricing/init', {
              method: 'POST'
            });

            if (response.ok) {
              alert('Prix initialisés avec succès');
              loadPricing();
            } else {
              const error = await response.json();
              alert('Erreur: ' + (error.error || 'Erreur lors de l\\'initialisation'));
            }
          } catch (error) {
            console.error('Erreur lors de l\\'initialisation:', error);
            alert('Erreur lors de l\\'initialisation');
          }
        }

        // Éditer un prix
        let currentPricingId = null;

        function editPricing(pricingId, plan, provider, price, currency, description) {
          currentPricingId = pricingId;

          document.getElementById('editPricePlan').value = plan;
          document.getElementById('editPriceProvider').value = provider;
          document.getElementById('editPriceAmount').value = price;
          document.getElementById('editPriceCurrency').value = currency;
          document.getElementById('editPriceDescription').value = description;

          document.getElementById('editPricingModal').classList.add('show');
        }

        // Fermer la modale d'édition des prix
        function closeEditPricingModal() {
          document.getElementById('editPricingModal').classList.remove('show');
          currentPricingId = null;
        }

        // Sauvegarder les modifications du prix
        async function savePricing() {
          if (!currentPricingId) return;

          const price = parseFloat(document.getElementById('editPriceAmount').value);
          const description = document.getElementById('editPriceDescription').value;

          if (isNaN(price) || price < 0) {
            alert('Prix invalide');
            return;
          }

          try {
            const response = await fetch(\`/admin/api/pricing/\${currentPricingId}\`, {
              method: 'PUT',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ price, description })
            });

            if (response.ok) {
              alert('Prix modifié avec succès');
              closeEditPricingModal();
              loadPricing();
            } else {
              const error = await response.json();
              alert('Erreur: ' + (error.error || 'Erreur lors de la modification'));
            }
          } catch (error) {
            console.error('Erreur lors de la sauvegarde:', error);
            alert('Erreur lors de la sauvegarde');
          }
        }

        // Charger les providers
        async function loadProviders() {
          try {
            const response = await fetch('/admin/api/providers');
            const providers = await response.json();

            if (providers.length === 0) {
              document.getElementById('providersTable').innerHTML = '<div class="empty">Aucun provider configuré. Cliquez sur "Initialiser les providers par défaut" pour commencer.</div>';
              return;
            }

            let html = '<table><thead><tr><th>Provider</th><th>Nom d\\'affichage</th><th>Description</th><th>Statut</th><th>Actions</th></tr></thead><tbody>';

            providers.forEach(provider => {
              const providerId = provider._id.toString ? provider._id.toString() : provider._id;
              const statusClass = provider.enabled ? 'status-active' : 'status-expired';
              const statusText = provider.enabled ? 'Activé' : 'Désactivé';
              const toggleText = provider.enabled ? 'Désactiver' : 'Activer';

              html += \`
                <tr>
                  <td>\${provider.name}</td>
                  <td>\${provider.displayName}</td>
                  <td>\${provider.description || '-'}</td>
                  <td><span class="\${statusClass}">\${statusText}</span></td>
                  <td>
                    <button class="action-btn" onclick="toggleProvider('\${providerId}', \${!provider.enabled})">\${toggleText}</button>
                  </td>
                </tr>
              \`;
            });

            html += '</tbody></table>';
            document.getElementById('providersTable').innerHTML = html;
          } catch (error) {
            console.error('Erreur lors du chargement des providers:', error);
            document.getElementById('providersTable').innerHTML = '<div class="empty">Erreur lors du chargement</div>';
          }
        }

        // Initialiser les providers par défaut
        async function initializeProviders() {
          if (!confirm('Êtes-vous sûr de vouloir initialiser les providers par défaut ? Cela ne fonctionnera que si aucun provider n\\'existe déjà.')) {
            return;
          }

          try {
            const response = await fetch('/admin/api/providers/init', {
              method: 'POST'
            });

            if (response.ok) {
              alert('Providers initialisés avec succès');
              loadProviders();
            } else {
              const error = await response.json();
              alert('Erreur: ' + (error.error || 'Erreur lors de l\\'initialisation'));
            }
          } catch (error) {
            console.error('Erreur lors de l\\'initialisation:', error);
            alert('Erreur lors de l\\'initialisation');
          }
        }

        // Activer/Désactiver un provider
        async function toggleProvider(providerId, enabled) {
          try {
            const response = await fetch(\`/admin/api/providers/\${providerId}\`, {
              method: 'PUT',
              headers: {
                'Content-Type': 'application/json'
              },
              body: JSON.stringify({ enabled })
            });

            if (response.ok) {
              loadProviders();
            } else {
              const error = await response.json();
              alert('Erreur: ' + (error.error || 'Erreur lors de la mise à jour'));
            }
          } catch (error) {
            console.error('Erreur lors de la mise à jour:', error);
            alert('Erreur lors de la mise à jour');
          }
        }

        // ==================== Initialisation ====================

        // Charger toutes les données au démarrage
        loadStats();
        loadUsers();
        loadSubscriptions();
        loadPayments();
        loadPricing();
        loadProviders();

        // Rafraîchir les stats toutes les 5 minutes
        setInterval(loadStats, 300000);

        // ==================== Gestion des Onglets ====================

        function switchTab(tabName) {
          // Masquer tous les onglets
          document.querySelectorAll('.tab-content').forEach(tab => {
            tab.classList.remove('active');
          });

          // Masquer tous les boutons d'onglets actifs
          document.querySelectorAll('.tab').forEach(tab => {
            tab.classList.remove('active');
          });

          // Afficher l'onglet sélectionné
          document.getElementById(tabName + '-tab').classList.add('active');

          // Activer le bouton d'onglet correspondant
          event.target.classList.add('active');

          // Charger les graphiques si on est sur l'onglet graphiques
          if (tabName === 'charts') {
            loadCharts();
          }

          // Initialiser les années si on est sur l'onglet exports
          if (tabName === 'exports') {
            initializeYearSelector();
          }

          // Charger les admins si on est sur l'onglet admins
          if (tabName === 'admins') {
            loadAdmins();
          }
        }

        // ==================== Graphiques Chart.js ====================

        let charts = {};

        async function loadCharts() {
          // Éviter de recharger les graphiques s'ils existent déjà
          if (Object.keys(charts).length > 0) return;

          try {
            // Charger les données des graphiques en parallèle
            const [revenueData, usersData, plansData, providersData] = await Promise.all([
              fetch('/admin/api/charts/revenue').then(r => r.json()),
              fetch('/admin/api/charts/users').then(r => r.json()),
              fetch('/admin/api/charts/plans').then(r => r.json()),
              fetch('/admin/api/charts/providers-stats').then(r => r.json())
            ]);

            // Graphique des revenus
            createRevenueChart(revenueData);

            // Graphique des utilisateurs
            createUsersChart(usersData);

            // Graphique de distribution des plans
            createPlansChart(plansData);

            // Graphique des providers
            createProvidersChart(providersData);

          } catch (error) {
            console.error('Erreur lors du chargement des graphiques:', error);
          }
        }

        function createRevenueChart(data) {
          const ctx = document.getElementById('revenueChart');
          if (!ctx) return;

          // Créer les labels et données
          const monthNames = ['Jan', 'Fév', 'Mar', 'Avr', 'Mai', 'Jun', 'Jul', 'Aoû', 'Sep', 'Oct', 'Nov', 'Déc'];
          const labels = [];
          const amounts = [];

          // Remplir les données
          data.forEach(item => {
            labels.push(\`\${monthNames[item._id.month - 1]} \${item._id.year}\`);
            amounts.push(item.total.toFixed(2));
          });

          charts.revenue = new Chart(ctx, {
            type: 'line',
            data: {
              labels: labels,
              datasets: [{
                label: 'Revenus (€)',
                data: amounts,
                borderColor: '#667eea',
                backgroundColor: 'rgba(102, 126, 234, 0.1)',
                tension: 0.4,
                fill: true
              }]
            },
            options: {
              responsive: true,
              maintainAspectRatio: false,
              plugins: {
                legend: {
                  display: true,
                  position: 'top'
                }
              },
              scales: {
                y: {
                  beginAtZero: true,
                  ticks: {
                    callback: function(value) {
                      return value + '€';
                    }
                  }
                }
              }
            }
          });
        }

        function createUsersChart(data) {
          const ctx = document.getElementById('usersChart');
          if (!ctx) return;

          const monthNames = ['Jan', 'Fév', 'Mar', 'Avr', 'Mai', 'Jun', 'Jul', 'Aoû', 'Sep', 'Oct', 'Nov', 'Déc'];
          const labels = [];
          const totalUsers = [];
          const vipUsers = [];

          data.forEach(item => {
            labels.push(\`\${monthNames[item._id.month - 1]} \${item._id.year}\`);
            totalUsers.push(item.total);
            vipUsers.push(item.vip);
          });

          charts.users = new Chart(ctx, {
            type: 'line',
            data: {
              labels: labels,
              datasets: [
                {
                  label: 'Total Utilisateurs',
                  data: totalUsers,
                  borderColor: '#667eea',
                  backgroundColor: 'rgba(102, 126, 234, 0.1)',
                  tension: 0.4
                },
                {
                  label: 'Utilisateurs VIP',
                  data: vipUsers,
                  borderColor: '#10b981',
                  backgroundColor: 'rgba(16, 185, 129, 0.1)',
                  tension: 0.4
                }
              ]
            },
            options: {
              responsive: true,
              maintainAspectRatio: false,
              plugins: {
                legend: {
                  display: true,
                  position: 'top'
                }
              },
              scales: {
                y: {
                  beginAtZero: true
                }
              }
            }
          });
        }

        function createPlansChart(data) {
          const ctx = document.getElementById('plansChart');
          if (!ctx) return;

          const planLabels = {
            monthly: 'Mensuel',
            quarterly: 'Trimestriel',
            sixmonth: '6 Mois',
            yearly: 'Annuel'
          };

          const labels = [];
          const counts = [];
          const colors = ['#667eea', '#10b981', '#f59e0b'];

          data.forEach(item => {
            labels.push(planLabels[item._id] || item._id);
            counts.push(item.count);
          });

          charts.plans = new Chart(ctx, {
            type: 'doughnut',
            data: {
              labels: labels,
              datasets: [{
                data: counts,
                backgroundColor: colors,
                borderWidth: 2,
                borderColor: '#fff'
              }]
            },
            options: {
              responsive: true,
              maintainAspectRatio: false,
              plugins: {
                legend: {
                  display: true,
                  position: 'bottom'
                }
              }
            }
          });
        }

        function createProvidersChart(data) {
          const ctx = document.getElementById('providersChart');
          if (!ctx) return;

          const providerLabels = {
            paypal: 'PayPal',
            revolut: 'Revolut',
            stripe: 'Stripe'
          };

          const labels = [];
          const counts = [];
          const colors = ['#0088cc', '#667eea', '#635bff'];

          data.forEach(item => {
            labels.push(providerLabels[item._id] || item._id);
            counts.push(item.count);
          });

          charts.providers = new Chart(ctx, {
            type: 'bar',
            data: {
              labels: labels,
              datasets: [{
                label: 'Nombre de paiements',
                data: counts,
                backgroundColor: colors
              }]
            },
            options: {
              responsive: true,
              maintainAspectRatio: false,
              plugins: {
                legend: {
                  display: false
                }
              },
              scales: {
                y: {
                  beginAtZero: true,
                  ticks: {
                    stepSize: 1
                  }
                }
              }
            }
          });
        }

        // ==================== Export CSV ====================

        function initializeYearSelector() {
          const yearSelect = document.getElementById('exportYear');
          if (!yearSelect || yearSelect.options.length > 1) return;

          const currentYear = new Date().getFullYear();
          for (let year = currentYear; year >= currentYear - 5; year--) {
            const option = document.createElement('option');
            option.value = year;
            option.textContent = year;
            yearSelect.appendChild(option);
          }
        }

        function toggleDarkMode() {
          document.body.classList.toggle('dark-mode');
          
          // Sauvegarder la préférence dans localStorage
          const isDarkMode = document.body.classList.contains('dark-mode');
          localStorage.setItem('darkMode', isDarkMode ? 'enabled' : 'disabled');
          
          // Mettre à jour le texte du bouton
          const btn = document.querySelector('.dark-mode-btn');
          if (btn) {
            btn.textContent = isDarkMode ? 'Mode Clair' : 'Mode Sombre';
          }
          
          // Recharger les graphiques pour adapter les couleurs
          if (Object.keys(charts).length > 0) {
            reloadChartsForTheme();
          }
        }

        // Fonction pour adapter les graphiques au thème
        function reloadChartsForTheme() {
          const isDarkMode = document.body.classList.contains('dark-mode');
          
          // Couleurs adaptées au thème
          const gridColor = isDarkMode ? '#404040' : '#e9ecef';
          const textColor = isDarkMode ? '#b0b0b0' : '#666';
          
          // Mettre à jour tous les graphiques existants
          Object.values(charts).forEach(chart => {
            if (chart && chart.options) {
              // Mettre à jour les couleurs des axes
              if (chart.options.scales) {
                if (chart.options.scales.y) {
                  chart.options.scales.y.grid = { color: gridColor };
                  chart.options.scales.y.ticks = { color: textColor };
                }
                if (chart.options.scales.x) {
                  chart.options.scales.x.grid = { color: gridColor };
                  chart.options.scales.x.ticks = { color: textColor };
                }
              }
              
              // Mettre à jour la légende
              if (chart.options.plugins && chart.options.plugins.legend) {
                chart.options.plugins.legend.labels = { color: textColor };
              }
              
              chart.update();
            }
          });
        }

        async function exportData(type) {
          const month = document.getElementById('exportMonth').value;
          const year = document.getElementById('exportYear').value;

          let url = \`/admin/api/export/\${type}\`;
          const params = [];

          if (month) params.push(\`month=\${month}\`);
          if (year) params.push(\`year=\${year}\`);

          if (params.length > 0) {
            url += '?' + params.join('&');
          }

          try {
            // Ouvrir l'URL dans un nouvel onglet pour télécharger le fichier
            window.open(url, '_blank');
          } catch (error) {
            console.error('Erreur lors de l\\'export:', error);
            alert('Erreur lors de l\\'export des données');
          }
        }

        // ==================== Admin Management Functions ====================

        // Load all admins
        async function loadAdmins() {
          try {
            const response = await fetch('/admin/api/admins');

            if (!response.ok) {
              if (response.status === 403) {
                document.getElementById('adminsTableBody').innerHTML =
                  '<tr><td colspan="7" style="text-align: center; color: red;">Accès refusé - Super admin requis</td></tr>';
                return;
              }
              throw new Error('Erreur lors du chargement des administrateurs');
            }

            const admins = await response.json();

            if (admins.length === 0) {
              document.getElementById('adminsTableBody').innerHTML =
                '<tr><td colspan="7" style="text-align: center;">Aucun administrateur trouvé</td></tr>';
              return;
            }

            const formatDate = (date) => {
              if (!date) return '-';
              const d = new Date(date);
              const day = String(d.getDate()).padStart(2, '0');
              const month = String(d.getMonth() + 1).padStart(2, '0');
              const year = d.getFullYear();
              const hours = String(d.getHours()).padStart(2, '0');
              const minutes = String(d.getMinutes()).padStart(2, '0');
              return \`\${day}/\${month}/\${year} \${hours}:\${minutes}\`;
            };

            let html = '';
            admins.forEach(admin => {
              const roleBadge = admin.role === 'super_admin'
                ? '<span class="badge badge-success">Super Admin</span>'
                : '<span class="badge badge-info">Admin</span>';

              const statusBadge = admin.isActive
                ? '<span class="badge badge-success">Actif</span>'
                : '<span class="badge badge-danger">Inactif</span>';

              const lastLogin = formatDate(admin.lastLogin);
              const createdAt = formatDate(admin.createdAt);
              const adminId = admin._id.toString ? admin._id.toString() : admin._id;

              // Check if this is the current user
              const isCurrentUser = '${req.session.adminId}' === adminId;

              html += \`
                <tr>
                  <td>\${admin.username}\${isCurrentUser ? ' <strong>(Vous)</strong>' : ''}</td>
                  <td>\${admin.email}</td>
                  <td>\${roleBadge}</td>
                  <td>\${statusBadge}</td>
                  <td>\${lastLogin}</td>
                  <td>\${createdAt}</td>
                  <td>
                    \${!isCurrentUser ? \`<button class="action-btn action-btn-danger" onclick="deleteAdmin('\${adminId}', '\${admin.username}')">Supprimer</button>\` : '-'}
                  </td>
                </tr>
              \`;
            });

            document.getElementById('adminsTableBody').innerHTML = html;
          } catch (error) {
            console.error('Erreur lors du chargement des admins:', error);
            document.getElementById('adminsTableBody').innerHTML =
              '<tr><td colspan="7" style="text-align: center; color: red;">Erreur lors du chargement</td></tr>';
          }
        }

        // Delete admin
        async function deleteAdmin(adminId, username) {
          if (!confirm(\`Êtes-vous sûr de vouloir supprimer l'administrateur "\${username}" ?\\n\\nCette action est irréversible.\`)) {
            return;
          }

          try {
            const response = await fetch(\`/admin/api/admins/\${adminId}\`, {
              method: 'DELETE'
            });

            const data = await response.json();

            if (!response.ok) {
              alert(\`Erreur: \${data.error || 'Impossible de supprimer l\\'administrateur'}\`);
              return;
            }

            alert(\`Administrateur "\${username}" supprimé avec succès\`);
            loadAdmins(); // Reload the admins list
          } catch (error) {
            console.error('Erreur lors de la suppression:', error);
            alert('Erreur lors de la suppression de l\\'administrateur');
          }
        }

        // ==================== End Admin Management Functions ====================

        // Charger la préférence au chargement de la page
        document.addEventListener('DOMContentLoaded', () => {
          const darkMode = localStorage.getItem('darkMode');
          const btn = document.querySelector('.dark-mode-btn');

          if (darkMode === 'enabled') {
            document.body.classList.add('dark-mode');
            if (btn) btn.textContent = 'Mode Clair';
          } else {
            if (btn) btn.textContent = 'Mode Sombre';
          }
        });
      </script>
    </body>
    </html>
  `);
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

// ==================== Pricing Routes ====================

// Get all pricing configurations
router.get('/api/pricing', requireAuth, async (_req: Request, res: Response) => {
  try {
    const prices = await PricingConfig.find().sort({ plan: 1, provider: 1 });
    res.json(prices);
  } catch (error) {
    logger.error({ error }, 'Error fetching pricing');
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// Update a pricing configuration
router.put('/api/pricing/:id', requireAuth, async (req: Request, res: Response) => {
  try {
    const { price, description } = req.body;

    if (price !== undefined && (typeof price !== 'number' || price < 0)) {
      res.status(400).json({ error: 'Prix invalide' });
      return;
    }

    const updateData: any = {};
    if (price !== undefined) updateData.price = price;
    if (description !== undefined) updateData.description = description;

    const pricing = await PricingConfig.findByIdAndUpdate(
      req.params.id,
      updateData,
      { new: true, runValidators: true }
    );

    if (!pricing) {
      res.status(404).json({ error: 'Configuration de prix non trouvée' });
      return;
    }

    logger.info({ updateData }, `Pricing ${req.params.id} updated by admin ${req.session.username}`);

    // Ajouter un avertissement si le prix a été modifié pour un plan avec abonnements
    const priceChanged = price !== undefined;
    const isSubscriptionPlan = ['monthly', 'quarterly', 'sixmonth', 'yearly'].includes(pricing.plan);

    const response: any = { ...pricing.toObject() };

    if (priceChanged && isSubscriptionPlan) {
      response.warning = '⚠️ Important : Ce changement de prix s\'applique uniquement aux paiements uniques. Pour les abonnements mensuels PayPal avec auto-renouvellement, vous devez également créer un nouveau plan dans votre Dashboard PayPal (https://www.paypal.com/businessmanage) avec le nouveau prix. Les abonnements existants gardent leur prix actuel.';
    }

    res.json(response);
  } catch (error) {
    logger.error({ error }, 'Error updating pricing');
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// Initialize default pricing (only if no pricing exists)
router.post('/api/pricing/init', requireAuth, async (_req: Request, res: Response) => {
  try {
    const existingCount = await PricingConfig.countDocuments();
    if (existingCount > 0) {
      res.status(400).json({ error: 'Les prix sont déjà configurés' });
      return;
    }

    const defaultPrices = [
      { plan: 'monthly', provider: 'all', price: 29.90, currency: 'EUR', description: 'Abonnement mensuel' },
      { plan: 'quarterly', provider: 'all', price: 79.90, currency: 'EUR', description: 'Abonnement trimestriel' },
      { plan: 'sixmonth', provider: 'all', price: 149.90, currency: 'EUR', description: 'Abonnement 6 mois' },
      { plan: 'yearly', provider: 'all', price: 279.90, currency: 'EUR', description: 'Abonnement annuel' },
    ];

    const prices = await PricingConfig.insertMany(defaultPrices);

    logger.info(`Default pricing initialized by admin ${_req.session.username}`);

    res.json(prices);
  } catch (error) {
    logger.error({ error }, 'Error initializing pricing');
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// ==================== Plan Display Names Routes ====================

// Get all plan display names
router.get('/api/plan-names', requireAuth, async (_req: Request, res: Response) => {
  try {
    const { PlanDisplayName } = await import('../models/PlanDisplayName');
    const planNames = await PlanDisplayName.find().sort({ sortOrder: 1 });
    res.json(planNames);
  } catch (error) {
    logger.error({ error }, 'Error fetching plan names');
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// Update a plan display name
router.put('/api/plan-names/:id', requireAuth, async (req: Request, res: Response) => {
  try {
    const { PlanDisplayName } = await import('../models/PlanDisplayName');
    const { invalidatePlanNamesCache } = await import('../utils/planDisplayNames');

    const { displayName, emoji, description, features, isActive, sortOrder } = req.body;

    const planName = await PlanDisplayName.findByIdAndUpdate(
      req.params.id,
      { displayName, emoji, description, features, isActive, sortOrder },
      { new: true, runValidators: true }
    );

    if (!planName) {
      return res.status(404).json({ error: 'Plan non trouvé' });
    }

    // Invalider le cache
    invalidatePlanNamesCache();

    logger.info({ planName }, `Plan name updated by admin ${req.session.username}`);

    return res.json(planName);
  } catch (error) {
    logger.error({ error }, 'Error updating plan name');
    return res.status(500).json({ error: 'Erreur serveur' });
  }
});

// Initialize default plan names
router.post('/api/plan-names/init', requireAuth, async (_req: Request, res: Response) => {
  try {
    const { initializeDefaultPlanNames } = await import('../models/PlanDisplayName');

    await initializeDefaultPlanNames();

    const { PlanDisplayName } = await import('../models/PlanDisplayName');
    const planNames = await PlanDisplayName.find().sort({ sortOrder: 1 });

    logger.info(`Plan names initialized by admin ${_req.session.username}`);

    res.json(planNames);
  } catch (error) {
    logger.error({ error }, 'Error initializing plan names');
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// ==================== Chart Data Routes ====================

// Get revenue data for charts (last 12 months)
router.get('/api/charts/revenue', requireAuth, async (_req: Request, res: Response) => {
  try {
    const now = new Date();
    const twelveMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 11, 1);

    const revenueData = await Payment.aggregate([
      {
        $match: {
          status: 'completed',
          createdAt: { $gte: twelveMonthsAgo },
        },
      },
      {
        $group: {
          _id: {
            year: { $year: '$createdAt' },
            month: { $month: '$createdAt' },
          },
          total: { $sum: '$amount' },
          count: { $sum: 1 },
        },
      },
      {
        $sort: { '_id.year': 1, '_id.month': 1 },
      },
    ]);

    res.json(revenueData);
  } catch (error) {
    logger.error({ error }, 'Error fetching revenue chart data');
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// Get user growth data for charts (last 12 months)
router.get('/api/charts/users', requireAuth, async (_req: Request, res: Response) => {
  try {
    const now = new Date();
    const twelveMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 11, 1);

    const userData = await User.aggregate([
      {
        $match: {
          createdAt: { $gte: twelveMonthsAgo },
        },
      },
      {
        $group: {
          _id: {
            year: { $year: '$createdAt' },
            month: { $month: '$createdAt' },
          },
          total: { $sum: 1 },
          vip: {
            $sum: { $cond: ['$isVip', 1, 0] },
          },
        },
      },
      {
        $sort: { '_id.year': 1, '_id.month': 1 },
      },
    ]);

    res.json(userData);
  } catch (error) {
    logger.error({ error }, 'Error fetching user chart data');
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// Get plan distribution data
router.get('/api/charts/plans', requireAuth, async (_req: Request, res: Response) => {
  try {
    const planData = await Subscription.aggregate([
      {
        $match: {
          status: 'active',
        },
      },
      {
        $group: {
          _id: '$plan',
          count: { $sum: 1 },
        },
      },
    ]);

    res.json(planData);
  } catch (error) {
    logger.error({ error }, 'Error fetching plan chart data');
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// Get payment provider distribution data
router.get('/api/charts/providers-stats', requireAuth, async (_req: Request, res: Response) => {
  try {
    const providerData = await Payment.aggregate([
      {
        $match: {
          status: 'completed',
        },
      },
      {
        $group: {
          _id: '$provider',
          count: { $sum: 1 },
          total: { $sum: '$amount' },
        },
      },
    ]);

    res.json(providerData);
  } catch (error) {
    logger.error({ error }, 'Error fetching provider chart data');
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// ==================== CSV Export Routes ====================

// Export users to CSV
router.get('/api/export/users', requireAuth, async (req: Request, res: Response) => {
  try {
    const { month, year } = req.query;
    const query: any = {};

    if (month && year) {
      const startDate = new Date(Number(year), Number(month) - 1, 1);
      const endDate = new Date(Number(year), Number(month), 0, 23, 59, 59);
      query.createdAt = { $gte: startDate, $lte: endDate };
    }

    const users = await User.find(query).sort({ createdAt: -1 }).lean();

    // Generate CSV
    let csv = 'Telegram ID,Prénom,Nom,Username,Statut VIP,VIP jusqu\'à,Date de création\n';

    users.forEach(user => {
      const vipStatus = user.isVip ? 'VIP' : 'Non-VIP';
      const vipUntil = user.vipUntil ? new Date(user.vipUntil).toLocaleDateString('fr-FR') : '-';
      const createdAt = new Date(user.createdAt).toLocaleDateString('fr-FR');

      csv += `${user.telegramId},"${user.firstName || ''}","${user.lastName || ''}","${user.username || ''}",${vipStatus},${vipUntil},${createdAt}\n`;
    });

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename=users_${year || 'all'}_${month || 'all'}.csv`);
    res.send('\ufeff' + csv); // BOM for Excel UTF-8 support
  } catch (error) {
    logger.error({ error }, 'Error exporting users to CSV');
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// Export payments to CSV
router.get('/api/export/payments', requireAuth, async (req: Request, res: Response) => {
  try {
    const { month, year } = req.query;
    const query: any = {};

    if (month && year) {
      const startDate = new Date(Number(year), Number(month) - 1, 1);
      const endDate = new Date(Number(year), Number(month), 0, 23, 59, 59);
      query.createdAt = { $gte: startDate, $lte: endDate };
    }

    const payments = await Payment.find(query)
      .populate('userId', 'firstName lastName username')
      .sort({ createdAt: -1 })
      .lean();

    // Generate CSV
    let csv = 'Telegram ID,Nom complet,Username,Montant,Devise,Provider,Statut,Date\n';

    payments.forEach(payment => {
      const userName = payment.userId
        ? `${(payment.userId as any).firstName || ''} ${(payment.userId as any).lastName || ''}`.trim()
        : 'N/A';
      const username = payment.userId ? (payment.userId as any).username || 'N/A' : 'N/A';
      const date = new Date(payment.createdAt).toLocaleDateString('fr-FR');

      csv += `${payment.telegramId},"${userName}","${username}",${payment.amount},${payment.currency},${payment.provider},${payment.status},${date}\n`;
    });

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename=payments_${year || 'all'}_${month || 'all'}.csv`);
    res.send('\ufeff' + csv); // BOM for Excel UTF-8 support
  } catch (error) {
    logger.error({ error }, 'Error exporting payments to CSV');
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// Export subscriptions to CSV
router.get('/api/export/subscriptions', requireAuth, async (req: Request, res: Response) => {
  try {
    const { month, year } = req.query;
    const query: any = {};

    if (month && year) {
      const startDate = new Date(Number(year), Number(month) - 1, 1);
      const endDate = new Date(Number(year), Number(month), 0, 23, 59, 59);
      query.createdAt = { $gte: startDate, $lte: endDate };
    }

    const subscriptions = await Subscription.find(query).sort({ createdAt: -1 }).lean();

    // Generate CSV
    let csv = 'Telegram ID,Plan,Statut,Date de début,Date de fin,Provider,Auto-renouvellement,Date de création\n';

    subscriptions.forEach(sub => {
      const planLabels: any = {
        monthly: 'Mensuel',
        quarterly: 'Trimestriel',
        sixmonth: '6 Mois',
        yearly: 'Annuel'
      };

      const plan = planLabels[sub.plan] || sub.plan;
      const startDate = new Date(sub.startDate).toLocaleDateString('fr-FR');
      const endDate = new Date(sub.endDate).toLocaleDateString('fr-FR');
      const createdAt = new Date(sub.createdAt).toLocaleDateString('fr-FR');
      const autoRenew = sub.autoRenew ? 'Oui' : 'Non';

      csv += `${sub.telegramId},${plan},${sub.status},${startDate},${endDate},${sub.paymentProvider},${autoRenew},${createdAt}\n`;
    });

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename=subscriptions_${year || 'all'}_${month || 'all'}.csv`);
    res.send('\ufeff' + csv); // BOM for Excel UTF-8 support
  } catch (error) {
    logger.error({ error }, 'Error exporting subscriptions to CSV');
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// ==================== Payment Provider Management ====================

// Get all payment providers
router.get('/api/providers', requireAuth, async (_req: Request, res: Response) => {
  try {
    const providers = await PaymentProvider.find().sort({ name: 1 });
    res.json(providers);
  } catch (error) {
    logger.error({ error }, 'Error fetching payment providers');
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// Update a payment provider (toggle enabled status)
router.put('/api/providers/:id', requireAuth, async (req: Request, res: Response) => {
  try {
    const { enabled, displayName, description } = req.body;

    if (enabled !== undefined && typeof enabled !== 'boolean') {
      res.status(400).json({ error: 'Valeur enabled invalide' });
      return;
    }

    const updateData: any = {};
    if (enabled !== undefined) updateData.enabled = enabled;
    if (displayName !== undefined) updateData.displayName = displayName;
    if (description !== undefined) updateData.description = description;

    const provider = await PaymentProvider.findByIdAndUpdate(
      req.params.id,
      updateData,
      { new: true, runValidators: true }
    );

    if (!provider) {
      res.status(404).json({ error: 'Provider non trouvé' });
      return;
    }

    logger.info({ updateData }, `Payment provider ${req.params.id} updated by admin ${req.session.username}`);

    res.json(provider);
  } catch (error) {
    logger.error({ error }, 'Error updating payment provider');
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// Initialize default payment providers (only if no providers exist)
router.post('/api/providers/init', requireAuth, async (_req: Request, res: Response) => {
  try {
    const existingCount = await PaymentProvider.countDocuments();
    if (existingCount > 0) {
      res.status(400).json({ error: 'Les providers sont déjà configurés' });
      return;
    }

    const defaultProviders = [
      { name: 'paypal', enabled: true, displayName: 'PayPal', description: 'Paiement via PayPal' },
      { name: 'revolut', enabled: true, displayName: 'Revolut', description: 'Paiement via Revolut' },
      { name: 'stripe', enabled: true, displayName: 'Stripe', description: 'Paiement par carte bancaire via Stripe' },
    ];

    const providers = await PaymentProvider.insertMany(defaultProviders);

    logger.info(`Default payment providers initialized by admin ${_req.session.username}`);

    res.json(providers);
  } catch (error) {
    logger.error({ error }, 'Error initializing payment providers');
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// ==================== Admin Management (Super Admin Only) ====================

// Get all admins (super_admin only)
router.get('/api/admins', requireSuperAdmin, async (_req: Request, res: Response) => {
  try {
    const admins = await Admin.find()
      .select('-password')
      .sort({ createdAt: -1 });

    res.json(admins);
  } catch (error) {
    logger.error({ error }, 'Error fetching admins');
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// Delete admin (super_admin only, cannot delete yourself)
router.delete('/api/admins/:id', requireSuperAdmin, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    // Prevent self-deletion
    if (id === req.session.adminId) {
      res.status(400).json({ error: 'Vous ne pouvez pas supprimer votre propre compte' });
      return;
    }

    const admin = await Admin.findByIdAndDelete(id);

    if (!admin) {
      res.status(404).json({ error: 'Administrateur non trouvé' });
      return;
    }

    logger.info(`Admin ${admin.username} deleted by super admin ${req.session.username}`);

    res.json({ message: 'Administrateur supprimé avec succès' });
  } catch (error) {
    logger.error({ error }, 'Error deleting admin');
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

export default router;
