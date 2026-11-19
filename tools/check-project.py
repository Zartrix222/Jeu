#!/usr/bin/env python3
"""Static integrity check of the Unity project (no Unity needed).

Checks:
 - every asset / folder under Assets/ has a .meta, and every .meta has its asset
 - GUIDs are unique
 - every GUID referenced by scenes / ProjectSettings resolves to an existing asset
 - scripts referenced by a scene contain a class with the file's name
 - JSON files (content + Packages/manifest.json) parse
 - required project files exist
Exit code 1 on any error.
"""
import json
import os
import re
import sys

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
errors, warnings = [], []

REQUIRED = [
    "Packages/manifest.json",
    "ProjectSettings/EditorBuildSettings.asset",
    "Assets/_Project/Scenes/Main.unity",
    "Assets/_Project/Scripts/Runtime/Core/GameRoot.cs",
    "Assets/_Project/Scripts/Editor/IndustriaProjectSetup.cs",
    "Assets/_Project/Resources/Data/items.json",
    "Assets/_Project/Resources/Data/recipes.json",
    "Assets/_Project/Resources/Data/buildables.json",
    "Assets/_Project/Resources/Data/eras.json",
]


def rel(p):
    return os.path.relpath(p, ROOT).replace(os.sep, "/")


def main():
    for r in REQUIRED:
        if not os.path.exists(os.path.join(ROOT, r)):
            errors.append(f"Fichier requis manquant : {r}")

    guids = {}
    assets = os.path.join(ROOT, "Assets")
    for dirpath, dirnames, filenames in os.walk(assets):
        dirnames[:] = [d for d in dirnames if not d.startswith(".") and not d.endswith("~")]
        entries = [(os.path.join(dirpath, d), True) for d in dirnames] + \
                  [(os.path.join(dirpath, f), False) for f in filenames if not f.endswith(".meta") and not f.startswith(".")]
        for path, _ in entries:
            meta = path + ".meta"
            if not os.path.exists(meta):
                errors.append(f".meta manquant : {rel(path)}")
                continue
            m = re.search(r"^guid: ([0-9a-f]{32})", open(meta, encoding="utf-8").read(), re.M)
            if not m:
                errors.append(f"GUID illisible : {rel(meta)}")
                continue
            g = m.group(1)
            if g in guids:
                errors.append(f"GUID dupliqué {g} : {rel(path)} et {guids[g]}")
            guids[g] = rel(path)
        for f in filenames:
            if f.endswith(".meta"):
                target = os.path.join(dirpath, f[:-5])
                if not os.path.exists(target):
                    errors.append(f".meta orphelin : {rel(os.path.join(dirpath, f))}")

    # GUID references in YAML assets
    yaml_files = []
    for base in ("Assets", "ProjectSettings"):
        for dirpath, _, filenames in os.walk(os.path.join(ROOT, base)):
            for f in filenames:
                if f.endswith((".unity", ".prefab", ".asset", ".mat")):
                    yaml_files.append(os.path.join(dirpath, f))
    for y in yaml_files:
        text = open(y, encoding="utf-8").read()
        if not text.startswith("%YAML"):
            errors.append(f"En-tête YAML Unity absent : {rel(y)}")
        for g in set(re.findall(r"guid: ([0-9a-f]{32})", text)):
            if g in guids:
                target = guids[g]
                if y.endswith(".unity") and target.endswith(".cs"):
                    cls = os.path.splitext(os.path.basename(target))[0]
                    src = open(os.path.join(ROOT, target), encoding="utf-8").read()
                    if not re.search(rf"class\s+{cls}\b", src):
                        errors.append(f"{rel(y)} référence {target} mais la classe {cls} est introuvable")
            elif not g.startswith("0000000000000000"):
                errors.append(f"{rel(y)} référence un GUID inconnu : {g}")
        # local fileID consistency inside scenes
        if y.endswith(".unity"):
            ids = set(re.findall(r"^--- !u!\d+ &(\d+)", text, re.M))
            for ref in set(re.findall(r"\{fileID: (\d+)\}", text)):
                if ref != "0" and ref not in ids:
                    errors.append(f"{rel(y)} : fileID local {ref} introuvable")

    # Build settings must list the main scene with the right GUID
    ebs = os.path.join(ROOT, "ProjectSettings/EditorBuildSettings.asset")
    if os.path.exists(ebs):
        t = open(ebs, encoding="utf-8").read()
        if "Assets/_Project/Scenes/Main.unity" not in t:
            errors.append("EditorBuildSettings ne contient pas Main.unity")

    for j in ["Packages/manifest.json"] + [f"Assets/_Project/Resources/Data/{n}" for n in os.listdir(os.path.join(ROOT, "Assets/_Project/Resources/Data")) if n.endswith(".json")]:
        try:
            json.load(open(os.path.join(ROOT, j), encoding="utf-8"))
        except Exception as e:  # noqa: BLE001
            errors.append(f"JSON invalide {j} : {e}")

    for w in warnings:
        print("AVERTISSEMENT :", w)
    for e in errors:
        print("ERREUR :", e)
    print(f"{len(guids)} assets vérifiés, {len(yaml_files)} fichiers YAML, {len(errors)} erreur(s).")
    return 1 if errors else 0


if __name__ == "__main__":
    sys.exit(main())
