import difflib
import json
import logging
from collections.abc import Callable
from datetime import datetime, timezone
from typing import Any, Awaitable

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Event, Folder, Note, User, UserProfileFact
from app.services import search, workspace
from app.services.agent_settings_service import get_agent_settings
from app.services.llm import chat_completion

logger = logging.getLogger(__name__)

TS_FMT = "%Y-%m-%d %H:%M:%S"


def _ts() -> str:
    return datetime.now(timezone.utc).strftime(TS_FMT)

TOOLS = [
    {
        "type": "function",
        "function": {
            "name": "create_note",
            "description": "Создать новую заметку в папке (в т.ч. подпапке) или корне. folder_id — id папки из дерева.",
            "parameters": {
                "type": "object",
                "properties": {
                    "folder_id": {"type": ["integer", "null"], "description": "ID папки или null для корня"},
                    "title": {"type": "string", "description": "Заголовок"},
                    "content": {"type": "string", "description": "Markdown по шаблону: Кратко, Основное, Ключевые пункты, Задачи (опционально), Связи/Выводы (опционально). Не копировать verbatim."},
                },
                "required": ["title", "content"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "create_task",
            "description": "Создать ЗАДАЧУ (не привязанную ко времени). Кладётся в папку «Задачи», при необходимости в подпапку по category. category — категория задачи (Работа, Дом, Здоровье, Учёба и т.д.). Используй когда пользователь просит задачу — БЕЗ даты/времени. subtasks — массив {text, done}.",
            "parameters": {
                "type": "object",
                "properties": {
                    "title": {"type": "string", "description": "Заголовок задачи (кратко)"},
                    "content": {"type": "string", "description": "Описание задачи (Markdown)"},
                    "category": {"type": ["string", "null"], "description": "Категория: Работа, Дом, Здоровье, Учёба, Проект X. null — без категории."},
                    "subtasks": {
                        "type": "array",
                        "items": {"type": "object", "properties": {"text": {"type": "string"}, "done": {"type": "boolean"}}, "required": ["text"]},
                        "description": "Подзадачи (опционально). Каждая: {text: 'описание', done: false}",
                    },
                },
                "required": ["title", "content"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "append_to_note",
            "description": "Добавить блок в конец существующей заметки",
            "parameters": {
                "type": "object",
                "properties": {
                    "note_id": {"type": "integer"},
                    "content": {"type": "string", "description": "Markdown-блок по той же структуре шаблона (Кратко, Основное и т.д.). Не копировать verbatim."},
                },
                "required": ["note_id", "content"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "patch_note",
            "description": "Заменить конкретный фрагмент текста (str_replace семантика)",
            "parameters": {
                "type": "object",
                "properties": {
                    "note_id": {"type": "integer"},
                    "old_text": {"type": "string", "description": "Точная строка из заметки"},
                    "new_text": {"type": "string"},
                },
                "required": ["note_id", "old_text", "new_text"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "create_folder",
            "description": "Создать папку. parent_folder_id — ID родительской папки для подпапки; null — корень.",
            "parameters": {
                "type": "object",
                "properties": {
                    "name": {"type": "string"},
                    "parent_folder_id": {"type": ["integer", "null"], "description": "ID родителя для подпапки; null = корень"},
                },
                "required": ["name"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "create_folder_with_note",
            "description": "Создать папку (или подпапку) и поместить в неё заметку. parent_folder_id — ID родителя для подпапки; null — корень. Используй parent_folder_id когда заметка относится к подкатегории существующей папки (задачи, проекты, идеи и т.д.).",
            "parameters": {
                "type": "object",
                "properties": {
                    "folder_name": {"type": "string", "description": "Имя папки/подпапки: Задачи, Проекты, Идеи, ЭБС-Лань и т.д."},
                    "parent_folder_id": {"type": ["integer", "null"], "description": "ID родительской папки для подпапки; null — создать в корне"},
                    "title": {"type": "string", "description": "Заголовок заметки"},
                    "content": {"type": "string", "description": "Markdown по шаблону: Кратко, Основное, Ключевые пункты, Задачи/Связи при необходимости."},
                },
                "required": ["folder_name", "title", "content"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "update_user_profile",
            "description": "Добавить факт о пользователе в долговременную память. Вызывай после создания заметки, если извлечена новая сфера или подкатегория. Примеры: «работаю в ЭБС-Лань» → fact=\"Пользователь работает в ЭБС-Лань. Идеи по работе класть в папку ЭБС-Лань.\"; создана подпапка Задачи в ЭБС-Лань → fact=\"Задачи по ЭБС-Лань класть в подпапку Задачи внутри папки ЭБС-Лань.\"",
            "parameters": {
                "type": "object",
                "properties": {
                    "fact": {"type": "string", "description": "Краткий факт: сфера + куда класть заметки (папка). Формат: «Пользователь X. Заметки по Y класть в папку Z.»"},
                },
                "required": ["fact"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "skip_save",
            "description": "Не сохранять. Вызывай, когда ввод не содержит ничего полезного для долговременной памяти: приветствие, благодарность, неполная мысль, мелкий вопрос, тест.",
            "parameters": {
                "type": "object",
                "properties": {
                    "reason": {"type": "string", "description": "Краткая причина: приветствие, нечего сохранять, тест и т.д."},
                },
                "required": ["reason"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "request_note_selection",
            "description": "Пользователь просит изменить/дополнить заметку, но НЕ указал какую. Подходят несколько заметок. Верни список кандидатов — фронтенд покажет выбор. Вызывай ТОЛЬКО когда: 1) нет блока «Заметка для редактирования», 2) запрос на редактирование/дополнение существующей заметки, 3) подходящих заметок 2 и более. Если одна — сразу append_to_note или patch_note.",
            "parameters": {
                "type": "object",
                "properties": {
                    "candidates": {
                        "type": "array",
                        "items": {"type": "object", "properties": {"note_id": {"type": "integer"}, "title": {"type": "string"}}, "required": ["note_id", "title"]},
                        "description": "Список заметок для выбора пользователем",
                    },
                },
                "required": ["candidates"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "create_note_with_event",
            "description": "Создать заметку + событие в календаре. ОБЯЗАТЕЛЬНО для: напоминание, встреча, добавить в календарь, событие на [дату], завтра в [время], в пятницу и т.п. При наличии даты/времени в запросе — только этот инструмент. ВСЕ поля извлекай из текста.",
            "parameters": {
                "type": "object",
                "properties": {
                    "folder_id": {"type": ["integer", "null"], "description": "ID папки или null для корня"},
                    "title": {"type": "string", "description": "Краткий заголовок события (для календаря)"},
                    "content": {"type": "string", "description": "Markdown по шаблону событий: ## Событие (что, когда, где), ## Заметка пользователя (исходный текст), ## Детали (подробности)."},
                    "starts_at": {"type": "string", "description": "ISO 8601 начало (например 2025-02-18T15:00:00)"},
                    "ends_at": {"type": "string", "description": "ISO 8601 конец (например 2025-02-18T16:00:00)"},
                },
                "required": ["title", "content", "starts_at", "ends_at"],
            },
        },
    },
]

SYSTEM_PROMPT = """Ты — агент организации заметок. Пользователь наговаривает или пишет сырые идеи (поток сознания, черновик).

Сегодня: {today} (используй для интерпретации относительных дат при создании событий: «завтра», «в пятницу», «через неделю» и т.д.).

Твоя задача: извлечь суть, переформулировать более подробно и структурировать идею, оформить в читаемый Markdown. НЕ копировать текст verbatim.

Алгоритм (порядок проверки важен):
1. ПРОВЕРЬ НАМЕРЕНИЕ СОБЫТИЯ первым. Ключевые слова: напоминание, добавить в календарь, встреча, событие, на дату, в [время], завтра в, в пятницу. Если пользователь просит что-то на конкретную дату/время → ТОЛЬКО create_note_with_event. create_folder_with_note и create_note НЕ создают события в календаре.
2. Для событий: извлекай дату и время из текста. starts_at/ends_at в ISO 8601. Дефолты: 09:00 для «только дата», 30 мин длительность если не указано.
3. ПРОВЕРЬ ЗАДАЧУ. Ключевые слова: задача, нужно сделать, не забудь, запомни что надо, добавить в задачи. Если НЕТ даты/времени → create_task (не create_note). Указывай category по контексту (Работа, Дом, Здоровье, Учёба, Проект и т.д.). В subtasks — подзадачи если есть чекбоксы/шаги.
4. ЕСЛИ в контексте есть блок «Заметка для редактирования» — пользователь работает с этой заметкой. Используй append_to_note или patch_note для неё. Не создавай новую заметку.
5. ЕСЛИ пользователь просит изменить/дополнить существующую заметку, но блок «Заметка для редактирования» отсутствует: подходит ОДНА заметка → append_to_note или patch_note. Подходят НЕСКОЛЬКО → request_note_selection с candidates.
6. Для обычных заметок (без даты/напоминания/задачи) выбери ОДНО:
   a) append_to_note — та же тема, запись дополняет существующую заметку
   b) create_note в существующей папке — тема папки совпадает, но отдельная запись
   c) create_task — если пользователь описывает что-то что НУЖНО СДЕЛАТЬ (без привязки ко времени)
   d) create_folder_with_note — новая сфера (работа, компания, учёба, здоровье). НЕ для напоминаний/событий — только для обычных заметок без привязки к дате.
   e) request_note_selection — только когда запрос на редактирование/дополнение и подходят 2+ заметки (п.5).

Правила папок и иерархии:
- Папки могут иметь подпапки (parent_folder_id). Контекст показывает дерево — используй id родителя для подпапок.
- Если заметка относится к подкатегории существующей папки — создай подпапку. Примеры подкатегорий: задачи, проекты, идеи, встречи, доки, обучение.
- Пример: есть папка «ЭБС-Лань» id=1; пользователь добавляет «задача с работы: сделать отчёт» → create_folder_with_note(folder_name="Задачи", parent_folder_id=1, …). НЕ класть в корень «ЭБС-Лань», а в подпапку.
- Если подпапка уже есть в дереве — create_note с folder_id этой подпапки.
- ПРЕДПОЧИТАЙ create_folder_with_note, когда пользователь упоминает: работу, компанию, должность, проект, учёбу, здоровье. Для новой сферы — корневая папка (parent_folder_id=null). Для подкатегории — подпапка (parent_folder_id=id родителя).
- create_note с folder_id=null только если контекст общий/разрозненный.

Правила контента и шаблон заметки:
- Контент ВСЕГДА — твоя переформулировка (максимально раскрыть суть), в Markdown
- Используй единый шаблон структуры (опускай пустые секции):

## Шаблон заметки (Markdown)
```markdown
## Кратко
[1–2 предложения: о чём заметка, главная мысль]

## Основное
[детали, контекст, пояснения — с подзаголовками ## если нужно]

## Ключевые пункты
- [буллеты для важных фактов, решений, идей]

## Задачи (если есть)
- [ ] действие 1
- [ ] действие 2

## Связи / Выводы (если есть)
[связанные идеи, итоговые мысли]
```

- Секции «Задачи» и «Связи/Выводы» — только если релевантны
- Для create_note_with_event: ## Событие | ## Заметка пользователя | ## Детали (без Кратко/Задачи)
- При append добавляй разделитель "\\n\\n---\\n\\n" перед новым блоком
- Заголовки краткие (до 5 слов)
- Для patch_note используй ТОЧНЫЕ строки из оригинала
- Отвечай ТОЛЬКО вызовами инструментов, без текста
- Один ввод → один основной tool call; дополнительно можно вызвать update_user_profile при создании заметки

Долговременная память:
- update_user_profile вызывай ТОЛЬКО для НОВЫХ фактов. Перед вызовом проверь блок «Известно о пользователе»: если такой факт уже есть — НЕ вызывай.
- После create_folder_with_note/create_note — вызови update_user_profile при новой сфере или подкатегории. Формат: «Пользователь X. Идеи по Y класть в папку Z.» Для подпапок: «Задачи по [компания] класть в подпапку Задачи внутри [папка].»
- skip_save — когда нечего сохранять: приветствие, «спасибо», неполная фраза, тест.
"""

TASKS_FOLDER_NAME = "Задачи"


async def _get_or_create_tasks_folder(db: AsyncSession, user_id: int) -> Folder:
    """Get or create root folder for tasks."""
    result = await db.execute(
        select(Folder).where(
            Folder.user_id == user_id,
            Folder.name == TASKS_FOLDER_NAME,
            Folder.parent_folder_id.is_(None),
        )
    )
    folder = result.scalar_one_or_none()
    if folder is not None:
        return folder
    folder = Folder(user_id=user_id, name=TASKS_FOLDER_NAME, parent_folder_id=None, order_index=0)
    db.add(folder)
    await db.flush()
    logger.info("Created tasks folder", extra={"user_id": user_id, "folder_id": folder.id})
    return folder


async def _get_or_create_task_category(
    db: AsyncSession, parent_folder: Folder, category_name: str, user_id: int
) -> Folder:
    """Get or create subfolder under tasks folder for category."""
    name = category_name.strip() if category_name else ""
    if not name:
        return parent_folder
    result = await db.execute(
        select(Folder).where(
            Folder.user_id == user_id,
            Folder.parent_folder_id == parent_folder.id,
            Folder.name == name,
        )
    )
    folder = result.scalar_one_or_none()
    if folder is not None:
        return folder
    folder = Folder(
        user_id=user_id,
        name=name,
        parent_folder_id=parent_folder.id,
        order_index=0,
    )
    db.add(folder)
    await db.flush()
    logger.info("Created task category folder", extra={"user_id": user_id, "name": name})
    return folder


async def _get_note_for_user(db: AsyncSession, note_id: int, user_id: int) -> Note | None:
    result = await db.execute(
        select(Note).where(
            Note.id == note_id, Note.user_id == user_id, Note.deleted_at.is_(None)
        )
    )
    return result.scalar_one_or_none()


async def _get_folder_for_user(db: AsyncSession, folder_id: int, user_id: int) -> Folder | None:
    result = await db.execute(
        select(Folder).where(Folder.id == folder_id, Folder.user_id == user_id)
    )
    return result.scalar_one_or_none()


def _execute_patch_note(content: str, old_text: str, new_text: str) -> str:
    if old_text in content:
        return content.replace(old_text, new_text, 1)
    lines = content.splitlines()
    close = difflib.get_close_matches(old_text, lines, n=1, cutoff=0.7)
    if close:
        logger.warning(
            "patch_note: used difflib fallback",
            extra={"old_preview": old_text[:50]},
        )
        return content.replace(close[0], new_text, 1)
    logger.warning(
        "patch_note: fragment not found",
        extra={"old_preview": old_text[:50]},
    )
    raise ValueError("Fragment not found")


async def get_profile_facts(db: AsyncSession, user_id: int) -> list[tuple[int, str]]:
    """Returns list of (id, fact) deduplicated by normalized fact."""
    result = await db.execute(
        select(UserProfileFact.id, UserProfileFact.fact)
        .where(UserProfileFact.user_id == user_id)
        .order_by(UserProfileFact.created_at)
    )
    raw = [(r[0], r[1]) for r in result.all()]
    seen: set[str] = set()
    deduped: list[tuple[int, str]] = []
    for fid, f in raw:
        n = f.strip().lower()
        if n and n not in seen:
            seen.add(n)
            deduped.append((fid, f))
    return deduped


async def build_context(db: AsyncSession, user_id: int, note_id: int | None = None) -> tuple[str, str]:
    """Returns (context, profile_block for system prompt). note_id — заметка для редактирования, её полный контент включается."""
    profile_facts = await get_profile_facts(db, user_id)
    profile_block = ""
    if profile_facts:
        profile_block = "\n\nИзвестно о пользователе (используй для выбора папки):\n" + "\n".join(f"- {f}" for _id, f in profile_facts)

    # Полный контент открытой заметки — для append/patch
    note_for_edit_block = ""
    if note_id is not None:
        note = await _get_note_for_user(db, note_id, user_id)
        if note is not None:
            content = workspace.get_content(user_id, note.id)
            note_for_edit_block = (
                "\n\n--- Заметка для редактирования (пользователь с ней работает, дополняй или меняй через append_to_note/patch_note) ---\n"
                f"id={note.id} folder_id={note.folder_id} title={note.title!r}\n\nПолный текст:\n{content or ''}\n---"
            )

    folders_result = await db.execute(
        select(Folder).where(Folder.user_id == user_id).order_by(Folder.order_index, Folder.id)
    )
    folders = list(folders_result.scalars().all())

    # Build tree: roots + children
    roots: list[Folder] = []
    for f in folders:
        if f.parent_folder_id is None:
            roots.append(f)

    def _tree_lines(items: list[Folder], indent: int = 0) -> list[str]:
        lines: list[str] = []
        prefix = "  " * indent
        for f in items:
            lines.append(f"{prefix}- id={f.id} name={f.name!r}")
            children = sorted(
                (x for x in folders if x.parent_folder_id == f.id),
                key=lambda x: (x.order_index, x.id),
            )
            lines.extend(_tree_lines(children, indent + 1))
        return lines

    parts: list[str] = ["Папки (иерархия; id для parent_folder_id):"]
    parts.extend(_tree_lines(roots))

    notes_result = await db.execute(
        select(Note).where(Note.user_id == user_id, Note.deleted_at.is_(None))
    )
    notes = list(notes_result.scalars().all())

    parts.append("\nЗаметки (id, title, preview 400):")
    for n in notes:
        content = workspace.get_content(user_id, n.id)
        preview = (content or "")[:400].replace("\n", " ")
        parts.append(f"  - id={n.id} folder_id={n.folder_id} title={n.title!r} preview={preview!r}")

    events_result = await db.execute(
        select(Event).where(Event.user_id == user_id).order_by(Event.starts_at)
    )
    events = list(events_result.scalars().all())
    parts.append("\nСобытия (id, note_id, title, starts_at, ends_at):")
    for e in events:
        parts.append(f"  - id={e.id} note_id={e.note_id} title={e.title!r} starts={e.starts_at.isoformat()} ends={e.ends_at.isoformat()}")

    context_str = "\n".join(parts)
    if note_for_edit_block:
        context_str = note_for_edit_block + "\n\n" + context_str
    return context_str, profile_block


async def process_agent(
    db: AsyncSession,
    user: User,
    user_input: str,
    *,
    note_id: int | None = None,
    on_event: Callable[[str, dict[str, Any]], Awaitable[None]] | None = None,
) -> tuple[list[int], list[int], str | None]:
    async def emit(phase: str, **data: Any) -> None:
        if on_event:
            await on_event(phase, data)

    await emit("building_context", message="Загрузка контекста…")

    context, profile_block = await build_context(db, user.id, note_id=note_id)

    today_str = datetime.now(timezone.utc).strftime("%Y-%m-%d, %A")
    system_content = SYSTEM_PROMPT.format(today=today_str) + profile_block

    messages = [
        {"role": "system", "content": system_content},
        {"role": "user", "content": f"Контекст:\n{context}\n\nСырой ввод (наговор/черновик — переформулируй и структурируй):\n{user_input}"},
    ]

    affected_ids: list[int] = []
    created_ids: list[int] = []
    created_note_ids: list[int] = []

    await emit("calling_llm", message="Анализирую и переформулирую…")

    agent_params = await get_agent_settings(db, user.id, "notes")
    response = await chat_completion(
        messages,
        tools=TOOLS,
        base_url=agent_params.get("base_url"),
        model=agent_params.get("model"),
        api_key=agent_params.get("api_key") or None,
        temperature=agent_params["temperature"],
        frequency_penalty=agent_params["frequency_penalty"],
        top_p=agent_params["top_p"],
        max_tokens=agent_params["max_tokens"],
    )
    message = response.get("message", response)
    if isinstance(message, dict):
        content = message.get("content")
        tool_calls = message.get("tool_calls", [])
    else:
        content = None
        tool_calls = []

    if not tool_calls:
        await emit("done", affected_ids=affected_ids, created_ids=created_ids, created_note_ids=created_note_ids)
        return affected_ids, created_ids, None

    _status_msg = {
        "create_note": "Создаю заметку",
        "create_task": "Создаю задачу",
        "append_to_note": "Добавляю в заметку",
        "patch_note": "Редактирую заметку",
        "create_folder": "Создаю папку",
        "create_folder_with_note": "Создаю папку и заметку",
        "create_note_with_event": "Добавляю событие в календарь",
        "update_user_profile": "Запоминаю контекст",
        "skip_save": "Пропускаю сохранение",
        "request_note_selection": "Выбор заметки",
    }

    skipped_reason: str | None = None

    for tc in tool_calls:
        fn = tc.get("function", {})
        name = fn.get("name")
        args_str = fn.get("arguments", "{}")
        try:
            args = json.loads(args_str)
        except json.JSONDecodeError as e:
            logger.error("Agent tool args parse error", extra={"name": name, "args": args_str, "error": str(e)})
            continue

        msg = _status_msg.get(name, name)
        if name == "create_note":
            msg = f"Создаю заметку «{args.get('title', '')}»"
        elif name == "create_task":
            msg = f"Создаю задачу «{args.get('title', '')}»"
        elif name == "append_to_note":
            msg = "Добавляю в существующую заметку"
        elif name == "create_folder_with_note":
            msg = f"Создаю папку «{args.get('folder_name', '')}» и заметку"
        elif name == "create_note_with_event":
            msg = f"Добавляю событие «{args.get('title', '')}»"
        elif name == "skip_save":
            skipped_reason = args.get("reason", "нечего сохранять")
            msg = f"Пропускаю: {skipped_reason}"

        await emit("executing_tool", tool=name, message=msg)

        if name == "request_note_selection" and note_id is None:
            raw = args.get("candidates") or []
            if not isinstance(raw, list):
                raw = []
            validated: list[dict[str, Any]] = []
            for c in raw[:20]:
                if not isinstance(c, dict):
                    continue
                nid = c.get("note_id")
                title = c.get("title") or ""
                if nid is None:
                    continue
                try:
                    nid = int(nid)
                except (TypeError, ValueError):
                    continue
                note = await _get_note_for_user(db, nid, user.id)
                if note is not None:
                    validated.append({"note_id": nid, "title": title or note.title})
            if validated:
                await emit(
                    "done",
                    affected_ids=[],
                    created_ids=[],
                    created_note_ids=[],
                    requires_note_selection=True,
                    candidates=validated,
                )
                return [], [], None

        if name == "create_note":
            folder_id = args.get("folder_id")
            title = args.get("title")
            content = args.get("content", "")
            if not title:
                continue
            if folder_id is not None:
                folder = await _get_folder_for_user(db, folder_id, user.id)
                if folder is None:
                    logger.warning("Agent create_note: folder not found", extra={"folder_id": folder_id})
                    continue
            note = Note(
                user_id=user.id,
                folder_id=folder_id,
                title=title,
                content="",
            )
            db.add(note)
            await db.flush()
            content_full = f"Создано: {_ts()}\n\n{content}"
            workspace.set_content(user.id, note.id, content_full)
            search.index_note(user.id, note.id, note.title, content_full)
            created_ids.append(note.id)
            created_note_ids.append(note.id)
            affected_ids.append(note.id)

        elif name == "create_task":
            title = args.get("title")
            content = args.get("content", "")
            category = args.get("category")
            subtasks_raw = args.get("subtasks")
            if not title:
                continue
            tasks_folder = await _get_or_create_tasks_folder(db, user.id)
            target_folder = await _get_or_create_task_category(db, tasks_folder, category or "", user.id)
            subtasks: list[dict] | None = None
            if isinstance(subtasks_raw, list) and subtasks_raw:
                subtasks = []
                for st in subtasks_raw:
                    if isinstance(st, dict) and st.get("text"):
                        subtasks.append({"text": st["text"], "done": bool(st.get("done", False))})
            note = Note(
                user_id=user.id,
                folder_id=target_folder.id,
                title=title,
                content="",
                is_task=True,
                subtasks=subtasks,
            )
            db.add(note)
            await db.flush()
            content_full = f"Создано: {_ts()}\n\n{content}"
            workspace.set_content(user.id, note.id, content_full)
            search.index_note(user.id, note.id, note.title, content_full)
            created_ids.append(note.id)
            created_note_ids.append(note.id)
            affected_ids.append(note.id)

        elif name == "append_to_note":
            note_id = args.get("note_id")
            content = args.get("content", "")
            if note_id is None:
                continue
            note = await _get_note_for_user(db, note_id, user.id)
            if note is None:
                logger.warning("Agent append_to_note: note not found", extra={"note_id": note_id})
                continue
            cur = workspace.get_content(user.id, note.id)
            new_content = (cur or "") + f"\n\n--- {_ts()} ---\n\n" + content
            workspace.set_content(user.id, note.id, new_content)
            search.index_note(user.id, note.id, note.title, new_content)
            note.updated_at = datetime.now(timezone.utc).replace(tzinfo=None)
            affected_ids.append(note.id)

        elif name == "patch_note":
            note_id = args.get("note_id")
            old_text = args.get("old_text", "")
            new_text = args.get("new_text", "")
            if note_id is None or not old_text:
                continue
            note = await _get_note_for_user(db, note_id, user.id)
            if note is None:
                logger.warning("Agent patch_note: note not found", extra={"note_id": note_id})
                continue
            cur = workspace.get_content(user.id, note.id)
            new_content = _execute_patch_note(cur, old_text, new_text)
            workspace.set_content(user.id, note.id, new_content)
            search.index_note(user.id, note.id, note.title, new_content)
            note.updated_at = datetime.now(timezone.utc).replace(tzinfo=None)
            affected_ids.append(note.id)

        elif name == "create_folder":
            folder_name = args.get("name")
            parent_id = args.get("parent_folder_id")
            if not folder_name:
                continue
            if parent_id is not None:
                parent = await _get_folder_for_user(db, parent_id, user.id)
                if parent is None:
                    logger.warning("Agent create_folder: parent not found", extra={"parent_id": parent_id})
                    continue
            folder = Folder(
                user_id=user.id,
                name=folder_name,
                parent_folder_id=parent_id,
                order_index=0,
            )
            db.add(folder)
            await db.flush()
            created_ids.append(folder.id)
            affected_ids.append(folder.id)

        elif name == "create_folder_with_note":
            folder_name = args.get("folder_name")
            parent_id = args.get("parent_folder_id")
            title = args.get("title")
            content = args.get("content", "")
            if not folder_name or not title:
                continue
            if parent_id is not None:
                parent = await _get_folder_for_user(db, parent_id, user.id)
                if parent is None:
                    logger.warning(
                        "Agent create_folder_with_note: parent not found",
                        extra={"parent_id": parent_id},
                    )
                    continue
            folder = Folder(
                user_id=user.id,
                name=folder_name,
                parent_folder_id=parent_id,
                order_index=0,
            )
            db.add(folder)
            await db.flush()
            created_ids.append(folder.id)
            affected_ids.append(folder.id)
            # note is added below — created_note_ids.append there
            note = Note(
                user_id=user.id,
                folder_id=folder.id,
                title=title,
                content="",
            )
            db.add(note)
            await db.flush()
            content_full = f"Создано: {_ts()}\n\n{content}"
            workspace.set_content(user.id, note.id, content_full)
            search.index_note(user.id, note.id, note.title, content_full)
            created_ids.append(note.id)
            created_note_ids.append(note.id)
            affected_ids.append(note.id)

        elif name == "create_note_with_event":
            folder_id = args.get("folder_id")
            title = args.get("title")
            content = args.get("content", "")
            starts_str = args.get("starts_at")
            ends_str = args.get("ends_at")
            if not title or not starts_str or not ends_str:
                logger.warning(
                    "Agent create_note_with_event: missing required fields",
                    extra={"args_keys": list(args.keys())},
                )
                continue
            if folder_id is not None:
                folder = await _get_folder_for_user(db, folder_id, user.id)
                if folder is None:
                    logger.warning(
                        "Agent create_note_with_event: folder not found",
                        extra={"folder_id": folder_id},
                    )
                    continue
            try:
                starts_dt = datetime.fromisoformat(starts_str.replace("Z", "+00:00"))
                ends_dt = datetime.fromisoformat(ends_str.replace("Z", "+00:00"))
            except (ValueError, TypeError) as e:
                logger.error(
                    "Agent create_note_with_event: invalid datetime",
                    extra={"starts_at": starts_str, "ends_at": ends_str, "error": str(e)},
                )
                continue
            if starts_dt.tzinfo is None:
                starts_dt = starts_dt.replace(tzinfo=timezone.utc)
            if ends_dt.tzinfo is None:
                ends_dt = ends_dt.replace(tzinfo=timezone.utc)
            note = Note(
                user_id=user.id,
                folder_id=folder_id,
                title=title,
                content="",
            )
            db.add(note)
            await db.flush()
            content_full = f"Создано: {_ts()}\n\n{content}"
            workspace.set_content(user.id, note.id, content_full)
            search.index_note(user.id, note.id, note.title, content_full)
            event = Event(
                user_id=user.id,
                note_id=note.id,
                title=title,
                starts_at=starts_dt,
                ends_at=ends_dt,
            )
            db.add(event)
            created_ids.append(note.id)
            created_note_ids.append(note.id)
            affected_ids.append(note.id)

        elif name == "update_user_profile":
            fact = args.get("fact", "").strip()
            if fact:
                existing = await db.execute(
                    select(UserProfileFact.fact).where(UserProfileFact.user_id == user.id)
                )
                existing_facts = {r[0].strip().lower() for r in existing.all()}
                fact_normalized = fact.lower()
                if fact_normalized not in existing_facts:
                    db.add(UserProfileFact(user_id=user.id, fact=fact))
                    await db.flush()
                else:
                    logger.debug("update_user_profile: skipped duplicate", extra={"fact_preview": fact[:50]})

        elif name == "skip_save":
            skipped_reason = args.get("reason", "нечего сохранять")

    if skipped_reason and not affected_ids and not created_ids:
        await emit("done", affected_ids=[], created_ids=[], created_note_ids=[], skipped=True, reason=skipped_reason)
        return affected_ids, created_ids, skipped_reason

    await emit("saving", message="Сохраняю…")
    await db.commit()
    await emit("done", affected_ids=affected_ids, created_ids=created_ids, created_note_ids=created_note_ids)
    return affected_ids, created_ids, None
