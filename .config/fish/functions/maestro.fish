function maestro --description 'Run maestro against a work-only ssh-agent (toptal key only)'
    set -l work_sock "$HOME/.ssh/agents/toptal.sock"
    set -l work_key "$HOME/.ssh/id_ed25519_toptal"

    mkdir -p (dirname "$work_sock")

    # Probe the agent behind the pinned socket: 0=has a key, 1=empty, 2=no/dead agent.
    env SSH_AUTH_SOCK=$work_sock ssh-add -l >/dev/null 2>&1
    set -l probe $status

    if test $probe -eq 2
        rm -f "$work_sock"
        ssh-agent -a "$work_sock" >/dev/null
    end

    # Load the work key if the agent is empty or freshly started. Fail CLOSED: if the
    # key can't be loaded, abort rather than hand maestro an empty agent — an empty
    # agent triggers maestro's `ssh-add --apple-use-keychain` / default-key fallback,
    # which would pull the personal key (~/.ssh/id_ed25519) into the forwarded socket.
    if test $probe -ne 0
        if not env SSH_AUTH_SOCK=$work_sock ssh-add "$work_key"
            echo "maestro: could not load work key $work_key into the work-only agent — aborting so the personal key can't leak into a remote session." >&2
            return 1
        end
    end

    # Expose ONLY the work-only agent to maestro. MAESTRO_HOST_SSH_AUTH_SOCK is the
    # var maestro forwards; SSH_AUTH_SOCK is its fallback — pin both.
    env SSH_AUTH_SOCK=$work_sock MAESTRO_HOST_SSH_AUTH_SOCK=$work_sock command maestro $argv
end
