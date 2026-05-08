#!/usr/bin/env bash
# 引数を $AKAIRE_FAKE_ARG_LOG にダンプし、最小の構造化レスポンスを返す
LOG="${AKAIRE_FAKE_ARG_LOG:-/tmp/akaire-fake-args.log}"
printf '%s\n' "$@" > "$LOG"
cat <<EOF
{
  "type": "result",
  "session_id": "fake-record-session",
  "result": "",
  "structured_output": {"comments": []}
}
EOF
