"use client"

import { useState, useEffect, useRef } from "react"
import type { GraphData, GraphNode, GraphEdge } from "@/lib/types"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
import { ExternalLink, TrendingUp, TrendingDown } from "lucide-react"
import { cn } from "@/lib/utils"

interface RelationshipGraphProps {
  data: GraphData
}

interface NodePosition {
  x: number
  y: number
}

export function RelationshipGraph({ data }: RelationshipGraphProps) {
  const svgRef = useRef<SVGSVGElement>(null)
  const [dimensions, setDimensions] = useState({ width: 1000, height: 600 })
  const [nodePositions, setNodePositions] = useState<Map<string, NodePosition>>(new Map())
  const [selectedNode, setSelectedNode] = useState<string | null>(null)
  const [isMobile, setIsMobile] = useState(false)

  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth < 768)
    }
    checkMobile()
    window.addEventListener("resize", checkMobile)
    return () => window.removeEventListener("resize", checkMobile)
  }, [])

  useEffect(() => {
    const positions = new Map<string, NodePosition>()

    const inputNodes = data.nodes.filter((n) => n.type === "input")
    const policyNodes = data.nodes.filter((n) => n.type === "policy")
    const sectorNodes = data.nodes.filter((n) => n.type === "sector")
    const enterpriseNodes = data.nodes.filter((n) => n.type === "enterprise")

    const width = dimensions.width
    const height = dimensions.height
    const padding = isMobile ? 40 : 80

    if (isMobile) {
      const rowHeight = (height - padding * 2) / 4

      inputNodes.forEach((node, i) => {
        positions.set(node.id, {
          x: width / 2,
          y: padding + rowHeight * 0.5,
        })
      })

      const policySpacing = width / (policyNodes.length + 1)
      policyNodes.forEach((node, i) => {
        positions.set(node.id, {
          x: policySpacing * (i + 1),
          y: padding + rowHeight * 1.5,
        })
      })

      const sectorSpacing = width / (sectorNodes.length + 1)
      sectorNodes.forEach((node, i) => {
        positions.set(node.id, {
          x: sectorSpacing * (i + 1),
          y: padding + rowHeight * 2.5,
        })
      })

      const enterpriseSpacing = width / (enterpriseNodes.length + 1)
      enterpriseNodes.forEach((node, i) => {
        positions.set(node.id, {
          x: enterpriseSpacing * (i + 1),
          y: padding + rowHeight * 3.5,
        })
      })
    } else {
      const colWidth = (width - padding * 2) / 4

      inputNodes.forEach((node, i) => {
        positions.set(node.id, {
          x: padding + colWidth * 0.5,
          y: height / 2,
        })
      })

      const policySpacing = height / (policyNodes.length + 1)
      policyNodes.forEach((node, i) => {
        positions.set(node.id, {
          x: padding + colWidth * 1.5,
          y: policySpacing * (i + 1),
        })
      })

      const sectorSpacing = height / (sectorNodes.length + 1)
      sectorNodes.forEach((node, i) => {
        positions.set(node.id, {
          x: padding + colWidth * 2.5,
          y: sectorSpacing * (i + 1),
        })
      })

      const enterpriseSpacing = height / (enterpriseNodes.length + 1)
      enterpriseNodes.forEach((node, i) => {
        positions.set(node.id, {
          x: padding + colWidth * 3.5,
          y: enterpriseSpacing * (i + 1),
        })
      })
    }

    setNodePositions(positions)
  }, [data, dimensions, isMobile])

  useEffect(() => {
    const updateDimensions = () => {
      if (svgRef.current) {
        const container = svgRef.current.parentElement
        if (container) {
          const width = container.clientWidth
          const height = Math.max(isMobile ? 800 : 600, window.innerHeight * 0.7)
          setDimensions({ width, height })
        }
      }
    }

    updateDimensions()
    window.addEventListener("resize", updateDimensions)
    return () => window.removeEventListener("resize", updateDimensions)
  }, [isMobile])

  const getNodeColor = (type: GraphNode["type"]) => {
    switch (type) {
      case "input":
        return "var(--color-node-input)"
      case "policy":
        return "var(--color-node-policy)"
      case "sector":
        return "var(--color-node-sector)"
      case "enterprise":
        return "var(--color-node-enterprise)"
      default:
        return "var(--primary)"
    }
  }

  const getNodeShape = (type: GraphNode["type"]) => {
    return "roundedRect"
  }

  const getIntersectionPoint = (source: NodePosition, target: NodePosition, targetType: string, isMobile: boolean) => {
    const scale = isMobile ? 0.8 : 1
    let w = 140 * scale
    let h = 70 * scale

    if (targetType === "input") {
      w = 160 * scale
      h = 80 * scale
    } else if (targetType === "enterprise") {
      w = 130 * scale
      h = 65 * scale
    }

    // Vector from target center to source center
    const vx = source.x - target.x
    const vy = source.y - target.y

    if (vx === 0 && vy === 0) return target

    // Calculate intersection with the box boundary
    // Box is [-w/2, w/2] x [-h/2, h/2] relative to target center
    // We want to find t such that (t*vx, t*vy) is on the boundary
    // t_x = (w/2) / |vx|
    // t_y = (h/2) / |vy|

    const tX = Math.abs(vx) > 0 ? w / 2 / Math.abs(vx) : Number.POSITIVE_INFINITY
    const tY = Math.abs(vy) > 0 ? h / 2 / Math.abs(vy) : Number.POSITIVE_INFINITY

    const t = Math.min(tX, tY)

    return {
      x: target.x + vx * t,
      y: target.y + vy * t,
    }
  }

  return (
    <div className="w-full overflow-x-auto">
      <TooltipProvider>
        <svg
          ref={svgRef}
          width={dimensions.width}
          height={dimensions.height}
          className="min-w-full"
          style={{ minWidth: isMobile ? "100%" : "800px" }}
        >
          <defs>
            <marker id="arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto">
              <path d="M 0 0 L 10 5 L 0 10 z" fill="hsl(var(--border))" />
            </marker>
          </defs>

          {/* Draw edges */}
          <g className="edges">
            {data.edges.map((edge) => {
              const sourcePos = nodePositions.get(edge.source)
              const targetPos = nodePositions.get(edge.target)
              const targetNode = data.nodes.find((n) => n.id === edge.target)

              if (!sourcePos || !targetPos || !targetNode) return null

              const endPoint = getIntersectionPoint(sourcePos, targetPos, targetNode.type, isMobile)

              return (
                <g key={edge.id}>
                  {/* Invisible thick line for easier hovering */}
                  <line
                    x1={sourcePos.x}
                    y1={sourcePos.y}
                    x2={endPoint.x}
                    y2={endPoint.y}
                    stroke="transparent"
                    strokeWidth="20"
                  />
                  {/* Visible line */}
                  <line
                    x1={sourcePos.x}
                    y1={sourcePos.y}
                    x2={endPoint.x}
                    y2={endPoint.y}
                    stroke="hsl(var(--border))"
                    strokeWidth="2"
                    strokeDasharray="5,5"
                    markerEnd="url(#arrow)"
                    className="transition-all group-hover:stroke-primary group-hover:stroke-[3px]"
                  />
                </g>
              )
            })}
          </g>

          {/* Draw nodes */}
          <g className="nodes">
            {data.nodes.map((node) => {
              const pos = nodePositions.get(node.id)
              if (!pos) return null

              return (
                <g key={node.id}>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <g
                        className="cursor-pointer transition-transform duration-300 ease-out hover:-translate-y-1"
                        onClick={() => setSelectedNode(node.id === selectedNode ? null : node.id)}
                      >
                        <NodeShape
                          type={node.type}
                          x={pos.x}
                          y={pos.y}
                          color={getNodeColor(node.type)}
                          isSelected={selectedNode === node.id}
                          isMobile={isMobile}
                        />
                        <text
                          x={pos.x}
                          y={pos.y}
                          textAnchor="middle"
                          dominantBaseline="middle"
                          className="fill-white text-xs md:text-sm font-medium pointer-events-none drop-shadow-md"
                          style={{ userSelect: "none" }}
                        >
                          {truncateText(node.label, isMobile ? 12 : 18)}
                        </text>
                      </g>
                    </TooltipTrigger>
                    <TooltipContent className="max-w-sm md:max-w-md bg-popover/90 backdrop-blur-sm border-border/50 shadow-xl">
                      <NodeTooltipContent node={node} />
                    </TooltipContent>
                  </Tooltip>
                </g>
              )
            })}
          </g>
        </svg>
      </TooltipProvider>
    </div>
  )
}

interface NodeShapeProps {
  type: GraphNode["type"]
  x: number
  y: number
  color: string
  isSelected: boolean
  isMobile?: boolean
}

function NodeShape({ type, x, y, color, isSelected, isMobile }: NodeShapeProps) {
  const strokeWidth = isSelected ? 3 : 1.5
  const stroke = isSelected ? "hsl(var(--primary))" : "white"
  const scale = isMobile ? 0.8 : 1

  let width = 140 * scale
  let height = 70 * scale

  // Slight size adjustments based on type for hierarchy, but same shape
  if (type === "input") {
    width = 160 * scale
    height = 80 * scale
  } else if (type === "enterprise") {
    width = 130 * scale
    height = 65 * scale
  }

  return (
    <rect
      x={x - width / 2}
      y={y - height / 2}
      width={width}
      height={height}
      rx={12 * scale}
      ry={12 * scale}
      fill={color}
      stroke={stroke}
      strokeWidth={strokeWidth}
      className="transition-all duration-300 ease-in-out"
      style={{ filter: "drop-shadow(0 4px 6px rgb(0 0 0 / 0.1))" }}
    />
  )
}

function NodeTooltipContent({ node }: { node: GraphNode }) {
  return (
    <div className="space-y-3">
      <div>
        <div className="font-semibold text-base mb-1">{node.label}</div>
        <div className="text-xs text-muted-foreground">
          {node.type === "input" && "검색 입력"}
          {node.type === "policy" && "관련 정책"}
          {node.type === "sector" && "산업 분야"}
          {node.type === "enterprise" && "관련 기업"}
        </div>
      </div>

      {node.data.stockData && (
        <div className="pt-2 border-t border-border">
          <div className="flex items-center justify-between mb-1">
            <span className="text-sm font-medium">현재가</span>
            <span className="text-base font-bold">{node.data.stockData.price.toLocaleString()}원</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-xs text-muted-foreground">{node.data.stockData.symbol}</span>
            <div
              className={cn(
                "flex items-center gap-1 text-sm font-medium",
                node.data.stockData.change > 0 ? "text-stock-up" : "text-stock-down",
              )}
            >
              {node.data.stockData.change > 0 ? (
                <TrendingUp className="w-4 h-4" />
              ) : (
                <TrendingDown className="w-4 h-4" />
              )}
              <span>
                {node.data.stockData.change > 0 ? "+" : ""}
                {node.data.stockData.change.toLocaleString()}({node.data.stockData.changePercent > 0 ? "+" : ""}
                {node.data.stockData.changePercent.toFixed(2)}%)
              </span>
            </div>
          </div>
        </div>
      )}

      {node.data.description && (
        <div className="pt-2 border-t border-border">
          <p className="text-sm leading-relaxed whitespace-pre-line">{node.data.description}</p>
        </div>
      )}

      {node.data.evidence && node.data.evidence.length > 0 && (
        <div className="pt-2 border-t border-border space-y-2">
          <div className="text-xs font-medium text-muted-foreground">
            {node.type === "policy" ? "관련 근거" : "출처"}
          </div>
          {node.data.evidence.map((evidence: any, idx: number) => (
            <a
              key={idx}
              href={evidence.url}
              target="_blank"
              rel="noopener noreferrer"
              className="flex flex-col gap-1 text-sm group"
            >
              <span className="font-medium text-foreground group-hover:text-primary transition-colors">
                {evidence.source_title}
              </span>
              <span className="text-xs text-muted-foreground flex items-center gap-1">
                <ExternalLink className="w-3 h-3" />
                {evidence.url}
              </span>
            </a>
          ))}
        </div>
      )}
    </div>
  )
}

function EdgeTooltipContent({ edge }: { edge: GraphEdge }) {
  return (
    <div className="space-y-2">
      <div className="text-sm font-medium">연결 관계</div>
      {edge.data.description && <p className="text-sm leading-relaxed">{edge.data.description}</p>}
      {edge.data.evidence && edge.data.evidence.length > 0 && (
        <div className="pt-2 border-t border-border space-y-2">
          <div className="text-xs font-medium text-muted-foreground">근거</div>
          {edge.data.evidence.map((evidence: any, idx: number) => (
            <a
              key={idx}
              href={evidence.url}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-start gap-2 text-xs text-primary hover:underline"
            >
              <ExternalLink className="w-3 h-3 mt-0.5 flex-shrink-0" />
              <span className="line-clamp-2">{evidence.source_title}</span>
            </a>
          ))}
        </div>
      )}
    </div>
  )
}

function truncateText(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text
  return text.substring(0, maxLength) + "..."
}
