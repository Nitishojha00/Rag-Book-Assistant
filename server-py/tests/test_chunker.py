import pytest

from app.rag.chunker import chunk_text


def test_chunks_are_the_right_size_and_overlap_correctly():
    text = " ".join(f"w{i}" for i in range(300))
    chunks = chunk_text(text, "book", chunk_words=120, overlap_words=30)

    assert len(chunks) == 3
    assert len(chunks[0]["text"].split(" ")) == 120
    assert chunks[1]["text"].split(" ")[0] == "w90"
    assert chunks[2]["chunkIndex"] == 2


def test_rejects_overlap_that_is_not_smaller_than_chunk_size():
    with pytest.raises(ValueError):
        chunk_text("a b c", "book", chunk_words=10, overlap_words=10)
