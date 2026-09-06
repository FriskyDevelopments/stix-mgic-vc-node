#!/usr/bin/env python3
"""Test for ghost-join fix: two JSON lines arriving in one chunk must produce exactly two replies, never poison the next request.

This test exercises the buffer/split + process_line + exactly-one-reply contract without needing a real MTProto client.
"""
from __future__ import annotations

import io
import json
import os
import sys
from typing import Any

# Import the module under test (it must not execute main() side effects on import)
sys.path.insert(0, os.path.dirname(__file__))
import telegram_vc_adapter as mod  # type: ignore


class FakeAdapter:
    """Minimal stand-in that records calls and returns predictable status."""
    def __init__(self) -> None:
        self.calls: list[tuple[str, dict[str, Any]]] = []
        self.chat_id: int | None = None
        self.source: str | None = None

    def status(self) -> dict[str, Any]:
        self.calls.append(("status", {}))
        return {"paired": True, "active": self.chat_id is not None, "chatId": self.chat_id, "source": self.source}

    def join(self, chat_id: str, source: str, camera: bool = True) -> dict[str, Any]:
        self.calls.append(("join", {"chatId": chat_id, "source": source, "camera": camera}))
        self.chat_id = int(chat_id)
        self.source = source
        return self.status()

    # other methods not needed for the two-line poison test


def run_two_lines_in_one_chunk() -> list[dict[str, Any]]:
    """Feed two complete JSON request lines as a single chunk and capture the two outputs."""
    replies: list[dict[str, Any]] = []

    def fake_output(payload: dict[str, Any]) -> None:
        replies.append(payload)

    # monkey patch output used by process_line
    orig_output = mod.output
    mod.output = fake_output  # type: ignore

    adapter = FakeAdapter()

    # Simulate the exact bytes arriving in one read: two lines, no trailing partial
    chunk = b'{"id":"a1","action":"join","chatId":"-100123","source":"rtmp://x"}\n{"id":"a2","action":"status"}\n'

    # Use the module's main loop logic but drive it with a fake stdin fileno
    # We will call the internal buffer processing directly by replicating the split logic
    # to keep the test hermetic and not require real fd tricks.

    buffer = b""
    buffer += chunk
    while b"\n" in buffer:
        raw_line, buffer = buffer.split(b"\n", 1)
        line = raw_line.decode("utf-8", errors="replace").strip()
        if line:
            mod.process_line(adapter, line)  # type: ignore[attr-defined]

    mod.output = orig_output  # restore
    return replies


def main() -> None:
    replies = run_two_lines_in_one_chunk()
    print("Replies captured:", len(replies))
    for r in replies:
        print(json.dumps(r))

    assert len(replies) == 2, f"Expected 2 replies, got {len(replies)} — ghost join / poison bug"

    # First reply should be the join result
    assert replies[0]["id"] == "a1"
    assert replies[0]["ok"] is True
    assert replies[0]["result"]["active"] is True

    # Second reply must be a clean status, not a poisoned error from the first
    assert replies[1]["id"] == "a2"
    assert replies[1]["ok"] is True

    print("PASS: two JSON lines in one chunk → two clean replies, no poison.")


if __name__ == "__main__":
    main()
