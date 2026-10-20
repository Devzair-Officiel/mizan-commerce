"""Configuration du service IA — variables d'environnement.

Volontairement minimaliste : `os.environ` suffit pour trois variables, on
évite d'ajouter `pydantic-settings` juste pour ça. Aucune valeur secrète par
défaut : si `AI_SERVICE_API_KEY` est absent en runtime, l'authentification
service-to-service refusera systématiquement toute requête.
"""
from __future__ import annotations

import os

SERVICE_NAME = 'mizan-ai'

# Environnement applicatif (development, staging, production). Utile pour
# distinguer les logs et adapter le comportement en cas de besoin ; pas de
# valeur sensible ici, donc un défaut lisible est acceptable.
APP_ENV: str = os.environ.get('APP_ENV', 'development')

# Clé partagée avec Django/Celery pour authentifier les appels internes.
# Aucun défaut : une clé faible en dur serait pire que pas de clé du tout,
# car elle pourrait fuiter par erreur dans une image.
API_KEY: str = os.environ.get('AI_SERVICE_API_KEY', '')


# ─── Provider LLM (extraction structurée de facture, POC 6A) ──────────────
#
# Pour une facture, le service transmet au provider :
# - le texte OCR de la facture ;
# - les scores de confiance et bboxes par ligne.
# Aucune image de facture, aucune donnée PostgreSQL, aucune clé Mizan.
#
# Seul le scan d'emballage (`/internal/product-scan/vision`, voir `vision/`)
# envoie une image au fournisseur, et seulement en secours : Django ne
# l'appelle que si la lecture locale (code-barres, OCR) reste incertaine.
# L'image est alors réduite et ré-encodée sans métadonnées (GPS compris).
#
# L'endpoint /internal/invoice/structure refuse toute requête si la clé
# OpenAI n'est pas configurée (503 générique) : mieux vaut échouer visible
# qu'accepter silencieusement de laisser fuiter des factures sans provider.
OPENAI_API_KEY: str = os.environ.get('OPENAI_API_KEY', '')

# Modèle par défaut choisi pour le POC : `gpt-5-mini` — compromis
# qualité/coût raisonnable pour une extraction structurée courte. On
# rend le nom configurable pour A/B tester d'autres modèles sans
# rebuild image.
OPENAI_INVOICE_MODEL: str = os.environ.get('OPENAI_INVOICE_MODEL', 'gpt-5-mini')

# Timeout unifié (secondes) sur l'appel provider. Volontairement plus
# long que l'OCR : le LLM peut prendre plusieurs dizaines de secondes
# sur une facture dense. On garde une borne pour ne jamais bloquer
# indéfiniment un worker.
OPENAI_INVOICE_TIMEOUT_SECONDS: float = float(
    os.environ.get('OPENAI_INVOICE_TIMEOUT_SECONDS', '45'),
)


# ─── Fournisseur IA du scan d'emballage ───────────────────────────────────
#
# Deux niveaux, chacun désactivable :
# 1. structuration du texte : les lignes OCR (texte seul, aucune image) partent
#    vers le fournisseur dès que `VISION_PROVIDER` en désigne un ;
# 2. secours image : la photo de face ne part que si, en plus,
#    `PRODUCT_SCAN_IMAGE_FALLBACK` est vrai.
# `none` (défaut) : rien ne sort, le scan s'en tient au code-barres et aux
# règles locales. Valeurs reconnues : voir `vision/registry.py`. Une valeur
# inconnue ou une clé absente désactive aussi les deux niveaux, sans erreur.
VISION_PROVIDER: str = os.environ.get('VISION_PROVIDER', 'none').strip().lower()

# Faux par défaut : la structuration du texte peut être active sans qu'aucune
# image ne quitte le service.
PRODUCT_SCAN_IMAGE_FALLBACK: bool = (
    os.environ.get('PRODUCT_SCAN_IMAGE_FALLBACK', 'false').strip().lower() in ('1', 'true', 'yes', 'on')
)

# Modèle texte de la structuration ; même défaut que la facture.
PRODUCT_TEXT_MODEL: str = os.environ.get('PRODUCT_TEXT_MODEL', '') or OPENAI_INVOICE_MODEL

# Une requête texte courte : bien plus rapide qu'une image. Le total (texte puis
# éventuel secours image) reste sous `AI_SERVICE_PRODUCT_SCAN_TIMEOUT_SECONDS`
# côté Django pour la lecture locale.
PRODUCT_TEXT_TIMEOUT_SECONDS: float = float(os.environ.get('PRODUCT_TEXT_TIMEOUT_SECONDS', '15'))

# Modèle du fournisseur ; par défaut le même que l'extraction de facture, pour
# n'avoir qu'un modèle à surveiller tant que les tests de coût sont en cours.
VISION_MODEL: str = os.environ.get('VISION_MODEL', '') or OPENAI_INVOICE_MODEL

# Plus court que la facture : un emballage est une seule image, et
# l'utilisateur attend la réponse devant son formulaire.
VISION_TIMEOUT_SECONDS: float = float(os.environ.get('VISION_TIMEOUT_SECONDS', '30'))
