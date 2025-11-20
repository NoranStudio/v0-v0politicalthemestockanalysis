"use client"

import type React from "react"

import { useState, useMemo, useRef, useEffect } from "react"
import { motion } from "framer-motion"
import { ExternalLink, TrendingUp, TrendingDown } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { mockStockData } from "@/lib/mock-data"
import type { AnalysisReport } from "@/lib/types"

interface RelationshipGraphProps {
  data: AnalysisReport
}

type NodeType = "input" | "policy" | "sector" | "company"

interface GraphNode {
  id: string
  type: NodeType
  label: string
  x: number
  y: number
  data?: any
  sources?: any[] // For policy evidence
  description?: string // For sector impact
}

interface GraphLink {
  source: string
  target: string
}

export function RelationshipGraph({ data }: RelationshipGraphProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [selectedNode, setSelectedNode] = useState<GraphNode | null>(null)
  const [containerSize, setContainerSize] = useState({ width: 0, height: 0 })

  // Update container size on resize
  useEffect(() => {
    const updateSize = () => {
      if (containerRef.current) {
        setContainerSize({
          width: containerRef.current.offsetWidth,
          height: containerRef.current.offsetHeight,
        })
      }
    }

    updateSize()
    window.addEventListener("resize", updateSize)
    return () => window.removeEventListener("resize", updateSize)
  }, [])

  // Process data into nodes and links with merging logic
  const { nodes, links } = useMemo(() => {
    const nodesMap = new Map<string, GraphNode>()
    const linksSet = new Set<string>()

    // 1. Input Node (Root)
    const rootId = "root"
    nodesMap.set(rootId, {
      id: rootId,
      type: "input",
      label: data.influence_chains[0]?.politician || "Input",
      x: 0,
      y: 0.5,
    })

    // Helper to add link
    const addLink = (source: string, target: string) => {
      linksSet.add(`${source}|${target}`)
    }

    // Process chains
    data.influence_chains.forEach((chain) => {
      // 2. Policy Node
      const policyId = `policy-${chain.policy}`
      if (!nodesMap.has(policyId)) {
        nodesMap.set(policyId, {
          id: policyId,
          type: "policy",
          label: chain.policy,
          x: 0.25,
          y: 0, // Will calculate later
          sources: chain.evidence || [],
        })
      } else {
        // Merge evidence if exists
        const existing = nodesMap.get(policyId)!
        if (chain.evidence) {
          const existingUrls = new Set(existing.sources?.map((s) => s.url))
          chain.evidence.forEach((ev) => {
            if (!existingUrls.has(ev.url)) {
              existing.sources?.push(ev)
              existingUrls.add(ev.url)
            }
          })
        }
      }
      addLink(rootId, policyId)

      // 3. Sector Node
      const sectorId = `sector-${chain.industry_or_sector}`
      if (!nodesMap.has(sectorId)) {
        nodesMap.set(sectorId, {
          id: sectorId,
          type: "sector",
          label: chain.industry_or_sector,
          x: 0.55,
          y: 0, // Will calculate later
          description: chain.impact_description,
        })
      } else {
        // Append description if different
        const existing = nodesMap.get(sectorId)!
        if (existing.description && !existing.description.includes(chain.impact_description)) {
          if (chain.impact_description.length > 10) {
            existing.description += "\n\n" + chain.impact_description
          }
        }
      }
      addLink(policyId, sectorId)

      // 4. Company Nodes
      chain.companies.forEach((companyName) => {
        const companyId = `company-${companyName}`
        if (!nodesMap.has(companyId)) {
          nodesMap.set(companyId, {
            id: companyId,
            type: "company",
            label: companyName,
            x: 0.85,
            y: 0, // Will calculate later
            data: mockStockData[companyName],
          })
        }
        addLink(sectorId, companyId)
      })
    })

    // Convert to arrays
    const nodeList = Array.from(nodesMap.values())
    const linkList = Array.from(linksSet).map((str) => {
      const [source, target] = str.split("|")
      return { source, target }
    })

    // --- Layout Algorithm ---

    // Group by type
    const policies = nodeList.filter((n) => n.type === "policy")
    const sectors = nodeList.filter((n) => n.type === "sector")
    const companies = nodeList.filter((n) => n.type === "company")

    // Sort Policies (Alphabetical or by original order if possible)
    policies.sort((a, b) => a.label.localeCompare(b.label))

    // Assign Y to Policies
    policies.forEach((node, i) => {
      node.y = (i + 1) / (policies.length + 1)
    })

    // Sort Sectors based on connected Policies (Barycenter method)
    sectors.forEach((sector) => {
      const parents = linkList
        .filter((l) => l.target === sector.id)
        .map((l) => nodeList.find((n) => n.id === l.source)!)
        .filter(Boolean)

      if (parents.length > 0) {
        const avgY = parents.reduce((sum, p) => sum + p.y, 0) / parents.length
        sector.y = avgY
      }
    })
    // Sort sectors by their calculated Y to prevent crossing
    sectors.sort((a, b) => a.y - b.y)
    // Re-distribute evenly to avoid overlap, but keep relative order
    sectors.forEach((node, i) => {
      node.y = (i + 1) / (sectors.length + 1)
    })

    // Sort Companies based on connected Sectors
    companies.forEach((company) => {
      const parents = linkList
        .filter((l) => l.target === company.id)
        .map((l) => nodeList.find((n) => n.id === l.source)!)
        .filter(Boolean)

      if (parents.length > 0) {
        const avgY = parents.reduce((sum, p) => sum + p.y, 0) / parents.length
        company.y = avgY
      }
    })
    companies.sort((a, b) => a.y - b.y)
    companies.forEach((node, i) => {
      node.y = (i + 1) / (companies.length + 1)
    })

    return { nodes: nodeList, links: linkList }
  }, [data])

  // Helper to get node color
  const getNodeColor = (type: NodeType) => {
    switch (type) {
      case "input":
        return "bg-blue-600 border-blue-400 text-white"
      case "policy":
        return "bg-purple-600 border-purple-400 text-white"
      case "sector":
        return "bg-cyan-600 border-cyan-400 text-white"
      case "company":
        return "bg-emerald-600 border-emerald-400 text-white"
      default:
        return "bg-gray-500"
    }
  }

  return (
    <div
      className="w-full h-[800px] bg-slate-50 rounded-xl border shadow-sm overflow-hidden relative"
      ref={containerRef}
    >
      {/* SVG Layer for Lines */}
      <svg className="absolute inset-0 w-full h-full pointer-events-none z-0">
        {links.map((link, i) => {
          const sourceNode = nodes.find((n) => n.id === link.source)
          const targetNode = nodes.find((n) => n.id === link.target)
          if (!sourceNode || !targetNode) return null

          // Calculate coordinates based on percentages
          const x1 = sourceNode.x * containerSize.width
          const y1 = sourceNode.y * containerSize.height
          const x2 = targetNode.x * containerSize.width
          const y2 = targetNode.y * containerSize.height

          return (
            <path
              key={i}
              d={`M ${x1} ${y1} C ${(x1 + x2) / 2} ${y1}, ${(x1 + x2) / 2} ${y2}, ${x2} ${y2}`}
              fill="none"
              stroke="#94a3b8" // Slate-400
              strokeWidth="2"
              strokeDasharray="5,5"
            />
          )
        })}
      </svg>

      {/* Nodes Layer */}
      {nodes.map((node) => (
        <div
          key={node.id}
          className="absolute transform -translate-x-1/2 -translate-y-1/2 z-10"
          style={{
            left: `${node.x * 100}%`,
            top: `${node.y * 100}%`,
          }}
        >
          <TooltipWrapper node={node}>
            <motion.div
              whileHover={{ y: -5 }}
              transition={{ type: "spring", stiffness: 300 }}
              className={`
                px-4 py-3 rounded-xl shadow-lg border-2 cursor-pointer
                flex items-center justify-center text-center
                min-w-[140px] max-w-[200px]
                ${getNodeColor(node.type)}
              `}
            >
              <span className="text-sm font-bold line-clamp-2">{node.label}</span>
            </motion.div>
          </TooltipWrapper>
        </div>
      ))}
    </div>
  )
}

function TooltipWrapper({ children, node }: { children: React.ReactNode; node: GraphNode }) {
  return (
    <div className="group relative">
      {children}
      <div className="absolute bottom-full left-1/2 transform -translate-x-1/2 mb-3 hidden group-hover:block z-50 w-72">
        <div className="bg-white/90 backdrop-blur-md p-4 rounded-xl shadow-xl border border-slate-200 text-slate-800 text-left">
          <h4 className="font-bold text-lg mb-2 border-b pb-2">{node.label}</h4>

          {node.type === "policy" && node.sources && (
            <div className="space-y-3">
              <p className="text-xs font-semibold text-slate-500 uppercase">Evidence</p>
              {node.sources.map((source, idx) => (
                <div key={idx} className="text-sm">
                  <p className="font-medium mb-1">{source.source_title}</p>
                  <a
                    href={source.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-blue-600 hover:underline text-xs flex items-center gap-1"
                  >
                    <ExternalLink className="w-3 h-3" /> View Source
                  </a>
                </div>
              ))}
            </div>
          )}

          {node.type === "sector" && node.description && (
            <div className="space-y-2">
              <p className="text-xs font-semibold text-slate-500 uppercase">Impact Analysis</p>
              <p className="text-sm leading-relaxed text-slate-700">{node.description}</p>
            </div>
          )}

          {node.type === "company" && node.data && (
            <div className="space-y-3">
              <div className="flex justify-between items-center">
                <span className="text-slate-500 text-sm">Current Price</span>
                <span className="font-mono font-bold text-lg">{node.data.price.toLocaleString()} KRW</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-slate-500 text-sm">Change</span>
                <Badge
                  variant={node.data.change > 0 ? "default" : "destructive"}
                  className={node.data.change > 0 ? "bg-red-500 hover:bg-red-600" : "bg-blue-500 hover:bg-blue-600"}
                >
                  {node.data.change > 0 ? (
                    <TrendingUp className="w-3 h-3 mr-1" />
                  ) : (
                    <TrendingDown className="w-3 h-3 mr-1" />
                  )}
                  {node.data.changePercent}%
                </Badge>
              </div>
            </div>
          )}

          {node.type === "input" && <p className="text-sm text-slate-600">Target of analysis</p>}
        </div>
        {/* Arrow */}
        <div className="absolute top-full left-1/2 transform -translate-x-1/2 -mt-2 border-8 border-transparent border-t-white/90"></div>
      </div>
    </div>
  )
}
