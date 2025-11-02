#!/bin/bash

# Script pour basculer PayPal entre Sandbox et Live
# Usage: ./scripts/switch-paypal-mode.sh [sandbox|live]

set -e

APP_NAME="bot-telegram-vip"

# Couleurs pour l'output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Fonction pour afficher un message coloré
log_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

log_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

log_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Vérifier que fly CLI est installé
if ! command -v fly &> /dev/null; then
    log_error "Fly CLI n'est pas installé. Installez-le avec: curl -L https://fly.io/install.sh | sh"
    exit 1
fi

# Vérifier l'argument
if [ $# -ne 1 ]; then
    log_error "Usage: $0 [sandbox|live]"
    exit 1
fi

MODE=$1

if [ "$MODE" != "sandbox" ] && [ "$MODE" != "live" ]; then
    log_error "Mode invalide. Utilisez 'sandbox' ou 'live'"
    exit 1
fi

echo ""
log_info "======================================"
log_info "Basculement PayPal en mode: $MODE"
log_info "App: $APP_NAME"
log_info "======================================"
echo ""

# Afficher un avertissement pour le mode live
if [ "$MODE" == "live" ]; then
    log_warning "⚠️  ATTENTION : Vous allez passer en mode LIVE !"
    log_warning "    - Les paiements seront RÉELS (argent réel)"
    log_warning "    - Les frais PayPal seront appliqués"
    log_warning "    - Assurez-vous d'avoir configuré le webhook LIVE"
    echo ""
    read -p "Êtes-vous sûr de vouloir continuer ? (yes/no): " confirm
    if [ "$confirm" != "yes" ]; then
        log_info "Opération annulée."
        exit 0
    fi
fi

# Demander les credentials
echo ""
log_info "Entrez les credentials PayPal $MODE:"
echo ""

read -p "Client ID: " CLIENT_ID
if [ -z "$CLIENT_ID" ]; then
    log_error "Client ID requis"
    exit 1
fi

read -sp "Client Secret: " CLIENT_SECRET
echo ""
if [ -z "$CLIENT_SECRET" ]; then
    log_error "Client Secret requis"
    exit 1
fi

read -p "Webhook ID (optionnel, appuyez sur Entrée pour ignorer): " WEBHOOK_ID

# Confirmation
echo ""
log_info "Récapitulatif:"
log_info "  Mode: $MODE"
log_info "  Client ID: ${CLIENT_ID:0:20}..."
log_info "  Client Secret: ****** (masqué)"
if [ -n "$WEBHOOK_ID" ]; then
    log_info "  Webhook ID: $WEBHOOK_ID"
else
    log_warning "  Webhook ID: Non fourni (les webhooks ne fonctionneront pas)"
fi
echo ""

read -p "Continuer ? (yes/no): " final_confirm
if [ "$final_confirm" != "yes" ]; then
    log_info "Opération annulée."
    exit 0
fi

# Mise à jour des secrets
echo ""
log_info "Mise à jour des secrets Fly.io..."

if [ -n "$WEBHOOK_ID" ]; then
    fly secrets set \
        PAYPAL_CLIENT_ID="$CLIENT_ID" \
        PAYPAL_CLIENT_SECRET="$CLIENT_SECRET" \
        PAYPAL_WEBHOOK_ID="$WEBHOOK_ID" \
        PAYPAL_MODE="$MODE" \
        -a "$APP_NAME"
else
    fly secrets set \
        PAYPAL_CLIENT_ID="$CLIENT_ID" \
        PAYPAL_CLIENT_SECRET="$CLIENT_SECRET" \
        PAYPAL_MODE="$MODE" \
        -a "$APP_NAME"
fi

if [ $? -eq 0 ]; then
    log_success "✅ Secrets mis à jour avec succès!"
    echo ""
    log_info "L'application va redémarrer automatiquement..."
    sleep 5

    echo ""
    log_info "Vérification du statut..."
    fly status -a "$APP_NAME"

    echo ""
    log_info "Dernières lignes des logs:"
    fly logs -a "$APP_NAME" -n 20

    echo ""
    log_success "======================================"
    log_success "Basculement terminé avec succès!"
    log_success "======================================"
    echo ""

    if [ "$MODE" == "live" ]; then
        log_warning "⚠️  RAPPEL : Vous êtes maintenant en mode LIVE"
        log_warning "    - Testez avec un vrai paiement (votre propre compte)"
        log_warning "    - Surveillez les logs pendant 24h"
        log_warning "    - Vérifiez que les webhooks fonctionnent"
    fi

    echo ""
    log_info "Commandes utiles:"
    log_info "  Logs en temps réel: fly logs -a $APP_NAME"
    log_info "  Statut: fly status -a $APP_NAME"
    log_info "  Liste des secrets: fly secrets list -a $APP_NAME"
else
    log_error "❌ Échec de la mise à jour des secrets"
    exit 1
fi
