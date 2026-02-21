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

## Офлайн и синхронизация

APK работает с локальной базой данных (IndexedDB). При первом запуске:

1. Появится экран «URL сервера» — укажите адрес backend (например, `https://notes.example.com`)
2. Войдите в аккаунт
3. Данные кешируются локально и доступны без интернета
4. При редактировании офлайн изменения сохраняются в очередь и синхронизируются при восстановлении сети
5. **Создание заметок офлайн:** кнопка «Add» или «Просто заметка» — заметка сохраняется локально, при подключении отправляется на сервер

Сменить сервер: Ещё → «Сменить сервер».

## Создание заметок без агента

Кнопка «Просто заметка» в поле ввода создаёт заметку сразу в корне, без LLM. Удобно офлайн (агент недоступен) или когда не нужна автоматическая маршрутизация. Первая строка ввода — заголовок, остальное — содержимое.

## Загрузка с удалённого URL (разработка)

Чтобы приложение загружало контент с сервера вместо встроенных файлов, добавьте в `capacitor.config.js`:

```js
server: {
  url: "https://your-server.com",
  cleartext: false,
},
```

Можно задать URL по умолчанию при сборке: `VITE_API_BASE=https://your-server.com ./scripts/build-android.sh`
