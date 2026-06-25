"""
Symmetric encryption for storing third-party API tokens at rest.

The Fernet key is derived from SECRET_KEY via HKDF — rotating SECRET_KEY will
invalidate all encrypted tokens, so do so deliberately.
"""
import base64
from functools import lru_cache

from cryptography.fernet import Fernet, InvalidToken
from cryptography.hazmat.primitives import hashes
from cryptography.hazmat.primitives.kdf.hkdf import HKDF

from app.core.config import settings


_HKDF_SALT = b"wealth-vault.token-encryption.v1"
_HKDF_INFO = b"fernet-key"


@lru_cache(maxsize=1)
def _fernet() -> Fernet:
    if not settings.SECRET_KEY or len(settings.SECRET_KEY) < 32:
        raise RuntimeError(
            "SECRET_KEY must be set and at least 32 chars for token encryption."
        )
    derived = HKDF(
        algorithm=hashes.SHA256(),
        length=32,
        salt=_HKDF_SALT,
        info=_HKDF_INFO,
    ).derive(settings.SECRET_KEY.encode("utf-8"))
    return Fernet(base64.urlsafe_b64encode(derived))


def encrypt_token(plaintext: str) -> str:
    return _fernet().encrypt(plaintext.encode("utf-8")).decode("utf-8")


def decrypt_token(ciphertext: str) -> str:
    try:
        return _fernet().decrypt(ciphertext.encode("utf-8")).decode("utf-8")
    except InvalidToken as exc:
        raise ValueError("Failed to decrypt token — SECRET_KEY may have changed") from exc
