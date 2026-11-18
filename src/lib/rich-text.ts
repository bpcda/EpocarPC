import createDOMPurify from "dompurify";

const DOMPurify = createDOMPurify();

// Keep only the alignment styles produced by the editor, never arbitrary CSS.
DOMPurify.addHook("uponSanitizeAttribute", (_node, attribute) => {
  if (attribute.attrName !== "style") return;
  const alignment = /^\s*text-align:\s*(left|center|right|justify);?\s*$/i.exec(attribute.attrValue);
  attribute.keepAttr = !!alignment;
  if (alignment) attribute.attrValue = `text-align: ${alignment[1].toLowerCase()}`;
});

export const hasRichText = (value: string) => /<\/?[a-z][^>]*>/i.test(value);

export function sanitizeRichText(value: string) {
  return DOMPurify.sanitize(value, {
    ALLOWED_TAGS: ["p", "br", "h2", "h3", "h4", "strong", "b", "em", "i", "u", "s", "strike", "ul", "ol", "li", "blockquote", "a", "code", "pre", "hr", "img"],
    ALLOWED_ATTR: ["href", "style", "start", "src", "alt", "width", "height"],
  });
}

export function editorHtml(value: string) {
  if (hasRichText(value)) return sanitizeRichText(value);
  const text = document.createElement("div");
  return value.split(/\r?\n/).map(line => {
    text.textContent = line;
    return `<p>${text.innerHTML || "<br>"}</p>`;
  }).join("");
}

export function richTextToPlainText(value: string) {
  if (!hasRichText(value)) return value;
  const fragment = DOMPurify.sanitize(value.replace(/<\/(p|h[2-4]|li|blockquote)>|<br\s*\/?\s*>/gi, "$& "), { RETURN_DOM_FRAGMENT: true });
  return (fragment.textContent ?? "").replace(/\s+/g, " ").trim();
}
