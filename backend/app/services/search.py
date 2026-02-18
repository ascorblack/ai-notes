"""Hybrid search (BM25 + vector) via Redis Stack. Index notes for search."""

import logging
import re
import struct
from typing import Any

import redis
from redis.commands.search.field import TagField, TextField, VectorField
from redis.commands.search.index_definition import IndexDefinition, IndexType

from app.config import settings
from app.services.embeddings import EMBEDDING_DIMS, embed

logger = logging.getLogger(__name__)

INDEX_NAME = "notes_search"
KEY_PREFIX = "note_doc"
RRF_K = 60


def _get_redis() -> redis.Redis:
    return redis.from_url(settings.redis_url, decode_responses=False)


def _doc_key(user_id: int, note_id: int) -> str:
    return f"{KEY_PREFIX}:{user_id}:{note_id}"


def ensure_index_exists(r: redis.Redis) -> None:
    """Create index if it does not exist."""
    try:
        r.ft(INDEX_NAME).info()
        return
    except redis.ResponseError as e:
        if "no such index" not in str(e).lower() and "unknown index" not in str(e).lower():
            logger.error("Redis index check failed", extra={"error": str(e)})
            raise

    schema = (
        TagField("user_id"),
        TextField("note_id"),
        TextField("title"),
        TextField("content"),
        VectorField(
            "embedding",
            "FLAT",
            {
                "TYPE": "FLOAT32",
                "DIM": EMBEDDING_DIMS,
                "DISTANCE_METRIC": "COSINE",
            },
        ),
    )
    definition = IndexDefinition(
        prefix=[f"{KEY_PREFIX}:"],
        index_type=IndexType.HASH,
        language="russian",
    )
    r.ft(INDEX_NAME).create_index(schema, definition=definition)
    logger.info("Created Redis search index: %s", INDEX_NAME)


def index_note(user_id: int, note_id: int, title: str, content: str) -> None:
    """Index or reindex a single note."""
    r = _get_redis()
    ensure_index_exists(r)

    key = _doc_key(user_id, note_id)
    embedding = embed(f"{title}\n{content}"[:8000])
    vec_bytes = struct.pack(f"<{len(embedding)}f", *embedding)

    r.hset(
        key,
        mapping={
            "user_id": str(user_id),
            "note_id": str(note_id),
            "title": (title[:500] if title else ""),
            "content": (content[:50000] if content else ""),
            "embedding": vec_bytes,
        },
    )


def delete_note(user_id: int, note_id: int) -> None:
    """Remove note from index."""
    r = _get_redis()
    key = _doc_key(user_id, note_id)
    r.delete(key)


def reindex_notes_sync(notes: list[tuple[int, int, str, str]]) -> int:
    """Reindex notes. Each item: (user_id, note_id, title, content). Returns count."""
    count = 0
    for user_id, note_id, title, content in notes:
        index_note(user_id, note_id, title, content)
        count += 1
    return count


def _rrf_score(rank: int) -> float:
    return 1.0 / (RRF_K + rank + 1)


def _parse_search_response(raw: list) -> list[dict[str, Any]]:
    """Parse FT.SEARCH response: [total, key1, [f1,v1,f2,v2,...], key2, ...]."""
    docs = []
    if not raw or len(raw) < 2:
        return docs
    i = 1
    while i + 1 < len(raw):
        _key = raw[i]
        pairs = raw[i + 1]
        i += 2
        doc: dict[str, Any] = {}
        if isinstance(pairs, (list, tuple)):
            for j in range(0, len(pairs) - 1, 2):
                k = pairs[j]
                v = pairs[j + 1]
                key = k.decode() if isinstance(k, bytes) else str(k)
                if isinstance(v, bytes):
                    try:
                        val = v.decode("utf-8")
                    except UnicodeDecodeError:
                        continue  # skip binary fields (e.g. embedding)
                else:
                    val = v
                doc[key] = val
        docs.append(doc)
    return docs


def _escape_query(s: str) -> str:
    """Escape special chars for RediSearch query."""
    return re.sub(r"([\\\[\]{}()\"'~*?:!@^])", r"\\\1", s)


def search_notes_union(
    user_id: int,
    terms: list[str],
    limit: int = 10,
) -> list[dict[str, Any]]:
    """
    Hybrid search with OR over multiple terms. One BM25 query (term1|term2|...), vector for joined terms.
    Returns list of {note_id, title, snippet, score}.
    """
    terms = [str(t).strip() for t in terms if t and str(t).strip()]
    if not terms:
        return []

    logger.info(
        "search.search_notes_union called",
        extra={"user_id": user_id, "terms": terms[:20], "limit": limit},
    )
    r = _get_redis()
    try:
        ensure_index_exists(r)
    except redis.RedisError as e:
        logger.error("Redis unavailable for search", extra={"error": str(e)})
        raise

    results_by_note: dict[int, dict[str, Any]] = {}
    escaped = [_escape_query(t) for t in terms]
    or_clause = "|".join(escaped)

    def add_rrf(note_id: int, score: float, title: str = "", snippet: str = "") -> None:
        if note_id not in results_by_note:
            results_by_note[note_id] = {"note_id": note_id, "title": title, "snippet": snippet, "score": 0.0}
        results_by_note[note_id]["score"] += score
        if title and not results_by_note[note_id]["title"]:
            results_by_note[note_id]["title"] = title
        if snippet and not results_by_note[note_id]["snippet"]:
            results_by_note[note_id]["snippet"] = snippet

    text_q = f"@user_id:{{{user_id}}} @title|content:({or_clause})"
    try:
        text_raw = r.execute_command(
            "FT.SEARCH",
            INDEX_NAME,
            text_q,
            "RETURN", "3", "note_id", "title", "content",
            "LANGUAGE", "russian",
            "LIMIT", "0", str(limit * 2),
            "DIALECT", "2",
        )
        text_docs = _parse_search_response(text_raw)
    except redis.ResponseError as e:
        logger.warning("Text search OR failed", extra={"error": str(e), "query": text_q[:150]})
        text_docs = []

    for rank, doc in enumerate(text_docs):
        nid = int(doc.get("note_id", 0) or 0)
        if nid:
            title = str(doc.get("title") or "")
            content = str(doc.get("content") or "")
            snippet = content[:200].replace("\n", " ") if content else ""
            add_rrf(nid, _rrf_score(rank), title=title, snippet=snippet)

    vec_query = " ".join(terms[:5])
    vec = embed(vec_query)
    vec_bytes = struct.pack(f"<{len(vec)}f", *vec)
    vector_q = f"(@user_id:{{{user_id}}})=>[KNN {limit * 2} @embedding $vec AS score]"
    try:
        vec_raw = r.execute_command(
            "FT.SEARCH",
            INDEX_NAME,
            vector_q,
            "SORTBY", "score", "ASC",
            "RETURN", "4", "note_id", "title", "content", "score",
            "LIMIT", "0", str(limit * 2),
            "PARAMS", "2", "vec", vec_bytes,
            "DIALECT", "2",
        )
        vec_docs = _parse_search_response(vec_raw)
    except Exception as e:
        logger.warning("Vector search failed", extra={"error": str(e)})
        vec_docs = []

    for rank, doc in enumerate(vec_docs):
        nid = int(doc.get("note_id", 0) or 0)
        if not nid:
            continue
        try:
            dist = float(doc.get("score", 2.0) or 2.0)
        except (TypeError, ValueError):
            dist = 2.0
        if dist > settings.search_vector_score_threshold:
            continue
        title = str(doc.get("title") or "")
        content = str(doc.get("content") or "")
        snippet = content[:200].replace("\n", " ") if content else ""
        add_rrf(nid, _rrf_score(rank), title=title, snippet=snippet)

    sorted_results = sorted(
        results_by_note.values(),
        key=lambda x: -x["score"],
    )[:limit]

    logger.info(
        "search.search_notes_union result",
        extra={
            "user_id": user_id,
            "terms_count": len(terms),
            "merged_count": len(sorted_results),
            "note_ids": [r["note_id"] for r in sorted_results],
        },
    )
    return sorted_results


def search_notes(
    user_id: int,
    query: str,
    limit: int = 10,
) -> list[dict[str, Any]]:
    """
    Hybrid search: BM25 on title+content + vector KNN. Merge with RRF.
    Returns list of {note_id, title, snippet, score}.
    """
    if not query or not query.strip():
        return []

    logger.info("search.search_notes called", extra={"user_id": user_id, "query": query[:100], "limit": limit})
    r = _get_redis()
    try:
        ensure_index_exists(r)
    except redis.RedisError as e:
        logger.error("Redis unavailable for search", extra={"error": str(e)})
        raise

    results_by_note: dict[int, dict[str, Any]] = {}
    query_clean = query.strip()
    escaped = _escape_query(query_clean)

    def add_rrf(note_id: int, score: float, title: str = "", snippet: str = "") -> None:
        if note_id not in results_by_note:
            results_by_note[note_id] = {"note_id": note_id, "title": title, "snippet": snippet, "score": 0.0}
        results_by_note[note_id]["score"] += score
        if title and not results_by_note[note_id]["title"]:
            results_by_note[note_id]["title"] = title
        if snippet and not results_by_note[note_id]["snippet"]:
            results_by_note[note_id]["snippet"] = snippet

    text_q = f"@user_id:{{{user_id}}} @title|content:({escaped})"
    try:
        text_raw = r.execute_command(
            "FT.SEARCH",
            INDEX_NAME,
            text_q,
            "RETURN", "3", "note_id", "title", "content",
            "LANGUAGE", "russian",
            "LIMIT", "0", str(limit * 2),
            "DIALECT", "2",
        )
        text_docs = _parse_search_response(text_raw)
    except redis.ResponseError as e:
        logger.warning("Text search failed", extra={"error": str(e), "query": text_q[:100]})
        text_docs = []

    if not text_docs:
        try:
            fuzzy_q = f"@user_id:{{{user_id}}} @title|content:(%{query_clean}%)"
            fuzzy_raw = r.execute_command(
                "FT.SEARCH",
                INDEX_NAME,
                fuzzy_q,
                "RETURN", "3", "note_id", "title", "content",
                "LANGUAGE", "russian",
                "LIMIT", "0", str(limit * 2),
                "DIALECT", "2",
            )
            text_docs = _parse_search_response(fuzzy_raw)
        except redis.ResponseError:
            pass

    for rank, doc in enumerate(text_docs):
        nid = int(doc.get("note_id", 0) or 0)
        if nid:
            title = str(doc.get("title") or "")
            content = str(doc.get("content") or "")
            snippet = content[:200].replace("\n", " ") if content else ""
            add_rrf(nid, _rrf_score(rank), title=title, snippet=snippet)

    if not results_by_note:
        try:
            count_raw = r.execute_command(
                "FT.SEARCH", INDEX_NAME, f"@user_id:{{{user_id}}}", "LIMIT", "0", "0"
            )
            total_for_user = int(count_raw[0]) if count_raw else 0
            logger.info(
                "Search empty user_id=%s user_doc_count=%s query=%s",
                user_id, total_for_user, query_clean[:50],
            )
        except redis.ResponseError:
            pass

    vec = embed(query_clean)
    vec_bytes = struct.pack(f"<{len(vec)}f", *vec)
    vector_q = f"(@user_id:{{{user_id}}})=>[KNN {limit * 2} @embedding $vec AS score]"
    try:
        vec_raw = r.execute_command(
            "FT.SEARCH",
            INDEX_NAME,
            vector_q,
            "SORTBY", "score", "ASC",
            "RETURN", "4", "note_id", "title", "content", "score",
            "LIMIT", "0", str(limit * 2),
            "PARAMS", "2", "vec", vec_bytes,
            "DIALECT", "2",
        )
        vec_docs = _parse_search_response(vec_raw)
    except Exception as e:
        logger.warning("Vector search failed", extra={"error": str(e), "query_preview": query_clean[:50]})
        vec_docs = []

    for rank, doc in enumerate(vec_docs):
        nid = int(doc.get("note_id", 0) or 0)
        if not nid:
            continue
        try:
            dist = float(doc.get("score", 2.0) or 2.0)
        except (TypeError, ValueError):
            dist = 2.0
        if dist > settings.search_vector_score_threshold:
            continue
        title = str(doc.get("title") or "")
        content = str(doc.get("content") or "")
        snippet = content[:200].replace("\n", " ") if content else ""
        add_rrf(nid, _rrf_score(rank), title=title, snippet=snippet)

    sorted_results = sorted(
        results_by_note.values(),
        key=lambda x: -x["score"],
    )[:limit]

    logger.info(
        "search.search_notes result",
        extra={
            "user_id": user_id,
            "query_preview": query_clean[:80],
            "text_hits": len(text_docs),
            "vector_hits": len(vec_docs),
            "merged_count": len(sorted_results),
            "note_ids": [r["note_id"] for r in sorted_results],
        },
    )
    return sorted_results
