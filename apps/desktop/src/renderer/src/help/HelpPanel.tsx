import {
  Alert,
  Anchor,
  Button,
  Code,
  Divider,
  Group,
  Image,
  List,
  Table,
  Text,
  Title,
} from '@mantine/core';
import type { Token, Tokens } from 'marked';
import { Fragment, useEffect, useRef, type ReactNode } from 'react';
import { CONTENTS, GUIDE, guideImage } from './guide';
import { useHelp } from './Help';
import { calloutOf, resolveLink, type Callout, type GuidePage } from './markdown';
import { HELP_TOPICS } from './topics';
import './print.css';

/** Element ids in the panel are prefixed, so a heading never clashes with the app's own ids. */
const domId = (anchor: string) => `help-${anchor}`;

/**
 * The help panel, beside the screen the desk is on. Shows one guide page; links move within the
 * guide; **Back** returns; **Print** prints just this page (the event-day checklist fits on A4).
 */
export function HelpPanel() {
  const help = useHelp();
  const topic = help.history.at(-1);
  const scroller = useRef<HTMLDivElement>(null);
  const page = topic ? (GUIDE.get(topic.page) ?? GUIDE.get(CONTENTS)) : undefined;

  // Show the topic's heading, or the top of the page.
  useEffect(() => {
    const box = scroller.current;
    if (!box || !topic) return;
    const target = topic.anchor ? box.querySelector(`#${CSS.escape(domId(topic.anchor))}`) : null;
    if (target instanceof HTMLElement) target.scrollIntoView({ block: 'start' });
    else box.scrollTop = 0;
  }, [topic]);

  if (!topic || !page) return null;

  const print = () => {
    document.body.dataset['print'] = 'help';
    window.print();
    delete document.body.dataset['print'];
  };

  return (
    <div
      className="help-panel"
      role="region"
      aria-label="Help"
      style={{ display: 'flex', flexDirection: 'column', height: '100%' }}
      // Esc closes help only from inside it: screens use Esc for their own Cancel.
      onKeyDown={(e) => {
        if (e.key === 'Escape') help.close();
      }}
    >
      <Group
        className="help-toolbar"
        gap="xs"
        p="xs"
        justify="space-between"
        style={{ borderBottom: '1px solid var(--mantine-color-gray-3)' }}
      >
        <Group gap="xs">
          <Button
            variant="subtle"
            color="dark"
            size="compact-md"
            disabled={help.history.length < 2}
            onClick={help.back}
          >
            ← Back
          </Button>
          <Button
            variant="subtle"
            color="dark"
            size="compact-md"
            onClick={() => help.show({ page: CONTENTS })}
          >
            Contents
          </Button>
          <Button
            variant="subtle"
            color="dark"
            size="compact-md"
            onClick={() => help.show(HELP_TOPICS.checklist)}
          >
            Checklist
          </Button>
        </Group>
        <Group gap="xs">
          <Button variant="subtle" color="dark" size="compact-md" onClick={print}>
            Print
          </Button>
          <Button
            variant="subtle"
            color="dark"
            size="compact-md"
            onClick={help.close}
            rightSection={
              <Text span size="xs" c="dimmed">
                Esc
              </Text>
            }
          >
            Close
          </Button>
        </Group>
      </Group>
      <div
        ref={scroller}
        className="help-page"
        tabIndex={-1}
        style={{ overflowY: 'auto', flex: 1, padding: 'var(--mantine-spacing-md)' }}
      >
        <Blocks page={page} tokens={page.tokens} />
      </div>
    </div>
  );
}

function Blocks({ page, tokens }: { page: GuidePage; tokens: readonly Token[] }) {
  return (
    <>
      {tokens.map((t, i) => (
        <Block key={i} page={page} token={t} />
      ))}
    </>
  );
}

const CALLOUT_COLOUR: Record<Callout, string> = {
  NOTE: 'blue',
  TIP: 'green',
  IMPORTANT: 'violet',
  WARNING: 'orange',
  CAUTION: 'red',
};
const CALLOUT_TITLE: Record<Callout, string> = {
  NOTE: 'Note',
  TIP: 'Tip',
  IMPORTANT: 'Important',
  WARNING: 'Warning',
  CAUTION: 'Caution',
};

function Block({ page, token }: { page: GuidePage; token: Token }): ReactNode {
  switch (token.type) {
    case 'heading': {
      const h = token as Tokens.Heading;
      const order = Math.min(h.depth, 6) as 1 | 2 | 3 | 4 | 5 | 6;
      return (
        <Title
          order={order}
          id={domId(page.headingIds.get(h) ?? '')}
          size={['h2', 'h3', 'h4', 'h5', 'h6', 'h6'][order - 1]}
          mt={order === 1 ? 0 : 'lg'}
          mb="xs"
        >
          <Inline page={page} tokens={h.tokens} />
        </Title>
      );
    }
    case 'paragraph':
      return (
        <Text mb="sm">
          <Inline page={page} tokens={(token as Tokens.Paragraph).tokens} />
        </Text>
      );
    case 'text': {
      const t = token as Tokens.Text;
      return t.tokens ? <Inline page={page} tokens={t.tokens} /> : t.text;
    }
    case 'list': {
      const l = token as Tokens.List;
      const tasks = l.items.some((item) => item.task);
      return (
        <List
          type={l.ordered ? 'ordered' : 'unordered'}
          {...(l.ordered && typeof l.start === 'number' && { start: l.start })}
          listStyleType={tasks ? 'none' : undefined}
          withPadding={!tasks}
          spacing={4}
          mb="sm"
        >
          {l.items.map((item, i) => (
            <List.Item key={i}>
              {item.task && <span className="help-box" aria-hidden="true" />}
              <Blocks
                page={page}
                tokens={item.tokens.filter((t) => (t.type as string) !== 'checkbox')}
              />
            </List.Item>
          ))}
        </List>
      );
    }
    case 'table': {
      const t = token as Tokens.Table;
      return (
        <Table withTableBorder withColumnBorders mb="sm" verticalSpacing={4}>
          <Table.Thead>
            <Table.Tr>
              {t.header.map((cell, i) => (
                <Table.Th key={i}>
                  <Inline page={page} tokens={cell.tokens} />
                </Table.Th>
              ))}
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {t.rows.map((row, r) => (
              <Table.Tr key={r}>
                {row.map((cell, c) => (
                  <Table.Td key={c}>
                    <Inline page={page} tokens={cell.tokens} />
                  </Table.Td>
                ))}
              </Table.Tr>
            ))}
          </Table.Tbody>
        </Table>
      );
    }
    case 'blockquote': {
      const q = token as Tokens.Blockquote;
      const callout = calloutOf(q);
      if (!callout) {
        return (
          <Alert color="gray" mb="sm">
            <Blocks page={page} tokens={q.tokens} />
          </Alert>
        );
      }
      return (
        <Alert color={CALLOUT_COLOUR[callout.kind]} title={CALLOUT_TITLE[callout.kind]} mb="sm">
          <Blocks page={page} tokens={callout.body} />
        </Alert>
      );
    }
    case 'code':
      return (
        <Code block mb="sm">
          {(token as Tokens.Code).text}
        </Code>
      );
    case 'hr':
      return <Divider my="md" />;
    default:
      // `space`, and HTML (comments only, in the guide).
      return null;
  }
}

function Inline({ page, tokens }: { page: GuidePage; tokens: readonly Token[] | undefined }) {
  return (
    <>
      {(tokens ?? []).map((t, i) => (
        <Fragment key={i}>{inline(page, t)}</Fragment>
      ))}
    </>
  );
}

function inline(page: GuidePage, token: Token): ReactNode {
  switch (token.type) {
    case 'text':
    case 'escape': {
      const t = token as Tokens.Text;
      return t.tokens ? <Inline page={page} tokens={t.tokens} /> : t.text;
    }
    case 'strong':
      return (
        <strong>
          <Inline page={page} tokens={(token as Tokens.Strong).tokens} />
        </strong>
      );
    case 'em':
      return (
        <em>
          <Inline page={page} tokens={(token as Tokens.Em).tokens} />
        </em>
      );
    case 'del':
      return (
        <del>
          <Inline page={page} tokens={(token as Tokens.Del).tokens} />
        </del>
      );
    case 'codespan':
      return <Code>{(token as Tokens.Codespan).text}</Code>;
    case 'br':
      return <br />;
    case 'link':
      return <GuideLink page={page} link={token as Tokens.Link} />;
    case 'image': {
      const img = token as Tokens.Image;
      const src = guideImage(img.href);
      return src ? <Image src={src} alt={img.text} radius="sm" my="xs" /> : null;
    }
    default:
      return null;
  }
}

function GuideLink({ page, link }: { page: GuidePage; link: Tokens.Link }) {
  const help = useHelp();
  const target = resolveLink(page.id, link.href);
  const text = <Inline page={page} tokens={link.tokens} />;
  if (target.kind === 'external') {
    // Opens in the desk's web browser (main allows https only); help itself never needs it.
    return (
      <Anchor href={target.url} target="_blank" rel="noreferrer">
        {text}
      </Anchor>
    );
  }
  if (target.kind === 'page') {
    const { page: to, anchor } = target;
    return (
      <Anchor
        component="button"
        type="button"
        fz="inherit"
        style={{ verticalAlign: 'baseline' }}
        onClick={() => help.show({ page: to, ...(anchor && { anchor }) })}
      >
        {text}
      </Anchor>
    );
  }
  return text;
}
