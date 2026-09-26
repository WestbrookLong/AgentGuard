import cytoscape, { Core, ElementDefinition, StylesheetJson } from "cytoscape";
import { Maximize2, RefreshCw } from "lucide-react";
import { useEffect, useMemo, useRef } from "react";
import type { MemoryGraph } from "../types";

interface Props {
  graph: MemoryGraph | null;
  selectedId: string | null;
  onSelect: (nodeId: string) => void;
}

function graphStyles(): StylesheetJson {
  const root = getComputedStyle(document.documentElement);
  const color = (name: string, fallback: string) => root.getPropertyValue(name).trim() || fallback;
  return [
    {
      selector: "node",
      style: {
        "background-color": color("--surface", "#fff"),
        "border-color": color("--line", "#deded8"),
        "border-width": 1.5,
        color: color("--body-text", "#292926"),
        label: "data(shortLabel)",
        "font-family": 'Inter, "Segoe UI", sans-serif',
        "font-size": 9,
        "font-weight": 600,
        "min-zoomed-font-size": 9,
        "text-wrap": "ellipsis",
        "text-max-width": "118px",
        "text-valign": "bottom",
        "text-margin-y": 8,
        width: 34,
        height: 34,
      },
    },
    {
      selector: 'node[type = "identity"]',
      style: {
        "background-color": color("--ink", "#191919"),
        "border-color": color("--ink", "#191919"),
        color: color("--ink", "#191919"),
        width: 62,
        height: 62,
        "font-size": 11,
        "text-margin-y": 10,
      },
    },
    {
      selector: 'node[type = "topic"]',
      style: {
        "background-color": color("--coral", "#f15b40"),
        "border-color": color("--coral", "#f15b40"),
        width: 48,
        height: 48,
      },
    },
    {
      selector: 'node[type = "claim"]',
      style: {
        "background-color": color("--teal", "#177e75"),
        "border-color": color("--teal", "#177e75"),
        shape: "round-rectangle",
        width: 42,
        height: 32,
      },
    },
    {
      selector: 'node[type = "event"]',
      style: {
        "background-color": color("--secondary-text", "#4f4f4a"),
        "border-color": color("--secondary-text", "#4f4f4a"),
        shape: "diamond",
        width: 27,
        height: 27,
      },
    },
    {
      selector: 'node[type = "open_loop"]',
      style: {
        "background-color": color("--amber", "#e6a62d"),
        "border-color": color("--amber", "#e6a62d"),
        shape: "rectangle",
        width: 34,
        height: 34,
      },
    },
    {
      selector: 'node[type = "slot"]',
      style: {
        "background-color": "#4978a8",
        "border-color": "#4978a8",
        shape: "hexagon",
        width: 31,
        height: 31,
      },
    },
    {
      selector: 'node[type = "topic_item"]',
      style: {
        "background-color": "#8a7550",
        "border-color": "#8a7550",
        shape: "round-diamond",
        width: 29,
        height: 29,
      },
    },
    {
      selector: 'node[type = "state"]',
      style: {
        "background-color": "#6f6a8d",
        "border-color": "#6f6a8d",
        shape: "tag",
        width: 40,
        height: 34,
      },
    },
    {
      selector: 'node[type = "retrieval"]',
      style: {
        "background-color": "#40748a",
        "border-color": "#40748a",
        shape: "barrel",
        width: 36,
        height: 32,
      },
    },
    {
      selector: 'node[status = "disputed"]',
      style: {
        "border-color": color("--coral", "#f15b40"),
        "border-width": 4,
      },
    },
    {
      selector: "node:selected",
      style: {
        "border-color": color("--ink", "#191919"),
        "border-width": 4,
        "overlay-color": color("--teal", "#177e75"),
        "overlay-opacity": 0.08,
      },
    },
    {
      selector: "edge",
      style: {
        width: 1.2,
        "line-color": color("--line", "#c8c8c1"),
        "target-arrow-color": color("--line", "#c8c8c1"),
        "target-arrow-shape": "none",
        "curve-style": "bezier",
        opacity: 0.78,
      },
    },
    {
      selector: 'edge[directed = "true"]',
      style: { "target-arrow-shape": "triangle", "arrow-scale": 0.7 },
    },
    {
      selector: 'edge[type = "semantic_similarity"]',
      style: {
        "line-style": "dashed",
        "line-color": "#817b8f",
        "target-arrow-shape": "none",
        opacity: 0.5,
      },
    },
    {
      selector: 'edge[type *= "conflict"], edge[type = "contradicts"]',
      style: {
        "line-color": color("--coral", "#f15b40"),
        "target-arrow-color": color("--coral", "#f15b40"),
        width: 2.2,
      },
    },
    {
      selector: "edge:selected",
      style: {
        "line-color": color("--ink", "#191919"),
        "target-arrow-color": color("--ink", "#191919"),
        width: 2.4,
        opacity: 1,
      },
    },
  ];
}

export function MemoryGraphCanvas({ graph, selectedId, onSelect }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const cyRef = useRef<Core | null>(null);
  const elements = useMemo<ElementDefinition[]>(() => {
    if (!graph) return [];
    return [
      ...graph.nodes.map((node) => ({
        data: {
          ...node,
          shortLabel: node.label.length > 34 ? `${node.label.slice(0, 34)}…` : node.label,
        },
      })),
      ...graph.edges.map((edge) => ({ data: edge })),
    ];
  }, [graph]);

  useEffect(() => {
    if (!containerRef.current || !graph) return undefined;
    const cy = cytoscape({
      container: containerRef.current,
      elements,
      style: graphStyles(),
      minZoom: 0.25,
      maxZoom: 2.4,
      wheelSensitivity: 0.2,
      selectionType: "single",
      layout: {
        name: graph.mode === "global" ? "concentric" : "cose",
        animate: false,
        fit: true,
        padding: 54,
        nodeRepulsion: 8200,
        idealEdgeLength: 94,
        edgeElasticity: 80,
        nestingFactor: 1.2,
      },
    });
    cy.on("tap", "node", (event) => onSelect(event.target.id()));
    cyRef.current = cy;
    return () => {
      cy.destroy();
      cyRef.current = null;
    };
  }, [elements, graph, onSelect]);

  useEffect(() => {
    const cy = cyRef.current;
    if (!cy || !selectedId) return;
    cy.elements().unselect();
    const node = cy.getElementById(selectedId);
    if (node.length) {
      node.select();
      cy.animate({ center: { eles: node }, duration: 180 });
    }
  }, [selectedId]);

  return (
    <div className="memory-graph-shell">
      <div ref={containerRef} className="memory-graph-canvas" aria-label="记忆关系图" />
      <div className="graph-canvas-controls">
        <button title="适应画布" onClick={() => cyRef.current?.fit(undefined, 48)}><Maximize2 size={16} /></button>
        <button title="重新布局" onClick={() => {
          cyRef.current?.layout({
            name: graph?.mode === "global" ? "concentric" : "cose",
            animate: true,
            animationDuration: 280,
            fit: true,
            padding: 48,
            nodeRepulsion: 8200,
            idealEdgeLength: 94,
          }).run();
        }}><RefreshCw size={16} /></button>
      </div>
      {graph && (
        <div className="graph-count">{graph.nodes.length} 节点 · {graph.edges.length} 关系</div>
      )}
    </div>
  );
}
