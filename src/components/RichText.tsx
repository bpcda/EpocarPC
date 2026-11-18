import { cn } from "@/lib/utils";
import { hasRichText, sanitizeRichText } from "@/lib/rich-text";

export default function RichText({ content, className }: { content: string; className?: string }) {
  if (!hasRichText(content)) return <div className={cn("whitespace-pre-line break-words", className)}>{content}</div>;
  return <div
    className={cn("prose prose-sm max-w-none break-words prose-headings:font-body prose-headings:font-semibold prose-headings:leading-snug prose-a:underline [&_a]:text-inherit [&_pre]:whitespace-pre-wrap [&_pre]:break-words", className)}
    dangerouslySetInnerHTML={{ __html: sanitizeRichText(content) }}
  />;
}
