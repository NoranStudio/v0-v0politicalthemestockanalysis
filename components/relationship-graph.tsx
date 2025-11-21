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
    if (nodes.length > 0) {
      const columnGroups = new Map<string, ProcessedNode[]>()
      nodes.forEach((node) => {
        const column = node.type
        if (!columnGroups.has(column)) {
          columnGroups.set(column, [])
        }
        columnGroups.get(column)!.push(node)
      })

      const newPositions = new Map<string, NodePosition>()
      const isMobile = window.innerWidth < 768
      const verticalGap = 80
      const nodeHeight = 100

      const columnOrder = ["input", "policy", "sector", "enterprise"]
      const columns: ProcessedNode[][] = columnOrder.map((type) => columnGroups.get(type) || [])

      const maxNodesInColumn = Math.max(...columns.map((col) => col.length))
      const calculatedHeight = Math.max(600, maxNodesInColumn * (nodeHeight + verticalGap) + 200)

      const columnWidth = isMobile ? 200 : 300
      const totalWidth = columns.length * columnWidth + 400

      columns.forEach((columnNodes, colIndex) => {
        const x = (colIndex + 1) * (totalWidth / (columns.length + 1))
        const totalHeight = columnNodes.length * nodeHeight + (columnNodes.length - 1) * verticalGap
        const startY = (calculatedHeight - totalHeight) / 2

        columnNodes.forEach((node, rowIndex) => {
          const y = startY + rowIndex * (nodeHeight + verticalGap)
          newPositions.set(node.id, { x, y })
        })
      })

      setNodePositions(newPositions)
      setDimensions({ width: totalWidth, height: calculatedHeight })
    }
  }, [nodes])

  useEffect(() => {
    const updateDimensions = () => {
      if (svgRef.current) {
        const container = svgRef.current.parentElement
        if (container) {
          const width = container.clientWidth
          const height = dimensions.height
          setDimensions((prev) => ({ width, height: prev.height }))
        }
      }
    }

    updateDimensions()
    window.addEventListener("resize", updateDimensions)
    return () => window.removeEventListener("resize", updateDimensions)
  }, [dimensions.height])

  const getNodeColor = (type: ProcessedNode["type"]) => {
    switch (type) {
      case "input":
        return "rgb(17, 24, 39)" // Black (gray-900)
      case "policy":
        return "rgb(55, 65, 81)" // Dark gray (gray-700)
      case "sector":
        return "rgb(156, 163, 175)" // Light gray (gray-400)
      case "enterprise":
        return "rgb(243, 244, 246)" // White (gray-100)
      default:
        return "rgb(55, 65, 81)"
    }
  }

  const getTextColor = (type: ProcessedNode["type"]) => {
    switch (type) {
      case "input":
        return "rgb(255, 255, 255)" // White text on black
      case "policy":
        return "rgb(255, 255, 255)" // White text on dark gray
      case "sector":
        return "rgb(17, 24, 39)" // Dark text on light gray
      case "enterprise":
        return "rgb(17, 24, 39)" // Dark text on white
      default:
        return "rgb(255, 255, 255)"
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
    <div className="w-full overflow-x-auto overflow-y-auto">
      <TooltipProvider>
        <svg
          ref={svgRef}
          width={dimensions.width}
          height={dimensions.height}
          className="min-w-full"
          style={{ minWidth: isMobile ? "100%" : "800px" }}
        >
          <g className="edges">
            {nodes
              .filter((n) => n.type === "input")
              .map((inputNode) => {
                const inputPos = nodePositions.get(inputNode.id)
                if (!inputPos) return null

                return nodes
                  .filter((n) => n.type === "policy")
                  .map((policyNode) => {
                    const policyPos = nodePositions.get(policyNode.id)
                    if (!policyPos) return null

                    return (
                      <line
                        key={`edge-${inputNode.id}-${policyNode.id}`}
                        x1={inputPos.x}
                        y1={inputPos.y}
                        x2={policyPos.x}
                        y2={policyPos.y}
                        stroke="rgb(107, 114, 128)"
                        strokeWidth="2"
                        strokeDasharray="5,5"
                        opacity="0.7"
                      />
                    )
                  })
              })}

            {nodes
              .filter((n) => n.type === "policy")
              .map((policyNode) => {
                const policyPos = nodePositions.get(policyNode.id)
                if (!policyPos) return null

                // Extract index from policy-{idx}
                const policyIdx = policyNode.id.split("-")[1]
                const sectorNode = nodes.find((n) => n.id === `sector-${policyIdx}`)
                if (!sectorNode) return null

                const sectorPos = nodePositions.get(sectorNode.id)
                if (!sectorPos) return null

                return (
                  <line
                    key={`edge-${policyNode.id}-${sectorNode.id}`}
                    x1={policyPos.x}
                    y1={policyPos.y}
                    x2={sectorPos.x}
                    y2={sectorPos.y}
                    stroke="rgb(107, 114, 128)"
                    strokeWidth="2"
                    strokeDasharray="5,5"
                    opacity="0.7"
                  />
                )
              })}

            {nodes
              .filter((n) => n.type === "sector")
              .map((sectorNode) => {
                const sectorPos = nodePositions.get(sectorNode.id)
                if (!sectorPos) return null

                // Extract index from sector-{idx}
                const sectorIdx = sectorNode.id.split("-")[1]

                // Find all companies that belong to this sector (enterprise-{idx}-{companyIdx})
                const companyNodes = nodes.filter(
                  (n) => n.type === "enterprise" && n.id.startsWith(`enterprise-${sectorIdx}-`),
                )

                return companyNodes.map((companyNode) => {
                  const companyPos = nodePositions.get(companyNode.id)
                  if (!companyPos) return null

                  return (
                    <line
                      key={`edge-${sectorNode.id}-${companyNode.id}`}
                      x1={sectorPos.x}
                      y1={sectorPos.y}
                      x2={companyPos.x}
                      y2={companyPos.y}
                      stroke="rgb(107, 114, 128)"
                      strokeWidth="2"
                      strokeDasharray="5,5"
                      opacity="0.7"
                    />
                  )
                })
              })}
          </g>

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
                          className="text-sm md:text-base font-medium pointer-events-none drop-shadow-md"
                          style={{ userSelect: "none", fill: getTextColor(node.type) }}
                        >
                          {truncateText(node.label, isMobile ? 15 : 20)}
                        </text>
                      </g>
                    </TooltipTrigger>
                    <TooltipContent className="max-w-sm md:max-w-md bg-background/95 backdrop-blur-md border-border shadow-xl text-foreground">
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
  const stroke = isSelected ? "hsl(var(--primary))" : getBorderColor(type)
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

function getBorderColor(type: ProcessedNode["type"]) {
  switch (type) {
    case "input":
      return "rgb(75, 85, 99)" // gray-600 for black nodes
    case "policy":
      return "rgb(107, 114, 128)" // gray-500 for dark gray nodes
    case "sector":
      return "rgb(209, 213, 219)" // gray-300 for light gray nodes
    case "enterprise":
      return "rgb(229, 231, 235)" // gray-200 for white nodes
    default:
      return "rgb(156, 163, 175)" // gray-400 default
  }
}

function NodeTooltipContent({ node }: { node: ProcessedNode }) {
  console.log("[v0] Rendering tooltip for node:", node.id, "data:", node.data)

  return (
    <div className="space-y-3 text-foreground">
      <div>
        <div className="font-bold text-lg mb-1 text-foreground">{safeRender(node.fullText || node.label || "N/A")}</div>
      </div>

      {node.type === "policy" && (
        <div className="pt-2 border-t border-border space-y-2">
          <div className="text-sm">
            <span className="font-medium text-muted-foreground">관련 정책: </span>
            <span className="font-medium text-foreground">
              {(() => {
                const policyValue = node.data?.policy || node.data?.description || node.label || "N/A"
                console.log("[v0] Policy tooltip - rendering policy:", policyValue)
                return safeRender(policyValue)
              })()}
            </span>
          </div>
          {(() => {
            console.log("[v0] Policy tooltip - evidence check:", {
              exists: !!node.data?.evidence,
              isArray: Array.isArray(node.data?.evidence),
              length: node.data?.evidence?.length,
              data: node.data?.evidence,
            })
            return null
          })()}
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
            <span className="font-medium text-foreground">
              {(() => {
                const sectorValue = node.data?.sector || node.label || "N/A"
                console.log("[v0] Sector tooltip - rendering sector:", sectorValue)
                return safeRender(sectorValue)
              })()}
            </span>
          </div>
          <div className="text-sm">
            <span className="font-medium text-muted-foreground">영향 분석: </span>
            <span className="leading-relaxed text-foreground">
              {(() => {
                const impactValue = node.data?.impactDescription || node.data?.impact_description || "정보 없음"
                console.log("[v0] Sector tooltip - rendering impact:", impactValue)
                return safeRender(impactValue)
              })()}
            </span>
          </div>
        </div>
      )}

      {node.data?.stockData && (
        <div className="pt-2 border-t border-border">
          <div className="flex items-center justify-between mb-1">
            <span className="text-sm font-medium text-foreground">현재가</span>
            <span className="text-base font-bold text-foreground">
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
