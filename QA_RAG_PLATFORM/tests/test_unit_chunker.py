"""Unit tests — text chunking strategies (no I/O, no network)."""
import pytest
from backend.ingestion.chunker import (
    recursive_chunk,
    semantic_chunk,
    fixed_chunk,
    chunk_pages,
)

LOREM = (
    "The quick brown fox jumps over the lazy dog. "
    "Pack my box with five dozen liquor jugs. "
    "How vexingly quick daft zebras jump. "
    "The five boxing wizards jump quickly."
)


# ── recursive_chunk ───────────────────────────────────────────────────────────

class TestRecursiveChunk:

    def test_short_text_returns_single_chunk(self):
        result = recursive_chunk("hello world", chunk_size=500, chunk_overlap=50)
        assert result == ["hello world"]

    def test_splits_on_double_newline_first(self):
        text = "Para one.\n\nPara two.\n\nPara three."
        result = recursive_chunk(text, chunk_size=20, chunk_overlap=0)
        assert len(result) >= 2
        assert all(len(c) <= 20 for c in result)

    def test_no_empty_chunks_returned(self):
        text = "A\n\n\n\nB\n\n\n\nC"
        result = recursive_chunk(text, chunk_size=100, chunk_overlap=0)
        assert all(c.strip() for c in result)

    def test_all_chunks_respect_size_limit(self):
        result = recursive_chunk(LOREM, chunk_size=50, chunk_overlap=0)
        assert all(len(c) <= 50 for c in result)

    def test_overlap_makes_more_chunks_than_no_overlap(self):
        no_overlap = recursive_chunk(LOREM, chunk_size=80, chunk_overlap=0)
        with_overlap = recursive_chunk(LOREM, chunk_size=80, chunk_overlap=20)
        assert len(with_overlap) >= len(no_overlap)

    def test_empty_string_returns_empty_list(self):
        result = recursive_chunk("", chunk_size=100, chunk_overlap=0)
        assert result == []

    def test_whitespace_only_returns_empty_list(self):
        result = recursive_chunk("   \n\n  ", chunk_size=100, chunk_overlap=0)
        assert result == []

    def test_returns_list_of_strings(self):
        result = recursive_chunk(LOREM, chunk_size=100, chunk_overlap=10)
        assert isinstance(result, list)
        assert all(isinstance(c, str) for c in result)

    def test_all_content_preserved(self):
        # Joining chunks should contain all non-whitespace tokens from original
        text = "alpha beta gamma delta epsilon"
        result = recursive_chunk(text, chunk_size=15, chunk_overlap=0)
        joined = " ".join(result)
        for word in text.split():
            assert word in joined

    def test_chunk_size_1000_with_short_text(self):
        result = recursive_chunk("Short text.", chunk_size=1000, chunk_overlap=200)
        assert result == ["Short text."]


# ── semantic_chunk ────────────────────────────────────────────────────────────

class TestSemanticChunk:

    def test_splits_on_sentence_boundaries(self):
        text = "First sentence. Second sentence. Third sentence."
        result = semantic_chunk(text, chunk_size=30)
        assert len(result) >= 2

    def test_single_sentence_not_split(self):
        text = "This is one sentence."
        result = semantic_chunk(text, chunk_size=500)
        assert result == ["This is one sentence."]

    def test_no_empty_chunks(self):
        result = semantic_chunk(LOREM, chunk_size=60)
        assert all(c.strip() for c in result)

    def test_chunks_respect_size_limit(self):
        result = semantic_chunk(LOREM, chunk_size=60)
        assert all(len(c) <= 60 for c in result)

    def test_empty_text_returns_empty(self):
        assert semantic_chunk("", chunk_size=100) == []

    def test_returns_list_of_strings(self):
        result = semantic_chunk(LOREM, chunk_size=100)
        assert all(isinstance(c, str) for c in result)

    def test_exclamation_point_splits(self):
        text = "Warning! Error occurred! Please retry!"
        result = semantic_chunk(text, chunk_size=20)
        assert len(result) >= 2

    def test_question_mark_splits(self):
        text = "Is this working? Are you sure? Yes, definitely!"
        result = semantic_chunk(text, chunk_size=20)
        assert len(result) >= 2


# ── fixed_chunk ───────────────────────────────────────────────────────────────

class TestFixedChunk:

    def test_splits_at_exact_size(self):
        text = "a" * 100
        result = fixed_chunk(text, chunk_size=25, chunk_overlap=0)
        assert len(result) == 4
        assert all(c == "a" * 25 for c in result)

    def test_overlap_slides_window(self):
        text = "0123456789"
        result = fixed_chunk(text, chunk_size=6, chunk_overlap=2)
        assert result[0] == "012345"
        assert result[1] == "456789"

    def test_no_empty_chunks(self):
        result = fixed_chunk(LOREM, chunk_size=40, chunk_overlap=5)
        assert all(c.strip() for c in result)

    def test_empty_text_returns_empty(self):
        assert fixed_chunk("", chunk_size=100, chunk_overlap=10) == []

    def test_text_shorter_than_chunk_size(self):
        result = fixed_chunk("short", chunk_size=1000, chunk_overlap=50)
        assert result == ["short"]

    def test_zero_overlap(self):
        text = "abcdefgh"
        result = fixed_chunk(text, chunk_size=4, chunk_overlap=0)
        assert result == ["abcd", "efgh"]

    def test_chunk_count_increases_with_overlap(self):
        text = "x" * 100
        no_overlap = fixed_chunk(text, chunk_size=20, chunk_overlap=0)
        with_overlap = fixed_chunk(text, chunk_size=20, chunk_overlap=5)
        assert len(with_overlap) > len(no_overlap)


# ── chunk_pages ───────────────────────────────────────────────────────────────

class TestChunkPages:

    def _pages(self, text: str, meta: dict = None):
        return [{"text": text, "metadata": meta or {}, "page": 1}]

    def test_returns_list_of_dicts(self):
        result = chunk_pages(self._pages(LOREM), chunk_size=200, chunk_overlap=20)
        assert isinstance(result, list)
        assert all(isinstance(c, dict) for c in result)

    def test_each_chunk_has_required_keys(self):
        result = chunk_pages(self._pages(LOREM), chunk_size=200, chunk_overlap=20)
        for chunk in result:
            assert "id" in chunk
            assert "text" in chunk
            assert "metadata" in chunk
            assert "chunk_index" in chunk
            assert "page" in chunk

    def test_chunk_ids_are_unique(self):
        result = chunk_pages(self._pages(LOREM * 5), chunk_size=100, chunk_overlap=10)
        ids = [c["id"] for c in result]
        assert len(ids) == len(set(ids))

    def test_chunk_index_is_sequential(self):
        result = chunk_pages(self._pages(LOREM * 3), chunk_size=80, chunk_overlap=0)
        indices = [c["chunk_index"] for c in result]
        assert indices == list(range(len(result)))

    def test_metadata_propagated(self):
        meta = {"filename": "test.pdf", "author": "Alice"}
        result = chunk_pages(self._pages(LOREM, meta=meta), chunk_size=200, chunk_overlap=0)
        for chunk in result:
            assert chunk["metadata"]["filename"] == "test.pdf"
            assert chunk["metadata"]["author"] == "Alice"

    def test_strategy_recorded_in_metadata(self):
        result = chunk_pages(self._pages(LOREM), chunk_size=200, chunk_overlap=0, strategy="fixed")
        assert all(c["metadata"]["chunk_strategy"] == "fixed" for c in result)

    def test_semantic_strategy(self):
        result = chunk_pages(self._pages(LOREM), chunk_size=100, chunk_overlap=0, strategy="semantic")
        assert len(result) >= 1

    def test_empty_pages_skipped(self):
        pages = [
            {"text": "", "metadata": {}, "page": 1},
            {"text": "Real content here.", "metadata": {}, "page": 2},
        ]
        result = chunk_pages(pages, chunk_size=200, chunk_overlap=0)
        assert len(result) == 1
        assert "Real content" in result[0]["text"]

    def test_whitespace_only_page_skipped(self):
        pages = [{"text": "   \n  ", "metadata": {}, "page": 1}]
        result = chunk_pages(pages, chunk_size=200, chunk_overlap=0)
        assert result == []

    def test_multiple_pages_get_correct_page_number(self):
        pages = [
            {"text": "Page one content.", "metadata": {}, "page": 1},
            {"text": "Page two content.", "metadata": {}, "page": 2},
        ]
        result = chunk_pages(pages, chunk_size=200, chunk_overlap=0)
        page_nums = {c["page"] for c in result}
        assert 1 in page_nums
        assert 2 in page_nums

    def test_no_empty_text_chunks_in_output(self):
        result = chunk_pages(self._pages(LOREM * 2), chunk_size=50, chunk_overlap=5)
        assert all(c["text"].strip() for c in result)
