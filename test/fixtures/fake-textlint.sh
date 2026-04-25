#!/usr/bin/env bash
cat <<'EOF'
[
  {
    "filePath": "/tmp/note.md",
    "messages": [
      {"line": 1, "column": 5, "ruleId": "no-doubled-joshi", "message": "「が」が連続", "severity": 2}
    ]
  }
]
EOF
