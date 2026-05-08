#!/usr/bin/env bash
# claude が --json-schema 使用時に出す構造化出力を再現
# result は空、structured_output に本体が入る
echo "ARGS: $@" >&2
cat <<EOF
{
  "type": "result",
  "session_id": "fake-session-structured",
  "result": "",
  "structured_output": {
    "comments": [
      {"id":"s1","quote":"冗長","severity":"suggestion","message":"簡潔に"}
    ]
  }
}
EOF
