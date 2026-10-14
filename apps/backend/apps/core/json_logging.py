"""Logs de production : une ligne JSON par enregistrement, sur la sortie standard.

Message et trace d'exception passent par `mask_text` : ni e-mail, ni téléphone,
ni paramètre d'URL sensible. Les traces restent dans les logs du serveur, jamais
dans une réponse. Utilisé par LOGGING (config/settings/production.py) et par
gunicorn (gunicorn.conf.py), donc sans dépendance à Django.
"""

from __future__ import annotations

import json
import logging
from datetime import UTC, datetime

from apps.core.redaction import mask_text


class JsonFormatter(logging.Formatter):
    def format(self, record: logging.LogRecord) -> str:
        entry = {
            "time": datetime.fromtimestamp(record.created, UTC).isoformat(
                timespec="milliseconds"
            ),
            "level": record.levelname,
            "logger": record.name,
            "message": mask_text(record.getMessage()),
        }
        if record.exc_info:
            entry["exc"] = mask_text(self.formatException(record.exc_info))
        return json.dumps(entry, ensure_ascii=False)
