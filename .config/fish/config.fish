# asdf >= 0.16 ships no asdf.fish; it only needs shims on PATH
set -q ASDF_DATA_DIR; and set _asdf_shims $ASDF_DATA_DIR/shims; or set _asdf_shims $HOME/.asdf/shims
contains $_asdf_shims $PATH; or set --prepend PATH $_asdf_shims
set --erase _asdf_shims



# >>> conda initialize >>>
# !! Contents within this block are managed by 'conda init' !!
if test -f /Users/dempfi/miniconda3/bin/conda
    eval /Users/dempfi/miniconda3/bin/conda "shell.fish" "hook" $argv | source
else
    if test -f "/Users/dempfi/miniconda3/etc/fish/conf.d/conda.fish"
        . "/Users/dempfi/miniconda3/etc/fish/conf.d/conda.fish"
    else
        set -x PATH "/Users/dempfi/miniconda3/bin" $PATH
    end
end
# <<< conda initialize <<<


# The next line updates PATH for the Google Cloud SDK.
if [ -f '/Users/dempfi/google-cloud-sdk/path.fish.inc' ]; . '/Users/dempfi/google-cloud-sdk/path.fish.inc'; end

# Added by LM Studio CLI (lms)
set -gx PATH $PATH /Users/dempfi/.lmstudio/bin
# End of LM Studio CLI section

# direnv: per-directory env vars (used to scope `gh` auth for ~/Developer/toptal)
direnv hook fish | source


test -e {$HOME}/.iterm2_shell_integration.fish ; and source {$HOME}/.iterm2_shell_integration.fish


# Added by OrbStack: command-line tools and integration
# This won't be added again if you remove it.
source ~/.orbstack/shell/init2.fish 2>/dev/null || :
