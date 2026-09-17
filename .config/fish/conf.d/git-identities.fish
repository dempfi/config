if status is-interactive
    set -l gaps (bash $HOME/.config/git/identities.sh check)
    if test (count $gaps) -gt 0
        echo "git identities incomplete — run ~/.config/git/identities.sh setup" >&2
        printf '  missing %s\n' $gaps >&2
    end
end
