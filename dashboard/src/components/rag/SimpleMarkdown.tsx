import React from 'react';

// In short: the little markdown a model answer uses (bold, italics, inline code, bullet and numbered
// lists), turned into React elements. The text is never parsed as HTML (no innerHTML), so anything
// else in it, tags included, is shown as the plain text it is.

// One inline mark per match: `code`, **bold**, *italic* or _italic_. The italic forms need a non-word
// character on the outside, so snake_case names and 2*3*4 stay as they are.
const INLINE =
  /`([^`\n]+)`|\*\*(?!\s)(.+?)(?<!\s)\*\*|(?<![\w*])\*(?![\s*])(.+?)(?<![\s*])\*(?![\w*])|(?<!\w)_(?![\s_])(.+?)(?<![\s_])_(?!\w)/g;
const BULLET = /^\s*[-*+]\s+(.*)$/;
const NUMBERED = /^\s*(\d+)[.)]\s+(.*)$/;

/** The inline marks of one line. Bold and italic text can hold the other marks; code is literal. */
export function renderInline(text: string, keyPrefix = ''): React.ReactNode[] {
  const out: React.ReactNode[] = [];
  let last = 0;
  let n = 0;
  for (const m of text.matchAll(INLINE)) {
    const at = m.index ?? 0;
    if (at > last) out.push(text.slice(last, at));
    const key = `${keyPrefix}${n++}`;
    if (m[1] != null) {
      out.push(
        <code key={key} className="px-1 py-0.5 rounded rag-well font-mono text-[0.9em]">
          {m[1]}
        </code>,
      );
    } else if (m[2] != null) {
      out.push(<strong key={key}>{renderInline(m[2], `${key}.`)}</strong>);
    } else {
      out.push(<em key={key}>{renderInline(m[3] ?? m[4], `${key}.`)}</em>);
    }
    last = at + m[0].length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

/** Paragraphs (blank-line separated, single newlines kept as line breaks) and lists. */
export const SimpleMarkdown: React.FC<{ text: string }> = ({ text }) => {
  const lines = text.replace(/\r\n?/g, '\n').split('\n');
  const blocks: React.ReactNode[] = [];
  let i = 0;
  while (i < lines.length) {
    const key = `b${blocks.length}`;
    if (BULLET.test(lines[i])) {
      const items: string[] = [];
      while (i < lines.length && BULLET.test(lines[i])) items.push(lines[i++].match(BULLET)![1]);
      blocks.push(
        <ul key={key} className="list-disc pl-5 space-y-1">
          {items.map((item, j) => (
            <li key={j}>{renderInline(item)}</li>
          ))}
        </ul>,
      );
    } else if (NUMBERED.test(lines[i])) {
      // The list starts at the number the model wrote, so "3. ..." after a paragraph reads 3.
      const start = Number(lines[i].match(NUMBERED)![1]);
      const items: string[] = [];
      while (i < lines.length && NUMBERED.test(lines[i])) items.push(lines[i++].match(NUMBERED)![2]);
      blocks.push(
        <ol key={key} start={start} className="list-decimal pl-5 space-y-1">
          {items.map((item, j) => (
            <li key={j}>{renderInline(item)}</li>
          ))}
        </ol>,
      );
    } else if (lines[i].trim() === '') {
      i++;
    } else {
      const para: string[] = [];
      while (i < lines.length && lines[i].trim() !== '' && !BULLET.test(lines[i]) && !NUMBERED.test(lines[i])) {
        para.push(lines[i++]);
      }
      blocks.push(
        <p key={key}>
          {para.map((line, j) => (
            <React.Fragment key={j}>
              {j > 0 && <br />}
              {renderInline(line, `${j}-`)}
            </React.Fragment>
          ))}
        </p>,
      );
    }
  }
  return <div className="space-y-2">{blocks}</div>;
};
