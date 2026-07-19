Forked from https://github.com/FelixKratz/dotfiles

1. Give full disk access to Terminal
2. `/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/dempfi/config/main/setup.sh)"`

After bootstrap, create `~/.config/git/toptal.local.config` with the private
work commit identity, then run `gh auth login` once outside `~/Developer/toptal`
and once inside it. GitHub credentials remain in each local config directory's
ignored `hosts.yml`.
