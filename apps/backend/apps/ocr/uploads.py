"""Réception d'un fichier en mémoire seulement (scan d'emballage, URS-109).

Par défaut, Django écrit sur disque (`TemporaryFileUploadHandler`) tout
fichier de plus de 2,5 Mo. La photo d'un scan ne doit jamais être stockée :
ce handler la garde en mémoire quelle que soit sa taille, et cesse d'écrire
au-delà de la borne pour qu'un envoi démesuré n'occupe pas la RAM. La taille
réelle reste transmise, et le serializer refuse alors le fichier.
"""
from __future__ import annotations

from django.core.files.uploadhandler import MemoryFileUploadHandler
from django.http import HttpRequest


class InMemoryOnlyUploadHandler(MemoryFileUploadHandler):
    def __init__(self, request: HttpRequest | None = None, *, max_bytes: int) -> None:
        super().__init__(request)
        self._max_bytes = max_bytes
        self._written = 0

    def handle_raw_input(self, *args: object, **kwargs: object) -> None:
        self.activated = True

    def new_file(self, *args: object, **kwargs: object) -> None:
        self._written = 0
        super().new_file(*args, **kwargs)

    def receive_data_chunk(self, raw_data: bytes, start: int) -> None:
        # Un octet de plus que la borne suffit à faire refuser le fichier.
        room = self._max_bytes + 1 - self._written
        if room > 0:
            chunk = raw_data[:room]
            self.file.write(chunk)
            self._written += len(chunk)
