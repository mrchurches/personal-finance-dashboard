import { Card, Typography } from "antd";
import type { ReactElement, ReactNode } from "react";

const { Text, Title } = Typography;

interface SectionPanelProps {
  label: string;
  title: string;
  meta?: ReactNode;
  bodyClassName?: string;
  className?: string;
  children: ReactNode;
}

/** Card with the eyebrow + title + meta heading used by every dashboard panel. */
export function SectionPanel({
  label,
  title,
  meta,
  bodyClassName = "",
  className = "",
  children,
}: SectionPanelProps): ReactElement {
  return (
    <Card
      className={className}
      classNames={{ body: bodyClassName }}
      title={
        <div className="flex flex-wrap items-end justify-between gap-3 py-3">
          <div>
            <Text type="secondary" className="block text-xs font-semibold tracking-widest uppercase">
              {label}
            </Text>
            <Title level={2} className="mb-0! text-xl!">
              {title}
            </Title>
          </div>
          {meta !== undefined && (
            <Text type="secondary" className="text-xs">
              {meta}
            </Text>
          )}
        </div>
      }
    >
      {children}
    </Card>
  );
}
