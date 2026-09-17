# Pin maestro's forwarded SSH agent to the work-only socket for EVERY invocation
# path, not just the `maestro` fish function — so a full-path or scripted call
# (~/.maestro/bin/maestro, `command maestro`) also prefers the toptal-only agent
# over the default agent, which holds the personal key.
#
# Best-effort, not airtight: if the work agent is down, maestro may fall back to
# SSH_AUTH_SOCK (the default agent). The `maestro` function is the airtight path —
# it guarantees the work agent is up and populated before running maestro.
set -gx MAESTRO_HOST_SSH_AUTH_SOCK "$HOME/.ssh/agents/toptal.sock"
