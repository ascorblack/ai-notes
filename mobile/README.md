# AI Notes — мобильное приложение (Android)

Сборка Android APK через Capacitor. Web-приложение упаковывается в нативную оболочку.

## Требования

- Node.js, npm
- Android SDK (Android Studio или command-line tools)
- Собранный фронтенд в `../frontend/dist`

## Сборка

1. **Соберите фронтенд:**
   ```bash
   cd ../frontend
   npm install
   npm run build
   ```

2. **Скопируйте результат в `www`:**
   ```bash
   cp -r dist/* ../mobile/www/
   ```

3. **Соберите APK:**
   ```bash
   ./scripts/build-android.sh              # debug
   ./scripts/build-android.sh --release   # release (нужен keystore.properties)
   ```

## Release-подпись

Для release APK нужен `android/keystore.properties`:

```bash
cp android/keystore.properties.example android/keystore.properties
# Отредактируйте: storeFile, storePassword, keyAlias, keyPassword
```

Keystore-файл (`.keystore`/`.jks`) храните локально, не коммитьте в репозиторий.

## Загрузка с удалённого URL

Чтобы приложение загружало контент с сервера вместо встроенных файлов, добавьте в `capacitor.config.js`:

```js
server: {
  url: "https://your-server.com",
  cleartext: false,
},
```
