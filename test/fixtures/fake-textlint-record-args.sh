#!/usr/bin/env bash
# 引数を $AKAIRE_FAKE_ARG_LOG にダンプし、空のtextlint結果を返す
LOG="${AKAIRE_FAKE_ARG_LOG:-/tmp/akaire-fake-textlint-args.log}"
printf '%s\n' "$@" > "$LOG"
cat <<'EOF'
[{"filePath":"/tmp/note.md","messages":[]}]
EOF
