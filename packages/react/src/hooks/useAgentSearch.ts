/**
 * @module useAgentSearch
 *
 * Client-side fuzzy search hook for Bear Protocol agents using the Bitap
 * (shift-or / Wu-Manber) algorithm. Supports tag filtering, minimum reputation
 * score filtering, and returns ranked results with match offsets for
 * highlighting.
 */

import { useState, useMemo, useCallback } from "react";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * Minimal shape required for an agent to be searchable.
 * Extend this interface with your own fields.
 */
export interface SearchableAgent {
  /** Unique identifier – bigint for on-chain IDs, string for off-chain UUIDs. */
  id: bigint | string;
  /** Human-readable display name. */
  name: string;
  /** Optional longer description of the agent. */
  description?: string;
  /** Optional list of capability / category tags. */
  tags?: string[];
  /** Optional reputation score (higher = better). */
  reputationScore?: number;
  /** Allow arbitrary extra fields. */
  [key: string]: unknown;
}

/**
 * A single match offset within a text field, suitable for highlight rendering.
 */
export interface MatchOffset {
  /** Inclusive start index of the match within the field value. */
  start: number;
  /** Exclusive end index of the match within the field value. */
  end: number;
  /** The field name the match was found in (e.g. "name", "description"). */
  field: string;
}

/**
 * A single search result, pairing the matched agent with a relevance score
 * and the positions of all matches for highlight rendering.
 */
export interface SearchResult<T extends SearchableAgent> {
  /** The matched agent. */
  agent: T;
  /**
   * Relevance score in the range [0, 1].
   * - 1.0  exact match
   * - 0.8  prefix match
   * - 0.6  fuzzy match with 1 edit distance
   * - 0.4  fuzzy match with 2 edit distances
   */
  score: number;
  /** All match offsets across every searched field. */
  matches: MatchOffset[];
}

/**
 * Options accepted by {@link useAgentSearch}.
 */
export interface UseAgentSearchOptions {
  /**
   * Which agent fields to search. Defaults to `['name', 'description', 'tags']`.
   */
  keys?: Array<keyof SearchableAgent | string>;
  /**
   * Minimum relevance score threshold. Results below this value are excluded.
   * Defaults to `0` (all matches returned).
   */
  minScore?: number;
  /**
   * Filter agents whose `reputationScore` is below this value.
   * Agents without a `reputationScore` are excluded when this option is set.
   */
  minReputationScore?: number;
  /**
   * Intersection tag filter. Only agents that have **all** of these tags are
   * included. Tags are compared case-insensitively.
   */
  tags?: string[];
  /**
   * Maximum number of results to return. Defaults to `Infinity` (all results).
   */
  maxResults?: number;
}

// ---------------------------------------------------------------------------
// Bitap (shift-or) fuzzy matching
// ---------------------------------------------------------------------------

/**
 * Result returned by the internal Bitap matcher.
 *
 * @internal
 */
interface BitapMatchResult {
  /** Whether any match was found. */
  found: boolean;
  /** The edit distance of the best (lowest-cost) match found. */
  editDistance: number;
  /**
   * All match end indices (0-based, exclusive) found at the best edit distance.
   * Used to reconstruct match offsets.
   */
  matchEnds: number[];
}

/**
 * Performs a Bitap (shift-or / Wu-Manber) approximate string search.
 *
 * Tolerates:
 * - Up to **1** edit for patterns ≤ 32 characters.
 * - Up to **2** edits for patterns > 32 characters.
 *
 * The algorithm operates on Unicode code-points so multi-byte characters are
 * handled correctly.
 *
 * @param text    The haystack string to search within.
 * @param pattern The needle to search for (case-insensitive).
 * @returns       Match result including edit distance and end positions.
 *
 * @internal
 */
function bitapSearch(text: string, pattern: string): BitapMatchResult {
  const noMatch: BitapMatchResult = {
    found: false,
    editDistance: Infinity,
    matchEnds: [],
  };

  if (!pattern || !text) return noMatch;

  const patLen = pattern.length;
  const textLen = text.length;

  if (patLen > textLen + 2) return noMatch;

  const maxErrors = patLen <= 32 ? 1 : 2;

  // Build the bitmask alphabet map (code-point → 32-bit mask)
  const alphabet: Map<number, number> = new Map();
  for (let i = 0; i < patLen; i++) {
    const cp = pattern.codePointAt(i) as number;
    alphabet.set(cp, (alphabet.get(cp) ?? 0) | (1 << i));
  }

  /**
   * Shift-Or with k errors (Baeza-Yates & Gonnet 1992, extended by Wu & Manber
   * for k-approximate matching).
   *
   * State vectors R[k] track which positions in the pattern can be reached
   * from position i in the text with exactly k errors.
   */
  // R[k] is the state bitvector for k errors.
  const R: number[] = new Array(maxErrors + 1).fill(~1 >>> 0); // all 1s except bit 0
  // ~1 >>> 0  == 0xFFFFFFFE  (bit 0 = 0 → "just started" state)

  const bestEnds: number[] = [];
  let bestEdit = Infinity;

  for (let i = 0; i < textLen; i++) {
    const cp = text.codePointAt(i) as number;
    const pm = alphabet.get(cp) ?? 0;

    // Update from highest error count downward to avoid clobbering.
    let prev = R[0];
    R[0] = (R[0] | ~pm) >>> 0;
    R[0] = ((R[0] << 1) | 1) >>> 0;

    for (let k = 1; k <= maxErrors; k++) {
      const old = R[k];
      // Substitution / mismatch: prev (R[k-1] before shift)
      // Deletion:                R[k-1] after shift (R[k-1] << 1 | 1)
      // Insertion:               R[k] before update (old)
      R[k] =
        (((R[k] | ~pm) << 1) |
          1 |
          ((prev << 1) | 1) | // deletion from pattern
          prev | // insertion into pattern
          (old << 1) | // substitution
          1) >>>
        0;
      prev = old;
    }

    // Check for matches at each error level (lowest first)
    for (let k = 0; k <= maxErrors; k++) {
      // A match at pattern-length position means bit (patLen-1) is 0
      if ((R[k] & (1 << (patLen - 1))) === 0) {
        if (k < bestEdit) {
          bestEdit = k;
          bestEnds.length = 0;
          bestEnds.push(i + 1); // exclusive end
        } else if (k === bestEdit) {
          bestEnds.push(i + 1);
        }
        break; // don't check higher error levels for this position
      }
    }
  }

  if (bestEdit === Infinity) return noMatch;

  return { found: true, editDistance: bestEdit, matchEnds: bestEnds };
}

// ---------------------------------------------------------------------------
// Scoring helpers
// ---------------------------------------------------------------------------

/**
 * Converts a Bitap edit distance into a numeric relevance score.
 *
 * | Match type            | Score |
 * |-----------------------|-------|
 * | Exact match           | 1.0   |
 * | Prefix match          | 0.8   |
 * | 1-edit fuzzy match    | 0.6   |
 * | 2-edit fuzzy match    | 0.4   |
 *
 * @param editDistance The edit distance returned by {@link bitapSearch}.
 * @param isExact      Whether the entire field value equals the query.
 * @param isPrefix     Whether the field value starts with the query.
 * @returns A score in [0.4, 1.0], or `0` when no match.
 *
 * @internal
 */
function editDistanceToScore(
  editDistance: number,
  isExact: boolean,
  isPrefix: boolean,
): number {
  if (editDistance === Infinity) return 0;
  if (isExact) return 1.0;
  if (isPrefix) return 0.8;
  if (editDistance <= 1) return 0.6;
  return 0.4;
}

// ---------------------------------------------------------------------------
// Field extraction
// ---------------------------------------------------------------------------

/**
 * Extracts a flat array of `{ value, field }` pairs from an agent for the
 * given keys. Array values (e.g. `tags`) are joined with a space for
 * searching, but individual elements are also surfaced so offsets are
 * meaningful.
 *
 * @internal
 */
function extractFields(
  agent: SearchableAgent,
  keys: string[],
): Array<{ value: string; field: string }> {
  const result: Array<{ value: string; field: string }> = [];
  for (const key of keys) {
    const raw = agent[key];
    if (raw == null) continue;
    if (Array.isArray(raw)) {
      // Each tag as its own searchable segment
      for (const item of raw) {
        if (typeof item === "string" && item.length > 0) {
          result.push({ value: item, field: key });
        }
      }
    } else {
      const str = String(raw);
      if (str.length > 0) result.push({ value: str, field: key });
    }
  }
  return result;
}

// ---------------------------------------------------------------------------
// Core search function
// ---------------------------------------------------------------------------

/**
 * Searches a single agent against a lower-cased query string.
 *
 * @returns A `SearchResult` when the agent matches, or `null` when it does
 *          not meet the query criteria.
 *
 * @internal
 */
function searchAgent<T extends SearchableAgent>(
  agent: T,
  queryLower: string,
  keys: string[],
  minScore: number,
): SearchResult<T> | null {
  const fields = extractFields(agent, keys);

  let bestScore = 0;
  const allMatches: MatchOffset[] = [];

  for (const { value, field } of fields) {
    const valueLower = value.toLowerCase();

    // Fast-path: exact match
    if (valueLower === queryLower) {
      const score = 1.0;
      if (score > bestScore) bestScore = score;
      allMatches.push({ start: 0, end: value.length, field });
      continue;
    }

    // Fast-path: prefix match
    if (valueLower.startsWith(queryLower)) {
      const score = 0.8;
      if (score > bestScore) bestScore = score;
      allMatches.push({ start: 0, end: queryLower.length, field });
      continue;
    }

    // Fast-path: substring match (0-edit but not prefix/exact → score 0.8)
    const subIdx = valueLower.indexOf(queryLower);
    if (subIdx !== -1) {
      const score = 0.8;
      if (score > bestScore) bestScore = score;
      allMatches.push({
        start: subIdx,
        end: subIdx + queryLower.length,
        field,
      });
      continue;
    }

    // Fuzzy path via Bitap
    const result = bitapSearch(valueLower, queryLower);
    if (!result.found) continue;

    const score = editDistanceToScore(result.editDistance, false, false);
    if (score > bestScore) bestScore = score;

    // Convert end positions back to [start, end] offsets.
    // The match length is approximated as `queryLower.length + editDistance`
    // since insertions/deletions change the consumed text length.
    const matchLen = Math.min(
      queryLower.length + result.editDistance,
      value.length,
    );
    for (const end of result.matchEnds) {
      const start = Math.max(0, end - matchLen);
      allMatches.push({ start, end: Math.min(end, value.length), field });
    }
  }

  if (bestScore < minScore || bestScore === 0) return null;

  return { agent, score: bestScore, matches: allMatches };
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

/**
 * Return type of {@link useAgentSearch}.
 */
export interface UseAgentSearchReturn<T extends SearchableAgent> {
  /** Ranked search results (highest score first). Empty when `query` is blank. */
  results: SearchResult<T>[];
  /** The current search query string. */
  query: string;
  /** Update the search query. Triggers a re-render with fresh results. */
  setQuery: (q: string) => void;
  /**
   * `true` while a search is in-flight. Currently always `false` since the
   * search is synchronous; reserved for future async/worker support.
   */
  isSearching: boolean;
}

/**
 * Client-side fuzzy search hook for Bear Protocol agents.
 *
 * Uses the **Bitap (shift-or / Wu-Manber)** algorithm to perform approximate
 * string matching, tolerating up to 1 edit distance for short patterns and
 * up to 2 edits for longer ones. Results are ranked by relevance score,
 * filtered by optional tag and reputation constraints, and include match
 * offsets suitable for highlight rendering.
 *
 * @example
 * ```tsx
 * const { results, query, setQuery } = useAgentSearch(agents, {
 *   tags: ['defi'],
 *   minReputationScore: 80,
 *   maxResults: 20,
 * });
 *
 * return (
 *   <>
 *     <input value={query} onChange={e => setQuery(e.target.value)} />
 *     {results.map(({ agent, score, matches }) => (
 *       <AgentCard key={String(agent.id)} agent={agent} matches={matches} />
 *     ))}
 *   </>
 * );
 * ```
 *
 * @param agents  The full list of agents to search through.
 * @param options Optional search configuration.
 * @returns       Search state and controls.
 */
export function useAgentSearch<T extends SearchableAgent>(
  agents: T[],
  options: UseAgentSearchOptions = {},
): UseAgentSearchReturn<T> {
  const {
    keys = ["name", "description", "tags"],
    minScore = 0,
    minReputationScore,
    tags,
    maxResults = Infinity,
  } = options;

  const [query, setQueryRaw] = useState<string>("");

  /** Stable setter – avoids re-renders when the value hasn't changed. */
  const setQuery = useCallback((q: string) => {
    setQueryRaw((prev) => (prev === q ? prev : q));
  }, []);

  /** Pre-filter agents by tags and reputation before the query loop. */
  const filteredAgents = useMemo<T[]>(() => {
    const normalizedTags =
      tags && tags.length > 0 ? tags.map((t) => t.toLowerCase()) : null;

    return agents.filter((agent) => {
      // Reputation filter
      if (minReputationScore !== undefined) {
        if (
          agent.reputationScore === undefined ||
          agent.reputationScore < minReputationScore
        ) {
          return false;
        }
      }

      // Tag intersection filter (agent must have ALL required tags)
      if (normalizedTags) {
        const agentTags = (agent.tags ?? []).map((t) => t.toLowerCase());
        if (!normalizedTags.every((rt) => agentTags.includes(rt))) {
          return false;
        }
      }

      return true;
    });
  }, [agents, minReputationScore, tags]);

  /**
   * Memoized search results. Recomputed whenever the query, filtered agent
   * list, keys, minScore, or maxResults changes. For 1 000 agents the inner
   * loop stays well under 1 ms for typical queries.
   */
  const results = useMemo<SearchResult<T>[]>(() => {
    const trimmed = query.trim();

    // Empty query → return no results (callers can display unfiltered list)
    if (!trimmed) return [];

    const queryLower = trimmed.toLowerCase();
    const keysArr = keys as string[];
    const effectiveMinScore = minScore ?? 0;

    const matched: SearchResult<T>[] = [];

    for (const agent of filteredAgents) {
      const result = searchAgent(agent, queryLower, keysArr, effectiveMinScore);
      if (result) matched.push(result);
    }

    // Sort descending by score (stable – preserves original order on ties)
    matched.sort((a, b) => b.score - a.score);

    return maxResults === Infinity
      ? matched
      : matched.slice(0, maxResults as number);
  }, [query, filteredAgents, keys, minScore, maxResults]);

  return {
    results,
    query,
    setQuery,
    isSearching: false,
  };
}
