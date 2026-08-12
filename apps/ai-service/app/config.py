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
# Le service transmet au provider :
# - le texte OCR de la facture ;
# - les scores de confiance et bboxes par ligne.
# Aucune image, aucune donnée PostgreSQL, aucune clé Mizan.
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
