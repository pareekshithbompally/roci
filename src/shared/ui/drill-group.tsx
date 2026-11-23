/** A group of pages, one description for both form factors: on iPhone a card of rows, each pushing its page; on a Mac the
 *  pages' content in place. */

import React, { useState } from 'react';
import { CardRow, Section } from './card';
import { PageBody, PushedScreen, useOptionalNavStack } from './nav-stack';

export interface DrillGroupPage {
  key: string;
  /** Its row's title and its page's (iPhone). */
  title: string;
  /** What its row shows before the chevron (iPhone). */
  value?: string;
  /** Its content, given the title it must show itself (a Mac; on iPhone the page's bar shows it). */
  render: (ownTitle?: string) => React.ReactNode;
}

export interface DrillGroupProps {
  title?: string;
  footer?: React.ReactNode;
  /** Rows before the pages' own, in the same card. */
  rows?: React.ReactNode;
  pages: readonly DrillGroupPage[];
  /** A Mac's content when it isn't the pages one after another. */
  inPlace?: React.ReactNode;
}

export function DrillGroup(props: DrillGroupProps) {
  return useOptionalNavStack() ? <PushedPages {...props} /> : <InPlace {...props} />;
}

function InPlace({ title, footer, rows, pages, inPlace }: DrillGroupProps) {
  return (
    <>
      {rows && <Section title={title} footer={footer}>{rows}</Section>}
      {inPlace ?? pages.map((page) => <React.Fragment key={page.key}>{page.render(page.title)}</React.Fragment>)}
    </>
  );
}

function PushedPages({ title, footer, rows, pages }: DrillGroupProps) {
  const [openKey, setOpenKey] = useState<string | null>(null);
  const page = pages.find((p) => p.key === openKey);
  return (
    <>
      <Section title={title} footer={footer}>
        {rows}
        {pages.map(({ key, title: label, value }) => (
          <CardRow key={key} title={label} onOpen={() => setOpenKey(key)} value={value} />
        ))}
      </Section>
      <PushedScreen open={!!page} title={page?.title ?? ''} onClose={() => setOpenKey(null)}>
        <PageBody>{page?.render()}</PageBody>
      </PushedScreen>
    </>
  );
}
