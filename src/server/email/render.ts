/** Pure helpers for filling email templates. No I/O, so they are unit-tested directly. */

const VARIABLE = /\{\{\s*([a-zA-Z_][a-zA-Z0-9_]*)\s*\}\}/g;

export function renderTemplate(text: string, vars: Record<string, string>): string {
  return text.replace(VARIABLE, (_m, name: string) => vars[name] ?? "");
}

/** Variable names used in a template that are not in the allowed list (typos like {{nmae}}). */
export function unknownVariables(text: string, allowed: readonly string[]): string[] {
  const found = new Set<string>();
  for (const m of text.matchAll(VARIABLE)) if (!allowed.includes(m[1])) found.add(m[1]);
  return [...found];
}

export function usesVariable(text: string, name: string): boolean {
  return [...text.matchAll(VARIABLE)].some((m) => m[1] === name);
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

/** Plain text to minimal HTML: paragraphs on blank lines, bare URLs made clickable. Everything is escaped first. */
export function textToHtml(text: string): string {
  return text
    .trim()
    .split(/\n{2,}/)
    .map((para) => {
      const linked = escapeHtml(para).replace(/(https?:\/\/[^\s<]+)/g, '<a href="$1">$1</a>');
      return `<p>${linked.replace(/\n/g, "<br>")}</p>`;
    })
    .join("\n");
}
