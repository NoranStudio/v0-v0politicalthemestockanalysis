"use client"

import { useState, useEffect, useRef, useMemo } from "react"
import type { AnalysisReport } from "@/lib/types"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
import { ExternalLink, TrendingUp, TrendingDown } from "lucide-react"
import { cn, safeRender } from "@/lib/utils"

interface RelationshipGraphProps {
  data: AnalysisReport
}

interface NodePosition {
  x: number
  y: number
}

interface ProcessedNode {
  id: string
  label: string
  type: "input" | "policy" | "sector" | "enterprise"
  fullText?: string
  data: any
}

interface ProcessedEdge {
  id: string
  source: string
  target: string
  data: any
}

export function RelationshipGraph({ data }: RelationshipGraphProps) {
  const svgRef = useRef<SVGSVGElement>(null)
  const [dimensions, setDimensions] = useState({ width: 1000, height: 600 })
  const [nodePositions, setNodePositions] = useState<Map<string, NodePosition>>(new Map())
  const [selectedNode, setSelectedNode] = useState<string | null>(null)
  const [isMobile, setIsMobile] = useState(false)

  const { nodes, edges } = useMemo(() => {
    const nodes: ProcessedNode[] = []
    const edges: ProcessedEdge[] = []

    // Safety check: ensure data and influence_chains exist
    if (
      !data ||
      !data.influence_chains ||
      !Array.isArray(data.influence_chains) ||
      data.influence_chains.length === 0
    ) {
      console.error("[v0] Invalid or empty data structure:", data)
      return { nodes: [], edges: [] }
    }

    console.log("[v0] Processing influence_chains:", data.influence_chains)

    // Create input node (politician) - with fallback
    const politician = data.influence_chains[0]?.politician || "Unknown"
    nodes.push({
      id: "input-1",
      label: politician,
      type: "input",
      data: {},
    })

    const policyNodes: ProcessedNode[] = []
    const sectorNodes: ProcessedNode[] = []
    const companyNodes: ProcessedNode[] = []

    data.influence_chains.forEach((chain, idx) => {
      // Safety checks for each chain
      if (!chain) {
        console.warn(`[v0] Skipping invalid chain at index ${idx}`)
        return
      }

      console.log(`[v0] Processing chain ${idx}:`, {
        policy: chain.policy,
        sector: chain.industry_or_sector,
        impact: chain.impact_description,
        evidence: chain.evidence,
      })

      // Add policy node - allow "None directly linked"
      const policyLabel = chain.policy && chain.policy.trim() !== "" ? chain.policy : "None directly linked"
      const policyNode = {
        id: `policy-${idx}`,
        label: policyLabel,
        fullText: policyLabel,
        type: "policy" as const,
        data: {
          policy: policyLabel, // Store policy value directly
          description: policyLabel,
          evidence: Array.isArray(chain.evidence) ? chain.evidence : [],
        },
      }
      policyNodes.push(policyNode)
      console.log(`[v0] Created policy node:`, policyNode)

      // Add sector node - with fallback
      const sector = chain.industry_or_sector || "Unknown Sector"
      const impactDescription = chain.impact_description || "No description available"
      const sectorNode = {
        id: `sector-${idx}`,
        label: sector,
        type: "sector" as const,
        data: {
          sector: sector, // Ensure sector is stored
          impactDescription: impactDescription, // Store impact description with correct key
          impact_description: impactDescription, // Also store with underscore version for compatibility
        },
      }
      sectorNodes.push(sectorNode)
      console.log(`[v0] Created sector node:`, sectorNode)

      // Add company nodes - with array safety check
      if (Array.isArray(chain.companies)) {
        chain.companies.forEach((company, companyIdx) => {
          if (company && company.trim() !== "") {
            const symbolMatch = company.match(/$$(\d+)$$/)
            companyNodes.push({
              id: `enterprise-${idx}-${companyIdx}`,
              label: company,
              type: "enterprise",
              data: {
                stockData: {
                  symbol: symbolMatch ? symbolMatch[1] : "N/A",
                  price: 0,
                  change: 0,
                  changePercent: 0,
                },
              },
            })
          }
        })
      }
    })

    nodes.push(...policyNodes)
    nodes.push(...sectorNodes)
    nodes.push(...companyNodes)

    console.log("[v0] Processed nodes:", nodes.length, "edges:", edges.length)
    console.log(
      "[v0] Final nodes data:",
      nodes.map((n) => ({ id: n.id, type: n.type, data: n.data })),
    )

    return { nodes, edges }
  }, [data])

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

    const inputNodes = nodes.filter((n) => n.type === "input")
    const policyNodes = nodes.filter((n) => n.type === "policy")
    const sectorNodes = nodes.filter((n) => n.type === "sector")
    const enterpriseNodes = nodes.filter((n) => n.type === "enterprise")

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
  }, [nodes, dimensions, isMobile])

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

  const getNodeColor = (type: ProcessedNode["type"]) => {
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

  const getIntersectionPoint = (source: NodePosition, target: NodePosition, targetType: string, isMobile: boolean) => {
    return target
  }

  if (nodes.length === 0) {
    return (
      <div className="flex items-center justify-center min-h-[400px] text-muted-foreground">
        <p>관계도를 생성할 수 있는 데이터가 없습니다.</p>
      </div>
    )
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
          {/* Draw nodes */}
          <g className="nodes">
            {nodes.map((node) => {
              const pos = nodePositions.get(node.id)
              if (!pos) return null

              return (
                <g key={node.id}>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <g
                        className="cursor-pointer transition-transform duration-200 ease-out hover:-translate-y-2"
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
                          {truncateText(node.label, isMobile ? 15 : 20)}
                        </text>
                      </g>
                    </TooltipTrigger>
                    <TooltipContent className="max-w-sm md:max-w-md bg-background/95 backdrop-blur-md border-border shadow-xl">
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
  type: ProcessedNode["type"]
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

  let width = 234 * scale // 180 * 1.3
  let height = 117 * scale // 90 * 1.3

  if (type === "input") {
    width = 260 * scale // 200 * 1.3
    height = 130 * scale // 100 * 1.3
  } else if (type === "enterprise") {
    width = 221 * scale // 170 * 1.3
    height = 110 * scale // 85 * 1.3
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

function NodeTooltipContent({ node }: { node: ProcessedNode }) {
  console.log("[v0] Rendering tooltip for node:", node.id, "data:", node.data)

  return (
    <div className="space-y-3">
      <div>
        <div className="font-bold text-lg mb-1">{safeRender(node.fullText || node.label || "N/A")}</div>
      </div>

      {node.type === "policy" && (
        <div className="pt-2 border-t border-border space-y-2">
          <div className="text-sm">
            <span className="font-medium text-muted-foreground">관련 정책: </span>
            <span className="font-medium">
              {safeRender(node.data?.policy || node.data?.description || node.label || "N/A")}
            </span>
          </div>
          {node.data?.evidence && Array.isArray(node.data.evidence) && node.data.evidence.length > 0 && (
            <div className="mt-3">
              <div className="text-sm font-medium text-muted-foreground mb-2">관련 근거</div>
              {node.data.evidence.map((evidence: any, idx: number) => {
                if (!evidence || typeof evidence !== "object") {
                  return null
                }

                const title = evidence.source_title || evidence.title || "제목 없음"
                const titleString = safeRender(title)

                const url = evidence.url || evidence.source_url || ""
                const urlString = safeRender(url)

                return (
                  <div key={idx} className="flex flex-col gap-1 mb-2">
                    <span className="text-sm font-medium text-foreground">{titleString}</span>
                    {urlString && (
                      <a
                        href={urlString}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-xs text-primary hover:underline flex items-center gap-1"
                      >
                        <ExternalLink className="w-3 h-3" />
                        <span className="break-all">{urlString}</span>
                      </a>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}

      {node.type === "sector" && (
        <div className="pt-2 border-t border-border space-y-3">
          <div className="text-sm">
            <span className="font-medium text-muted-foreground">산업 분야: </span>
            <span className="font-medium">{safeRender(node.data?.sector || node.label || "N/A")}</span>
          </div>
          {(node.data?.impactDescription || node.data?.impact_description) && (
            <div className="text-sm">
              <span className="font-medium text-muted-foreground">영향 분석: </span>
              <span className="leading-relaxed">
                {safeRender(node.data.impactDescription || node.data.impact_description)}
              </span>
            </div>
          )}
        </div>
      )}

      {node.data?.stockData && (
        <div className="pt-2 border-t border-border">
          <div className="flex items-center justify-between mb-1">
            <span className="text-sm font-medium">현재가</span>
            <span className="text-base font-bold">
              {typeof node.data.stockData.price === "number"
                ? node.data.stockData.price.toLocaleString()
                : safeRender(node.data.stockData.price || "0")}
              원
            </span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-xs text-muted-foreground">
              {node.data.stockData.symbol ? safeRender(node.data.stockData.symbol) : "N/A"}
            </span>
            <div
              className={cn(
                "flex items-center gap-1 text-sm font-medium",
                (node.data.stockData.change || 0) > 0 ? "text-stock-up" : "text-stock-down",
              )}
            >
              {(node.data.stockData.change || 0) > 0 ? (
                <TrendingUp className="w-4 h-4" />
              ) : (
                <TrendingDown className="w-4 h-4" />
              )}
              <span>
                {(node.data.stockData.change || 0) > 0 ? "+" : ""}
                {typeof node.data.stockData.change === "number"
                  ? node.data.stockData.change.toLocaleString()
                  : safeRender(node.data.stockData.change || "0")}
                ({(node.data.stockData.changePercent || 0) > 0 ? "+" : ""}
                {typeof node.data.stockData.changePercent === "number"
                  ? node.data.stockData.changePercent.toFixed(2)
                  : safeRender(node.data.stockData.changePercent || "0.00")}
                %)
              </span>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function truncateText(text: string, maxLength: number): string {
  if (!text) return "N/A"
  const textString = typeof text === "string" ? text : String(text)
  if (textString.length <= maxLength) return textString
  return textString.substring(0, maxLength) + "..."
}
