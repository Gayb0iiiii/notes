// @ts-ignore - yjs is installed by the workspace collab package; this keeps the API lockfile stable.
import * as Y from "../../../collab/node_modules/yjs/dist/yjs.mjs";

function textNode(value: string): Y.XmlText | null {
  const clean = value.replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/\s+/g, " ").trim();
  if (!clean) return null;
  const text = new Y.XmlText();
  text.insert(0, clean);
  return text;
}

function element(name: string, children: Array<Y.XmlElement | Y.XmlText> = [], attrs: Record<string, unknown> = {}): Y.XmlElement {
  const node = new Y.XmlElement(name);
  for (const [key, value] of Object.entries(attrs)) {
    if (value !== undefined && value !== null && value !== "") node.setAttribute(key, value);
  }
  if (children.length > 0) node.insert(0, children);
  return node;
}

function paragraph(value: string): Y.XmlElement {
  return element("paragraph", [textNode(value)].filter(Boolean) as Y.XmlText[]);
}

function attr(source: string, name: string): string | null {
  const match = source.match(new RegExp(`${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s>]+))`, "i"));
  return match?.[1] ?? match?.[2] ?? match?.[3] ?? null;
}

function htmlToNodes(html: string): Array<Y.XmlElement | Y.XmlText> {
  const nodes: Array<Y.XmlElement | Y.XmlText> = [];
  const pattern = /<(h[1-3]|p|li|blockquote|pre)\b([^>]*)>([\s\S]*?)<\/\1>|<(img|hr)\b([^>]*)\/?>/gi;
  let cursor = 0;
  for (const match of html.matchAll(pattern)) {
    if (match.index === undefined) continue;
    const before = html.slice(cursor, match.index);
    if (textNode(before)) nodes.push(paragraph(before));
    const tag = (match[1] ?? match[4] ?? "p").toLowerCase();
    const attrs = match[2] ?? match[5] ?? "";
    const inner = match[3] ?? "";
    if (tag.startsWith("h")) nodes.push(element("heading", [textNode(inner)].filter(Boolean) as Y.XmlText[], { level: Number(tag.slice(1)) }));
    else if (tag === "img") {
      const src = attr(attrs, "src");
      if (src) nodes.push(element("image", [], { src, alt: attr(attrs, "alt") ?? "", title: attr(attrs, "title") ?? "", width: attr(attrs, "width") ?? "100%" }));
    } else if (tag === "hr") nodes.push(element("horizontalRule"));
    else if (tag === "li") nodes.push(element("bulletList", [element("listItem", [paragraph(inner)])]));
    else if (tag === "blockquote") nodes.push(element("blockquote", [paragraph(inner)]));
    else if (tag === "pre") nodes.push(element("codeBlock", [textNode(inner.replace(/<[^>]+>/g, ""))].filter(Boolean) as Y.XmlText[]));
    else nodes.push(paragraph(inner));
    cursor = match.index + match[0].length;
  }
  const rest = html.slice(cursor);
  if (textNode(rest)) nodes.push(paragraph(rest));
  return nodes.length > 0 ? nodes : [paragraph(" ")];
}

export function htmlToYjsUpdate(html: string): Buffer {
  const doc = new Y.Doc();
  doc.getXmlFragment("default").insert(0, htmlToNodes(html));
  return Buffer.from(Y.encodeStateAsUpdate(doc));
}
