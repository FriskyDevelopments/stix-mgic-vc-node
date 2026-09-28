"""Offline tests for the Ashy Telethon for-dummies wizard."""

from __future__ import annotations

import io
import json
import os
import stat
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path
from types import SimpleNamespace as NS
from unittest.mock import patch

ROOT = Path(__file__).resolve().parent
sys.path.insert(0, str(ROOT))

import ashy_telethon_setup as setup  # noqa: E402


HASH = "0123456789abcdef0123456789abcdef"
PHONE = "+5215551234567"


class FloodWaitError(Exception):
    def __init__(self, seconds: int):
        self.seconds = seconds
        super().__init__(f"wait {seconds} (secret={HASH})")


class SessionPasswordNeededError(Exception):
    pass


class PhoneCodeInvalidError(Exception):
    pass


class FakeClient:
    def __init__(self, path: str, api_id: int, api_hash: str, **_kwargs):
        self.path = path
        self.api_id = api_id
        self.api_hash = api_hash
        self.authorized = False
        self.need_password = False
        self.flood = False
        self.bad_code = False
        self.connected = False
        self.signed_password = False
        self.me = NS(id=8888816358, username="Ashy6942")

    def connect(self) -> None:
        self.connected = True

    def disconnect(self) -> None:
        self.connected = False

    def is_user_authorized(self) -> bool:
        return self.authorized

    def send_code_request(self, phone: str):
        if self.flood:
            raise FloodWaitError(180)
        return NS(phone_code_hash="not-for-logs")

    def sign_in(self, **kwargs):
        if "password" in kwargs:
            self.signed_password = True
            self.authorized = True
            return
        if self.bad_code:
            raise PhoneCodeInvalidError("wrong")
        if self.need_password:
            raise SessionPasswordNeededError()
        self.authorized = True

    def get_me(self):
        return self.me


class ValidationTests(unittest.TestCase):
    def test_phone_and_api_id_and_hash(self) -> None:
        self.assertEqual(setup.parse_phone("+52 155 5123 4567"), PHONE)
        with self.assertRaises(setup.SetupError):
            setup.parse_phone("5551234567")
        self.assertEqual(setup.parse_api_id("123456"), 123456)
        with self.assertRaises(setup.SetupError):
            setup.parse_api_id("0")
        self.assertEqual(setup.parse_api_hash(HASH.upper()), HASH)
        with self.assertRaises(setup.SetupError):
            setup.parse_api_hash("123456789:AAHnotabotbutwrong")

    def test_session_paths_match_existing_format(self) -> None:
        env = {key: value for key, value in os.environ.items() if key not in {"STIX_MTPROTO_SESSION_PATH", "MTPROTO_STATE_DIR"}}
        with patch.dict(os.environ, env, clear=True):
            self.assertEqual(setup.session_path(), Path("/data/mtproto/operator"))
            self.assertEqual(
                setup.session_path(tenant="t1"),
                Path("/data/mtproto/tenants/t1/operator"),
            )
        self.assertEqual(
            setup.session_file(Path("/data/mtproto/operator")),
            Path("/data/mtproto/operator.session"),
        )
        with self.assertRaises(setup.SetupError):
            setup.parse_tenant("../escape")

    def test_humanize_does_not_echo_sdk_secrets(self) -> None:
        message = setup.humanize_error(FloodWaitError(180))
        self.assertIn("minute", message)
        self.assertNotIn(HASH, message)
        self.assertNotIn("secret=", message)
        self.assertIn("wrong", setup.humanize_error(PhoneCodeInvalidError("x")).lower())
        self.assertIn("two-step", setup.humanize_error(SessionPasswordNeededError()).lower())

    def test_say_refuses_to_print_secrets(self) -> None:
        with self.assertRaises(setup.SetupError):
            setup.say(f"hash is {HASH}", secrets=[HASH])
        with self.assertRaises(setup.SetupError):
            setup.say("token 1234567890:AAHabcdefghijklmnopqrstuvwxyz", secrets=[])


class HelpAndCheckTests(unittest.TestCase):
    def test_help_mentions_my_telegram_and_not_botfather(self) -> None:
        result = subprocess.run(
            [sys.executable, str(ROOT / "ashy_telethon_setup.py"), "--help"],
            check=False,
            capture_output=True,
            text=True,
        )
        self.assertEqual(result.returncode, 0, result.stderr)
        blob = result.stdout
        self.assertIn("my.telegram.org", blob)
        self.assertIn("NOT BOTFATHER", blob)
        self.assertIn("STIX_TELEGRAM_API_ID", blob)
        self.assertIn("STIX_TELEGRAM_API_HASH", blob)
        self.assertIn("0600", blob)
        self.assertNotIn(HASH, blob)
        self.assertNotRegex(blob, r"\d{10}:[A-Za-z0-9_-]{20,}")

    def test_check_validates_and_does_not_print_hash(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            env = os.environ.copy()
            env.update(
                {
                    "STIX_TELEGRAM_API_ID": "123456",
                    "STIX_TELEGRAM_API_HASH": HASH,
                    "STIX_TELEGRAM_PHONE": PHONE,
                }
            )
            result = subprocess.run(
                [
                    sys.executable,
                    str(ROOT / "ashy_telethon_setup.py"),
                    "--dry-run",
                    "--session-path",
                    str(Path(tmp) / "operator"),
                ],
                check=False,
                capture_output=True,
                text=True,
                env=env,
            )
            self.assertEqual(result.returncode, 0, result.stderr)
            self.assertIn("NOT BotFather", result.stdout)
            self.assertNotIn(HASH, result.stdout)
            self.assertNotIn(HASH, result.stderr)
            self.assertNotIn(PHONE, result.stdout)

    def test_check_rejects_bad_phone(self) -> None:
        result = subprocess.run(
            [
                sys.executable,
                str(ROOT / "ashy_telethon_setup.py"),
                "--check",
                "--api-id",
                "1",
                "--phone",
                "555",
            ],
            check=False,
            capture_output=True,
            text=True,
            env={**os.environ, "STIX_TELEGRAM_API_HASH": HASH},
        )
        self.assertNotEqual(result.returncode, 0)
        self.assertIn("international", result.stderr.lower())
        self.assertNotIn(HASH, result.stderr)


class PairingTests(unittest.TestCase):
    def test_lock_session_is_0600(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / "operator"
            session = setup.session_file(path)
            session.write_bytes(b"sqlite-bytes-must-not-be-printed")
            setup.lock_session_files(path)
            mode = stat.S_IMODE(session.stat().st_mode)
            self.assertEqual(mode, 0o600)

    def test_pair_writes_verified_json_and_skips_existing(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / "operator"
            client = FakeClient(str(path), 1, HASH)
            client.authorized = True
            with patch.object(setup, "say"):
                result = setup.pair(
                    api_id=1,
                    api_hash=HASH,
                    phone=PHONE,
                    path=path,
                    force=False,
                    client_factory=lambda *_args, **_kwargs: client,
                )
            self.assertEqual(result["status"], "already_paired")
            verified = json.loads(setup.verified_path(path).read_text(encoding="utf-8"))
            self.assertEqual(verified["username"], "Ashy6942")
            self.assertEqual(stat.S_IMODE(setup.verified_path(path).stat().st_mode), 0o600)

    def test_pair_handles_2fa_and_floodwait(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / "operator"
            client = FakeClient(str(path), 1, HASH)
            client.need_password = True
            with patch.object(setup, "say"):
                result = setup.pair(
                    api_id=1,
                    api_hash=HASH,
                    phone=PHONE,
                    path=path,
                    force=False,
                    read_code=lambda: "12345",
                    read_password=lambda: "hidden-password",
                    client_factory=lambda *_args, **_kwargs: client,
                )
            self.assertEqual(result["status"], "paired")
            self.assertTrue(client.signed_password)

            flooded = FakeClient(str(path), 1, HASH)
            flooded.flood = True
            with patch.object(setup, "say"), self.assertRaises(setup.SetupError) as caught:
                setup.pair(
                    api_id=1,
                    api_hash=HASH,
                    phone=PHONE,
                    path=path,
                    force=True,
                    client_factory=lambda *_args, **_kwargs: flooded,
                )
            self.assertNotIn(HASH, str(caught.exception))
            self.assertIn("wait", str(caught.exception).lower())

    def test_main_check_missing_hash(self) -> None:
        buf = io.StringIO()
        env = {"STIX_TELEGRAM_API_ID": "1", "STIX_TELEGRAM_PHONE": PHONE}
        with patch.dict(os.environ, env, clear=False), patch.object(sys, "stderr", buf):
            os.environ.pop("STIX_TELEGRAM_API_HASH", None)
            code = setup.main(["--check", "--session-path", "/tmp/x/operator"])
        self.assertEqual(code, 1)
        self.assertIn("api_hash", buf.getvalue())


if __name__ == "__main__":
    unittest.main()
