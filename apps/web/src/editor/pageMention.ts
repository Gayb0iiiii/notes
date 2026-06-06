import Mention from "@tiptap/extension-mention";

export const PageMention = Mention.extend({
  name: "pageMention",
  addAttributes() {
    return {
      pageId: {
        default: null,
        parseHTML: (element) => element.getAttribute("data-page-id"),
        renderHTML: (attributes) => ({ "data-page-id": attributes.pageId })
      },
      fallbackTitle: {
        default: "Untitled",
        parseHTML: (element) => element.getAttribute("data-fallback-title"),
        renderHTML: (attributes) => ({ "data-fallback-title": attributes.fallbackTitle })
      }
    };
  },
  renderHTML({ node, HTMLAttributes }) {
    return ["span", { ...HTMLAttributes, class: "page-mention" }, `@${node.attrs.fallbackTitle}`];
  }
});
