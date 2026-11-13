import { test } from "node:test";
import assert from "node:assert/strict";
import { enforceRooms, livekitConfig } from "./supervisor.mjs";
test("closed rooms, former members and unsolicited rooms are removed", async () => {
  const removed = [],
    deleted = [];
  const api = {
    listRooms: async () => [
      { name: "board-open" },
      { name: "board-closed" },
      { name: "other" },
    ],
    listParticipants: async () => [
      { identity: "current" },
      { identity: "former" },
    ],
    removeParticipant: async (r, id) => removed.push([r, id]),
    deleteRoom: async (r) => deleted.push(r),
  };
  await enforceRooms(api, [{ room: "board-open", identity: "current" }]);
  assert.deepEqual(removed, [["board-open", "former"]]);
  assert.deepEqual(deleted, ["board-closed", "other"]);
});
test("database failure is not interpreted as permission", async () => {
  await assert.rejects(
    () =>
      enforceRooms(
        {
          listRooms: async () => {
            throw new Error("offline");
          },
        },
        [],
      ),
    /offline/,
  );
});
test("configuration is private, limited to seven and validates secrets", () => {
  assert.throws(() => livekitConfig({}), /chiave/);
  const config = livekitConfig({
    LIVEKIT_API_KEY: "board-key",
    LIVEKIT_API_SECRET: "a".repeat(40),
    LIVEKIT_NODE_IP: "203.0.113.1",
  });
  assert.equal(config.room.max_participants, 7);
  assert.equal(config.rtc.udp_port, 7882);
  assert.equal(config.keys["board-key"], "a".repeat(40));
});
