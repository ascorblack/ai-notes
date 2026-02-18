# AI Notes

**Умный менеджер заметок с голосовым вводом и LLM-агентом**, который организует заметки по смыслу. Пишите или говорите — агент поместит каждую заметку в нужную папку или добавит к существующей. Web-приложение + Android (Capacitor).

## Архитектура

```mermaid
flowchart TB
    subgraph Infra [Инфраструктура]
        Nginx["Nginx :4000"]
        Frontend[Frontend React]
        Backend[Backend FastAPI]
        Nginx --> Frontend
        Nginx --> Backend
    end

    subgraph Data [Хранилища]
        PostgreSQL[(PostgreSQL)]
        Redis[(Redis Stack)]
        Workspace["workspace MD files"]
    end

    subgraph External [Внешние]
        vLLM[vLLM API]
    end

    Backend --> PostgreSQL
    Backend --> Redis
    Backend --> Workspace
    Backend --> vLLM

    subgraph SearchFlow [Гибридный поиск]
        SearchAPI["GET /search"]
        EmbedService[Embedding Service]
        FT_BM25[RediSearch FT BM25]
        FT_KNN[RediSearch KNN]
        RRF[RRF Merge]
        SearchAPI --> FT_BM25
        SearchAPI --> EmbedService
        EmbedService --> FT_KNN
        FT_BM25 --> RRF
        FT_KNN --> RRF
        RRF --> SearchResults["Результаты + snippets"]
    end

    subgraph Indexing [Индексация]
        NoteCRUD["create/update/delete note"]
        SearchIdx[Search Index Service]
        NoteCRUD --> Workspace
        NoteCRUD --> SearchIdx
        SearchIdx --> Redis
    end

    subgraph NotesAgent [Агент заметок]
        UserInput[Ввод пользователя]
        AgentAPI["POST /agent/process"]
        AgentTools["create_note, append, patch, create_folder"]
        AgentAPI --> vLLM
        vLLM --> AgentTools
        AgentTools --> NoteCRUD
    end

    subgraph ChatAgent [Агент чата]
        ChatInput["Ввод в /chat"]
        ChatAPI["POST sessions/id/message"]
        DBChat[(Chat persistence)]
        ChatLLM[vLLM Stream]
        ToolSearch[search_notes]
        ChatAPI --> DBChat
        ChatAPI --> ChatLLM
        ChatLLM --> SSE["SSE: content_delta, tool_call, tool_result"]
        ChatLLM --> ToolSearch
        ToolSearch --> Redis
        ChatLLM --> DBChat
    end

    subgraph Voice [Голосовой ввод]
        MediaRecorder[MediaRecorder webm]
        TranscribeAPI["POST /transcribe"]
        Whisper[faster-whisper STT]
        TranscribeAPI --> Whisper
    end

    subgraph Auth [Аутентификация]
        JWT[JWT auth]
        AuthAPI["/auth/*"]
        AuthAPI --> PostgreSQL
    end

    Frontend --> SearchAPI
    Frontend --> ChatAPI
    Frontend --> AgentAPI
    Frontend --> TranscribeAPI
    Frontend --> AuthAPI
```



## Стек

- **Frontend:** React 18, Vite, TailwindCSS, react-markdown, CodeMirror 6, Zustand, TanStack Query, Framer Motion
- **Backend:** FastAPI, SQLAlchemy 2 async, PostgreSQL 16, Redis, JWT auth, faster-whisper (STT), sentence-transformers (эмбеддинги), httpx (клиент vLLM)
- **Mobile:** Capacitor 6, Android
- **Инфра:** Docker Compose, Nginx

## Требования

- Docker и Docker Compose
- Запущенный vLLM-сервер (например Qwen3 с tool-calling) — опционально для функций агента

## Быстрый старт

1. Скопируйте env и задайте значения:
  ```bash
   cp .env.example .env
   # Отредактируйте .env: SECRET_KEY, DATABASE_URL, VLLM_BASE_URL (если используете агента)
  ```
2. Запустите стек:
  ```bash
   docker compose up -d
  ```
3. Откройте [http://localhost:4000](http://localhost:4000)

## Конфигурация


| Переменная         | Описание                                                              |
| ------------------ | --------------------------------------------------------------------- |
| `DATABASE_URL`     | Строка подключения к PostgreSQL                                       |
| `SECRET_KEY`       | Ключ подписи JWT (`openssl rand -hex 32`)                             |
| `VLLM_BASE_URL`    | Базовый URL vLLM API (например `http://host.docker.internal:8000/v1`) |
| `VLLM_MODEL`       | Имя модели                                                            |
| `WHISPER_MODEL`    | Модель faster-whisper (по умолчанию `distil-large-v3`)                |
| `WHISPER_LANGUAGE` | Язык транскрипции (по умолчанию `ru`)                                 |
| `CORS_ORIGINS`     | Разрешённые origins через запятую                                     |


## Возможности

- **Workspace:** Контент заметок хранится как Markdown-файлы в `workspace/{user_id}/{note_id}.md` (локальная папка, не БД)
- **Auth:** Регистрация / вход по JWT
- **Заметки:** Создание, редактирование, удаление; Markdown с превью; перетаскивание для изменения порядка
- **Папки:** Древовидная структура; заметки могут быть в папках или в корне
- **Агент:** Ввод пользователя отправляется в LLM, который решает — `create_note`, `append_to_note`, `create_folder` или `patch_note`; факты профиля влияют на выбор папки
- **Голос:** MediaRecorder → webm → faster-whisper → текст в поле ввода
- **Поиск:** Гибридный (векторный + по ключевым словам) через Redis; эмбеддинги для семантического поиска

## Разработка

Запуск бэкенда локально (нужны `.env` и Postgres):

```bash
cd backend
poetry install
alembic upgrade head
poetry run uvicorn app.main:app --reload
```

Запуск фронтенда с прокси на API:

```bash
cd frontend
npm install
npm run dev
```

## Android

Скрипт собирает фронтенд, копирует в `mobile/www` и собирает APK:

```bash
./scripts/build-android.sh              # debug APK
./scripts/build-android.sh --release    # release APK
```

Для release нужен `mobile/android/keystore.properties` (см. `keystore.properties.example`). Подробности — в [mobile/README.md](mobile/README.md).

## Лицензия

MIT