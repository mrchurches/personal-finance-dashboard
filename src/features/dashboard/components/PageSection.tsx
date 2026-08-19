import type { ReactElement } from "react";
import { Typography } from "antd";

const { Text, Title } = Typography;

interface PageSectionProps {
  label: string;
  purpose: string;
}

/**
 * A heading between groups of panels.
 *
 * Read top to bottom the page had been a filing cabinet: a dozen panels in a row with
 * no statement of what any run of them was for. These headings do two things a reader
 * cannot get from the panels themselves - they say what question the next few answer,
 * and they say where it is safe to stop reading.
 *
 * Deliberately not a collapse and not navigation. Hiding the later sections would
 * destroy the audit trail this reader's trust is built on, which is being able to follow
 * a number down to the charges it came from.
 */
export function PageSection({ label, purpose }: PageSectionProps): ReactElement {
  return (
    <div className="mt-4 flex flex-col gap-1 border-t border-border pt-6 first:mt-0 first:border-0 first:pt-0">
      <Text type="secondary" className="text-xs font-semibold tracking-widest uppercase">
        {label}
      </Text>
      <Title level={2} className="mb-0! text-lg!">
        {purpose}
      </Title>
    </div>
  );
}
