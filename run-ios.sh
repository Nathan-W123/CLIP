#!/bin/bash
# CocoaPods / Xcode fail when the project path contains an apostrophe — keep this repo at a path like takethree-prime, not takethree'.
cd "$(dirname "$0")"
exec npx expo run:ios "$@"
