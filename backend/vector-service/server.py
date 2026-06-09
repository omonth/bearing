"""
Vector search service for bearing products.
Uses turbovec (TurboQuant) for indexing + sentence-transformers (bge-base-zh-v1.5) for embedding.
"""

import os
import json
import time
import logging
from pathlib import Path
from contextlib import asynccontextmanager

import numpy as np
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel, Field
from sentence_transformers import SentenceTransformer
from turbovec import IdMapIndex

# ── Config ──────────────────────────────────────────────────────────────────

EMBEDDING_MODEL = os.environ.get("EMBEDDING_MODEL", "BAAI/bge-base-zh-v1.5")
BIT_WIDTH = int(os.environ.get("BIT_WIDTH", "2"))
DIM = int(os.environ.get("DIM", "768"))
INDEX_DIR = Path(os.environ.get("INDEX_DIR", "/app/data"))
INDEX_FILE = INDEX_DIR / "bearings.tvim"
META_FILE = INDEX_DIR / "meta.json"

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("vector-service")

# ── Global state ────────────────────────────────────────────────────────────

model: SentenceTransformer | None = None
index: IdMapIndex | None = None
product_meta: dict[int, dict] = {}  # id → {content, source_type, source_id}


def load_meta() -> dict:
    if META_FILE.exists():
        return json.loads(META_FILE.read_text())
    return {"product_count": 0, "built_at": None, "model": EMBEDDING_MODEL}


def save_meta(meta: dict):
    META_FILE.write_text(json.dumps(meta, ensure_ascii=False, indent=2))


# ── Lifespan ────────────────────────────────────────────────────────────────

@asynccontextmanager
async def lifespan(app: FastAPI):
    global model, index, product_meta
    logger.info(f"Loading embedding model: {EMBEDDING_MODEL}")
    model = SentenceTransformer(EMBEDDING_MODEL)
    logger.info(f"Model loaded. dim={model.get_sentence_embedding_dimension()}")

    INDEX_DIR.mkdir(parents=True, exist_ok=True)

    if INDEX_FILE.exists():
        logger.info(f"Loading existing index from {INDEX_FILE}")
        index = IdMapIndex.load(str(INDEX_FILE))
        # Rebuild product_meta from persisted metadata
        meta_path = INDEX_DIR / "product_meta.json"
        if meta_path.exists():
            product_meta = {int(k): v for k, v in json.loads(meta_path.read_text()).items()}
        logger.info(f"Index loaded: {len(index)} vectors")
    else:
        logger.info("No existing index found, starting fresh")
        index = IdMapIndex(dim=DIM, bit_width=BIT_WIDTH)

    yield

    # Cleanup
    logger.info("Shutting down vector service")


app = FastAPI(title="Bearing Vector Service", lifespan=lifespan)


# ── Helpers ─────────────────────────────────────────────────────────────────

def embed_text(text: str) -> np.ndarray:
    """Embed a single text string, return float32 vector."""
    vec = model.encode(text, normalize_embeddings=True)
    return vec.astype(np.float32)


def embed_batch(texts: list[str]) -> np.ndarray:
    """Embed a batch of texts, return float32 matrix."""
    vecs = model.encode(texts, normalize_embeddings=True, batch_size=64, show_progress_bar=False)
    return vecs.astype(np.float32)


def persist_index():
    """Write index and metadata to disk."""
    index.write(str(INDEX_FILE))
    meta_path = INDEX_DIR / "product_meta.json"
    meta_path.write_text(json.dumps(product_meta, ensure_ascii=False))
    save_meta({
        "product_count": len(index),
        "built_at": time.strftime("%Y-%m-%dT%H:%M:%S"),
        "model": EMBEDDING_MODEL,
        "dim": DIM,
        "bit_width": BIT_WIDTH,
    })


# ── Request/Response models ─────────────────────────────────────────────────

class EmbedRequest(BaseModel):
    text: str


class EmbedResponse(BaseModel):
    vector: list[float]
    dim: int


class SearchRequest(BaseModel):
    query: str
    top_k: int = Field(default=5, ge=1, le=50)


class SearchResult(BaseModel):
    id: int
    score: float
    content: str


class SearchResponse(BaseModel):
    results: list[SearchResult]
    query_time_ms: float


class ProductData(BaseModel):
    id: int
    text: str
    source_type: str = "bearing"


class BuildIndexRequest(BaseModel):
    products: list[ProductData]


class IndexOpResponse(BaseModel):
    success: bool
    message: str
    count: int = 0


# ── Endpoints ───────────────────────────────────────────────────────────────

@app.get("/health")
def health():
    meta = load_meta()
    return {
        "status": "ok",
        "model": EMBEDDING_MODEL,
        "dim": DIM,
        "bit_width": BIT_WIDTH,
        "index_size": len(index) if index else 0,
        "built_at": meta.get("built_at"),
    }


@app.post("/embed", response_model=EmbedResponse)
def embed(req: EmbedRequest):
    vec = embed_text(req.text)
    return EmbedResponse(vector=vec.tolist(), dim=len(vec))


@app.post("/search", response_model=SearchResponse)
def search(req: SearchRequest):
    if len(index) == 0:
        return SearchResponse(results=[], query_time_ms=0)

    start = time.perf_counter()
    query_vec = embed_text(req.query)
    scores, ids = index.search(query_vec.reshape(1, -1), k=req.top_k)

    results = []
    for score, id_ in zip(scores[0], ids[0]):
        id_int = int(id_)
        meta = product_meta.get(id_int, {})
        results.append(SearchResult(
            id=id_int,
            score=round(float(score), 4),
            content=meta.get("content", ""),
        ))

    elapsed = (time.perf_counter() - start) * 1000
    return SearchResponse(results=results, query_time_ms=round(elapsed, 2))


@app.post("/index/build", response_model=IndexOpResponse)
def build_index(req: BuildIndexRequest):
    global index, product_meta

    index = IdMapIndex(dim=DIM, bit_width=BIT_WIDTH)
    product_meta = {}

    if not req.products:
        persist_index()
        return IndexOpResponse(success=True, message="Empty index built", count=0)

    texts = [p.text for p in req.products]
    ids = np.array([p.id for p in req.products], dtype=np.uint64)
    vecs = embed_batch(texts)

    index.add_with_ids(vecs, ids)

    for p in req.products:
        product_meta[p.id] = {"content": p.text, "source_type": p.source_type}

    persist_index()
    logger.info(f"Index built: {len(index)} vectors")
    return IndexOpResponse(success=True, message=f"Index built with {len(index)} vectors", count=len(index))


@app.post("/index/add", response_model=IndexOpResponse)
def add_to_index(req: BuildIndexRequest):
    if not req.products:
        return IndexOpResponse(success=True, message="Nothing to add", count=0)

    texts = [p.text for p in req.products]
    ids = np.array([p.id for p in req.products], dtype=np.uint64)
    vecs = embed_batch(texts)

    index.add_with_ids(vecs, ids)

    for p in req.products:
        product_meta[p.id] = {"content": p.text, "source_type": p.source_type}

    persist_index()
    return IndexOpResponse(success=True, message=f"Added {len(req.products)} vectors", count=len(req.products))


class RemoveRequest(BaseModel):
    ids: list[int]


@app.post("/index/remove", response_model=IndexOpResponse)
def remove_from_index(req: RemoveRequest):
    removed = 0
    for id_ in req.ids:
        if index.remove(np.uint64(id_)):
            product_meta.pop(id_, None)
            removed += 1

    persist_index()
    return IndexOpResponse(success=True, message=f"Removed {removed} vectors", count=removed)


@app.post("/index/update", response_model=IndexOpResponse)
def update_in_index(req: BuildIndexRequest):
    """Remove then re-add (turbovec has no in-place update)."""
    for p in req.products:
        index.remove(np.uint64(p.id))

    texts = [p.text for p in req.products]
    ids = np.array([p.id for p in req.products], dtype=np.uint64)
    vecs = embed_batch(texts)

    index.add_with_ids(vecs, ids)

    for p in req.products:
        product_meta[p.id] = {"content": p.text, "source_type": p.source_type}

    persist_index()
    return IndexOpResponse(success=True, message=f"Updated {len(req.products)} vectors", count=len(req.products))


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=5050)
