import type { ReactNode } from 'react';
import type { TextBlock } from '../../../shared/types.ts';

interface ListNode {
  text: string;
  children: ListNode[];
}

/** Éléments de liste consécutifs vers un arbre : un niveau plus profond devient une sous-liste. */
function toTree(items: TextBlock[]): ListNode[] {
  const root: ListNode[] = [];
  const stack: Array<{ level: number; children: ListNode[] }> = [{ level: 0, children: root }];
  for (const item of items) {
    const level = Math.max(1, item.level);
    while (stack.length > 1 && stack[stack.length - 1].level >= level) stack.pop();
    const node: ListNode = { text: item.text, children: [] };
    stack[stack.length - 1].children.push(node);
    stack.push({ level, children: node.children });
  }
  return root;
}

function List({ nodes }: { nodes: ListNode[] }) {
  return (
    <ul>
      {nodes.map((node, index) => (
        <li key={index}>
          {node.text}
          {node.children.length > 0 && <List nodes={node.children} />}
        </li>
      ))}
    </ul>
  );
}

export interface TextBlocksProps {
  blocks: TextBlock[];
  /** Niveau HTML des titres de premier niveau (les suivants descendent d'un cran, jusqu'à h6). */
  headingLevel: 4 | 5 | 6;
}

/** Texte du wiki (anglais) : paragraphes, listes imbriquées et intertitres. */
export function TextBlocks({ blocks, headingLevel }: TextBlocksProps) {
  const out: ReactNode[] = [];
  for (let i = 0; i < blocks.length; i++) {
    const block = blocks[i];
    if (block.kind === 'item') {
      const items: TextBlock[] = [];
      while (i < blocks.length && blocks[i].kind === 'item') items.push(blocks[i++]);
      i--;
      out.push(<List key={i} nodes={toTree(items)} />);
    } else if (block.kind === 'heading') {
      const Heading = `h${Math.min(6, headingLevel + Math.max(1, block.level) - 1)}` as 'h4' | 'h5' | 'h6';
      out.push(
        <Heading key={i} className="text-blocks__heading">
          {block.text}
        </Heading>,
      );
    } else {
      out.push(<p key={i}>{block.text}</p>);
    }
  }
  return (
    <div className="text-blocks" lang="en">
      {out}
    </div>
  );
}
