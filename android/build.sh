#!/bin/sh
# Builds the Bladedeck Android app (dist/Bladedeck-phone.apk) without Gradle: aapt2 for
# resources, javac + d8 for code, apksigner to sign. Needs a JDK and the Android SDK
# (platform 34, build-tools 34). Point ANDROID_HOME and JAVA_HOME at them.
set -e
cd "$(dirname "$0")"
SDK="${ANDROID_HOME:-$HOME/Android/sdk}"; BT="$SDK/build-tools/34.0.0"; JAR="$SDK/platforms/android-34/android.jar"
[ -n "$JAVA_HOME" ] && PATH="$JAVA_HOME/bin:$PATH"
OUT=build; rm -rf "$OUT"; mkdir -p "$OUT/res" "$OUT/gen" "$OUT/classes" "$OUT/dex"
# Launcher icons from the companion icon.
for d in mdpi:48 hdpi:72 xhdpi:96 xxhdpi:144 xxxhdpi:192; do
  mkdir -p "res/mipmap-${d%%:*}"; magick ../companion/icon-512.png -resize "${d##*:}x${d##*:}" "res/mipmap-${d%%:*}/ic_launcher.png"
done
"$BT/aapt2" compile --dir res -o "$OUT/res.zip"
"$BT/aapt2" link -o "$OUT/base.apk" -I "$JAR" --manifest AndroidManifest.xml -A assets --java "$OUT/gen" "$OUT/res.zip" --auto-add-overlay
javac --release 11 -encoding UTF-8 -classpath "$JAR" -d "$OUT/classes" $(find src "$OUT/gen" -name '*.java')
"$BT/d8" --lib "$JAR" --min-api 24 --output "$OUT/dex" $(find "$OUT/classes" -name '*.class')
cp "$OUT/base.apk" "$OUT/unsigned.apk"; (cd "$OUT/dex" && jar --update --no-manifest --file ../unsigned.apk classes.dex)
"$BT/zipalign" -f -p 4 "$OUT/unsigned.apk" "$OUT/aligned.apk"
KS="${BLADEDECK_KEYSTORE:-$HOME/Android/bladedeck.keystore}"
[ -f "$KS" ] || keytool -genkeypair -keystore "$KS" -storepass bladedeck -keypass bladedeck -alias bladedeck -keyalg RSA -keysize 2048 -validity 10000 -dname "CN=Bladedeck" >/dev/null 2>&1
mkdir -p ../dist
"$BT/apksigner" sign --ks "$KS" --ks-pass pass:bladedeck --key-pass pass:bladedeck --out ../dist/Bladedeck-phone.apk "$OUT/aligned.apk"
echo "Built dist/Bladedeck-phone.apk"
