import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { safeHref, type Block, type CmsImage, type InlineNode, type RichText } from "@/lib/cms";

export function CmsImg({ image, className, sizes = "100vw", eager }: { image: CmsImage; className?: string; sizes?: string; eager?: boolean }) {
  return (
    <img src={image.url} srcSet={image.srcSet} sizes={image.srcSet ? sizes : undefined} alt={image.alt}
      width={image.width} height={image.height} className={className}
      loading={eager ? "eager" : "lazy"} decoding="async" />
  );
}

export function SmartLink({ href, children, className }: { href: string; children: React.ReactNode; className?: string }) {
  if (href.startsWith("/")) return <Link to={href} className={className}>{children}</Link>;
  return <a href={href} className={className} target={/^https?:/.test(href) ? "_blank" : undefined} rel="noopener noreferrer">{children}</a>;
}

function Inline({ nodes }: { nodes: InlineNode[] }) {
  return <>{(nodes ?? []).map((n, i) => {
    if (n?.type === "link") {
      const href = safeHref(n.url);
      const inner = <Inline nodes={n.children} />;
      return href ? <SmartLink key={i} href={href} className="underline underline-offset-4">{inner}</SmartLink> : <span key={i}>{inner}</span>;
    }
    if (n?.type !== "text" || typeof n.text !== "string") return null;
    let el: React.ReactNode = n.text;
    if (n.code) el = <code>{el}</code>;
    if (n.bold) el = <strong>{el}</strong>;
    if (n.italic) el = <em>{el}</em>;
    if (n.underline) el = <u>{el}</u>;
    if (n.strikethrough) el = <s>{el}</s>;
    return <span key={i}>{el}</span>;
  })}</>;
}

/** Renders Strapi "blocks" rich text as React nodes (no raw HTML is ever injected). */
export function RichTextView({ value }: { value: RichText }) {
  return (
    <div className="space-y-4 text-base leading-relaxed text-foreground/85">
      {(value ?? []).map((n, i) => {
        switch (n?.type) {
          case "paragraph": return <p key={i}><Inline nodes={n.children} /></p>;
          case "heading": {
            const H = (`h${Math.min(Math.max(n.level + 1, 2), 6)}`) as "h2";
            return <H key={i} className="font-headline text-3xl tracking-wide text-foreground pt-2"><Inline nodes={n.children} /></H>;
          }
          case "quote": return <blockquote key={i} className="border-l-4 border-foreground pl-4 italic"><Inline nodes={n.children} /></blockquote>;
          case "list": {
            const L = n.format === "ordered" ? "ol" : "ul";
            return <L key={i} className={`${n.format === "ordered" ? "list-decimal" : "list-disc"} pl-6 space-y-1`}>
              {(n.children ?? []).map((li, j) => <li key={j}><Inline nodes={li.children} /></li>)}
            </L>;
          }
          case "image": {
            const href = n.image?.url && /^https?:\/\//.test(n.image.url) ? n.image.url : undefined;
            return href ? <img key={i} src={href} alt={n.image.alternativeText ?? ""} loading="lazy" className="w-full" /> : null;
          }
          default: return null;
        }
      })}
    </div>
  );
}

export function BlockRenderer({ blocks }: { blocks: Block[] }) {
  return (
    <div className="space-y-12">
      {blocks.map((b, i) => {
        switch (b.kind) {
          case "text": return <RichTextView key={i} value={b.body} />;
          case "heading-text": return (
            <section key={i}>
              <h2 className="font-headline text-4xl md:text-5xl tracking-wide text-foreground mb-4">{b.title}</h2>
              <RichTextView value={b.body} />
            </section>
          );
          case "image": return (
            <figure key={i}>
              <CmsImg image={b.image} className="w-full h-auto" sizes="(min-width: 1024px) 896px, 100vw" />
              {b.caption && <figcaption className="text-sm text-muted-foreground mt-2">{b.caption}</figcaption>}
            </figure>
          );
          case "gallery": return (
            <div key={i} className="grid grid-cols-2 md:grid-cols-3 gap-2">
              {b.images.map((img, j) => <CmsImg key={j} image={img} className="w-full aspect-square object-cover" sizes="(min-width: 768px) 33vw, 50vw" />)}
            </div>
          );
          case "quote": return (
            <blockquote key={i} className="border-l-4 border-foreground pl-6">
              <p className="font-headline text-3xl md:text-4xl tracking-wide text-foreground">“{b.text}”</p>
              {b.author && <footer className="text-sm text-muted-foreground mt-2">— {b.author}</footer>}
            </blockquote>
          );
          case "cta": return (
            <div key={i} className="bg-foreground text-primary-foreground p-8 md:p-12">
              <h2 className="font-headline text-4xl tracking-wide mb-3">{b.title}</h2>
              {b.text && <p className="text-primary-foreground/80 mb-6">{b.text}</p>}
              <Button variant="hero-secondary" asChild><SmartLink href={b.link.url}>{b.link.label}</SmartLink></Button>
            </div>
          );
          case "two-columns": return (
            <div key={i} className="grid md:grid-cols-2 gap-8"><RichTextView value={b.left} /><RichTextView value={b.right} /></div>
          );
          case "video": return (
            <div key={i} className="relative w-full aspect-video">
              <iframe src={b.embedUrl} title={b.title ?? "Video"} className="absolute inset-0 w-full h-full" loading="lazy"
                allow="accelerometer; encrypted-media; picture-in-picture" allowFullScreen referrerPolicy="strict-origin-when-cross-origin" />
            </div>
          );
          case "divider": return <hr key={i} className="border-t-2 border-foreground/20" />;
        }
      })}
    </div>
  );
}
