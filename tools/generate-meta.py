#!/usr/bin/env python3
"""Creates missing Unity .meta files under Assets/ with stable GUIDs (derived from the asset path).

Stable GUIDs mean every machine (and every contributor) gets the same IDs, so scene / prefab
references never break. Unity accepts these minimal metas and completes them on import.
Run from the repository root:  python3 tools/generate-meta.py
"""
import hashlib
import os
import sys

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..")
ASSETS = os.path.join(ROOT, "Assets")

IMPORTERS = {
    ".cs": "MonoImporter:\n  externalObjects: {}\n  serializedVersion: 2\n  defaultReferences: []\n  executionOrder: 0\n  icon: {instanceID: 0}\n  userData: \n  assetBundleName: \n  assetBundleVariant: \n",
    ".asmdef": "AssemblyDefinitionImporter:\n  externalObjects: {}\n  userData: \n  assetBundleName: \n  assetBundleVariant: \n",
    ".json": "TextScriptImporter:\n  externalObjects: {}\n  userData: \n  assetBundleName: \n  assetBundleVariant: \n",
    ".md": "TextScriptImporter:\n  externalObjects: {}\n  userData: \n  assetBundleName: \n  assetBundleVariant: \n",
}
DEFAULT = "DefaultImporter:\n  externalObjects: {}\n  userData: \n  assetBundleName: \n  assetBundleVariant: \n"


def guid_for(rel_path: str) -> str:
    return hashlib.md5(("industria:" + rel_path.replace(os.sep, "/")).encode("utf-8")).hexdigest()


def write_meta(path: str, is_dir: bool) -> bool:
    meta = path + ".meta"
    if os.path.exists(meta):
        return False
    rel = os.path.relpath(path, ROOT)
    body = f"fileFormatVersion: 2\nguid: {guid_for(rel)}\n"
    if is_dir:
        body += "folderAsset: yes\n" + DEFAULT
    else:
        body += IMPORTERS.get(os.path.splitext(path)[1].lower(), DEFAULT)
    with open(meta, "w", newline="\n") as f:
        f.write(body)
    return True


def main() -> int:
    created = 0
    for dirpath, dirnames, filenames in os.walk(ASSETS):
        # Unity ignores hidden folders and folders ending with "~".
        dirnames[:] = [d for d in dirnames if not d.startswith(".") and not d.endswith("~")]
        for d in dirnames:
            created += write_meta(os.path.join(dirpath, d), True)
        for f in filenames:
            if f.endswith(".meta") or f.startswith("."):
                continue
            created += write_meta(os.path.join(dirpath, f), False)
    # Assets/_Project itself and top-level folders
    print(f"{created} fichier(s) .meta créé(s).")
    return 0


if __name__ == "__main__":
    sys.exit(main())
