#!/bin/bash

echo "Installing commandline tools..."
xcode-select --install

# Homebrew
## Install
echo "Installing Brew..."
/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
brew analytics off

## Formulae
echo "Installing Brew Formulae..."
brew install fish
brew install mas
brew install asdf
brew install MonitorControl
brew install swiftformat

## Casks
echo "Installing Brew Casks..."
brew install --cask iterm2
brew install --cask sketch
brew install --cask zoom
brew install --cask transmission

# Mac App Store Apps
echo "Installing Mac App Store Apps..."
mas install 497799835 # Install XCode

echo "Planting ssh keys..."
cp -r $HOME/Library/Mobile\ Documents/com~apple~CloudDocs/.ssh $HOME/.ssh

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

echo "Planting Configuration Files..."
git clone git@github.com:dempfi/config.git $HOME/temp
cp -r "$HOME/temp/.config" "$HOME/.config"

echo "Making Fish default shell..."
sudo sh -c 'echo /opt/homebrew/bin/fish >> /etc/shells'
chsh -s /opt/homebrew/bin/fish

# Installing iterm themes
open "$HOME/temp/themes/ayu-light.itermcolors"
open "$HOME/temp/themes/ayu-mirage.itermcolors"

# Installing Xcode themes
THEME_DIRECTORY="$HOME/Library/Developer/Xcode/UserData/FontAndColorThemes"
if [ ! -d "$THEME_DIRECTORY" ]
then
  mkdir "$THEME_DIRECTORY"
fi
cp "$HOME/temp/themes/Ayu Light.xccolortheme" "$THEME_DIRECTORY/Ayu Light.xccolortheme"
cp "$HOME/temp/themes/Ayu Mirage.xccolortheme" "$THEME_DIRECTORY/Ayu Mirage.xccolortheme"

# Installing Fonts
cp -r $HOME/temp/font/ $HOME/Library/Fonts

rm -rf $HOME/temp

echo "Installation complete..."
