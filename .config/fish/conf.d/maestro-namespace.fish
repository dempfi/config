# Default maestro's session namespace, because maestro only learns the real one
# from its server-config API call: RemoteConfig::load() corrects `namespace` ONLY
# inside the Ok(server_config) arm, so when that call fails (a 429 rate-limit is
# enough) it silently stays at DEFAULT_K8S_NAMESPACE = "sessions-staging" and the
# failure is recorded with log::debug!, i.e. invisible. Every lookup then 403s and
# surfaces as:
#
#   Error: Pod <session> is not running. Use 'maestro resume' to restart it.
#
# ...for a pod that is perfectly healthy. Seen flipping mid-command: the first GET
# hit sessions-prod (200), every one after it hit sessions-staging (403), while the
# pod's own logs showed "ready: Init complete, starting supervisor".
#
# Fix submitted upstream as toptal/maestro#4426, which makes that fallback loud
# rather than silent. Setting the value here removes the dependency on the API call
# altogether: once it differs from the default, maestro never overwrites it.
#
# A DEFAULT, not a hard pin — `set -x MAESTRO_K8S_NAMESPACE sessions-staging`, or
# prefixing a single command, still wins.
set -q MAESTRO_K8S_NAMESPACE; or set -gx MAESTRO_K8S_NAMESPACE sessions-prod
