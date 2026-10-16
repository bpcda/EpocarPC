import { describe, expect, it } from "vitest";
import { admissionEvidence, submissionSchema } from "@/lib/association";

const application = (status: string, approved_at: string | null) => submissionSchema.parse({
  id: "00000000-0000-4000-8000-000000000001", user_id: "00000000-0000-4000-8000-000000000002",
  full_name: "Synthetic Person", email: "synthetic@example.invalid", file_path: null, filename: null,
  created_at: "2026-10-16T00:00:00Z", status, approved_at,
});

describe("admission evidence independent of category and access", () => {
  it("does not confirm a category holder with no application", () => {
    expect(admissionEvidence(null)).toEqual({ status: "unknown", source: null });
  });
  it.each(["draft", "submitted", "review", "rejected", "cancelled"])("never converts %s into an approval", status => {
    const row = application(status, "2026-10-16T00:00:00Z");
    expect(admissionEvidence(row).status).toBe("unknown");
    expect(row.status).toBe(status);
  });
  it.each([null, "not-a-date"])("does not confirm an approval without a valid timestamp (%s)", timestamp => {
    expect(admissionEvidence(application("approved", timestamp)).status).toBe("unknown");
  });
  it("preserves a recorded dated approval", () => {
    const row = application("approved", "2026-10-16T00:00:00Z");
    expect(admissionEvidence(row)).toEqual({ status: "confirmed", source: "application_decision" });
    expect(row.approved_at).toBe("2026-10-16T00:00:00Z");
  });
});