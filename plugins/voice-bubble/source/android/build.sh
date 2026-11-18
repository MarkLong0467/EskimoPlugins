#!/bin/sh
# Builds android/voice-bubble.jar (DEX) from VoiceBubble.java. Needs a JDK, Android's android.jar and r8.jar (d8).
# Defaults point at ~/scratch-toolchain/android; override with JAVA_HOME, ANDROID_JAR and R8_JAR.
set -eu
here=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
plugin=$(CDPATH= cd -- "$here/../.." && pwd)
tools="$HOME/scratch-toolchain/android"
: "${JAVA_HOME:=$(ls -d "$tools"/jdk/*/ | head -1)}"
: "${ANDROID_JAR:=$tools/android.jar}"
: "${R8_JAR:=$tools/r8.jar}"
out=$(mktemp -d)
# The JDK is a Windows program on this PC: give it Windows paths (cygpath) when they are available.
w() { if command -v cygpath >/dev/null 2>&1; then cygpath -w "$1"; else printf %s "$1"; fi; }
sep=":"; command -v cygpath >/dev/null 2>&1 && sep=";"
trap 'rm -rf "$out"' EXIT
mkdir -p "$out/stubs" "$out/classes" "$plugin/android"
"$JAVA_HOME/bin/javac" --release 8 -Xlint:-options -nowarn -cp "$(w "$ANDROID_JAR")" -d "$(w "$out/stubs")" $(find "$here/compile-stubs" -name '*.java')
"$JAVA_HOME/bin/javac" --release 8 -Xlint:-options -Xlint:unchecked -cp "$(w "$ANDROID_JAR")$sep$(w "$out/stubs")" -d "$(w "$out/classes")" $(find "$here/marklong" -name '*.java')
(cd "$out/classes" && "$JAVA_HOME/bin/jar" cf "$(w "$out/classes.jar")" .)
"$JAVA_HOME/bin/java" -cp "$(w "$R8_JAR")" com.android.tools.r8.D8 --release --min-api 24 --lib "$(w "$ANDROID_JAR")" --classpath "$(w "$out/stubs")" --output "$(w "$out/dex.zip")" "$(w "$out/classes.jar")"
cp "$out/dex.zip" "$plugin/android/voice-bubble.jar"
echo "built $plugin/android/voice-bubble.jar"
