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
