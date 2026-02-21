import { useEffect, useRef, useState } from "react";
import * as d3 from "d3";
import { useQuery } from "@tanstack/react-query";
import { useAuthStore } from "../store/authStore";
import { api } from "../api/client";
import { useTreeStore } from "../store/treeStore";
import { useRegisterOverlay } from "../hooks/useRegisterOverlay";

interface GraphViewProps {
  onClose: () => void;
}

interface GraphNode extends d3.SimulationNodeDatum {
  id: number;
  title: string;
  x?: number;
  y?: number;
  fx?: number | null;
  fy?: number | null;
}

export function GraphView({ onClose }: GraphViewProps) {
  useRegisterOverlay(true, onClose);
  const svgRef = useRef<SVGSVGElement>(null);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose]);
  const containerRef = useRef<HTMLDivElement>(null);
  const token = useAuthStore((s) => s.token);
  const setSelectedNote = useTreeStore((s) => s.setSelectedNote);

  const { data, isLoading } = useQuery({
    queryKey: ["graph", token],
    queryFn: () => api.notes.graph(token!),
    enabled: !!token,
  });

  const [dimensions, setDimensions] = useState({ width: 800, height: 600 });

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      const { width, height } = entries[0]?.contentRect ?? {};
      if (width != null && height != null) setDimensions({ width, height });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    if (!data || !svgRef.current || data.nodes.length === 0) return;

    const { width, height } = dimensions;
    const svg = d3.select(svgRef.current);
    svg.selectAll("*").remove();

    const nodeById = new Map(
      data.nodes.map((n) => [n.id, { ...n, x: 0, y: 0 } as GraphNode])
    );
    const links = data.edges
      .filter((e) => nodeById.has(e.source) && nodeById.has(e.target))
      .map((e) => ({
      source: nodeById.get(e.source) as GraphNode,
      target: nodeById.get(e.target) as GraphNode,
    }));

    const simulation = d3
      .forceSimulation(data.nodes.map((n) => nodeById.get(n.id)!))
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .force("link", d3.forceLink(links).id((d: any) => String(d.id)).distance(80))
      .force("charge", d3.forceManyBody().strength(-200))
      .force("center", d3.forceCenter(width / 2, height / 2));

    const link = svg
      .append("g")
      .selectAll("line")
      .data(links)
      .join("line")
      .attr("stroke", "var(--color-border)")
      .attr("stroke-opacity", 0.6)
      .attr("stroke-width", 1.5);

    const node = svg
      .append("g")
      .selectAll("g")
      .data(data.nodes.map((n) => nodeById.get(n.id)!))
      .join("g")
      .attr("cursor", "pointer");
    const drag = d3
      .drag<SVGGElement, GraphNode>()
      .on("start", (e, d) => {
        e.sourceEvent.stopPropagation();
        if (!e.active) simulation.alphaTarget(0.3).restart();
        d.fx = d.x;
        d.fy = d.y;
      })
      .on("drag", (e, d) => {
        d.fx = e.x;
        d.fy = e.y;
      })
      .on("end", (e, d) => {
        if (!e.active) simulation.alphaTarget(0);
        d.fx = null;
        d.fy = null;
      });
    // d3 selection type compatibility with drag
    (node as unknown as d3.Selection<SVGGElement, GraphNode, SVGGElement, unknown>).call(drag);

    node
      .append("circle")
      .attr("r", 8)
      .attr("fill", "var(--color-accent)")
      .attr("stroke", "var(--color-accent-muted)")
      .attr("stroke-width", 2);

    node
      .append("text")
      .text((d: GraphNode) => d.title)
      .attr("x", 12)
      .attr("y", 4)
      .attr("font-size", 12)
      .attr("fill", "var(--color-text)")
      .attr("class", "select-none");

    node.on("click", (_: unknown, d: GraphNode) => {
      setSelectedNote(d.id);
      onClose();
    });

    simulation.on("tick", () => {
      link
        .attr("x1", (d: { source: GraphNode; target: GraphNode }) => d.source.x ?? 0)
        .attr("y1", (d: { source: GraphNode; target: GraphNode }) => d.source.y ?? 0)
        .attr("x2", (d: { source: GraphNode; target: GraphNode }) => d.target.x ?? 0)
        .attr("y2", (d: { source: GraphNode; target: GraphNode }) => d.target.y ?? 0);
      node.attr("transform", (d: GraphNode) => `translate(${d.x ?? 0},${d.y ?? 0})`);
    });

    return () => {
      simulation.stop();
    };
  }, [data, dimensions, setSelectedNote, onClose]);

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-bg/95 backdrop-blur-sm">
      <div className="relative z-10 shrink-0 flex items-center justify-between border-b border-border px-4 py-3">
        <h2 className="text-lg font-semibold">Граф связей заметок</h2>
        <button
          type="button"
          onClick={onClose}
          className="touch-target-48 min-h-[44px] rounded-lg px-3 py-1.5 hover:bg-accent-muted/50 active:bg-accent-muted"
        >
          Закрыть
        </button>
      </div>
      <div ref={containerRef} data-graph-container className="flex-1 min-h-0">
        {isLoading ? (
          <div className="flex items-center justify-center h-full text-text-muted">
            Загрузка…
          </div>
        ) : !data || data.nodes.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-text-muted gap-2">
            <p>Нет связей между заметками</p>
            <p className="text-sm">Добавьте [[wikilinks]] в заметки для отображения графа</p>
          </div>
        ) : (
          <svg
            ref={svgRef}
            width={dimensions.width}
            height={dimensions.height}
            className="w-full h-full"
          />
        )}
      </div>
    </div>
  );
}
