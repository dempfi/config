#!/bin/bash

echo "Installing commandline tools..."
xcode-select --install

# Homebrew
## Install
echo "Installing Brew..."
/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
eval "$(/opt/homebrew/bin/brew shellenv)"
brew analytics off

## Formulae
echo "Installing Brew Formulae..."
brew install fish
brew install mas
brew install asdf
brew install MonitorControl
brew install swiftformat
brew install gh
brew install direnv

## Agent CLIs and RTK integration
echo "Installing Agent CLIs..."
brew install --cask claude-code
brew install --cask codex
brew install rtk
brew install agent-browser

## Casks
echo "Installing Brew Casks..."
brew install --cask iterm2
brew install --cask sketch
brew install --cask zoom
brew install --cask transmission
brew install --cask visual-studio-code

# Mac App Store Apps
echo "Installing Mac App Store Apps..."
mas install 497799835 # Install XCode

echo "Planting ssh keys..."
cp -r $HOME/Library/Mobile\ Documents/com~apple~CloudDocs/.ssh $HOME/.ssh
chmod 600 $HOME/.ssh/id_ed25519

echo "Changing macOS defaults..."

# Close any open System Preferences panes, to prevent them from overriding
# settings we’re about to change
osascript -e 'tell application "System Preferences" to quit'

# Trackpad: enable tap to click for this user and for the login screen
defaults write com.apple.driver.AppleBluetoothMultitouch.trackpad Clicking -bool true
defaults -currentHost write NSGlobalDomain com.apple.mouse.tapBehavior -int 1
defaults write NSGlobalDomain com.apple.mouse.tapBehavior -int 1
defaults write -g com.apple.trackpad.scaling 3

# Set language and text formats
defaults write NSGlobalDomain AppleLanguages -array "en"
defaults write NSGlobalDomain AppleLocale -string "en_US@currency=USD"
defaults write NSGlobalDomain AppleMeasurementUnits -string "Centimeters"
defaults write NSGlobalDomain AppleMetricUnits -bool true

# Set sidebar icon size to medium
defaults write NSGlobalDomain NSTableViewDefaultSizeMode -int 2

# Update frequency of Activity Monitor (in seconds)
defaults write com.apple.ActivityMonitor "UpdatePeriod" -int "1"

# Enable three finger drag
defaults write com.apple.AppleMultitouchTrackpad "TrackpadThreeFingerDrag" -bool "true"

# Minimize windows into their application’s icon
defaults write com.apple.dock minimize-to-application -bool true

# Group windows by application in Mission Control
defaults write com.apple.dock "expose-group-apps" -bool "true"

# Rearrange Spaces based on most recent use
defaults write com.apple.dock "mru-spaces" -bool "false"

# Set the icon size of Dock items to 48 pixels
defaults write com.apple.dock "tilesize" -int "48"

# Automatically hide and show the Dock
defaults write com.apple.dock autohide -bool true

# Show build operation duration
defaults write com.apple.dt.Xcode "ShowBuildOperationDuration" -bool "true"

# Show path bar
defaults write com.apple.finder ShowPathbar -bool true

# Keep folders on top when sorting by name
defaults write com.apple.finder "_FXSortFoldersFirst" -bool "true"

# Show hidden files
defaults write com.apple.finder AppleShowAllFiles -bool true

# Search the current directory by default
defaults write com.apple.finder FXDefaultSearchScope -string "SCcf"

# Use column view in all Finder windows by default
defaults write com.apple.finder FXPreferredViewStyle -string "clmv"

# Hide external hard drives on desktop
defaults write com.apple.finder ShowExternalHardDrivesOnDesktop -bool false

# Hide hard drives on desktop
defaults write com.apple.finder ShowHardDrivesOnDesktop -bool false

# Hide mounted servers on desktop
defaults write com.apple.finder ShowMountedServersOnDesktop -bool false

# Hide removable media on desktop
defaults write com.apple.finder ShowRemovableMediaOnDesktop -bool false

# Hide status bar
defaults write com.apple.finder ShowStatusBar -bool false

# Disable the “Are you sure you want to open this application?” dialog
defaults write com.apple.LaunchServices LSQuarantine -bool false
defaults write com.apple.mail AddressesIncludeNameOnPasteboard -bool false
defaults write com.apple.NetworkBrowser BrowseAllInterfaces 1

# Disable opening "safe" files automatically
defaults write com.apple.Safari AutoOpenSafeDownloads -bool false

# Enable the Develop menu and the Web Inspector in Safari
defaults write com.apple.Safari com.apple.Safari.ContentPageGroupIdentifier.WebKit2DeveloperExtrasEnabled -bool true

# Enable the Develop menu and the Web Inspector in Safari
defaults write com.apple.Safari IncludeDevelopMenu -bool true

# Enable the Develop menu and the Web Inspector in Safari
defaults write com.apple.Safari WebKitDeveloperExtrasEnabledPreferenceKey -bool true

# Disable switching to a space with open windows for an application when switching to the application
defaults write com.apple.spaces spans-displays -bool false

# Show all filename extensions
defaults write NSGlobalDomain AppleShowAllExtensions -bool true

# Set a blazingly fast keyboard repeat rate
defaults write NSGlobalDomain KeyRepeat -int 1
defaults write NSGlobalDomain InitialKeyRepeat -int 10

# Add a context menu item for showing the Web Inspector in web views
defaults write NSGlobalDomain WebKitDeveloperExtras -bool true

# Check for software updates daily, not just once per week
defaults write com.apple.SoftwareUpdate ScheduleFrequency -int 1

# Disable smart quotes
defaults write NSGlobalDomain NSAutomaticQuoteSubstitutionEnabled -bool false

# Do not close windows when closing an app
defaults write -g NSQuitAlwaysKeepsWindows -bool true

# iTerm
defaults write com.googlecode.iterm2 PrefsCustomFolder -string "$HOME/.config/iterm2"
defaults write com.googlecode.iterm2 LoadPrefsFromCustomFolder -bool true

echo "Planting Configuration Files..."
git clone git@github.com:dempfi/config.git $HOME/temp
cp -r "$HOME/temp/.config" "$HOME"

echo "Configuring git identities (dempfi by default, ikekurghinyan under ~/Developer/toptal)..."
mkdir -p "$HOME/Developer/toptal"
TOPTAL_GIT_LOCAL="$HOME/.config/git/toptal.local.config"
if [ ! -f "$TOPTAL_GIT_LOCAL" ]; then
  read -r -p "Work git email for ~/Developer/toptal: " TOPTAL_EMAIL
  printf '[user]\n\tname = Ike Kurghinyan\n\temail = %s\n\tuseConfigOnly = true\n' "$TOPTAL_EMAIL" > "$TOPTAL_GIT_LOCAL"
  chmod 600 "$TOPTAL_GIT_LOCAL"
fi
GH_CONFIG_DIR="$HOME/.config/gh" gh auth status >/dev/null 2>&1 || {
  echo "Log in to GitHub as dempfi"
  GH_CONFIG_DIR="$HOME/.config/gh" gh auth login --hostname github.com --git-protocol https --web
}
GH_CONFIG_DIR="$HOME/.config/gh-work" gh auth status >/dev/null 2>&1 || {
  echo "Log in to GitHub as ikekurghinyan"
  GH_CONFIG_DIR="$HOME/.config/gh-work" gh auth login --hostname github.com --git-protocol https --web
}
cp "$HOME/temp/.config/git/config" "$HOME/.config/git/config"
echo "  personal: $(GH_CONFIG_DIR="$HOME/.config/gh" gh api user -q .login)"
echo "  work:     $(GH_CONFIG_DIR="$HOME/.config/gh-work" gh api user -q .login)"
mkdir -p "$HOME/.claude" "$HOME/.codex"
cp "$HOME/temp/.claude/RTK.md" "$HOME/temp/.claude/statusline-command.sh" "$HOME/.claude/"
sed "s|/Users/dempfi|$HOME|g" "$HOME/temp/.claude/CLAUDE.md" > "$HOME/.claude/CLAUDE.md"
cp -R "$HOME/temp/.claude/hooks" "$HOME/temp/.claude/rules" "$HOME/temp/.claude/marketplaces" "$HOME/.claude/"
cp "$HOME/temp/.codex/RTK.md" "$HOME/.codex/"
sed "s|/Users/dempfi|$HOME|g" "$HOME/temp/.codex/AGENTS.md" > "$HOME/.codex/AGENTS.md"

echo "Configuring RTK..."
# Keep Claude's settings local: the official initializer adds only the RTK hook.
rtk init --global --hook-only --auto-patch
# Codex is configured by the tracked ~/.codex/AGENTS.md and RTK.md files above.
rtk telemetry disable
rtk verify

echo "Merging Claude settings (tracked keys win, machine-local keys survive)..."
SETTINGS="$HOME/.claude/settings.json"
[ -f "$SETTINGS" ] || echo '{}' > "$SETTINGS"
SETTINGS_TRACKED="$(mktemp)"
SETTINGS_MERGED="$(mktemp)"
sed "s|__HOME__|$HOME|g" "$HOME/temp/.claude/settings.json" > "$SETTINGS_TRACKED"
jq -s '.[0] * .[1]' "$SETTINGS" "$SETTINGS_TRACKED" > "$SETTINGS_MERGED" && mv "$SETTINGS_MERGED" "$SETTINGS"
rm -f "$SETTINGS_TRACKED"

echo "Installing agent skills from upstream..."
bash "$HOME/.config/agents/install-skills.sh"

echo "Making Fish default shell..."
sudo sh -c 'echo /opt/homebrew/bin/fish >> /etc/shells'
chsh -s /opt/homebrew/bin/fish

# Installing iterm themes
open "$HOME/temp/themes/ayu-light.itermcolors"
open "$HOME/temp/themes/ayu-mirage.itermcolors"

# Installing Xcode themes and fonts from ayu-theme/ayu-xcode
curl -fsSL https://raw.githubusercontent.com/ayu-theme/ayu-xcode/master/install.sh | sh -s -- --with-fonts

# Installing Fonts
cp -r $HOME/temp/font/ $HOME/Library/Fonts

rm -rf $HOME/temp

echo "Installation complete. Restart for values to take effect..."
