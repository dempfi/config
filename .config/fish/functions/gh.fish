function gh --description "Use the GitHub account for the current workspace" --wraps gh
    set -l config_dir "$HOME/.config/gh"
    if string match --quiet -- "$HOME/Developer/toptal" "$PWD"; or string match --quiet -- "$HOME/Developer/toptal/*" "$PWD"
        set config_dir "$HOME/.config/gh-work"
    end

    env GH_CONFIG_DIR=$config_dir command gh $argv
end
