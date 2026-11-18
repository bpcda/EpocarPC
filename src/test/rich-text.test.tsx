import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import RichText from "@/components/RichText";
import { editorHtml, richTextToPlainText, sanitizeRichText } from "@/lib/rich-text";

afterEach(cleanup);
describe("event and News rich text", () => {
  it("preserves old plain-text paragraphs, special characters and line breaks when opening the editor", () => {
    const value = "Ritrovo alle 9\nAuto < 30 anni & Vespa\n\nPartenza";
    const html = editorHtml(value);
    expect(html).toContain("<p>Ritrovo alle 9</p><p>Auto &lt; 30 anni &amp; Vespa</p><p><br></p><p>Partenza</p>");
    render(<RichText content={value} />);
    expect(screen.getByText(/Ritrovo alle 9/)).toHaveClass("whitespace-pre-line");
  });
  it("renders formatted descriptions while removing executable content, dangerous URLs and arbitrary styles", () => {
    const html = '<h2>Programma</h2><p style="text-align: center">Un <strong>raduno</strong></p><ul><li>Ritrovo</li></ul><a href="https://epocarpc.com/eventi">Eventi</a><a href="javascript:alert(1)">Malevolo</a><img src=x onerror="alert(1)"><script>alert(1)</script><p style="position:fixed;inset:0" onclick="alert(1)">Testo</p>';
    const { container } = render(<RichText content={html} />);
    expect(screen.getByRole("heading", { name: "Programma" })).toBeInTheDocument();
    expect(screen.getByText("raduno").tagName).toBe("STRONG");
    expect(screen.getByRole("listitem")).toHaveTextContent("Ritrovo");
    expect(screen.getByText("raduno").closest("p")).toHaveStyle({ textAlign: "center" });
    expect(screen.getByRole("link", { name: "Eventi" })).toHaveAttribute("href", "https://epocarpc.com/eventi");
    expect(screen.getByText("Malevolo")).not.toHaveAttribute("href");
    expect(screen.getByText("Testo")).not.toHaveAttribute("style");
    expect(container.querySelector("script, [onclick], [onerror]")).toBeNull();
    expect(container.querySelector("img")).toHaveAttribute("src", "x");
    expect(sanitizeRichText(html)).not.toContain("javascript:");
  });
  it("uses readable plain text for event metadata, without leaking HTML", () => {
    expect(richTextToPlainText("<h2>Programma</h2><p>Auto &amp; Vespa</p><p>Si parte.</p>")).toBe("Programma Auto & Vespa Si parte.");
  });
});
