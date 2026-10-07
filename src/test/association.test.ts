import { describe, expect, it } from "vitest";
import { membershipSchema, validateAssociationFile } from "@/lib/association";

describe("association validation", () => {
  it("requires valid contact information and statute acknowledgement", () => {
    expect(membershipSchema.safeParse({full_name:"Mario Rossi",email:"mario@example.org",acknowledged:true}).success).toBe(true);
    expect(membershipSchema.safeParse({full_name:"A",email:"bad",acknowledged:false}).success).toBe(false);
    expect(membershipSchema.safeParse({full_name:"A".repeat(101),email:"mario@example.org",acknowledged:true}).success).toBe(false);
  });
  it("accepts allowed files and rejects spoofed MIME, empty and oversized files", () => {
    expect(validateAssociationFile(new File(["pdf"],"modulo.pdf",{type:"application/pdf"})).ext).toBe("pdf");
    expect(()=>validateAssociationFile(new File(["x"],"modulo.exe"))).toThrow();
    expect(()=>validateAssociationFile(new File(["x"],"modulo.pdf",{type:"text/html"}))).toThrow();
    expect(()=>validateAssociationFile(new File([],"modulo.pdf",{type:"application/pdf"}))).toThrow();
    expect(()=>validateAssociationFile(new File([new Uint8Array(10*1024*1024+1)],"modulo.pdf",{type:"application/pdf"}))).toThrow();
    expect(()=>validateAssociationFile(new File(["pdf"],"modulo.pdf",{type:"application/pdf"}),true)).toThrow();
  });
});