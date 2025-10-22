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

// Page dashboard
router.get('/dashboard', requireAuthWeb, async (req: Request, res: Response) => {
  res.send(`
    <!DOCTYPE html>
    <html lang="fr">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Admin - Dashboard</title>
      <style>
        * {
          margin: 0;
          padding: 0;
          box-sizing: border-box;
        }
        body {
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
          background: #f5f5f5;
        }
        .header {
          background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
          color: white;
          padding: 20px 40px;
          display: flex;
          justify-content: space-between;
          align-items: center;
          box-shadow: 0 2px 10px rgba(0,0,0,0.1);
        }
        .header h1 {
          font-size: 24px;
        }
        .header-right {
          display: flex;
          gap: 20px;
          align-items: center;
        }
        .username {
          font-weight: 500;
        }
        .logout-btn {
          background: rgba(255,255,255,0.2);
          color: white;
          border: none;
          padding: 8px 16px;
          border-radius: 5px;
          cursor: pointer;
          font-size: 14px;
          transition: background 0.3s;
        }
        .logout-btn:hover {
          background: rgba(255,255,255,0.3);
        }
        .container {
          max-width: 1400px;
          margin: 0 auto;
          padding: 40px 20px;
        }
        .stats {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
          gap: 20px;
          margin-bottom: 40px;
        }
        .stat-card {
          background: white;
          padding: 25px;
          border-radius: 10px;
          box-shadow: 0 2px 10px rgba(0,0,0,0.05);
        }
        .stat-card h3 {
          color: #666;
          font-size: 14px;
          font-weight: 500;
          margin-bottom: 10px;
        }
        .stat-card .value {
          color: #333;
          font-size: 32px;
          font-weight: 700;
        }
        .stat-card .icon {
          font-size: 24px;
          margin-bottom: 10px;
        }
        .section {
          background: white;
          border-radius: 10px;
          padding: 30px;
          margin-bottom: 20px;
          box-shadow: 0 2px 10px rgba(0,0,0,0.05);
        }
        .section h2 {
          margin-bottom: 20px;
          color: #333;
        }
        .filters {
          display: flex;
          gap: 15px;
          margin-bottom: 20px;
          flex-wrap: wrap;
        }
        .filters input, .filters select {
          padding: 10px;
          border: 1px solid #ddd;
          border-radius: 5px;
          font-size: 14px;
        }
        .filters button {
          padding: 10px 20px;
          background: #667eea;
          color: white;
          border: none;
          border-radius: 5px;
          cursor: pointer;
          font-size: 14px;
        }
        table {
          width: 100%;
          border-collapse: collapse;
        }
        th {
          background: #f8f9fa;
          padding: 12px;
          text-align: left;
          font-weight: 600;
          color: #333;
          border-bottom: 2px solid #e9ecef;
        }
        td {
          padding: 12px;
          border-bottom: 1px solid #e9ecef;
        }
        tr:hover {
          background: #f8f9fa;
        }
        .badge {
          display: inline-block;
          padding: 4px 12px;
          border-radius: 12px;
          font-size: 12px;
          font-weight: 600;
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
        .loading {
          text-align: center;
          padding: 40px;
          color: #666;
        }
        .empty {
          text-align: center;
          padding: 40px;
          color: #999;
        }
        .action-btn {
          background: transparent;
          border: 1px solid #667eea;
          color: #667eea;
          padding: 4px 12px;
          border-radius: 4px;
          cursor: pointer;
          font-size: 12px;
          margin-right: 5px;
        }
        .action-btn:hover {
          background: #667eea;
          color: white;
        }
        .action-btn-danger {
          border-color: #dc3545;
          color: #dc3545;
        }
        .action-btn-danger:hover {
          background: #dc3545;
          color: white;
        }
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
        }
        .modal.show {
          display: flex;
        }
        .modal-content {
          background: white;
          border-radius: 10px;
          padding: 30px;
          max-width: 500px;
          width: 90%;
          box-shadow: 0 10px 40px rgba(0,0,0,0.3);
        }
        .modal-header {
          margin-bottom: 20px;
        }
        .modal-header h3 {
          margin: 0;
          color: #333;
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
          color: #333;
        }
        .modal-body input, .modal-body select {
          width: 100%;
          padding: 10px;
          border: 1px solid #ddd;
          border-radius: 5px;
          font-size: 14px;
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
        }
        .btn-primary {
          background: #667eea;
          color: white;
        }
        .btn-primary:hover {
          background: #5568d3;
        }
        .btn-secondary {
          background: #6c757d;
          color: white;
        }
        .btn-secondary:hover {
          background: #5a6268;
        }
        .btn-danger {
          background: #dc3545;
          color: white;
        }
        .btn-danger:hover {
          background: #c82333;
        }
      </style>
    </head>
    <body>
      <div class="header">
        <h1>📊 Panneau d'administration</h1>
        <div class="header-right">
          <span class="username">👤 ${req.session.username || 'Admin'}</span>
          <button class="logout-btn" onclick="logout()">Déconnexion</button>
        </div>
      </div>

      <div class="container">
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

      <script>
        let currentSubscriptionId = null;

        // Charger les statistiques
        async function loadStats() {
          try {
            const response = await fetch('/admin/api/stats');
            const data = await response.json();

            document.getElementById('totalUsers').textContent = data.totalUsers;
            document.getElementById('vipUsers').textContent = data.vipUsers;
            document.getElementById('activeSubscriptions').textContent = data.activeSubscriptions;
            document.getElementById('completedPayments').textContent = data.completedPayments;
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

              html += \`
                <tr>
                  <td>\${user.telegramId}</td>
                  <td>\${user.firstName || ''} \${user.lastName || ''}</td>
                  <td>@\${user.username || 'N/A'}</td>
                  <td>\${vipBadge}</td>
                  <td>\${vipUntil}</td>
                  <td>\${createdAt}</td>
                  <td>
                    <button class="action-btn" onclick="viewUserDetails('\${user._id}')">Détails</button>
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

            let html = '<table><thead><tr><th>Telegram ID</th><th>Montant</th><th>Devise</th><th>Provider</th><th>Statut</th><th>Date</th><th>Actions</th></tr></thead><tbody>';

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

              html += \`
                <tr>
                  <td>\${payment.telegramId}</td>
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

        // Voir les détails d'un utilisateur
        async function viewUserDetails(userId) {
          try {
            const response = await fetch(\`/admin/api/users/\${userId}\`);
            const user = await response.json();
            alert(JSON.stringify(user, null, 2));
          } catch (error) {
            console.error('Erreur:', error);
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

        // Fermer les modales en cliquant en dehors
        window.onclick = function(event) {
          const modal = document.getElementById('editModal');
          if (event.target === modal) {
            closeEditModal();
          }
        }

        // Charger toutes les données au démarrage
        loadStats();
        loadUsers();
        loadSubscriptions();
        loadPayments();

        // Rafraîchir les stats toutes les 30 secondes
        setInterval(loadStats, 30000);
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
    const [totalUsers, vipUsers, activeSubscriptions, completedPayments] = await Promise.all([
      User.countDocuments(),
      User.countDocuments({ isVip: true }),
      Subscription.countDocuments({ status: 'active' }),
      Payment.countDocuments({ status: 'completed' }),
    ]);

    res.json({
      totalUsers,
      vipUsers,
      activeSubscriptions,
      completedPayments,
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
