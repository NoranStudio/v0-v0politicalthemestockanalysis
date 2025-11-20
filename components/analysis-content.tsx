"use client"

import { useEffect, useState } from "react"
import { useSearchParams } from "next/navigation" // Add useSearchParams import
import { Card } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Spinner } from "@/components/ui/spinner"
import { RelationshipGraph } from "@/components/relationship-graph"
import type { GraphData, GraphNode, GraphEdge } from "@/lib/types"
import { AlertCircle } from "lucide-react"

interface InfluenceChain {
  politician: string
  policy: string
  industry_or_sector: string
  companies: string[]
  impact_description: string
  evidence: Array<{
    source_title: string
    url: string
  }>
}

interface ApiResponse {
  report_title: string
  time_range: string
  influence_chains: InfluenceChain[]
  notes: string
}

export function AnalysisContent() {
  const searchParams = useSearchParams()
  const [query, setQuery] = useState<string>("")
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [apiResponse, setApiResponse] = useState<ApiResponse | null>(null)
  const [graphData, setGraphData] = useState<GraphData | null>(null)

  useEffect(() => {
    if (typeof window !== "undefined") {
      const params = new URLSearchParams(window.location.search)
      const q = params.get("query") || params.get("q") || ""
      setQuery(q)
    }
  }, [])

  useEffect(() => {
    const fetchData = async () => {
      if (!query) return

      try {
        setLoading(true)
        console.log("[v0] Fetching data for query:", query)

        const response = await fetch("/api/generate", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ query }),
        })

        console.log("[v0] Response status:", response.status)

        if (!response.ok) {
          throw new Error("Failed to fetch analysis data")
        }

        const result: ApiResponse = await response.json()
        console.log("[v0] Received data:", result)

        setApiResponse(result)
        const data = transformToGraphData(result)
        setGraphData(data)
      } catch (err) {
        console.error("[v0] Error fetching data:", err)
        setError("분석 대상을 가져오는데 실패했습니다. 다시 시도해주세요.")
      } finally {
        setLoading(false)
      }
    }

    fetchData()
  }, [query])

  const transformToGraphData = (response: ApiResponse): GraphData => {
    const nodes: GraphNode[] = []
    const edges: GraphEdge[] = []
    const nodeMap = new Map<string, GraphNode>()
    let edgeIdCounter = 0

    // Helper to add node if it doesn't exist
    const addNode = (id: string, type: GraphNode["type"], label: string, data?: GraphNode["data"]): GraphNode => {
      if (!nodeMap.has(id)) {
        const node: GraphNode = {
          id,
          type,
          label,
          data: data || {},
        }
        nodeMap.set(id, node)
        nodes.push(node)
      }
      return nodeMap.get(id)!
    }

    // Helper to add edge with proper structure
    const addEdge = (source: string, target: string, data?: GraphEdge["data"]) => {
      const edgeExists = edges.some((e) => e.source === source && e.target === target)
      if (!edgeExists) {
        edges.push({
          id: `edge-${edgeIdCounter++}`,
          source,
          target,
          data: data || {},
        })
      }
    }

    // Process each influence chain
    response.influence_chains.forEach((chain, index) => {
      // 1. Input Node (Politician)
      const politicianId = `pol-${chain.politician.replace(/\s+/g, "-").toLowerCase()}`
      addNode(politicianId, "input", chain.politician, {})

      // 2. Policy Node
      const policyLabel = chain.policy === "None directly linked" ? "간접적 영향" : chain.policy
      const policyId = `policy-${index}-${policyLabel.replace(/\s+/g, "-").toLowerCase()}`

      addNode(policyId, "policy", policyLabel, {
        evidence: chain.evidence,
      })

      // Edge from politician to policy
      addEdge(politicianId, policyId, {
        description: "정책 연관성",
        evidence: chain.evidence,
      })

      // 3. Sector Node
      const sectorId = `sector-${chain.industry_or_sector.replace(/\s+/g, "-").toLowerCase()}`
      const existingSectorNode = nodeMap.get(sectorId)
      let sectorDescription = chain.impact_description

      if (existingSectorNode && existingSectorNode.data.description) {
        // Avoid duplicating if it's the exact same description
        if (!existingSectorNode.data.description.includes(chain.impact_description)) {
          sectorDescription = existingSectorNode.data.description + "\n\n" + chain.impact_description
        } else {
          sectorDescription = existingSectorNode.data.description
        }
      }

      const sectorNode = addNode(sectorId, "sector", chain.industry_or_sector, {
        description: sectorDescription,
      })

      // Update description if we appended to it (since addNode returns existing node)
      sectorNode.data.description = sectorDescription

      // Edge from policy to sector
      addEdge(policyId, sectorId, {
        description: "산업 영향",
        evidence: chain.evidence,
      })

      // 4. Company Nodes
      chain.companies.forEach((company) => {
        const companyId = `comp-${company.replace(/\s+/g, "-").toLowerCase()}`

        // Simulate stock data (placeholder for real stock API)
        // In a real app, we would match with the mockStockData or fetch real data
        // For now, let's try to find it in mockStockData if available, otherwise random

        // This is a bit of a hack since we don't have the full stock data in the API response yet
        // But for the UI demo it helps.

        const isPositive = Math.random() > 0.5
        const changeValue = isPositive ? Math.random() * 5 : -(Math.random() * 5)
        const price = 50000 + Math.random() * 100000

        addNode(companyId, "enterprise", company, {
          stockData: {
            symbol: company.includes("(") ? company.split("(")[1].replace(")", "") : "N/A",
            price: Math.round(price),
            change: Math.round((changeValue * price) / 100),
            changePercent: changeValue,
          },
          evidence: chain.evidence,
        })

        // Edge from sector to company
        addEdge(sectorId, companyId, {
          description: "기업 연관성",
          evidence: chain.evidence,
        })
      })
    })

    console.log("[v0] Transformed graph data:", { nodes, edges })
    return { nodes, edges }
  }

  if (!query) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="text-center space-y-2">
          <AlertCircle className="w-12 h-12 text-muted-foreground mx-auto" />
          <p className="text-muted-foreground">검색어를 입력해주세요</p>
        </div>
      </div>
    )
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[600px]">
        <div className="text-center space-y-4">
          <Spinner className="w-12 h-12 mx-auto" />
          <div className="space-y-2">
            <p className="font-medium">관계도를 분석하고 있습니다...</p>
            <p className="text-sm text-muted-foreground">정책, 산업, 기업 간의 연결고리를 찾는 중입니다</p>
            <p className="text-xs text-muted-foreground/80">심층 분석에는 시간이 소요될 수 있습니다.</p>
          </div>
        </div>
      </div>
    )
  }

  if (error || !apiResponse || !graphData) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="text-center space-y-2">
          <AlertCircle className="w-12 h-12 text-destructive mx-auto" />
          <p className="text-muted-foreground">{error || "분석 결과를 불러올 수 없습니다"}</p>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header Info */}
      <div className="space-y-3">
        <div className="flex flex-wrap items-center gap-3">
          <h2 className="text-2xl md:text-3xl font-bold">{apiResponse.report_title}</h2>
          <Badge variant="secondary" className="text-xs">
            {apiResponse.time_range}
          </Badge>
        </div>
        <p className="text-muted-foreground leading-relaxed">
          <span className="font-medium text-foreground">{query}</span>에 대한 정치·경제 관계도 분석 결과입니다. 노드를
          클릭하면 상세 정보와 근거를 확인할 수 있습니다.
        </p>
      </div>

      {/* Graph Visualization */}
      <Card className="p-4 md:p-6">
        <RelationshipGraph data={graphData} />
      </Card>

      {/* Notes */}
      {apiResponse.notes && (
        <Card className="p-4 bg-muted/50 border-muted">
          <p className="text-sm text-muted-foreground leading-relaxed">
            <span className="font-medium text-foreground">참고사항:</span> {apiResponse.notes}
          </p>
        </Card>
      )}
    </div>
  )
}
