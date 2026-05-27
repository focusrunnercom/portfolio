#!/usr/bin/env python3
"""
FocusRunner Google OAuth Setup — Headless OAuth 2.0 for GSC + GA4
==================================================================
Generates a refresh token for Google Search Console and Google Analytics
APIs without a browser on the server. Uses the Desktop App OAuth flow:
you visit a URL on any device, authorize, paste the code back.

Usage:
  export GOOGLE_CLIENT_ID="your-client-id.apps.googleusercontent.com"
  export GOOGLE_CLIENT_SECRET="your-secret"
  python3 scripts/google-oauth-setup.py

Output:
  GOOGLE_CLIENT_ID=...
  GOOGLE_CLIENT_SECRET=...
  GOOGLE_REFRESH_TOKEN=...

Environment:
  GOOGLE_CLIENT_ID       — OAuth 2.0 Client ID (required)
  GOOGLE_CLIENT_SECRET   — OAuth 2.0 Client Secret (required)
  GOOGLE_OAUTH_SCOPES    — space-separated scopes (default: GSC + GA4 read)
  GOOGLE_REDIRECT_PORT   — port for local redirect (default: 8080)
  GOOGLE_NO_BROWSER      — set to 1 to force copy-paste mode

Scopes configured:
  - https://www.googleapis.com/auth/webmasters.readonly   (GSC)
  - https://www.googleapis.com/auth/analytics.readonly    (GA4)
"""

import os
import sys
import json
import socket
import hashlib
import base64
import secrets
import urllib.parse
import http.server
import threading
import webbrowser
from pathlib import Path

DEFAULT_SCOPES = [
    "https://www.googleapis.com/auth/webmasters.readonly",
    "https://www.googleapis.com/auth/analytics.readonly",
]

OAUTH_AUTH_URL = "https://accounts.google.com/o/oauth2/auth"
OAUTH_TOKEN_URL = "https://oauth2.googleapis.com/token"


def get_free_port() -> int:
    """Find a free port on localhost."""
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        s.bind(("127.0.0.1", 0))
        return s.getsockname()[1]


def build_auth_url(client_id: str, scopes: list[str], redirect_uri: str, state: str,
                   code_challenge: str) -> str:
    params = {
        "client_id": client_id,
        "scope": " ".join(scopes),
        "response_type": "code",
        "redirect_uri": redirect_uri,
        "state": state,
        "access_type": "offline",
        "prompt": "consent",
        "code_challenge": code_challenge,
        "code_challenge_method": "S256",
    }
    return f"{OAUTH_AUTH_URL}?{urllib.parse.urlencode(params)}"


def exchange_code(client_id: str, client_secret: str, code: str,
                  redirect_uri: str, code_verifier: str) -> dict:
    """Exchange authorization code for tokens."""
    import urllib.request

    data = urllib.parse.urlencode({
        "client_id": client_id,
        "client_secret": client_secret,
        "code": code,
        "redirect_uri": redirect_uri,
        "grant_type": "authorization_code",
        "code_verifier": code_verifier,
    }).encode()

    req = urllib.request.Request(OAUTH_TOKEN_URL, data=data)
    req.add_header("Content-Type", "application/x-www-form-urlencoded")

    with urllib.request.urlopen(req) as resp:
        return json.loads(resp.read())


def test_token(token: str) -> bool:
    """Quick test that the token works for GSC."""
    import urllib.request

    req = urllib.request.Request(
        "https://www.googleapis.com/oauth2/v3/tokeninfo",
        headers={"Authorization": f"Bearer {token}"},
    )
    try:
        with urllib.request.urlopen(req) as resp:
            info = json.loads(resp.read())
            print(f"  ✓ Token valid for: {info.get('email', 'unknown')}")
            print(f"  ✓ Scopes: {info.get('scope', 'unknown')}")
            return True
    except Exception as e:
        print(f"  ✗ Token verification failed: {e}")
        return False


def interactive_mode(client_id: str, client_secret: str, scopes: list[str]) -> dict | None:
    """
    Interactive OAuth flow: start a local HTTP server, open browser (or print URL),
    capture redirect, exchange code for tokens.
    """
    port = int(os.environ.get("GOOGLE_REDIRECT_PORT", str(get_free_port())))
    redirect_uri = f"http://127.0.0.1:{port}"

    # PKCE
    code_verifier = base64.urlsafe_b64encode(secrets.token_bytes(32)).rstrip(b"=").decode()
    code_challenge = base64.urlsafe_b64encode(
        hashlib.sha256(code_verifier.encode()).digest()
    ).rstrip(b"=").decode()
    state = secrets.token_hex(16)

    auth_url = build_auth_url(client_id, scopes, redirect_uri, state, code_challenge)

    result = {"code": None, "error": None}
    server_ready = threading.Event()

    class OAuthHandler(http.server.BaseHTTPRequestHandler):
        def do_GET(self):
            parsed = urllib.parse.urlparse(self.path)
            params = urllib.parse.parse_qs(parsed.query)

            if "code" in params:
                result["code"] = params["code"][0]
                self.send_response(200)
                self.send_header("Content-Type", "text/html; charset=utf-8")
                self.end_headers()
                self.wfile.write(b"<html><body><h2>Authorization successful!</h2><p>You may close this window.</p></body></html>")
            elif "error" in params:
                result["error"] = params.get("error", ["unknown"])[0]
                self.send_response(400)
                self.end_headers()
            else:
                self.send_response(404)
                self.end_headers()

        def log_message(self, format, *args):
            pass  # Suppress logs

    server = http.server.HTTPServer(("127.0.0.1", port), OAuthHandler)
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    server_ready.set()

    try:
        print(f"\n🔗 Open this URL in a browser:\n\n{auth_url}\n")

        no_browser = os.environ.get("GOOGLE_NO_BROWSER", "0") == "1"
        if not no_browser:
            try:
                webbrowser.open(auth_url)
                print("(Browser should open automatically. If not, copy the URL above.)\n")
            except Exception:
                pass

        print("Waiting for authorization... ", end="", flush=True)

        timeout = 300  # 5 minutes
        elapsed = 0
        while result["code"] is None and result["error"] is None and elapsed < timeout:
            threading.Event().wait(1)
            elapsed += 1

        server.shutdown()

        if result["error"]:
            print(f"\n❌ Authorization error: {result['error']}")
            return None
        elif result["code"] is None:
            print("\n❌ Timed out waiting for authorization.")
            return None

        print("done!")

        print("Exchanging authorization code for tokens... ", end="", flush=True)
        tokens = exchange_code(client_id, client_secret, result["code"],
                               redirect_uri, code_verifier)
        print("done!")

        access_token = tokens.get("access_token")
        refresh_token = tokens.get("refresh_token")

        if not refresh_token:
            print("❌ No refresh token returned. Did you authorize this app before?")
            print("   Revoke access at https://myaccount.google.com/permissions and retry.")
            return None

        print(f"\n✅ Access token obtained")
        if access_token:
            test_token(access_token)

        return {
            "access_token": access_token,
            "refresh_token": refresh_token,
            "expires_in": tokens.get("expires_in"),
            "token_type": tokens.get("token_type"),
        }

    except Exception as e:
        print(f"\n❌ Error: {e}")
        return None
    finally:
        server.shutdown()


def manual_code_mode(client_id: str, client_secret: str, scopes: list[str]) -> dict | None:
    """
    Copy-paste mode: generate the URL, user visits manually and pastes the code.
    Uses the out-of-band (OOB) redirect URI.
    """
    # PKCE
    code_verifier = base64.urlsafe_b64encode(secrets.token_bytes(32)).rstrip(b"=").decode()
    code_challenge = base64.urlsafe_b64encode(
        hashlib.sha256(code_verifier.encode()).digest()
    ).rstrip(b"=").decode()
    state = secrets.token_hex(16)

    # Use urn:ietf:wg:oauth:2.0:oob for copy-paste mode
    redirect_uri = "urn:ietf:wg:oauth:2.0:oob"

    auth_url = build_auth_url(client_id, scopes, redirect_uri, state, code_challenge)

    print(f"\n🔗 Open this URL in a browser:\n\n{auth_url}\n")
    print("After authorizing, you'll see an authorization code.")
    print("Copy that code and paste it below.\n")

    code = input("Authorization code: ").strip()

    if not code:
        print("❌ No code provided.")
        return None

    print("Exchanging authorization code for tokens... ", end="", flush=True)
    try:
        tokens = exchange_code(client_id, client_secret, code,
                               redirect_uri, code_verifier)
        print("done!")

        access_token = tokens.get("access_token")
        refresh_token = tokens.get("refresh_token")

        if not refresh_token:
            print("❌ No refresh token returned.")
            return None

        print(f"\n✅ Access token obtained")
        if access_token:
            test_token(access_token)

        return {
            "access_token": access_token,
            "refresh_token": refresh_token,
            "expires_in": tokens.get("expires_in"),
            "token_type": tokens.get("token_type"),
        }

    except Exception as e:
        print(f"\n❌ Error exchanging code: {e}")
        return None


def main():
    client_id = os.environ.get("GOOGLE_CLIENT_ID", "").strip()
    client_secret = os.environ.get("GOOGLE_CLIENT_SECRET", "").strip()

    if not client_id or not client_secret:
        print("=" * 65)
        print("  Google OAuth Setup for FocusRunner SEO Monitor")
        print("=" * 65)
        print()
        print("❌ GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET must be set.")
        print()
        print("First, create OAuth credentials in Google Cloud Console:")
        print()
        print("  1. Go to https://console.cloud.google.com/apis/credentials")
        print("  2. Select or create a project")
        print("  3. Click '+ CREATE CREDENTIALS' → 'OAuth client ID'")
        print("  4. Application type: 'Desktop app'")
        print("  5. Name: 'FocusRunner SEO Monitor'")
        print("  6. Click 'CREATE'")
        print("  7. Copy the Client ID and Client Secret")
        print()
        print("  8. Then enable the required APIs:")
        print("     - Google Search Console API:")
        print("       https://console.cloud.google.com/apis/library/webmasters.googleapis.com")
        print("     - Google Analytics Data API:")
        print("       https://console.cloud.google.com/apis/library/analyticsdata.googleapis.com")
        print()
        print("Then run:")
        print("  export GOOGLE_CLIENT_ID='your-client-id.apps.googleusercontent.com'")
        print("  export GOOGLE_CLIENT_SECRET='your-secret'")
        print("  python3 scripts/google-oauth-setup.py")
        print()
        sys.exit(1)

    scopes_str = os.environ.get("GOOGLE_OAUTH_SCOPES", " ".join(DEFAULT_SCOPES))
    scopes = scopes_str.split()

    print("=" * 65)
    print("  Google OAuth Setup for FocusRunner SEO Monitor")
    print("=" * 65)
    print(f"\n  Client ID: {client_id[:40]}...")
    print(f"  Scopes: {', '.join(scopes)}")

    # Determine mode
    if os.environ.get("GOOGLE_NO_BROWSER") == "1" or "--no-browser" in sys.argv:
        print("  Mode: manual (copy-paste)")
        tokens = manual_code_mode(client_id, client_secret, scopes)
    else:
        print("  Mode: interactive (local redirect server)")
        tokens = interactive_mode(client_id, client_secret, scopes)

        # Fallback to manual if interactive fails
        if tokens is None:
            print("\n⚠️  Interactive mode failed. Trying manual copy-paste mode...")
            tokens = manual_code_mode(client_id, client_secret, scopes)

    if tokens is None:
        print("\n❌ OAuth setup failed.")
        sys.exit(1)

    # Output env vars
    print("\n" + "=" * 65)
    print("  Add these to your CTO agent environment:")
    print("=" * 65)
    print()
    print(f"GOOGLE_CLIENT_ID={client_id}")
    print(f"GOOGLE_CLIENT_SECRET={client_secret}")
    print(f"GOOGLE_REFRESH_TOKEN={tokens['refresh_token']}")
    print()
    print("Also set your GA4 property ID:")
    print('GA4_PROPERTY_ID=458617613  # Default FocusRunner GA4 property')
    print()
    print("=" * 65)
    print("  Setup complete! Run the monitor:")
    print("    bash scripts/seo-monitor.sh")
    print("=" * 65)


if __name__ == "__main__":
    main()
