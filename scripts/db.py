"""Shared Supabase connection and table helpers."""

from __future__ import annotations

import os
from typing import Any

from dotenv import load_dotenv
from supabase import Client, create_client

load_dotenv()


class ConfigurationError(RuntimeError):
    """Raised when the simulator is not configured to access Supabase."""


def get_client() -> Client:
    url = os.getenv("SUPABASE_URL")
    key = os.getenv("SUPABASE_SERVICE_ROLE_KEY")
    if not url or not key:
        raise ConfigurationError(
            "Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in the environment."
        )
    return create_client(url, key)


def table(client: Client, schema: str, name: str) -> Any:
    """Return a PostgREST table scoped to one of the custom schemas."""
    return client.schema(schema).table(name)
