source /opt/homebrew/opt/asdf/libexec/asdf.fish



# The next line updates PATH for the Google Cloud SDK.
if [ -f '/Users/dempfi/google-cloud-sdk/path.fish.inc' ]; . '/Users/dempfi/google-cloud-sdk/path.fish.inc'; end

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

