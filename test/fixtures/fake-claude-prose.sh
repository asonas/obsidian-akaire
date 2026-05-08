#!/usr/bin/env bash
# claude が --json-schema を無視して自然文＋JSON断片を返してきた状況の再現
echo "ARGS: $@" >&2
cat <<EOF
{
  "type": "result",
  "session_id": "fake-session-prose",
  "result": "レビューの要点をまとめます。\n\n以下が指摘です。\n{\"comments\":[{\"id\":\"c1\",\"quote\":\"冗長\",\"severity\":\"suggestion\",\"message\":\"簡潔に\"}]}\n\n以上です。"
}
EOF
