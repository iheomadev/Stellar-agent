import { useState, useEffect, useRef, useCallback } from "react";

/** A single event emitted by the job event stream. */
export interface JobEvent {
  eventType: string;
  timestamp: number;
  ledger: number;
  payload: Record<string, unknown>;
}

/** Raw SSE message shape received from /api/events/stream */
interface RawJobEvent {
  jobId?: string | number | bigint;
  eventType?: string;
  timestamp?: number;
  ledger?: number;
  payload?: Record<string, unknown>;
  id?: string;
  [key: string]: unknown;
}

export interface UseJobEventsOptions {
  /** Base URL for the API server. Defaults to empty string (same origin). */
  baseUrl?: string;
  /** Maximum number of reconnection attempts. Defaults to 10. */
  maxRetries?: number;
  /** Initial reconnect delay in milliseconds. Doubles each attempt, capped at 30s. Defaults to 1000. */
  retryDelay?: number;
}

export interface UseJobEventsResult {
  events: JobEvent[];
  isConnected: boolean;
  error: Error | null;
  clearEvents: () => void;
}

const MAX_BACKOFF_MS = 30_000;

/**
 * Subscribes to the SSE job event stream at `{baseUrl}/api/events/stream?jobId={jobId}`.
 *
 * - Maintains a chronological array of `JobEvent` objects filtered to the given jobId.
 * - Reconnects automatically with exponential backoff on connection loss.
 * - Tracks `lastEventId` via the SSE `Last-Event-ID` header to avoid duplicate events.
 * - Cleans up the `EventSource` on unmount.
 *
 * @param jobId - The job identifier to subscribe to (string or bigint).
 * @param options - Optional configuration: baseUrl, maxRetries, retryDelay.
 */
export function useJobEvents(
  jobId: string | bigint,
  options: UseJobEventsOptions = {},
): UseJobEventsResult {
  const {
    baseUrl = "",
    maxRetries = 10,
    retryDelay = 1_000,
  } = options;

  const [events, setEvents] = useState<JobEvent[]>([]);
  const [isConnected, setIsConnected] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  // Refs for values that should not trigger re-renders but need stable access in callbacks
  const retriesRef = useRef(0);
  const lastEventIdRef = useRef<string | null>(null);
  const retryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const esRef = useRef<EventSource | null>(null);
  const isMountedRef = useRef(true);

  const clearEvents = useCallback(() => {
    setEvents([]);
  }, []);

  useEffect(() => {
    isMountedRef.current = true;

    const jobIdStr = String(jobId);

    function buildUrl(): string {
      const url = new URL(
        `${baseUrl}/api/events/stream`,
        // When baseUrl is empty, use a placeholder origin so URL parses correctly,
        // then strip it back to a relative URL.
        baseUrl ? undefined : "http://localhost",
      );
      url.searchParams.set("jobId", jobIdStr);
      if (lastEventIdRef.current !== null) {
        url.searchParams.set("lastEventId", lastEventIdRef.current);
      }
      // Return relative URL when no baseUrl provided
      return baseUrl ? url.toString() : `${url.pathname}${url.search}`;
    }

    function connect(): void {
      if (!isMountedRef.current) return;

      const source = new EventSource(buildUrl());
      esRef.current = source;

      source.onopen = () => {
        if (!isMountedRef.current) return;
        retriesRef.current = 0;
        setIsConnected(true);
        setError(null);
      };

      source.onmessage = (event: MessageEvent<string>) => {
        if (!isMountedRef.current) return;

        // Track the SSE event id for reconnect deduplication
        if (event.lastEventId) {
          lastEventIdRef.current = event.lastEventId;
        }

        let raw: RawJobEvent;
        try {
          raw = JSON.parse(event.data) as RawJobEvent;
        } catch {
          // Ignore unparseable messages
          return;
        }

        // Filter to only events belonging to this jobId
        const rawJobId = raw.jobId !== undefined ? String(raw.jobId) : undefined;
        if (rawJobId !== undefined && rawJobId !== jobIdStr) {
          return;
        }

        // Track id from payload if SSE id header wasn't set
        if (!event.lastEventId && raw.id !== undefined) {
          lastEventIdRef.current = String(raw.id);
        }

        const jobEvent: JobEvent = {
          eventType: typeof raw.eventType === "string" ? raw.eventType : "unknown",
          timestamp: typeof raw.timestamp === "number" ? raw.timestamp : Date.now(),
          ledger: typeof raw.ledger === "number" ? raw.ledger : 0,
          payload: raw.payload ?? {},
        };

        setEvents((prev) => [...prev, jobEvent]);
      };

      source.onerror = () => {
        if (!isMountedRef.current) return;

        source.close();
        esRef.current = null;
        setIsConnected(false);

        if (retriesRef.current >= maxRetries) {
          setError(
            new Error(
              `SSE connection to job ${jobIdStr} failed after ${maxRetries} retries`,
            ),
          );
          return;
        }

        // Exponential backoff: retryDelay * 2^attempt, capped at 30s
        const delay = Math.min(
          retryDelay * Math.pow(2, retriesRef.current),
          MAX_BACKOFF_MS,
        );
        retriesRef.current += 1;

        retryTimerRef.current = setTimeout(() => {
          if (isMountedRef.current) {
            connect();
          }
        }, delay);
      };
    }

    connect();

    return () => {
      isMountedRef.current = false;

      if (retryTimerRef.current !== null) {
        clearTimeout(retryTimerRef.current);
        retryTimerRef.current = null;
      }

      if (esRef.current !== null) {
        esRef.current.close();
        esRef.current = null;
      }

      setIsConnected(false);
    };
    // Re-subscribe whenever jobId or connection parameters change
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [jobId, baseUrl, maxRetries, retryDelay]);

  return { events, isConnected, error, clearEvents };
}
