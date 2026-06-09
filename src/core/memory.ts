import {
  loadEmbeddingModel,
  runSaveEmbeddings,
  runRagSearch,
  unloadQVACModel,
  EMBEDDING_MODEL_ID,
} from "./qvac.js";

/**
 * A "known-friendly" entity Scarecrow has been taught to recognise — the
 * owner's vehicle, a household pet, a uniformed mail carrier, etc. When a scene
 * semantically matches one of these (via on-device RAG / embeddings), an alert
 * that a rule would otherwise raise is suppressed.
 */
export interface KnownEntity {
  id: string;
  label: string; // e.g. "My silver truck"
  description: string; // e.g. "A silver Toyota Tacoma pickup truck"
}

export interface EntityMatch {
  matched: boolean;
  entity?: KnownEntity;
  score?: number;
}

/** Cosine-similarity floor for treating a scene as a known entity. */
export const KNOWN_ENTITY_THRESHOLD = 0.6;

const knownEntities: KnownEntity[] = [];

export function getKnownEntities(): KnownEntity[] {
  return knownEntities.map((e) => ({ ...e }));
}

export function registerKnownEntity(entity: {
  label: string;
  description: string;
  id?: string;
}): KnownEntity {
  const created: KnownEntity = {
    id: entity.id ?? `ent_${Date.now()}_${knownEntities.length}`,
    label: entity.label,
    description: entity.description,
  };
  knownEntities.push(created);
  return created;
}

export function removeKnownEntity(id: string): boolean {
  const idx = knownEntities.findIndex((e) => e.id === id);
  if (idx === -1) return false;
  knownEntities.splice(idx, 1);
  return true;
}

export function clearKnownEntities(): void {
  knownEntities.length = 0;
}

/** Stable doc form used both for ingest and for mapping a hit back to an entity. */
function toDoc(e: KnownEntity): string {
  return `${e.label}: ${e.description}`;
}

/**
 * Decide whether a scene description matches a known-friendly entity.
 *
 * Loads the embedding model, ingests the known-entity descriptions, runs a
 * semantic search for the scene, then unloads the model (≤4GB lifecycle).
 * Returns `{ matched: false }` when there are no known entities, the search
 * is inconclusive, or anything goes wrong — i.e. it fails *safe* (never
 * suppresses an alert on error).
 */
export async function checkKnownEntity(
  sceneDescription: string,
  threshold: number = KNOWN_ENTITY_THRESHOLD
): Promise<EntityMatch> {
  if (knownEntities.length === 0) return { matched: false };

  let modelId: string | undefined;
  try {
    modelId = await loadEmbeddingModel(EMBEDDING_MODEL_ID);

    await runSaveEmbeddings({
      modelId,
      documents: knownEntities.map(toDoc),
    });

    const results = (await runRagSearch({
      modelId,
      query: sceneDescription,
      topK: 1,
    })) as Array<{ content?: string; score?: number }>;

    const top = Array.isArray(results) ? results[0] : undefined;
    const score = top?.score ?? 0;

    if (top && score >= threshold) {
      const entity =
        knownEntities.find((e) => top.content?.startsWith(e.label)) ??
        knownEntities.find((e) => toDoc(e) === top.content);
      if (entity) return { matched: true, entity, score };
    }
    return { matched: false, score };
  } catch (err) {
    console.warn("[memory] Known-entity check failed (failing safe):", err);
    return { matched: false };
  } finally {
    if (modelId) await unloadQVACModel(modelId);
  }
}
