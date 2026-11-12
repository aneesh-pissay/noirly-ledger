import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { actionLabel, auditCsv, canonicalJson, ChainChecker, GENESIS_HASH, hashInput, type AuditFields, type ChainEntry } from "./audit";

const sha = (text: string) => createHash("sha256").update(text).digest("hex");

function chain(n: number): ChainEntry[] {
  const out: ChainEntry[] = [];
  let prev = GENESIS_HASH;
  for (let seq = 1; seq <= n; seq++) {
    const fields: AuditFields = { workspaceId: "w1", seq, at: `2026-10-31T10:00:0${seq}.000Z`, actorId: "u1", actorName: "Asha", action: "transaction.created", entity: "transaction", entityId: `t${seq}`, summary: `Added ${seq}`, data: { amountMinor: seq * 100 } };
    const hash = sha(hashInput(prev, fields));
    out.push({ ...fields, prevHash: prev, hash });
    prev = hash;
  }
  return out;
}

const check = (entries: ChainEntry[]) => {
  const checker = new ChainChecker(sha);
  for (const e of entries) checker.add(e);
  return checker.result();
};

describe("audit chain", () => {
  it("writes the same entry the same way whatever the key order", () => {
    expect(canonicalJson({ b: 1, a: [2, { d: null, c: "x" }], u: undefined })).toBe('{"a":[2,{"c":"x","d":null}],"b":1}');
    expect(canonicalJson(new Date("2026-10-31T00:00:00Z"))).toBe('"2026-10-31T00:00:00.000Z"');
    expect(canonicalJson({ toHexString: () => "abc", toString: () => "abc" })).toBe('"abc"');
  });

  it("passes an untouched chain", () => {
    const entries = chain(5);
    expect(check(entries)).toEqual({ ok: true, entries: 5, lastHash: entries[4]!.hash });
    expect(check([])).toEqual({ ok: true, entries: 0, lastHash: GENESIS_HASH });
  });

  it("catches an edit, a removal, a reorder and a forged entry", () => {
    const edited = chain(4);
    edited[2] = { ...edited[2]!, summary: "Added 300" };
    expect(check(edited)).toMatchObject({ ok: false, brokenAt: 3, reason: "Entry 3 was changed after it was written", entries: 2 });

    const removed = chain(4);
    removed.splice(1, 1);
    expect(check(removed)).toMatchObject({ ok: false, brokenAt: 2, reason: "Entry 2 is missing" });

    const reordered = chain(3);
    expect(check([reordered[0]!, reordered[0]!])).toMatchObject({ ok: false, reason: "Entry 1 appears twice" });

    // Rewriting an entry and its own hash still leaves the next one pointing at the old hash.
    const forged = chain(3);
    const { prevHash, hash: _old, ...fields } = forged[1]!;
    const changed = { ...fields, data: { amountMinor: 1 } };
    forged[1] = { ...changed, prevHash, hash: sha(hashInput(prevHash, changed)) };
    expect(check(forged)).toMatchObject({ ok: false, brokenAt: 3, reason: "Entry 3 doesn't follow the one before it" });
  });

  it("labels actions and exports CSV", () => {
    expect(actionLabel("budget.moved_out")).toBe("Budget moved out");
    const [e] = chain(1);
    const csv = auditCsv([{ seq: 1, at: e!.at, actorName: null, action: e!.action, entity: "transaction", entityId: "t1", summary: 'Said "hi", then left', data: { a: 1 }, hash: e!.hash }]);
    expect(csv.split("\r\n")[1]).toBe(`1,${e!.at},Ledger,transaction.created,transaction,t1,"Said ""hi"", then left","{""a"":1}",${e!.hash}`);
  });
});
