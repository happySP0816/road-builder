"use client"

import { useRef, useEffect, type MouseEvent } from "react"
import { Button } from "@/components/ui/button"
import { ZoomIn, ZoomOut } from "lucide-react"
import { type Road, type Node, type BuildSession, RoadType, type NodePoint } from "@/lib/road-types"

interface RoadCanvasProps {
  nodes: Node[]
  roads: Road[]
  buildSession: BuildSession
  drawingMode: "nodes" | "pan" | "move" | "select-node" | "connect" | "disconnect"
  snapEnabled: boolean
  snapDistance: number
  defaultRoadWidth: number
  showRoadLengths: boolean
  scaleMetersPerPixel: number
  selectedRoadId: string | null
  selectedNodeId: string | null
  selectedNodeData: Node | null
  connectingFromNodeId?: string | null
  panOffset: { x: number; y: number }
  zoom: number
  mousePosition: { x: number; y: number } | null
  isActivelyDrawingCurve?: boolean
  onMouseDown: (e: MouseEvent<HTMLCanvasElement>) => void
  onMouseMove: (e: MouseEvent<HTMLCanvasElement> | globalThis.MouseEvent) => void
  onMouseUp: (e: MouseEvent<HTMLCanvasElement> | globalThis.MouseEvent) => void
  onCompleteBuildSession: () => void
  onCancelBuildSession: () => void
  onZoomIn: () => void
  onZoomOut: () => void
  onResetZoom: () => void
  onAddRoad?: (road: Omit<Road, "id">) => void
}

export default function RoadCanvas({
  nodes,
  roads,
  buildSession,
  drawingMode,
  snapDistance,
  defaultRoadWidth,
  showRoadLengths,
  scaleMetersPerPixel,
  selectedRoadId,
  selectedNodeId,
  selectedNodeData,
  connectingFromNodeId,
  panOffset,
  zoom,
  mousePosition,
  isActivelyDrawingCurve,
  onMouseDown,
  onMouseMove,
  onMouseUp,
  onCompleteBuildSession,
  onCancelBuildSession,
  onZoomIn,
  onZoomOut,
  onResetZoom,
}: RoadCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const handleResize = () => {
      const canvas = canvasRef.current
      if (!canvas || !containerRef.current) return
      canvas.width = containerRef.current.clientWidth
      canvas.height = containerRef.current.clientHeight
    }
    window.addEventListener("resize", handleResize)
    handleResize()
    return () => window.removeEventListener("resize", handleResize)
  }, [])

  const drawEditableControlPoints = (ctx: CanvasRenderingContext2D, selectedNode: Node | null, allRoads: Road[]) => {
    if (!selectedNode) return

    ctx.strokeStyle = "#fb923c"
    ctx.fillStyle = "#fb923c"
    ctx.lineWidth = 1 / zoom

    selectedNode.connectedRoadIds.forEach((roadId) => {
      const road = allRoads.find((r) => r.id === roadId)
      if (!road || road.type !== RoadType.BEZIER || !road.controlPoints) return

      let controlPoint: { x: number; y: number } | undefined

      if (road.startNodeId === selectedNode.id) {
        controlPoint = road.controlPoints[0]
      } else if (road.endNodeId === selectedNode.id) {
        controlPoint = road.controlPoints[1]
      }

      if (controlPoint) {
        ctx.beginPath()
        ctx.moveTo(selectedNode.x, selectedNode.y)
        ctx.lineTo(controlPoint.x, controlPoint.y)
        ctx.stroke()

        ctx.beginPath()
        ctx.arc(controlPoint.x, controlPoint.y, 6 / zoom, 0, Math.PI * 2)
        ctx.fill()
      }
    })
  }

  const drawConnectionPreview = (ctx: CanvasRenderingContext2D) => {
    if (!connectingFromNodeId || !mousePosition) return
    
    const fromNode = nodes.find(n => n.id === connectingFromNodeId)
    if (!fromNode) return
    
    ctx.strokeStyle = "#3b82f6"
    ctx.lineWidth = 2 / zoom
    ctx.setLineDash([5 / zoom, 5 / zoom])
    ctx.beginPath()
    ctx.moveTo(fromNode.x, fromNode.y)
    ctx.lineTo(mousePosition.x, mousePosition.y)
    ctx.stroke()
    ctx.setLineDash([])
  }

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext("2d")
    if (!ctx) return

    ctx.clearRect(0, 0, canvas.width, canvas.height)
    ctx.save()
    ctx.translate(panOffset.x, panOffset.y)
    ctx.scale(zoom, zoom)

    drawGrid(ctx, canvas.width, canvas.height)
    roads.forEach((road) => drawRoad(ctx, road, road.id === selectedRoadId))
    nodes.forEach((node) => drawNode(ctx, node, node.id === selectedNodeId, node.id === connectingFromNodeId))

    if (selectedNodeData) {
      drawEditableControlPoints(ctx, selectedNodeData, roads)
    }

    if (drawingMode === "connect") {
      drawConnectionPreview(ctx)
    }

    if (buildSession.isActive) {
      drawBuildSessionPreview(ctx, buildSession, mousePosition, isActivelyDrawingCurve)
    }

    ctx.restore()
  }, [
    nodes,
    roads,
    buildSession,
    selectedRoadId,
    selectedNodeId,
    selectedNodeData,
    connectingFromNodeId,
    drawingMode,
    panOffset,
    zoom,
    mousePosition,
    showRoadLengths,
    scaleMetersPerPixel,
    snapDistance,
    isActivelyDrawingCurve,
  ])

  const drawGrid = (ctx: CanvasRenderingContext2D, width: number, height: number) => {
    const gridSize = snapDistance
    ctx.strokeStyle = "#f3f4f6"
    ctx.lineWidth = 0.5 / zoom

    const startX = Math.floor(-panOffset.x / zoom / gridSize) * gridSize
    const startY = Math.floor(-panOffset.y / zoom / gridSize) * gridSize
    const endX = startX + width / zoom + gridSize
    const endY = startY + height / zoom + gridSize

    for (let x = startX; x <= endX; x += gridSize) {
      ctx.beginPath()
      ctx.moveTo(x, startY)
      ctx.lineTo(x, endY)
      ctx.stroke()
    }
    for (let y = startY; y <= endY; y += gridSize) {
      ctx.beginPath()
      ctx.moveTo(startX, y)
      ctx.lineTo(endX, y)
      ctx.stroke()
    }
  }

  const drawNode = (ctx: CanvasRenderingContext2D, node: Node | NodePoint, isSelected: boolean, isConnecting?: boolean) => {
    const actualNode = node as Node
    let fillColor = "#6b7280" // Default gray
    
    if (isConnecting) {
      fillColor = "#3b82f6" // Blue for connecting node
    } else if (isSelected) {
      fillColor = "#3b82f6" // Blue for selected
    } else if ((actualNode.connectedRoadIds?.length || 0) > 0) {
      fillColor = "#059669" // Green for connected nodes
    }
    
    ctx.fillStyle = fillColor
    ctx.strokeStyle = "#9ca3af"
    ctx.lineWidth = 2 / zoom
    ctx.beginPath()
    ctx.arc(node.x, node.y, 8 / zoom, 0, Math.PI * 2)
    ctx.fill()
    ctx.stroke()

    if (isSelected || isConnecting) {
      ctx.strokeStyle = isConnecting ? "#3b82f6" : "#3b82f6"
      ctx.lineWidth = 2 / zoom
      ctx.setLineDash([3 / zoom, 3 / zoom])
      ctx.beginPath()
      ctx.arc(node.x, node.y, 15 / zoom, 0, Math.PI * 2)
      ctx.stroke()
      ctx.setLineDash([])
    }
  }

  const drawRoad = (ctx: CanvasRenderingContext2D, road: Road, isSelected: boolean) => {
    ctx.strokeStyle = isSelected ? "#3b82f6" : "#374151"
    ctx.lineWidth = road.width / zoom
    ctx.lineCap = "round"
    ctx.lineJoin = "round"

    if (road.type === RoadType.BEZIER && road.controlPoints) {
      ctx.beginPath()
      ctx.moveTo(road.start.x, road.start.y)
      ctx.bezierCurveTo(
        road.controlPoints[0].x,
        road.controlPoints[0].y,
        road.controlPoints[1].x,
        road.controlPoints[1].y,
        road.end.x,
        road.end.y,
      )
      ctx.stroke()
    } else if (road.type === RoadType.CURVED) {
      const cpX = (road.start.x + road.end.x) / 2 + (road.end.y - road.start.y) * 0.3
      const cpY = (road.start.y + road.end.y) / 2 + (road.start.x - road.end.x) * 0.3
      ctx.beginPath()
      ctx.moveTo(road.start.x, road.start.y)
      ctx.quadraticCurveTo(cpX, cpY, road.end.x, road.end.y)
      ctx.stroke()
    } else {
      ctx.beginPath()
      ctx.moveTo(road.start.x, road.start.y)
      ctx.lineTo(road.end.x, road.end.y)
      ctx.stroke()
    }

    if (showRoadLengths) drawRoadLength(ctx, road)

    if (isSelected) {
      ctx.globalAlpha = 0.4
      ctx.lineWidth = (road.width + 4) / zoom
      if (road.type === RoadType.BEZIER && road.controlPoints) {
        ctx.beginPath()
        ctx.moveTo(road.start.x, road.start.y)
        ctx.bezierCurveTo(
          road.controlPoints[0].x,
          road.controlPoints[0].y,
          road.controlPoints[1].x,
          road.controlPoints[1].y,
          road.end.x,
          road.end.y,
        )
        ctx.stroke()
      } else if (road.type === RoadType.CURVED) {
        const cpX = (road.start.x + road.end.x) / 2 + (road.end.y - road.start.y) * 0.3
        const cpY = (road.start.y + road.end.y) / 2 + (road.start.x - road.end.x) * 0.3
        ctx.beginPath()
        ctx.moveTo(road.start.x, road.start.y)
        ctx.quadraticCurveTo(cpX, cpY, road.end.x, road.end.y)
        ctx.stroke()
      } else {
        ctx.beginPath()
        ctx.moveTo(road.start.x, road.start.y)
        ctx.lineTo(road.end.x, road.end.y)
        ctx.stroke()
      }
      ctx.globalAlpha = 1.0
    }
  }

  const calculateRoadLength = (road: Road): number => {
    if (road.type === RoadType.BEZIER && road.controlPoints) {
      let len = 0
      const steps = 20
      let p0 = road.start
      for (let i = 1; i <= steps; i++) {
        const t = i / steps,
          mt = 1 - t
        const x =
          mt * mt * mt * road.start.x +
          3 * mt * mt * t * road.controlPoints[0].x +
          3 * mt * t * t * road.controlPoints[1].x +
          t * t * t * road.end.x
        const y =
          mt * mt * mt * road.start.y +
          3 * mt * mt * t * road.controlPoints[0].y +
          3 * mt * t * t * road.controlPoints[1].y +
          t * t * t * road.end.y
        const p1 = { x, y }
        len += Math.sqrt(Math.pow(p1.x - p0.x, 2) + Math.pow(p1.y - p0.y, 2))
        p0 = p1
      }
      return len * scaleMetersPerPixel
    }
    const dx = road.end.x - road.start.x
    const dy = road.end.y - road.start.y
    return Math.sqrt(dx * dx + dy * dy) * scaleMetersPerPixel
  }

  const drawRoadLength = (ctx: CanvasRenderingContext2D, road: Road) => {
    const length = calculateRoadLength(road)
    const midX = (road.start.x + road.end.x) / 2
    const midY = (road.start.y + road.end.y) / 2
    ctx.fillStyle = "rgba(0,0,0,0.7)"
    ctx.font = `${10 / zoom}px Arial`
    ctx.textAlign = "center"
    ctx.fillText(`${length.toFixed(1)}m`, midX, midY - 5 / zoom)
  }

  const drawBuildSessionPreview = (
    ctx: CanvasRenderingContext2D,
    session: BuildSession,
    currentMousePos: { x: number; y: number } | null,
    isDraggingCurve?: boolean,
  ) => {
    if (!session.isActive || session.nodes.length === 0) return

    ctx.lineWidth = session.roadWidth / zoom
    ctx.strokeStyle = isDraggingCurve ? "#ef4444" : "#a1a1aa"
    ctx.fillStyle = isDraggingCurve ? "#ef4444" : "#a1a1aa"

    session.nodes.forEach((node) => {
      drawNode(ctx, node, false)
      if (node.cp1 && (node.cp1.x !== node.x || node.cp1.y !== node.y)) {
        ctx.beginPath()
        ctx.arc(node.cp1.x, node.cp1.y, 4 / zoom, 0, Math.PI * 2)
        ctx.fill()
        ctx.beginPath()
        ctx.moveTo(node.x, node.y)
        ctx.lineTo(node.cp1.x, node.cp1.y)
        ctx.setLineDash([2 / zoom, 2 / zoom])
        ctx.stroke()
        ctx.setLineDash([])
      }
      if (node.cp2 && (node.cp2.x !== node.x || node.cp2.y !== node.y)) {
        ctx.beginPath()
        ctx.arc(node.cp2.x, node.cp2.y, 4 / zoom, 0, Math.PI * 2)
        ctx.fill()
        ctx.beginPath()
        ctx.moveTo(node.x, node.y)
        ctx.lineTo(node.cp2.x, node.cp2.y)
        ctx.setLineDash([2 / zoom, 2 / zoom])
        ctx.stroke()
        ctx.setLineDash([])
      }
    })

    for (let i = 0; i < session.nodes.length - 1; i++) {
      const p1 = session.nodes[i]
      const p2 = session.nodes[i + 1]
      ctx.beginPath()
      ctx.moveTo(p1.x, p1.y)

      const segmentIsBezier =
        p1.cp2 && p2.cp1 && (p1.cp2.x !== p1.x || p1.cp2.y !== p1.y || p2.cp1.x !== p2.x || p2.cp1.y !== p2.y)

      if (segmentIsBezier) {
        ctx.bezierCurveTo(p1.cp2!.x, p1.cp2!.y, p2.cp1!.x, p2.cp1!.y, p2.x, p2.y)
      } else {
        ctx.lineTo(p2.x, p2.y)
      }
      ctx.stroke()
    }

    if (currentMousePos) {
      const lastPoint = session.nodes[session.nodes.length - 1]
      ctx.beginPath()
      ctx.moveTo(lastPoint.x, lastPoint.y)

      if (session.roadType === RoadType.BEZIER && lastPoint.cp2 && isDraggingCurve) {
        const tempCp1ForMouse = {
          x: currentMousePos.x - (lastPoint.cp2.x - lastPoint.x),
          y: currentMousePos.y - (lastPoint.cp2.y - lastPoint.y),
        }
        ctx.bezierCurveTo(
          lastPoint.cp2.x,
          lastPoint.cp2.y,
          tempCp1ForMouse.x,
          tempCp1ForMouse.y,
          currentMousePos.x,
          currentMousePos.y,
        )
      } else {
        ctx.lineTo(currentMousePos.x, currentMousePos.y)
      }
      ctx.stroke()
    }
  }

  const getCursorClass = () => {
    if (drawingMode === "pan") return "cursor-grab"
    if (drawingMode === "select-node") return "cursor-pointer"
    if (drawingMode === "nodes") return "cursor-crosshair"
    if (drawingMode === "connect") return "cursor-pointer"
    if (drawingMode === "disconnect") return "cursor-pointer"
    return "cursor-default"
  }

  const getModeDisplayName = () => {
    switch (drawingMode) {
      case "nodes": return "Build"
      case "pan": return "Pan"
      case "move": return "Select Roads"
      case "select-node": return "Select Nodes"
      case "connect": return "Connect"
      case "disconnect": return "Disconnect"
      default: return drawingMode
    }
  }

  return (
    <div ref={containerRef} className="relative flex-1 bg-white">
      <canvas ref={canvasRef} onMouseDown={onMouseDown} className={`w-full h-full ${getCursorClass()}`} />

      <div className="absolute top-4 left-4 bg-white/90 backdrop-blur-sm px-3 py-2 rounded-lg shadow-sm text-sm font-medium border">
        Mode: {getModeDisplayName()}
        {buildSession.isActive && " (Building...)"}
        {connectingFromNodeId && " (Click target node)"}
      </div>

      <div className="absolute top-4 right-4 flex flex-col gap-2">
        <Button variant="outline" size="icon" onClick={onZoomIn}>
          <ZoomIn className="h-4 w-4" />
        </Button>
        <Button variant="outline" size="icon" onClick={onZoomOut}>
          <ZoomOut className="h-4 w-4" />
        </Button>
        <Button variant="outline" size="sm" onClick={onResetZoom} className="text-xs px-2">
          {(zoom * 100).toFixed(0)}%
        </Button>
      </div>
    </div>
  )
}