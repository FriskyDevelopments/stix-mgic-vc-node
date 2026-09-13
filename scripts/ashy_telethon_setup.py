#!/usr/bin/env python3
"""Ashy for-dummies Telethon pairing for dens / VC.

This is NOT BotFather. Dens needs a Telegram *user* session (MTProto):
api_id + api_hash from https://my.telegram.org, then phone + login code
(+ optional two-step password).

The session is the same Telethon file format used by
`scripts/mtproto_canary_pair.py` and `scripts/telegram_vc_adapter.py`.
It stays on the node's durable volume (default /data/mtproto/operator)
with mode 0600. It is never printed, never returned by an API, and
never belongs in Workers or chat.
"""

from __future__ import annotations

import argparse
import getpass
import json
import os
import re
import stat
import sys
import time
from collections.abc import Callable
from pathlib import Path
from typing import Any

DEFAULT_STATE_DIR = "/data/mtproto"
DEFAULT_SESSION_BASENAME = "operator"
MY_TELEGRAM_URL = "https://my.telegram.org"
PHONE_RE = re.compile(r"^\+[1-9]\d{7,14}$")
API_HASH_RE = re.compile(r"^[0-9a-fA-F]{32}$")
TENANT_RE = re.compile(r"^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$")
CODE_RE = re.compile(r"^[0-9]{4,8}$")

HELP_EPILOG = f"""
THIS IS NOT BOTFATHER.
A bot token from @BotFather cannot join a Telegram voice chat / dens.
Dens/VC uses your Telegram *user* account through Telethon.

Quick path (read docs/ASHY-TELETHON-FOR-DUMMIES.md for screenshots-in-words):

  1. Open {MY_TELEGRAM_URL} in a browser. Log in with the dedicated
     operator Telegram account (not your daily chat account if you can help it).
  2. Click "API development tools".
  3. Create an app if you do not have one (title + short name is enough).
  4. Copy App api_id (a number) and App api_hash (32 hex characters).
  5. Run this script. Paste when asked. We will not print them back.
  6. Enter the phone, then the login code Telegram sends, then 2FA if asked.
  7. Keep api_id / api_hash in vault / .env / wrangler secret / .dev.vars.
     The login session stays on this machine only.

Environment (optional — skips prompts when set):

  STIX_TELEGRAM_API_ID
  STIX_TELEGRAM_API_HASH
  STIX_TELEGRAM_PHONE
  STIX_MTPROTO_SESSION_PATH   default: /data/mtproto/operator
  MTPROTO_STATE_DIR           default: /data/mtproto

The session file is written with mode 0600 on the node disk only.
This script refuses to print api_hash, passwords, login codes, or session bytes.
"""


class SetupError(RuntimeError):
    """Safe, user-facing error. Must never include secrets or session bytes."""


def state_dir() -> Path:
    raw = os.environ.get("MTPROTO_STATE_DIR", "").strip()
    return Path(raw or DEFAULT_STATE_DIR)


def session_path(*, tenant: str | None = None, override: str | None = None) -> Path:
    if override:
        return Path(override)
    env = os.environ.get("STIX_MTPROTO_SESSION_PATH", "").strip()
    if env:
        return Path(env)
    root = state_dir()
    if tenant:
        return root / "tenants" / tenant / DEFAULT_SESSION_BASENAME
    return root / DEFAULT_SESSION_BASENAME


def session_file(path: Path) -> Path:
    return path if path.suffix == ".session" else path.with_name(path.name + ".session")


def verified_path(path: Path) -> Path:
    return path.parent / "verified.json"


def normalize_phone(value: str) -> str:
    return re.sub(r"[\s()-]", "", value.strip())


def parse_phone(value: str) -> str:
    phone = normalize_phone(value)
    if not PHONE_RE.match(phone):
        raise SetupError(
            "Enter the dedicated Telegram phone in international format, like +5215551234567."
        )
    return phone


def parse_api_id(value: str) -> int:
    raw = value.strip()
    if not raw.isdigit() or int(raw) <= 0:
        raise SetupError("api_id must be a positive number from my.telegram.org (API development tools).")
    return int(raw)


def parse_api_hash(value: str) -> str:
    raw = value.strip()
    if not API_HASH_RE.match(raw):
        raise SetupError(
            "api_hash must be the 32-character code from my.telegram.org. We will not print it."
        )
    return raw.lower()


def parse_tenant(value: str) -> str:
    raw = value.strip()
    if not TENANT_RE.match(raw):
        raise SetupError("Tenant id may only use letters, numbers, dot, dash, or underscore.")
    return raw


def parse_code(value: str) -> str:
    raw = value.strip()
    if not CODE_RE.match(raw):
        raise SetupError("Enter the numeric login code Telegram just sent (usually 5 digits).")
    return raw


def looks_secret(text: str, secrets: list[str]) -> bool:
    lowered = text.lower()
    for secret in secrets:
        if secret and secret.lower() in lowered:
            return True
    if re.search(r"\d{8,}:[A-Za-z0-9_-]{20,}", text):
        return True
    return False


def say(message: str, *, secrets: list[str] | None = None) -> None:
    if looks_secret(message, secrets or []):
        raise SetupError("Refusing to print a secret. Pairing stopped.")
    print(message, flush=True)


def prompt_line(label: str) -> str:
    try:
        return input(label).strip()
    except EOFError as error:
        raise SetupError("This step needs a terminal. Re-run the script in an interactive shell.") from error


def prompt_secret(label: str) -> str:
    try:
        return getpass.getpass(label).strip()
    except EOFError as error:
        raise SetupError("This step needs a terminal. Re-run the script in an interactive shell.") from error


def humanize_error(error: BaseException) -> str:
    name = type(error).__name__
    seconds = getattr(error, "seconds", None)
    if "FloodWait" in name:
        wait = int(seconds) if isinstance(seconds, int) else None
        if wait and wait >= 60:
            minutes = max(1, (wait + 59) // 60)
            return (
                f"Telegram asked us to wait about {minutes} minute(s). "
                "You tried too many times. Wait, then run this script again."
            )
        return "Telegram asked us to wait a bit (FloodWait). Try again in a few minutes."
    if "PhoneCodeInvalid" in name:
        return "That login code was wrong. Open Telegram, copy the newest code, and run this again."
    if "PhoneCodeExpired" in name:
        return "That login code expired. Run this again and use the new code Telegram sends."
    if "PasswordHashInvalid" in name or ("PasswordRequired" in name and "Session" not in name):
        return "That two-step password was wrong. Try again. We never store it."
    if "SessionPasswordNeeded" in name:
        return "This account has two-step verification. Enter that password when asked."
    if "PhoneNumberInvalid" in name:
        return "Telegram did not accept that phone number. Use international format, like +5215551234567."
    if "PhoneNumberBanned" in name or "UserDeactivated" in name:
        return "Telegram rejected this account. Use a dedicated operator account that can still log in."
    if "AuthRestart" in name or "FreshResetAuthorisation" in name:
        return "Telegram asked to start over. Run the script again."
    if isinstance(error, SetupError):
        return str(error)
    return "Pairing failed. Check the phone, the login code, and that this is not a BotFather token."


def ensure_session_dir(path: Path) -> None:
    directory = path.parent
    try:
        directory.mkdir(parents=True, exist_ok=True, mode=0o700)
    except OSError as error:
        raise SetupError(
            f"Cannot create {directory}. Mount the durable volume or set STIX_MTPROTO_SESSION_PATH "
            "to a private folder on this machine."
        ) from error
    try:
        os.chmod(directory, 0o700)
    except OSError:
        pass
    probe = directory / ".stix-mtproto-write-test"
    try:
        probe.write_text("ok", encoding="utf-8")
        probe.unlink()
    except OSError as error:
        raise SetupError(
            f"Cannot write under {directory}. Mount /data or set STIX_MTPROTO_SESSION_PATH."
        ) from error


def lock_session_files(path: Path) -> list[str]:
    locked: list[str] = []
    candidates = [
        session_file(path),
        session_file(path).with_name(session_file(path).name + "-journal"),
        verified_path(path),
    ]
    for candidate in candidates:
        if not candidate.exists() or not candidate.is_file():
            continue
        os.chmod(candidate, stat.S_IRUSR | stat.S_IWUSR)
        locked.append(str(candidate))
    return locked


def write_verified(path: Path, user_id: str, username: str) -> None:
    payload = {"id": user_id, "username": username, "verifiedAt": int(time.time() * 1000)}
    target = verified_path(path)
    target.write_text(json.dumps(payload), encoding="utf-8")
    os.chmod(target, stat.S_IRUSR | stat.S_IWUSR)


def credentials_from_env() -> tuple[int | None, str, str]:
    api_id_raw = os.environ.get("STIX_TELEGRAM_API_ID", "").strip()
    api_hash = os.environ.get("STIX_TELEGRAM_API_HASH", "").strip()
    phone = os.environ.get("STIX_TELEGRAM_PHONE", "").strip()
    api_id = parse_api_id(api_id_raw) if api_id_raw else None
    if api_hash:
        api_hash = parse_api_hash(api_hash)
    if phone:
        phone = parse_phone(phone)
    return api_id, api_hash, phone


def collect_credentials(args: argparse.Namespace) -> tuple[int, str, str]:
    api_id, api_hash, phone = credentials_from_env()
    if args.api_id:
        api_id = parse_api_id(args.api_id)
    if args.phone:
        phone = parse_phone(args.phone)

    if api_id is None:
        say(f"Open {MY_TELEGRAM_URL} → log in → click API development tools.")
        say("Create an app if you need one, then copy App api_id (the number).")
        api_id = parse_api_id(prompt_line("api_id: "))
    if not api_hash:
        say("Now paste App api_hash. Typing is hidden. We will not print it.")
        api_hash = parse_api_hash(prompt_secret("api_hash (hidden): "))
    if not phone:
        say("Phone for this operator account, international format.")
        phone = parse_phone(prompt_line("phone (+country…): "))
    return api_id, api_hash, phone


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        prog="ashy_telethon_setup",
        description="Pair a Telegram user session for dens / VC. Not BotFather.",
        epilog=HELP_EPILOG,
        formatter_class=argparse.RawDescriptionHelpFormatter,
    )
    parser.add_argument(
        "--check",
        "--dry-run",
        dest="check",
        action="store_true",
        help="Validate inputs and the session folder. Do not contact Telegram. Do not print secrets.",
    )
    parser.add_argument("--api-id", help="App api_id from my.telegram.org (or set STIX_TELEGRAM_API_ID).")
    parser.add_argument("--phone", help="Operator phone, like +5215551234567 (or set STIX_TELEGRAM_PHONE).")
    parser.add_argument(
        "--tenant",
        help="Write the session under /data/mtproto/tenants/<id>/operator instead of the default path.",
    )
    parser.add_argument("--session-path", help="Override STIX_MTPROTO_SESSION_PATH (advanced).")
    parser.add_argument(
        "--force",
        action="store_true",
        help="Pair again even if a session already exists on this node.",
    )
    return parser


def resolve_session_path(args: argparse.Namespace) -> Path:
    tenant = parse_tenant(args.tenant) if args.tenant else None
    return session_path(tenant=tenant, override=args.session_path)


def check_only(args: argparse.Namespace) -> int:
    secrets: list[str] = []
    api_id, api_hash, phone = credentials_from_env()
    if args.api_id:
        api_id = parse_api_id(args.api_id)
    if args.phone:
        phone = parse_phone(args.phone)
    if api_hash:
        secrets.append(api_hash)
    if phone:
        secrets.append(phone)
    if api_id is None:
        raise SetupError("Missing api_id. Pass --api-id or set STIX_TELEGRAM_API_ID, or run without --check to be prompted.")
    if not api_hash:
        raise SetupError("Missing api_hash. Set STIX_TELEGRAM_API_HASH, or run without --check to paste it hidden.")
    if not phone:
        raise SetupError("Missing phone. Pass --phone or set STIX_TELEGRAM_PHONE, or run without --check to be prompted.")
    path = resolve_session_path(args)
    ensure_session_dir(path)
    say("Inputs look valid. Session folder is writable.", secrets=secrets)
    say("This is NOT BotFather. Dens uses the Telethon user session on this node.", secrets=secrets)
    say(f"When you pair for real, the session file stays next to {path.name} with mode 0600.", secrets=secrets)
    say("Run the same command without --check to log in.", secrets=secrets)
    return 0


def import_telethon() -> tuple[Any, Any, Any]:
    try:
        from telethon.errors import FloodWaitError, SessionPasswordNeededError
        from telethon.sync import TelegramClient
    except ImportError as error:
        raise SetupError(
            "Python package 'telethon' is not installed. The Ashy container image already has it "
            "(see Dockerfile). Do not paste credentials into chat while installing packages."
        ) from error
    return TelegramClient, SessionPasswordNeededError, FloodWaitError


def pair(
    *,
    api_id: int,
    api_hash: str,
    phone: str,
    path: Path,
    force: bool,
    read_code: Callable[[], str] | None = None,
    read_password: Callable[[], str] | None = None,
    client_factory: Callable[..., Any] | None = None,
) -> dict[str, str]:
    secrets = [api_hash, phone]
    ensure_session_dir(path)
    existing = session_file(path)
    factory = client_factory or import_telethon()[0]
    client = factory(str(path), api_id, api_hash)
    try:
        client.connect()
        if client.is_user_authorized() and not force:
            me = client.get_me()
            username = getattr(me, "username", "") or ""
            user_id = str(getattr(me, "id", "") or "")
            identity = f"@{username}" if username else user_id or "this operator"
            write_verified(path, user_id, username)
            lock_session_files(path)
            say(f"Already paired as {identity}. Nothing else to do.", secrets=secrets)
            say("Session stays on this node only. We did not print credentials.", secrets=secrets)
            return {"id": user_id, "username": username, "status": "already_paired"}

        if existing.exists() and force:
            say("Re-pairing this node. The old session on disk will be replaced.", secrets=secrets)

        say("Telegram will send a login code to that account now.", secrets=secrets)
        try:
            sent = client.send_code_request(phone)
        except Exception as error:
            raise SetupError(humanize_error(error)) from error

        code_reader = read_code or (lambda: parse_code(prompt_line("Login code from Telegram: ")))
        code = parse_code(code_reader())
        secrets.append(code)
        password_needed = False
        try:
            client.sign_in(phone=phone, code=code, phone_code_hash=sent.phone_code_hash)
        except Exception as error:
            if type(error).__name__ == "SessionPasswordNeededError":
                password_needed = True
            else:
                raise SetupError(humanize_error(error)) from error

        if password_needed:
            say("This account has two-step verification. Typing is hidden.", secrets=secrets)
            password_reader = read_password or (lambda: prompt_secret("Two-step password (hidden): "))
            password = password_reader()
            if not password:
                raise SetupError("This Telegram account needs its two-step password to finish pairing.")
            secrets.append(password)
            try:
                client.sign_in(password=password)
            except Exception as error:
                raise SetupError(humanize_error(error)) from error

        if not client.is_user_authorized():
            raise SetupError("Telegram did not finish login. Run the script again with a fresh code.")
        me = client.get_me()
        username = getattr(me, "username", "") or ""
        user_id = str(getattr(me, "id", "") or "")
        identity = f"@{username}" if username else user_id or "the operator account"
        write_verified(path, user_id, username)
        lock_session_files(path)
        say(f"Success. Paired dens / VC as {identity}.", secrets=secrets)
        say("The login session is on this node's disk only (mode 0600).", secrets=secrets)
        say("Keep STIX_TELEGRAM_API_ID and STIX_TELEGRAM_API_HASH in vault / .env / wrangler secret / .dev.vars.", secrets=secrets)
        say("Never paste api_hash, the session file, or a BotFather token in chat.", secrets=secrets)
        say("Next: open a dens group call and test from the operator studio.", secrets=secrets)
        return {"id": user_id, "username": username, "status": "paired"}
    finally:
        try:
            client.disconnect()
        except Exception:
            pass
        lock_session_files(path)


def main(argv: list[str] | None = None) -> int:
    parser = build_parser()
    args = parser.parse_args(argv)
    try:
        if args.check:
            return check_only(args)
        api_id, api_hash, phone = collect_credentials(args)
        path = resolve_session_path(args)
        pair(api_id=api_id, api_hash=api_hash, phone=phone, path=path, force=args.force)
        return 0
    except KeyboardInterrupt:
        say("Cancelled. Nothing extra was printed.")
        return 130
    except SetupError as error:
        print(f"Could not pair: {error}", file=sys.stderr)
        return 1
    except Exception as error:
        print(f"Could not pair: {humanize_error(error)}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
