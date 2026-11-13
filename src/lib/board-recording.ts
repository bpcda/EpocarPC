export type LocalRecording = {
  id: string;
  userId: string;
  meetingId: string;
  mime: string;
  seconds: number;
  bytes: number;
  created: string;
};
const DATABASE = "epocar-board-audio";
async function database() {
  return new Promise<IDBDatabase>((resolve, reject) => {
    const r = indexedDB.open(DATABASE, 1);
    r.onupgradeneeded = () => {
      r.result.createObjectStore("recordings", { keyPath: "id" });
      r.result.createObjectStore("chunks", { keyPath: ["id", "index"] });
    };
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
}
async function transaction<T>(
  stores: string[],
  mode: IDBTransactionMode,
  run: (tx: IDBTransaction, done: (value: T) => void) => void,
): Promise<T> {
  const db = await database();
  try {
    return await new Promise<T>((resolve, reject) => {
      const tx = db.transaction(stores, mode);
      let result: T;
      run(tx, (v) => {
        result = v;
      });
      tx.oncomplete = () => resolve(result);
      tx.onabort = () =>
        reject(tx.error ?? new Error("Salvataggio locale interrotto"));
      tx.onerror = () => reject(tx.error);
    });
  } finally {
    db.close();
  }
}
export const saveLocalRecording = (r: LocalRecording) =>
  transaction<void>(["recordings"], "readwrite", (tx) => {
    tx.objectStore("recordings").put(r);
  });
export const saveLocalChunk = (id: string, index: number, blob: Blob) =>
  transaction<void>(["chunks"], "readwrite", (tx) => {
    tx.objectStore("chunks").put({ id, index, blob });
  });
export const localRecordings = (userId: string, meetingId: string) =>
  transaction<LocalRecording[]>(["recordings"], "readonly", (tx, done) => {
    const r = tx.objectStore("recordings").getAll();
    r.onsuccess = () =>
      done(
        r.result.filter(
          (v: LocalRecording) =>
            v.userId === userId && v.meetingId === meetingId,
        ),
      );
  });
export const localRecordingBlob = (r: LocalRecording) =>
  transaction<Blob>(["chunks"], "readonly", (tx, done) => {
    const q = tx
      .objectStore("chunks")
      .getAll(IDBKeyRange.bound([r.id, 0], [r.id, Number.MAX_SAFE_INTEGER]));
    q.onsuccess = () =>
      done(
        new Blob(
          q.result.map((v) => v.blob),
          { type: r.mime },
        ),
      );
  });
export const removeLocalRecording = (id: string) =>
  transaction<void>(["recordings", "chunks"], "readwrite", (tx) => {
    tx.objectStore("recordings").delete(id);
    tx.objectStore("chunks").delete(
      IDBKeyRange.bound([id, 0], [id, Number.MAX_SAFE_INTEGER]),
    );
  });

/** Chunks reach IndexedDB before upload; microphone cleanup also runs on persistence failure. */
export class BoardRecorder {
  private rec: MediaRecorder;
  private index = 0;
  private queued = Promise.resolve();
  private activeFrom = 0;
  private milliseconds = 0;
  private persistenceError: unknown;
  private finished: Promise<LocalRecording>;
  constructor(
    private stream: MediaStream,
    public record: LocalRecording,
    private onError: (e: unknown) => void,
  ) {
    this.rec = new MediaRecorder(stream, { audioBitsPerSecond: 24000 });
    this.record.mime = this.rec.mimeType;
    this.finished = new Promise((resolve, reject) => {
      this.rec.ondataavailable = (e) => {
        if (!e.data.size) return;
        const index = this.index++;
        this.record.bytes += e.data.size;
        this.queued = this.queued
          .then(async () => {
            await saveLocalChunk(this.record.id, index, e.data);
            await saveLocalRecording({ ...this.record, seconds: this.seconds });
          })
          .catch((error) => {
            this.persistenceError = error;
            this.onError(error);
            this.stop();
          });
        if (this.record.bytes >= 24 * 1024 * 1024) {
          this.onError(
            new Error(
              "Raggiunto il limite della traccia: avvia una nuova registrazione per continuare",
            ),
          );
          this.stop();
        }
      };
      this.rec.onerror = (e) => {
        this.onError(e);
        this.stop();
      };
      this.rec.onstop = () => {
        this.release();
        void this.queued
          .then(async () => {
            this.record.seconds = Math.max(1, this.seconds);
            await saveLocalRecording(this.record);
            if (this.persistenceError) reject(this.persistenceError);
            else resolve(this.record);
          })
          .catch(reject);
      };
    });
    // The UI handles the result when stopping; avoid an unhandled rejection on device failure.
    void this.finished.catch(() => {});
  }
  get paused() {
    return this.rec.state === "paused";
  }
  get seconds() {
    return Math.ceil(
      (this.milliseconds +
        (this.activeFrom ? performance.now() - this.activeFrom : 0)) /
        1000,
    );
  }
  async start() {
    await saveLocalRecording(this.record);
    this.activeFrom = performance.now();
    this.rec.start(10000);
  }
  pause() {
    if (this.rec.state !== "recording") return;
    this.milliseconds += performance.now() - this.activeFrom;
    this.activeFrom = 0;
    this.rec.pause();
  }
  resume() {
    if (this.rec.state !== "paused") return;
    this.activeFrom = performance.now();
    this.rec.resume();
  }
  release() {
    this.stream.getTracks().forEach((t) => t.stop());
  }
  stop() {
    if (this.rec.state !== "inactive") {
      if (this.activeFrom)
        this.milliseconds += performance.now() - this.activeFrom;
      this.activeFrom = 0;
      this.rec.stop();
    }
    this.release();
    return this.finished;
  }
}
