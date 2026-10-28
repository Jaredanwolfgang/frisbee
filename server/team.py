"""Player credentials and bounded avatar normalization for the shared team hub."""
import base64
import hashlib
import hmac
import io
import secrets
import warnings
from datetime import date


def password_hash(value):
    if not isinstance(value, str) or not 8 <= len(value) <= 128 or not value.strip():
        raise ValueError('队员口令需为 8–128 个字符。')
    salt = secrets.token_hex(16)
    digest = hashlib.pbkdf2_hmac('sha256', value.encode(), bytes.fromhex(salt), 600000).hex()
    return 'pbkdf2_sha256$600000$'+salt+'$'+digest


def password_matches(value, encoded):
    if not isinstance(value, str) or len(value) > 128 or not encoded:
        return False
    try:
        algorithm, rounds, salt, expected = encoded.split('$')
        if algorithm != 'pbkdf2_sha256' or int(rounds) != 600000:
            return False
        actual = hashlib.pbkdf2_hmac('sha256', value.encode(), bytes.fromhex(salt), int(rounds)).hex()
        return hmac.compare_digest(actual, expected)
    except (ValueError, TypeError):
        return False


def calendar_date(value, label):
    if not isinstance(value, str):
        raise ValueError(label+'需为 YYYY-MM-DD。')
    try:
        result = date.fromisoformat(value)
        if result.isoformat() != value:
            raise ValueError()
        return value
    except ValueError:
        raise ValueError(label+'需为 YYYY-MM-DD。') from None


def avatar_jpeg(encoded):
    from PIL import Image, ImageOps, UnidentifiedImageError
    if not isinstance(encoded, str) or len(encoded) > 2800000:
        raise ValueError('头像过大，请选择较小的图片。')
    try:
        raw = base64.b64decode(encoded, validate=True)
        if len(raw) > 2 * 1024 * 1024:
            raise ValueError('头像过大。')
        with warnings.catch_warnings():
            warnings.simplefilter('error', Image.DecompressionBombWarning)
            with Image.open(io.BytesIO(raw)) as image:
                if image.format not in {'JPEG', 'PNG', 'WEBP'} or image.width * image.height > 20000000:
                    raise ValueError('请使用 JPG、PNG 或 WebP 图片，分辨率不超过 2000 万像素。')
                image.load()
                square = ImageOps.fit(ImageOps.exif_transpose(image).convert('RGB'), (256, 256), method=Image.Resampling.LANCZOS)
                output = io.BytesIO()
                square.save(output, format='JPEG', quality=80, optimize=True)
                result = output.getvalue()
        if len(result) > 100000:
            raise ValueError('头像压缩后仍过大。')
        return result
    except (UnidentifiedImageError, OSError, Image.DecompressionBombError, Image.DecompressionBombWarning, base64.binascii.Error):
        raise ValueError('无法读取头像，请换一张 JPG、PNG 或 WebP 图片。') from None
