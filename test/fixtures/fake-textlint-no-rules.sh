#!/usr/bin/env bash
cat <<'EOF'

== No rules found, textlint hasn't done anything ==

Possible reasons:
* Your textlint config file has no rules.
* You have no config file and you aren't passing rules via command line.
* Your textlint config has a syntax error.

EOF
exit 1
