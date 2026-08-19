#!/usr/bin/env python3
"""One-time MTProto canary pairing for STIX.

The resulting session stays in VC Node's private mounted data volume with mode 0600.
It is a dedicated operator credential and must never be copied to a browser or logs.
"""

from __future__ import annotations

import argparse
import json
import os
import sys

from telethon.sync import TelegramClient
from telethon.errors import SessionPasswordNeededError


def required(name: str) -> str:
    value = os.environ.get(name, "").strip()
    if not value:
        raise RuntimeError(f"{name} is required")
    return value


def client_from_env(phone_argument: str | None) -> tuple[TelegramClient, str]:
    api_id = int(required("STIX_TELEGRAM_API_ID"))
    api_hash = required("STIX_TELEGRAM_API_HASH")
    phone = phone_argument or required("STIX_TELEGRAM_PHONE")
    session_path = os.environ.get("STIX_MTPROTO_SESSION_PATH", "/data/mtproto/operator")
    return TelegramClient(session_path, api_id, api_hash), phone


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("command", choices=("start", "confirm", "interactive"))
    parser.add_argument("--code")
    parser.add_argument("--phone-code-hash")
    parser.add_argument("--phone")
    args = parser.parse_args()

    client, phone = client_from_env(args.phone)

    client.connect()
    try:
        if args.command == "start":
            sent = client.send_code_request(phone)
            print(json.dumps({"phone_code_hash": sent.phone_code_hash}))
            return 0

        if args.command == "confirm":
            if not args.code or not args.phone_code_hash:
                raise RuntimeError("code and phone_code_hash are required")
            try:
                client.sign_in(phone=phone, code=args.code, phone_code_hash=args.phone_code_hash)
            except SessionPasswordNeededError:
                password = os.environ.get("STIX_TELEGRAM_TWO_STEP_PASSWORD", "")
                if not password:
                    raise RuntimeError("Telegram two-step password required")
                client.sign_in(password=password)
            me = client.get_me()
            print(json.dumps({"id": str(me.id), "username": me.username or ""}))
            return 0

        if not client.is_user_authorized():
            sent = client.send_code_request(phone)
            code = input("Enter the Telegram verification code: ").strip()
            client.sign_in(phone=phone, code=code, phone_code_hash=sent.phone_code_hash)
        me = client.get_me()
        identity = f"@{me.username}" if me.username else str(me.id)
        print(f"Verified Telegram operator: {identity}")
        print("Canary pairing complete. Exit with Ctrl-C.")
        input()
    finally:
        client.disconnect()

    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except KeyboardInterrupt:
        raise SystemExit(130)
    except Exception as error:
        print(f"Pairing failed: {error}", file=sys.stderr)
        raise SystemExit(1)
