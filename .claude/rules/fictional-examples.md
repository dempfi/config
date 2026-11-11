# Examples are always fictional (CRITICAL)

Every example written into this repository is invented. That covers test fixtures and assertions, sample data,
docs, READMEs, rule and skill prose, commit messages and PR descriptions:

- **People**: no real person's name. Use invented first names (Juno, Otto, Wren, Mabel).
- **Companies and products**: no real company or product, the owner's own included. Use an invented name (Lantern,
  Acme).
- **Identifiers**: no real ticket keys, Slack channels or handles, repo or org names, hostnames, internal tool names,
  URLs, emails or account ids. Use `LAMP-1`, `#lantern-launch`, `example.com`, `someone@example.com`.
- **Paths**: no path into a real project directory. Use `/x/...` or `$HOME/Developer/example`.

The same goes for anything copied from another session, the board, Slack or a ticket into an example: replace every
real name in it before it lands in a file.

Why: this repository is public. A real name in a test or a doc publishes who the owner knows and what they build, and
it stays in git history after the line is edited away. An invented name tests and explains exactly as well.

This rule covers examples only. Configuration that must name a real directory, key or account is not an example; it
stays out of tracked files, in an untracked local file.

Related: [[no-session-links]].
