#!/usr/bin/env bash
# Compile-checks the Unity scripts outside Unity (see tools/UnityCompileCheck) and runs the simulation tests.
set -euo pipefail
cd "$(dirname "$0")"
status=0
for mode in "InputMode=new WithEditor=false" "InputMode=legacy WithEditor=false" "InputMode=new WithEditor=true"; do
  args=""
  for kv in $mode; do args="$args -p:$kv"; done
  echo "=== Compilation ($mode) ==="
  if ! dotnet build UnityCompileCheck/UnityCompileCheck.csproj $args -nologo -v q -clp:ErrorsOnly; then status=1; fi
done
echo "=== Tests de simulation ==="
dotnet test SimulationTests/SimulationTests.csproj -nologo -v q || status=1
exit $status
