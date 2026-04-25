#!/usr/bin/env bash
# 引数を stderr に書いて、固定 JSON を stdout に返す（review 用）
echo "ARGS: $@" >&2
cat <<EOF
{
  "type": "result",
  "session_id": "fake-session-123",
  "result": "{\"comments\":[{\"id\":\"c1\",\"quote\":\"冗長な表現\",\"contextBefore\":\"これは\",\"contextAfter\":\"です\",\"severity\":\"suggestion\",\"message\":\"簡潔に\"}]}"
}
EOF
