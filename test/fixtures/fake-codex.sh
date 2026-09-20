#!/bin/sh
cat >/dev/null
printf '%s\n' '{"type":"thread.started","thread_id":"codex-session-1"}'
printf '%s\n' '{"type":"item.completed","item":{"type":"agent_message","text":"{\"comments\":[{\"id\":\"c1\",\"quote\":\"冗長\",\"contextBefore\":\"これは\",\"contextAfter\":\"です\",\"severity\":\"suggestion\",\"message\":\"簡潔に\"}]}"}}'
