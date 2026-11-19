#!/bin/zsh
# Dev-only: real speech for the meeting harness (src/features/home/preview/meeting.html). macOS `say` speaks each line
# as 16 kHz mono 16-bit PCM; the lines and their audio go to fixtures/speech.json (git-ignored). Run once.
set -euo pipefail
cd "$(dirname "$0")/../src/features/home/preview"
mkdir -p fixtures
tmp=$(mktemp -d)
lines=(
  "Okay, let's start. The partial patient definition now counts enrolled data."
  "We have the same hospital under many names, Tata Memorial and T M H, so the numbers split."
  "Anaya will merge the hospital name variants before we rerun the dashboard."
  "Parikshit confirms the definition change with the medical team by Friday."
)
print -n '{"lines":[' > fixtures/speech.json
for i in {1..${#lines}}; do
  say -o "$tmp/$i.wav" --data-format=LEI16@16000 "${lines[$i]}"
  # the WAV's data chunk only (raw PCM), base64
  pcm=$(python3 -c "import sys,wave,base64; w=wave.open(sys.argv[1]); print(base64.b64encode(w.readframes(w.getnframes())).decode())" "$tmp/$i.wav")
  [[ $i -gt 1 ]] && print -n ',' >> fixtures/speech.json
  print -n "{\"text\":$(python3 -c 'import json,sys; print(json.dumps(sys.argv[1]))' "${lines[$i]}"),\"pcm\":\"$pcm\"}" >> fixtures/speech.json
done
print ']}' >> fixtures/speech.json
rm -rf "$tmp"
echo "wrote $(wc -c < fixtures/speech.json) bytes to fixtures/speech.json"
