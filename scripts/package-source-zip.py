#!/usr/bin/env python3
import hashlib
import os
import pathlib
import shutil
import zipfile

ROOT = pathlib.Path.cwd()
VERSION = "0.1.0"
ZIP_NAME = f"7xAir-source-v{VERSION}.zip"
DIST_DIR = ROOT / "dist"
ZIP_PATH = DIST_DIR / ZIP_NAME
SHA_PATH = DIST_DIR / f"{ZIP_NAME}.sha256"
ARTIFACT_OUT = ROOT / "artifacts" / "file_generation" / "ttl=63d" / "output"

EXCLUDE_DIRS = {
    ".git",
    "node_modules",
    "target",
    "dist",
    "build",
    "artifacts",
    "user_uploaded_files",
    "__pycache__",
    ".gradle",
}

def should_include(rel_path: pathlib.Path) -> bool:
    for part in rel_path.parts:
        if part in EXCLUDE_DIRS:
            return False
    name = rel_path.name
    if name == ".env" or name.endswith(".tmp") or name.endswith(".bak"):
        return False
    return True

def main() -> None:
    DIST_DIR.mkdir(parents=True, exist_ok=True)
    ARTIFACT_OUT.mkdir(parents=True, exist_ok=True)

    included_files = []
    for dirpath, dirnames, filenames in os.walk(ROOT):
        dirnames[:] = sorted(d for d in dirnames if d not in EXCLUDE_DIRS)
        for fname in sorted(filenames):
            full = pathlib.Path(dirpath) / fname
            rel = full.relative_to(ROOT)
            if should_include(rel):
                included_files.append((full, rel))

    with zipfile.ZipFile(ZIP_PATH, "w", compression=zipfile.ZIP_DEFLATED, compresslevel=9) as zf:
        for full, rel in included_files:
            zf.write(full, arcname=f"7xAir-v{VERSION}/{rel.as_posix()}")

    # Verify archive integrity
    with zipfile.ZipFile(ZIP_PATH, "r") as zf:
        bad = zf.testzip()
        if bad is not None:
            raise RuntimeError(f"ZIP integrity verification failed on entry: {bad}")
        entry_count = len(zf.namelist())

    sha256 = hashlib.sha256(ZIP_PATH.read_bytes()).hexdigest()
    SHA_PATH.write_text(f"{sha256}  {ZIP_NAME}\n", encoding="utf-8")
    shutil.copy2(ZIP_PATH, ARTIFACT_OUT / ZIP_NAME)

    print(f"Packaged {ZIP_PATH} ({entry_count} files, {ZIP_PATH.stat().st_size} bytes)")
    print(f"SHA-256: {sha256}")

if __name__ == "__main__":
    main()
