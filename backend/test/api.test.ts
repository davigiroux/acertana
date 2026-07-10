import { describe, it, expect, beforeEach } from "vitest";
import { openDb, type Db } from "../src/db.js";
import { buildServer } from "../src/server.js";
import type { FastifyInstance } from "fastify";

const KEY = Buffer.alloc(32, 7);
const POOL = "F1xTuReP0oLPubkeyXXXXXXXXXXXXXXXXXXXXXXXXXX";

describe("API", () => {
  let db: Db;
  let app: FastifyInstance;

  beforeEach(() => {
    db = openDb(":memory:");
    app = buildServer({ db, pickKey: KEY });
  });

  it("create pool -> resolve join code -> join -> members lists wallet", async () => {
    const create = await app.inject({
      method: "POST",
      url: "/pools",
      payload: { name: "Copa dos Amigos", organizer: "OrgWallet111", poolPubkey: POOL },
    });
    expect(create.statusCode).toBe(201);
    const { joinCode } = create.json();
    expect(joinCode).toMatch(/^[23456789ABCDEFGHJKMNPQRSTUVWXYZ]{6}$/);

    const resolve = await app.inject({ method: "GET", url: `/j/${joinCode}` });
    expect(resolve.statusCode).toBe(200);
    expect(resolve.json()).toEqual({ poolPubkey: POOL, name: "Copa dos Amigos" });

    const join = await app.inject({
      method: "POST",
      url: `/pools/${POOL}/join`,
      payload: { wallet: "MemberWallet111", emailHint: "d***@gmail.com" },
    });
    expect(join.statusCode).toBe(200);

    const members = await app.inject({ method: "GET", url: `/pools/${POOL}/members` });
    expect(members.statusCode).toBe(200);
    const list = members.json().members;
    expect(list).toHaveLength(1);
    expect(list[0].wallet).toBe("MemberWallet111");
    expect(list[0].emailHint).toBe("d***@gmail.com");
  });

  it("duplicate join is idempotent", async () => {
    await app.inject({
      method: "POST",
      url: "/pools",
      payload: { name: "P", organizer: "O", poolPubkey: POOL },
    });
    for (let i = 0; i < 2; i++) {
      const res = await app.inject({
        method: "POST",
        url: `/pools/${POOL}/join`,
        payload: { wallet: "W1" },
      });
      expect(res.statusCode).toBe(200);
    }
    const members = await app.inject({ method: "GET", url: `/pools/${POOL}/members` });
    expect(members.json().members).toHaveLength(1);
  });

  it("unknown join code -> 404", async () => {
    const res = await app.inject({ method: "GET", url: "/j/ZZZZZZ" });
    expect(res.statusCode).toBe(404);
  });

  it("stores encrypted pick", async () => {
    await app.inject({
      method: "POST",
      url: "/pools",
      payload: { name: "P", organizer: "O", poolPubkey: POOL },
    });
    const res = await app.inject({
      method: "POST",
      url: "/picks",
      payload: {
        poolPubkey: POOL,
        wallet: "W1",
        fixtureId: 1001,
        homeGoals: 2,
        awayGoals: 1,
        saltHex: "11".repeat(32),
      },
    });
    expect(res.statusCode).toBe(201);
    const row = db.prepare("SELECT ciphertext, revealed FROM picks").get() as {
      ciphertext: string;
      revealed: number;
    };
    expect(row.revealed).toBe(0);
    expect(row.ciphertext).not.toContain("11".repeat(32)); // stored encrypted
  });
});
