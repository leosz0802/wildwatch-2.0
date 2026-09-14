#!/usr/bin/env python3
"""Safely replace WX_APP_SECRET in a root-owned environment file.

The secret is read from stdin so it never appears in shell history or process
arguments. Successful output reports only whether a value was installed.
"""

import os
import re
import stat
import sys
import tempfile


def main() -> int:
    if len(sys.argv) != 2:
        print("usage: set_wechat_secret.py ENV_FILE", file=sys.stderr)
        return 2
    env_path = os.path.abspath(sys.argv[1])
    secret = sys.stdin.read().strip()
    if not re.fullmatch(r"[A-Za-z0-9]{32}", secret):
        print("invalid WeChat AppSecret format", file=sys.stderr)
        return 2

    info = os.stat(env_path)
    with open(env_path, "r", encoding="utf-8") as source:
        lines = source.read().splitlines()
    replacement = f"WX_APP_SECRET={secret}"
    replaced = False
    updated = []
    for line in lines:
        if line.startswith("WX_APP_SECRET="):
            if not replaced:
                updated.append(replacement)
                replaced = True
            continue
        updated.append(line)
    if not replaced:
        updated.append(replacement)

    descriptor, temp_path = tempfile.mkstemp(prefix=".wild-api-env-", dir=os.path.dirname(env_path), text=True)
    try:
        with os.fdopen(descriptor, "w", encoding="utf-8") as target:
            target.write("\n".join(updated) + "\n")
            target.flush()
            os.fsync(target.fileno())
        os.chmod(temp_path, stat.S_IMODE(info.st_mode))
        os.chown(temp_path, info.st_uid, info.st_gid)
        os.replace(temp_path, env_path)
    finally:
        if os.path.exists(temp_path):
            os.unlink(temp_path)
    print("WX_APP_SECRET_SET=yes")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
