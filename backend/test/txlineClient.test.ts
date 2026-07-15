import { describe, expect, it } from "vitest";
import {
  TxlineClient,
  mapFixture,
  mapScoreEvent,
  parseSse,
  soccerStatus,
  toUnixSeconds,
} from "../src/txline/client.js";

const KICKOFF = 1786000000;

describe("mapFixture", () => {
  const raw = {
    FixtureId: 17588320,
    StartTime: KICKOFF * 1000,
    Participant1: "Brazil",
    Participant2: "Senegal",
    Participant1IsHome: true,
    Competition: "World Cup",
    CompetitionId: 72,
  };

  it("maps ids, names, and ms start time to unix seconds", () => {
    expect(mapFixture(raw)).toEqual({
      fixtureId: 17588320,
      home: "Brazil",
      away: "Senegal",
      kickoffTs: KICKOFF,
    });
  });

  it("swaps home/away when participant1 is not home", () => {
    const f = mapFixture({ ...raw, Participant1IsHome: false });
    expect(f.home).toBe("Senegal");
    expect(f.away).toBe("Brazil");
  });

  it("passes through second-resolution start times", () => {
    expect(toUnixSeconds(KICKOFF)).toBe(KICKOFF);
    expect(toUnixSeconds(KICKOFF * 1000)).toBe(KICKOFF);
  });
});

describe("mapScoreEvent", () => {
  // The live feed's PascalCase shape (soccer feed docs v1.1).
  const raw = {
    FixtureId: 17588320,
    Participant1IsHome: true,
    StatusSoccerId: "H1",
    ScoreSoccer: {
      Participant1: { Total: { Goals: 2 } },
      Participant2: { Total: { Goals: 1 } },
    },
  };

  it("maps a provisional in-play score", () => {
    expect(mapScoreEvent(raw)).toEqual({
      fixtureId: 17588320,
      homeGoals: 2,
      awayGoals: 1,
      final: false,
    });
  });

  it("still accepts camelCase payload variants", () => {
    expect(
      mapScoreEvent({
        fixtureId: 17588320,
        participant1IsHome: false,
        statusSoccerId: "F",
        scoreSoccer: raw.ScoreSoccer,
      }),
    ).toEqual({ fixtureId: 17588320, homeGoals: 1, awayGoals: 2, final: true });
  });

  it("marks F / FET / FPE (and their phase ids) as final", () => {
    for (const status of ["F", "FET", "FPE", 5, 10, 13]) {
      expect(mapScoreEvent({ ...raw, StatusSoccerId: status })?.final).toBe(true);
    }
  });

  it("does not treat in-play or voided statuses as final", () => {
    for (const status of ["H1", "HT", "H2", "A", "C", "P", "END"]) {
      expect(mapScoreEvent({ ...raw, StatusSoccerId: status })?.final).toBe(false);
    }
  });

  it("handles object-encoded statuses", () => {
    expect(soccerStatus({ F: {} })).toBe("F");
    expect(mapScoreEvent({ ...raw, StatusSoccerId: { F: {} } })?.final).toBe(true);
  });

  it("swaps goals when participant1 is away", () => {
    const e = mapScoreEvent({ ...raw, Participant1IsHome: false });
    expect(e).toMatchObject({ homeGoals: 1, awayGoals: 2 });
  });

  it("returns null without a usable score", () => {
    expect(mapScoreEvent({ FixtureId: 1 })).toBeNull();
    expect(mapScoreEvent({ ...raw, ScoreSoccer: {} })).toBeNull();
  });
});

function streamOf(...chunks: string[]): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  return new ReadableStream({
    start(controller) {
      for (const c of chunks) controller.enqueue(encoder.encode(c));
      controller.close();
    },
  });
}

describe("parseSse", () => {
  it("parses id/event/data blocks, including split across chunks", async () => {
    const events = [];
    for await (const msg of parseSse(
      streamOf('id: 1:0\nevent: scores\ndata: {"a"', ':1}\n\ndata: plain\n\n'),
    )) {
      events.push(msg);
    }
    expect(events).toEqual([
      { id: "1:0", event: "scores", data: '{"a":1}' },
      { data: "plain" },
    ]);
  });

  it("joins multi-line data", async () => {
    const events = [];
    for await (const msg of parseSse(streamOf("data: one\ndata: two\n\n"))) events.push(msg);
    expect(events[0].data).toBe("one\ntwo");
  });
});

describe("TxlineClient", () => {
  it("renews the JWT once on 401 and retries", async () => {
    const calls: string[] = [];
    let jwtCount = 0;
    const fetchImpl = (async (url: string | URL | Request, init?: RequestInit) => {
      const u = String(url);
      calls.push(u);
      if (u.endsWith("/auth/guest/start")) {
        jwtCount += 1;
        return new Response(JSON.stringify({ token: `jwt${jwtCount}` }));
      }
      const auth = (init?.headers as Record<string, string>).Authorization;
      if (auth === "Bearer jwt1") return new Response("expired", { status: 401 });
      return new Response(JSON.stringify([]));
    }) as typeof fetch;

    const client = new TxlineClient({ apiOrigin: "https://tx.test", apiToken: "tok", fetchImpl });
    expect(await client.fetchFixtures()).toEqual([]);
    expect(jwtCount).toBe(2);
    expect(calls.filter((c) => c.includes("/api/fixtures/snapshot"))).toHaveLength(2);
  });

  it("passes competitionId and startEpochDay through", async () => {
    let seen = "";
    const fetchImpl = (async (url: string | URL | Request) => {
      const u = String(url);
      if (u.endsWith("/auth/guest/start")) return new Response(JSON.stringify({ token: "j" }));
      seen = u;
      return new Response(JSON.stringify([]));
    }) as typeof fetch;
    const client = new TxlineClient({
      apiOrigin: "https://tx.test",
      apiToken: "tok",
      competitionId: 72,
      fetchImpl,
    });
    await client.fetchFixtures(20624);
    expect(seen).toContain("startEpochDay=20624");
    expect(seen).toContain("competitionId=72");
  });

  describe("fetchScoreSnapshot", () => {
    const snapshot = {
      FixtureId: 42,
      StatusSoccerId: "F",
      ScoreSoccer: {
        Participant1: { Total: { Goals: 3 } },
        Participant2: { Total: { Goals: 2 } },
      },
    };

    function clientWith(body: BodyInit | null, status = 200): TxlineClient {
      const fetchImpl = (async (url: string | URL | Request) => {
        if (String(url).endsWith("/auth/guest/start")) {
          return new Response(JSON.stringify({ token: "j" }));
        }
        expect(String(url)).toContain("/api/scores/snapshot/42");
        return new Response(body, { status });
      }) as typeof fetch;
      return new TxlineClient({ apiOrigin: "https://tx.test", apiToken: "tok", fetchImpl });
    }

    it("maps a PascalCase snapshot body", async () => {
      expect(await clientWith(JSON.stringify(snapshot)).fetchScoreSnapshot(42)).toEqual({
        fixtureId: 42,
        homeGoals: 3,
        awayGoals: 2,
        final: true,
      });
    });

    it("unwraps array-wrapped bodies", async () => {
      const e = await clientWith(JSON.stringify([snapshot])).fetchScoreSnapshot(42);
      expect(e?.final).toBe(true);
      expect(await clientWith(JSON.stringify([])).fetchScoreSnapshot(42)).toBeNull();
    });

    it("returns null on 404", async () => {
      expect(await clientWith("not found", 404).fetchScoreSnapshot(42)).toBeNull();
    });

    it("throws on other errors", async () => {
      await expect(clientWith("boom", 500).fetchScoreSnapshot(42)).rejects.toThrow("500");
    });
  });
});
