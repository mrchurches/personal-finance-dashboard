import { Tooltip } from "antd";
import type { ReactElement, ReactNode } from "react";
import { useTranslation } from "react-i18next";
import es from "@/i18n/locales/es.json";

/**
 * The glossary keys, taken from the catalogue itself.
 *
 * Typed rather than left as a string so a mistyped id is a compile error. With a plain
 * string it would have been a silent one: i18next renders an unknown key as the key, so
 * the reader would see "glossary.opening" in a tooltip and nothing would have failed.
 */
type GlossaryId = keyof typeof es.glossary;

interface TermProps {
  id: GlossaryId;
  children: ReactNode;
}

/**
 * A word that explains itself where it appears.
 *
 * The panels were already well written: nearly all of them carry a paragraph saying why
 * a figure is computed the way it is. What was missing is the other question - what does
 * this word mean - and the words that need it are not in the paragraphs. They are in
 * column headers and metric titles, which the eye lands on after the paragraph has been
 * scrolled past, and where there is no room for prose.
 *
 * So the explanation attaches to the term. Definitions only: anything the reader is
 * meant to DO, and any verdict about whether a number is good news, has to be visible
 * text, because a reader on a phone may never open a tooltip and a reader in a hurry
 * will not.
 *
 * Click as well as hover, for the same reason.
 */
export function Term({ id, children }: TermProps): ReactElement {
  const { t } = useTranslation();

  return (
    <Tooltip
      title={t(`glossary.${id}`)}
      trigger={["hover", "click"]}
      styles={{ root: { maxWidth: 320 } }}
    >
      <span className="cursor-help underline decoration-dotted decoration-from-font underline-offset-2">
        {children}
      </span>
    </Tooltip>
  );
}
