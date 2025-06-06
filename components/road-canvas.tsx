"use client"

import { useRef, useEffect, type MouseEvent } from "react"
import { Button } from "@/components/ui/button"
import { Check, X, ZoomIn, ZoomOut } from "lucide-react"
import { type Road, type Node, type BuildSession, RoadType, type NodePoint } from "@/lib/road-types"

interface RoadCanvasProps {
  nodes: Node[]
  roads: Road[]
  buildSession: BuildSession
  drawingMode: "nodes" | "pan" | "move" | "select-node"
  snapEnabled: boolean
  snapDistance: number
  defaultRoadWidth: number
  showRoadLengths: boolean
  scaleMetersPerPixel: number
  selectedRoadId: string | null
  selectedNodeId: string | null
  selectedNodeData: Node | null // Pass full selected node data
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

  // New function to draw editable control points for a selected node
  const drawEditableControlPoints = (ctx: CanvasRenderingContext2D, selectedNode: Node | null, allRoads: Road[]) => {
    if (!selectedNode) return

    ctx.strokeStyle = "#fb923c" // Orange for edit handles
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
        // Draw line from node to handle
        ctx.beginPath()
        ctx.moveTo(selectedNode.x, selectedNode.y)
        ctx.lineTo(controlPoint.x, controlPoint.y)
        ctx.stroke()

        // Draw handle
        ctx.beginPath()
        ctx.arc(controlPoint.x, controlPoint.y, 6 / zoom, 0, Math.PI * 2)
        ctx.fill()
      }
    })
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
    nodes.forEach((node) => drawNode(ctx, node, node.id === selectedNodeId))

    // Draw editable handles if a node is selected
    if (selectedNodeData) {
      drawEditableControlPoints(ctx, selectedNodeData, roads)
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
    selectedNodeData, // Add as dependency
    panOffset,
    zoom,
    mousePosition,
    showRoadLengths,
    scaleMetersPerPixel,
    snapDistance,
    isActivelyDrawingCurve,
  ])

  // ... (drawGrid, drawNode, drawRoad, calculateRoadLength, drawRoadLength remain the same)
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

  const drawNode = (ctx: CanvasRenderingContext2D, node: Node | NodePoint, isSelected: boolean) => {
    const actualNode = node as Node
    ctx.fillStyle = isSelected ? "#3b82f6" : (actualNode.connectedRoadIds?.length || 0) > 0 ? "#059669" : "#6b7280"
    ctx.strokeStyle = "#9ca3af"
    ctx.lineWidth = 2 / zoom
    ctx.beginPath()
    ctx.arc(node.x, node.y, 8 / zoom, 0, Math.PI * 2)
    ctx.fill()
    ctx.stroke()

    if (isSelected) {
      ctx.strokeStyle = "#3b82f6"
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
      // Straight
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
    isDraggingCurve?: boolean, // This indicates if the current drag is shaping a curve
  ) => {
    if (!session.isActive || session.nodes.length === 0) return

    ctx.lineWidth = session.roadWidth / zoom
    // Use isDraggingCurve for the preview color, session.roadType for actual curve drawing
    ctx.strokeStyle = isDraggingCurve ? "#ef4444" : "#a1a1aa"
    ctx.fillStyle = isDraggingCurve ? "#ef4444" : "#a1a1aa"

    // Draw existing nodes in the session and their control points if they exist
    session.nodes.forEach((node) => {
      drawNode(ctx, node, false) // Draw the node itself
      // Draw cp1 handle (incoming curve to this node)
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
      // Draw cp2 handle (outgoing curve from this node)
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

    // Draw completed segments within the current build session
    for (let i = 0; i < session.nodes.length - 1; i++) {
      const p1 = session.nodes[i]
      const p2 = session.nodes[i + 1]
      ctx.beginPath()
      ctx.moveTo(p1.x, p1.y)

      // Check if this specific segment should be bezier based on its control points
      // A segment is bezier if p1.cp2 is defined AND p2.cp1 is defined
      // AND they are not the same as their respective node positions (indicating actual curve)
      const segmentIsBezier =
        p1.cp2 && p2.cp1 && (p1.cp2.x !== p1.x || p1.cp2.y !== p1.y || p2.cp1.x !== p2.x || p2.cp1.y !== p2.y)

      if (segmentIsBezier) {
        ctx.bezierCurveTo(p1.cp2!.x, p1.cp2!.y, p2.cp1!.x, p2.cp1!.y, p2.x, p2.y)
      } else {
        ctx.lineTo(p2.x, p2.y)
      }
      ctx.stroke()
    }

    // Draw the preview line/curve to the current mouse position
    if (currentMousePos) {
      const lastPoint = session.nodes[session.nodes.length - 1]
      ctx.beginPath()
      ctx.moveTo(lastPoint.x, lastPoint.y)

      // session.roadType here reflects the type of segment being actively previewed/dragged
      if (session.roadType === RoadType.BEZIER && lastPoint.cp2 && isDraggingCurve) {
        // If actively dragging a curve, use the last point's cp2 and derive a temporary cp1 for the mouse
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
        // If not actively dragging a curve (i.e., session.roadType is STRAIGHT or not dragging), draw a straight line
        ctx.lineTo(currentMousePos.x, currentMousePos.y)
      }
      ctx.stroke()
    }
  }

  const getCursorClass = () => {
    if (drawingMode === "pan") return "cursor-grab"
    if (drawingMode === "select-node") return "cursor-pointer"
    if (drawingMode === "nodes") return "cursor-crosshair"
    return "cursor-default"
  }

  return (
    <div ref={containerRef} className="relative flex-1 bg-white">
      <canvas ref={canvasRef} onMouseDown={onMouseDown} className={`w-full h-full ${getCursorClass()}`} />

      <div className="absolute top-4 left-4 bg-white/90 backdrop-blur-sm px-3 py-2 rounded-lg shadow-sm text-sm font-medium border">
        Mode: {drawingMode.charAt(0).toUpperCase() + drawingMode.slice(1)}
        {buildSession.isActive && " (Building...)"}
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

      {buildSession.isActive && buildSession.nodes.length > 0 && (
        <div className="absolute bottom-4 left-1/2 transform -translate-x-1/2 bg-white/90 backdrop-blur-sm px-4 py-2 rounded-lg shadow-sm border flex gap-2">
          <Button size="sm" onClick={onCompleteBuildSession} className="bg-green-600 hover:bg-green-700">
            <Check size={16} className="mr-1" />
            Finish Path
          </Button>
          <Button size="sm" variant="outline" onClick={onCancelBuildSession}>
            <X size={16} className="mr-1" />
            Cancel
          </Button>
        </div>
      )}
    </div>
  )
}
