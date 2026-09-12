#!/usr/bin/env python3
"""Automated release helper script for Restart HA.

Usage:
    export GITHUB_TOKEN="your_token"
    python3 scripts/release.py 1.0.1 "Notes de la mise à jour..."
"""
import json
import os
import re
import ssl
import subprocess
import sys
import urllib.request

REPO_OWNER = "SocrateMobile"
REPO_NAME = "Restart-HA"
GITHUB_REPO = f"{REPO_OWNER}/{REPO_NAME}"

ROOT_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
MANIFEST_PATH = os.path.join(ROOT_DIR, "custom_components", "restart_ha", "manifest.json")
CONST_PATH = os.path.join(ROOT_DIR, "custom_components", "restart_ha", "const.py")


def get_token() -> str:
    """Retrieve GitHub token from environment or git remote."""
    token = os.environ.get("GITHUB_TOKEN")
    if token:
        return token
    try:
        remote = (
            subprocess.check_output(
                ["git", "remote", "get-url", "origin"],
                cwd=ROOT_DIR,
                text=True,
            )
            .strip()
        )
        match = re.search(r":([^@]+)@github\.com", remote)
        if match:
            return match.group(1)
    except Exception:
        pass
    print("Error: GITHUB_TOKEN environment variable is not set.")
    sys.exit(1)


def update_version_files(new_ver: str) -> None:
    """Update version in manifest.json and const.py."""
    # 1. manifest.json
    with open(MANIFEST_PATH, "r", encoding="utf-8") as f:
        data = json.load(f)
    data["version"] = new_ver
    with open(MANIFEST_PATH, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=2)
        f.write("\n")
    print(f"Updated {MANIFEST_PATH} -> {new_ver}")

    # 2. const.py
    with open(CONST_PATH, "r", encoding="utf-8") as f:
        content = f.read()
    new_content = re.sub(r'VERSION\s*=\s*"[^"]+"', f'VERSION = "{new_ver}"', content)
    with open(CONST_PATH, "w", encoding="utf-8") as f:
        f.write(new_content)
    print(f"Updated {CONST_PATH} -> {new_ver}")


def run_cmd(cmd: list[str]) -> None:
    """Run shell command and check status."""
    print(f"Running: {' '.join(cmd)}")
    subprocess.check_call(cmd, cwd=ROOT_DIR)


def create_github_release(new_ver: str, release_notes: str, token: str) -> None:
    """Create GitHub release via API and attach latest tag."""
    tag = f"v{new_ver}" if not new_ver.startswith("v") else new_ver
    url = f"https://api.github.com/repos/{GITHUB_REPO}/releases"

    payload = {
        "tag_name": tag,
        "target_commitish": "main",
        "name": f"Restart HA {tag} (Latest)",
        "body": release_notes,
        "draft": False,
        "prerelease": False,
        "make_latest": "true",
    }

    ctx = ssl.create_default_context()
    try:
        import certifi

        ctx.load_verify_locations(certifi.where())
    except Exception:
        ctx.check_hostname = False
        ctx.verify_mode = ssl.CERT_NONE

    req = urllib.request.Request(
        url,
        data=json.dumps(payload).encode("utf-8"),
        headers={
            "Authorization": f"token {token}",
            "Accept": "application/vnd.github.v3+json",
            "Content-Type": "application/json",
            "User-Agent": "Restart-HA-Releaser",
        },
        method="POST",
    )

    with urllib.request.urlopen(req, context=ctx) as resp:
        res = json.loads(resp.read().decode("utf-8"))
        print(f"GitHub Release created successfully: {res.get('html_url')}")


def main() -> None:
    if len(sys.argv) < 2:
        print("Usage: python3 scripts/release.py <version> [release_notes]")
        sys.exit(1)

    new_ver = sys.argv[1].lstrip("v")
    notes = (
        sys.argv[2]
        if len(sys.argv) > 2
        else f"Release {new_ver}\n\n- Nouvelles améliorations et corrections pour Restart HA."
    )
    token = get_token()

    print(f"Preparing release v{new_ver}...")
    update_version_files(new_ver)

    tag = f"v{new_ver}"

    # Git operations
    run_cmd(["git", "add", "."])
    run_cmd(["git", "commit", "-m", f"chore(release): bump version to {tag}"])
    run_cmd(["git", "tag", "-fa", tag, "-m", f"Release {tag}"])
    run_cmd(["git", "tag", "-fa", "latest", "-m", f"Latest release ({tag})"])
    run_cmd(["git", "push", "origin", "main"])
    run_cmd(["git", "push", "origin", "--tags", "--force"])

    # GitHub release
    create_github_release(new_ver, notes, token)
    print(f"🎉 Successfully published release {tag} with floating tag 'latest'!")


if __name__ == "__main__":
    main()
