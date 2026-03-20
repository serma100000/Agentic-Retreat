'use client';

import { useMemo } from 'react';
import { useRouter } from 'next/navigation';

interface Correlation {
  readonly serviceA: string;
  readonly serviceB: string;
  readonly score: number;
  readonly coOccurrences: number;
}

interface CorrelationGraphProps {
  readonly serviceSlug: string;
  readonly correlations: readonly Correlation[];
}

interface NodePosition {
  x: number;
  y: number;
  label: string;
  slug: string;
  isCenter: boolean;
}

export default function CorrelationGraph({
  serviceSlug,
  correlations,
}: CorrelationGraphProps) {
  const router = useRouter();

  const { nodes, edges } = useMemo(() => {
    const width = 500;
    const height = 400;
    const centerX = width / 2;
    const centerY = height / 2;
    const radius = 140;

    const connectedServices = correlations.map((c) =>
      c.serviceA === serviceSlug ? c.serviceB : c.serviceA,
    );

    const centerNode: NodePosition = {
      x: centerX,
      y: centerY,
      label: serviceSlug.replace(/-/g, ' '),
      slug: serviceSlug,
      isCenter: true,
    };

    const outerNodes: NodePosition[] = connectedServices.map((slug, i) => {
      const angle = (2 * Math.PI * i) / connectedServices.length - Math.PI / 2;
      return {
        x: centerX + radius * Math.cos(angle),
        y: centerY + radius * Math.sin(angle),
        label: slug.replace(/-/g, ' '),
        slug,
        isCenter: false,
      };
    });

    const allNodes = [centerNode, ...outerNodes];

    const edgeData = correlations.map((c) => {
      const targetSlug = c.serviceA === serviceSlug ? c.serviceB : c.serviceA;
      const targetNode = outerNodes.find((n) => n.slug === targetSlug);
      return {
        from: centerNode,
        to: targetNode!,
        score: c.score,
        coOccurrences: c.coOccurrences,
      };
    });

    return { nodes: allNodes, edges: edgeData };
  }, [serviceSlug, correlations]);

  if (correlations.length === 0) {
    return (
      <div className="rounded-lg border border-gray-200 p-8 text-center text-sm text-gray-500 dark:border-gray-700 dark:text-gray-400">
        No correlated services found.
      </div>
    );
  }

  return (
    <div className="w-full overflow-x-auto">
      <svg
        viewBox="0 0 500 400"
        className="mx-auto max-w-full"
        style={{ minWidth: 320 }}
      >
        {/* Edges */}
        {edges.map((edge, i) => (
          <line
            key={i}
            x1={edge.from.x}
            y1={edge.from.y}
            x2={edge.to.x}
            y2={edge.to.y}
            stroke="currentColor"
            className="text-gray-300 dark:text-gray-600"
            strokeWidth={Math.max(1, edge.score * 6)}
            strokeOpacity={0.6}
          />
        ))}

        {/* Edge labels */}
        {edges.map((edge, i) => {
          const mx = (edge.from.x + edge.to.x) / 2;
          const my = (edge.from.y + edge.to.y) / 2;
          return (
            <text
              key={`label-${i}`}
              x={mx}
              y={my - 6}
              textAnchor="middle"
              className="fill-gray-400 text-[10px] dark:fill-gray-500"
            >
              {(edge.score * 100).toFixed(0)}%
            </text>
          );
        })}

        {/* Nodes */}
        {nodes.map((node) => (
          <g
            key={node.slug}
            className="cursor-pointer"
            onClick={() => {
              if (!node.isCenter) {
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                router.push(`/analytics/services/${node.slug}` as any);
              }
            }}
          >
            <circle
              cx={node.x}
              cy={node.y}
              r={node.isCenter ? 28 : 22}
              className={
                node.isCenter
                  ? 'fill-blue-500 dark:fill-blue-600 stroke-blue-700 dark:stroke-blue-400'
                  : 'fill-gray-200 hover:fill-blue-100 dark:fill-gray-700 dark:hover:fill-blue-900 stroke-gray-400 dark:stroke-gray-500'
              }
              strokeWidth={1.5}
            />
            <text
              x={node.x}
              y={node.y + (node.isCenter ? 42 : 36)}
              textAnchor="middle"
              className={
                node.isCenter
                  ? 'fill-gray-900 text-xs font-semibold dark:fill-gray-100 capitalize'
                  : 'fill-gray-600 text-[11px] dark:fill-gray-400 capitalize'
              }
            >
              {node.label.length > 14
                ? node.label.slice(0, 12) + '...'
                : node.label}
            </text>
          </g>
        ))}
      </svg>
    </div>
  );
}
