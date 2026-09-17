Forked from https://github.com/FelixKratz/dotfiles

1. Give full disk access to Terminal
2. `/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/dempfi/config/main/setup.sh)"`

Under `~/Developer/toptal` git commits with the work email and authenticates as
the work GitHub account; everywhere else it uses the personal one. The work
email and both GitHub logins are private and never tracked. `setup.sh` collects
them; after restoring `.config` any other way, run
`~/.config/git/identities.sh setup`. A plain `gh auth login` is not a substitute:
it rewrites the credential helpers that pin each account to its directory.
New fish shells warn while any piece is missing.

`.config/git/identities.test.sh` checks the per-directory resolution and the
missing-piece detection.
