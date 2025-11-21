"use client"

import { useState, useEffect, useRef, useMemo } from "react"
import type { AnalysisReport } from "@/lib/types"
import { safeRender } from "@/lib/utils"

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

interface StockPriceData {
  price?: string
  direction?: "상승" | "하락"
  change?: string
  change_percent?: string
  error?: string
}

export function RelationshipGraph({ data }: RelationshipGraphProps) {
  const svgRef = useRef<SVGSVGElement>(null)
  const [dimensions, setDimensions] = useState({ width: 1000, height: 600 })
  const [nodePositions, setNodePositions] = useState<Map<string, NodePosition>>(new Map())
  const [selectedNode, setSelectedNode] = useState<string | null>(null)
  const [isMobile, setIsMobile] = useState(false)
  const [hoveredNode, setHoveredNode] = useState<ProcessedNode | null>(null)
  const [stockPrices, setStockPrices] = useState<Record<string, StockPriceData>>({})
  const [isLoadingStocks, setIsLoadingStocks] = useState(true)
  const stockFetchedRef = useRef(false)

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
    if (data.length === 0) return

    const processData = () => {
      const columnGroups = new Map<string, ProcessedNode[]>()
      columnGroups.set("input", [])
      columnGroups.set("policy", [])
      columnGroups.set("sector", [])
      columnGroups.set("enterprise", [])

      console.log("[v0] Processing data with nodes:", data)

      data.forEach((item, index) => {
        const inputNode: ProcessedNode = {
          id: `input-${index}`,
          label: item.politician || "Unknown",
          type: "input",
          fullText: item.politician || "Unknown",
          data: item,
        }
        columnGroups.get("input")?.push(inputNode)

        if (item.policy) {
          const policyNode: ProcessedNode = {
            id: `policy-${index}`,
            label: truncateText(item.policy, 30),
            type: "policy",
            fullText: item.policy,
            data: { ...item, policy: item.policy },
          }
          columnGroups.get("policy")?.push(policyNode)
        }

        if (item.industry_or_sector) {
          const sectorNode: ProcessedNode = {
            id: `sector-${index}`,
            label: truncateText(item.industry_or_sector, 30),
            type: "sector",
            fullText: item.industry_or_sector,
            data: {
              ...item,
              sector: item.industry_or_sector,
              impactDescription: item.impact_description,
            },
          }
          columnGroups.get("sector")?.push(sectorNode)
        }

        if (item.companies && Array.isArray(item.companies)) {
          item.companies.forEach((company, companyIndex) => {
            const enterpriseNode: ProcessedNode = {
              id: `enterprise-${index}-${companyIndex}`,
              label: truncateText(company, 30),
              type: "enterprise",
              fullText: company,
              data: item,
            }
            columnGroups.get("enterprise")?.push(enterpriseNode)
          })
        }
      })

      setNodePositions(
        Array.from(columnGroups.values())
          .flat()
          .filter((node) => node !== undefined),
      )

      const newPositions = new Map<string, NodePosition>()
      const verticalGap = 120 // Increased vertical gap for larger nodes
      const nodeHeight = 200 // Double node height from 100 to 200

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

    processData()
  }, [data, isMobile])

  useEffect(() => {
    if (stockFetchedRef.current) return
    stockFetchedRef.current = true

    const fetchAllStockPrices = async () => {
      console.log("[v0] Starting to fetch all stock prices...")
      const allCompanies = new Set<string>()

      // Collect all unique company names
      nodes.forEach((node) => {
        if (node.type === "enterprise" && node.label) {
          const companies = node.label.includes(",") ? node.label.split(",").map((c) => c.trim()) : [node.label]
          companies.forEach((c) => allCompanies.add(c))
        }
      })

      console.log(`[v0] Found ${allCompanies.size} unique companies:`, Array.from(allCompanies))

      const companyArray = Array.from(allCompanies)
      const results: Record<string, StockPriceData> = {}

      for (let i = 0; i < companyArray.length; i++) {
        const company = companyArray[i]
        console.log(`[v0] Fetching stock price for: ${company} (${i + 1}/${companyArray.length})`)

        try {
          const response = await fetch("http://localhost:8001/api/stock-price", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ company }),
          })

          if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`)
          }

          const data = await response.json()
          console.log(`[v0] Received stock data for ${company}:`, data)
          results[company] = data
        } catch (error) {
          console.error(`[v0] Failed to fetch stock price for ${company}:`, error)
          results[company] = { error: "검색도중 에러가 났습니다." }
        }

        // Wait 0.5 seconds instead of 1 second between requests to avoid rate limiting
        if (i < companyArray.length - 1) {
          await new Promise((resolve) => setTimeout(resolve, 500))
        }
      }

      console.log("[v0] Finished fetching all stock prices:", results)
      setStockPrices(results)
      setIsLoadingStocks(false)
    }

    if (nodes.some((node) => node.type === "enterprise")) {
      fetchAllStockPrices()
    } else {
      setIsLoadingStocks(false)
    }
  }, [nodes])

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
    <div className="relative w-full overflow-x-auto overflow-y-auto" style={{ height: dimensions.height }}>
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
              <g
                key={node.id}
                className="cursor-pointer transition-transform duration-200 ease-out hover:-translate-y-1"
                onMouseEnter={() => setHoveredNode(node)}
                onMouseLeave={() => setHoveredNode(null)}
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
                  className="text-base md:text-lg font-medium pointer-events-none drop-shadow-md"
                  style={{ userSelect: "none", fill: getTextColor(node.type) }}
                >
                  {truncateText(node.label, isMobile ? 15 : 20)}
                </text>
              </g>
            )
          })}
        </g>
      </svg>

      {hoveredNode && (
        <div
          className="absolute z-50 pointer-events-auto"
          style={{
            left: `${nodePositions.get(hoveredNode.id)?.x || 0}px`,
            top: `${(nodePositions.get(hoveredNode.id)?.y || 0) - 110}px`,
            transform: "translate(-50%, -100%)",
          }}
        >
          <NodeTooltipContent node={hoveredNode} stockPrices={stockPrices} isLoadingStocks={isLoadingStocks} />
        </div>
      )}
    </div>
  )
}

function NodeShape({
  type,
  x,
  y,
  color,
  isSelected,
  isMobile,
}: {
  type: string
  x: number
  y: number
  color: string
  isSelected: boolean
  isMobile: boolean
}) {
  const width = isMobile ? 300 : 400
  const height = isMobile ? 100 : 140
  const rx = isMobile ? 12 : 16
  const ry = isMobile ? 12 : 16

  return (
    <rect
      x={x - width / 2}
      y={y - height / 2}
      width={width}
      height={height}
      rx={rx}
      ry={ry}
      fill={color}
      stroke={isSelected ? "rgb(239, 68, 68)" : getBorderColor(type)}
      strokeWidth={isSelected ? 2 : 1.5}
      className="transition-all duration-300 ease-in-out"
      style={{ filter: "drop-shadow(0 4px 6px rgb(0 0 0 / 0.1))" }}
    />
  )
}

function NodeTooltipContent({
  node,
  stockPrices,
  isLoadingStocks,
}: {
  node: ProcessedNode
  stockPrices: Record<string, StockPriceData>
  isLoadingStocks: boolean
}) {
  return (
    <div className="relative">
      <div className="max-w-xl bg-background/95 backdrop-blur-sm text-foreground rounded-lg shadow-xl border p-6">
        <div>
          <div className="font-bold text-xl mb-2">{safeRender(node.fullText || node.label || "N/A")}</div>
        </div>

        {node.type === "policy" && (
          <div className="pt-3 border-t border-border space-y-3">
            <div className="text-base">
              <span className="font-medium text-muted-foreground">관련 정책: </span>
              <span className="font-medium text-foreground">
                {safeRender(node.data?.policy || node.data?.description || node.label || "N/A")}
              </span>
            </div>
            {node.data?.evidence && Array.isArray(node.data.evidence) && node.data.evidence.length > 0 && (
              <div className="mt-4">
                <div className="text-base font-medium text-muted-foreground mb-2">관련 근거</div>
                {node.data.evidence.map((evidence: any, idx: number) => {
                  if (!evidence || typeof evidence !== "object") {
                    return null
                  }

                  const sourceTitle = safeRender(evidence.source_title)
                  const url = typeof evidence.url === "string" ? evidence.url : ""

                  if (!sourceTitle) return null

                  return (
                    <div key={idx} className="mb-2 text-sm">
                      {url ? (
                        <a
                          href={url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-blue-600 dark:text-blue-400 hover:underline flex items-start gap-1"
                        >
                          <span className="flex-shrink-0 mt-0.5">🔗</span>
                          <span className="break-words">{sourceTitle}</span>
                        </a>
                      ) : (
                        <div className="text-muted-foreground">{sourceTitle}</div>
                      )}
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        )}

        {node.type === "sector" && (
          <div className="pt-3 border-t border-border space-y-3">
            <div className="text-base">
              <span className="font-medium text-muted-foreground">산업 분야: </span>
              <span className="font-medium text-foreground">
                {safeRender(node.data?.sector || node.data?.industry_or_sector || node.label || "N/A")}
              </span>
            </div>
            <div className="text-base">
              <span className="font-medium text-muted-foreground">영향 분석: </span>
              <span className="text-foreground">
                {safeRender(node.data?.impactDescription || node.data?.impact_description || "N/A")}
              </span>
            </div>
          </div>
        )}

        {node.type === "enterprise" && (
          <div className="pt-3 border-t border-border space-y-3">
            <div className="text-base font-semibold text-muted-foreground mb-3">주가 정보</div>
            {isLoadingStocks ? (
              <div className="text-base text-muted-foreground">주가 정보를 불러오는 중...</div>
            ) : stockPrices[node.fullText || node.label] ? (
              <div className="space-y-2">
                <div className="flex items-baseline gap-3">
                  <span className="text-sm text-muted-foreground">현재가:</span>
                  <span
                    className={`text-3xl font-bold ${
                      stockPrices[node.fullText || node.label].direction === "상승" ? "text-red-500" : "text-blue-500"
                    }`}
                  >
                    {stockPrices[node.fullText || node.label].price}
                  </span>
                </div>
                <div className="flex items-center gap-3 text-base">
                  <span className="text-muted-foreground">전일대비:</span>
                  <span
                    className={
                      stockPrices[node.fullText || node.label].direction === "상승"
                        ? "text-red-500 font-semibold"
                        : "text-blue-500 font-semibold"
                    }
                  >
                    {stockPrices[node.fullText || node.label].direction}{" "}
                    {stockPrices[node.fullText || node.label].change}{" "}
                    {stockPrices[node.fullText || node.label].change_percent}
                  </span>
                </div>
              </div>
            ) : stockPrices[node.fullText || node.label] === null ? (
              <div className="text-base text-gray-600 dark:text-gray-400 font-medium">
                주가 정보를 불러올 수 없습니다
              </div>
            ) : (
              <div className="text-base text-gray-600 dark:text-gray-400 font-medium">검색 도중 에러가 났습니다</div>
            )}

            {node.data?.evidence && Array.isArray(node.data.evidence) && node.data.evidence.length > 0 && (
              <div className="mt-4 pt-3 border-t border-border">
                <div className="text-base font-medium text-muted-foreground mb-2">관련 근거</div>
                {node.data.evidence.map((evidence: any, idx: number) => {
                  if (!evidence || typeof evidence !== "object") {
                    return null
                  }

                  const sourceTitle = safeRender(evidence.source_title)
                  const url = typeof evidence.url === "string" ? evidence.url : ""

                  if (!sourceTitle) return null

                  return (
                    <div key={idx} className="mb-2 text-sm">
                      {url ? (
                        <a
                          href={url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-blue-600 dark:text-blue-400 hover:underline flex items-start gap-1"
                        >
                          <span className="flex-shrink-0 mt-0.5">🔗</span>
                          <span className="break-words">{sourceTitle}</span>
                        </a>
                      ) : (
                        <div className="text-muted-foreground">{sourceTitle}</div>
                      )}
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        )}

        {node.type === "input" && (
          <div className="pt-3 border-t border-border">
            <div className="text-base text-muted-foreground">정치인 정보</div>
          </div>
        )}
      </div>
      <div
        className="absolute left-1/2 -translate-x-1/2 w-0 h-0"
        style={{
          bottom: "-8px",
          borderLeft: "8px solid transparent",
          borderRight: "8px solid transparent",
          borderTop: "8px solid hsl(var(--border))",
        }}
      />
      <div
        className="absolute left-1/2 -translate-x-1/2 w-0 h-0"
        style={{
          bottom: "-7px",
          borderLeft: "7px solid transparent",
          borderRight: "7px solid transparent",
          borderTop: "7px solid hsl(var(--background))",
        }}
      />
    </div>
  )
}

function getBorderColor(type: string) {
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

function truncateText(text: string, maxLength: number): string {
  if (!text) return "N/A"
  const textString = typeof text === "string" ? text : String(text)
  if (textString.length <= maxLength) return textString
  return textString.substring(0, maxLength) + "..."
}
