import type { Fixture, ScoreEvent } from "./stub.js";

/**
 * TxLINE runtime client (design §4, World Cup free tier).
 *
 * Auth model (see https://txline-docs.txodds.com):
 * - Guest JWT from `POST /auth/guest/start` — short-lived, renewed on 401.
 * - Long-lived API token minted once by the subscribe CLI
 *   (src/txline/subscribe.ts) and passed in via TXLINE_API_TOKEN.
 *
 * Both are sent on every data request:
 *   Authorization: Bearer <jwt>    X-Api-Token: <apiToken>
 */
export interface TxlineConfig {
  /** e.g. https://txline-dev.txodds.com (devnet) */
  apiOrigin: string;
  apiToken: string;
  /** Optional competition filter for /fixtures/snapshot (e.g. World Cup id). */
  competitionId?: number;
  fetchImpl?: typeof fetch;
}

/** Raw TxLINE /api/fixtures/snapshot row (fields we consume). */
interface TxFixture {
  FixtureId: number;
  StartTime: number;
  Participant1: string;
  Participant2: string;
  Participant1IsHome: boolean;
  Competition: string;
  CompetitionId: number;
}

interface TxScoreSoccer {
  Participant1?: { Total?: { Goals?: number } };
  Participant2?: { Total?: { Goals?: number } };
}

/**
 * Raw TxLINE scores payload (stream + snapshot, fields we consume). The live
 * feed uses PascalCase (per the soccer feed docs); camelCase variants are
 * kept as fallbacks.
 */
interface TxScores {
  FixtureId?: number;
  fixtureId?: number;
  Participant1IsHome?: boolean;
  participant1IsHome?: boolean;
  StatusSoccerId?: unknown;
  statusSoccerId?: unknown;
  GameState?: string;
  gameState?: string;
  ScoreSoccer?: TxScoreSoccer;
  scoreSoccer?: TxScoreSoccer;
}

/**
 * Soccer statuses meaning the result is final for scoring: F=ended,
 * FET=after extra time, FPE=after penalties (also their numeric phase ids).
 * Abandoned/Cancelled/Postponed are terminal but have no scorable result.
 */
const FINAL_STATUSES = new Set(["F", "FET", "FPE", "5", "10", "13"]);

/** statusSoccerId serializes as a bare string, numeric phase id, or `{ "F": {} }`. */
export function soccerStatus(status: unknown): string | undefined {
  if (typeof status === "string") return status;
  if (typeof status === "number") return String(status);
  if (status && typeof status === "object") return Object.keys(status)[0];
  return undefined;
}

/** TxLINE StartTime arrives in ms on some feeds; normalize to unix seconds. */
export function toUnixSeconds(t: number): number {
  return t > 1e12 ? Math.floor(t / 1000) : t;
}

/** Map a raw snapshot row to our Fixture shape (TxLINE FixtureId is already an int64 → our u64 fixture_id). */
export function mapFixture(f: TxFixture): Fixture {
  const homeFirst = f.Participant1IsHome !== false;
  return {
    fixtureId: f.FixtureId,
    home: homeFirst ? f.Participant1 : f.Participant2,
    away: homeFirst ? f.Participant2 : f.Participant1,
    kickoffTs: toUnixSeconds(f.StartTime),
  };
}

/** Map a raw scores payload to a ScoreEvent, or null if it has no usable score. */
export function mapScoreEvent(s: TxScores): ScoreEvent | null {
  const fixtureId = s.FixtureId ?? s.fixtureId;
  const score = s.ScoreSoccer ?? s.scoreSoccer;
  const p1 = score?.Participant1?.Total?.Goals;
  const p2 = score?.Participant2?.Total?.Goals;
  if (typeof fixtureId !== "number" || typeof p1 !== "number" || typeof p2 !== "number") {
    // Surface shape mismatches (this exact silent-drop hid the camelCase bug),
    // but skip payloads with no fixture id at all — heartbeats/other events.
    if (fixtureId !== undefined) {
      console.warn("txline: unmappable scores payload", JSON.stringify(s).slice(0, 500));
    }
    return null;
  }
  const homeFirst = (s.Participant1IsHome ?? s.participant1IsHome) !== false;
  const status = soccerStatus(s.StatusSoccerId ?? s.statusSoccerId) ?? s.GameState ?? s.gameState;
  return {
    fixtureId,
    homeGoals: homeFirst ? p1 : p2,
    awayGoals: homeFirst ? p2 : p1,
    final: status !== undefined && FINAL_STATUSES.has(status),
  };
}

export class TxlineClient {
  private jwt = "";
  private readonly fetch: typeof fetch;

  constructor(private readonly config: TxlineConfig) {
    this.fetch = config.fetchImpl ?? fetch;
  }

  async renewJwt(): Promise<string> {
    const res = await this.fetch(`${this.config.apiOrigin}/auth/guest/start`, { method: "POST" });
    if (!res.ok) throw new Error(`guest JWT request failed (${res.status})`);
    this.jwt = ((await res.json()) as { token: string }).token;
    return this.jwt;
  }

  private headers(): Record<string, string> {
    return {
      Authorization: `Bearer ${this.jwt}`,
      "X-Api-Token": this.config.apiToken,
    };
  }

  /** GET with automatic one-shot JWT renewal on 401. */
  private async get(path: string): Promise<Response> {
    if (!this.jwt) await this.renewJwt();
    let res = await this.fetch(`${this.config.apiOrigin}/api${path}`, { headers: this.headers() });
    if (res.status === 401) {
      await this.renewJwt();
      res = await this.fetch(`${this.config.apiOrigin}/api${path}`, { headers: this.headers() });
    }
    return res;
  }

  /** Upcoming covered fixtures (snapshot starts at the current UTC day by default). */
  async fetchFixtures(startEpochDay?: number): Promise<Fixture[]> {
    const params = new URLSearchParams();
    if (startEpochDay !== undefined) params.set("startEpochDay", String(startEpochDay));
    if (this.config.competitionId !== undefined) {
      params.set("competitionId", String(this.config.competitionId));
    }
    const qs = params.size ? `?${params}` : "";
    const res = await this.get(`/fixtures/snapshot${qs}`);
    if (!res.ok) throw new Error(`fixtures snapshot failed (${res.status}): ${await res.text()}`);
    return ((await res.json()) as TxFixture[]).map(mapFixture);
  }

  /**
   * Latest known score for a fixture from `/scores/snapshot/{fixtureId}`, or
   * null when TxLINE has none (404) or the payload has no usable score. Used
   * to backfill results missed while the SSE stream was down.
   */
  async fetchScoreSnapshot(fixtureId: number): Promise<ScoreEvent | null> {
    const res = await this.get(`/scores/snapshot/${fixtureId}`);
    if (res.status === 404) return null;
    if (!res.ok) throw new Error(`scores snapshot failed (${res.status}): ${await res.text()}`);
    const body = (await res.json()) as TxScores | TxScores[];
    const payload = Array.isArray(body) ? body[0] : body;
    if (!payload) return null;
    return mapScoreEvent(payload);
  }

  /**
   * Live score events from the TxLINE SSE stream. Reconnects forever with
   * backoff, resuming via Last-Event-ID. Callers backfill any gap from a
   * fixtures/scores snapshot on reconnect (design §4) — the ResultsStore's
   * final-wins semantics make replayed events harmless.
   */
  async *scoreEvents(signal?: AbortSignal): AsyncGenerator<ScoreEvent> {
    let lastEventId: string | undefined;
    let backoffMs = 1_000;
    while (!signal?.aborted) {
      try {
        if (!this.jwt) await this.renewJwt();
        const res = await this.fetch(`${this.config.apiOrigin}/api/scores/stream`, {
          headers: {
            ...this.headers(),
            Accept: "text/event-stream",
            "Cache-Control": "no-cache",
            ...(lastEventId ? { "Last-Event-ID": lastEventId } : {}),
          },
          signal,
        });
        if (res.status === 401) {
          await this.renewJwt();
          continue;
        }
        if (!res.ok || !res.body) throw new Error(`scores stream failed (${res.status})`);
        backoffMs = 1_000;
        for await (const msg of parseSse(res.body)) {
          if (msg.id) lastEventId = msg.id;
          if (!msg.data) continue;
          let payload: TxScores;
          try {
            payload = JSON.parse(msg.data) as TxScores;
          } catch {
            continue;
          }
          const event = mapScoreEvent(payload);
          if (event) yield event;
        }
        // Stream ended cleanly — reconnect immediately.
      } catch (err) {
        if (signal?.aborted) return;
        console.error("txline stream error, reconnecting:", err);
        await new Promise((r) => setTimeout(r, backoffMs));
        backoffMs = Math.min(backoffMs * 2, 60_000);
      }
    }
  }
}

interface SseMessage {
  id?: string;
  event?: string;
  data?: string;
}

/** Minimal SSE parser: yields one message per blank-line-terminated block. */
export async function* parseSse(body: ReadableStream<Uint8Array>): AsyncGenerator<SseMessage> {
  const decoder = new TextDecoder();
  let buffer = "";
  const reader = body.getReader();
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      let sep: number;
      while ((sep = buffer.indexOf("\n\n")) !== -1) {
        const block = buffer.slice(0, sep);
        buffer = buffer.slice(sep + 2);
        const msg: SseMessage = {};
        const dataLines: string[] = [];
        for (const line of block.split("\n")) {
          if (line.startsWith("id:")) msg.id = line.slice(3).trim();
          else if (line.startsWith("event:")) msg.event = line.slice(6).trim();
          else if (line.startsWith("data:")) dataLines.push(line.slice(5).trimStart());
        }
        if (dataLines.length) msg.data = dataLines.join("\n");
        if (msg.id !== undefined || msg.event !== undefined || msg.data !== undefined) yield msg;
      }
    }
  } finally {
    reader.releaseLock();
  }
}
