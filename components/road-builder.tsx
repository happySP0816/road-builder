"use client"

import { useRef, useState, useEffect, type MouseEvent } from "react"
import { Button } from "@/components/ui/button"
import { Toggle } from "@/components/ui/toggle"
import { Slider } from "@/components/ui/slider"
import { Badge } from "@/components/ui/badge"
import { type Road, RoadType } from "@/lib/road-types"
import {
  SplineIcon as BezierCurve,
  PenLineIcon as StraightLine,
  Trash2,
  Undo2,
  MousePointer2,
  Minus,
  Move,
  Ruler,
  ZoomIn,
  ZoomOut,
  MousePointer,
} from "lucide-react"

export default function RoadBuilder() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [nodes, setNodes] = useState<{ x: number; y: number }[]>([])
  const [roads, setRoads] = useState<Road[]>([])
  const [curvedRoads, setCurvedRoads] = useState(false)
  const [snapEnabled, setSnapEnabled] = useState(false)
  const [snapDistance, setSnapDistance] = useState(20)
  const [defaultRoadWidth, setDefaultRoadWidth] = useState(10)
  const containerRef = useRef<HTMLDivElement>(null)

  // Updated states - added move and circle modes
  const [drawingMode, setDrawingMode] = useState<"nodes" | "lines" | "pan" | "move">("nodes")
  const [isDrawing, setIsDrawing] = useState(false)
  const [currentLine, setCurrentLine] = useState<{
    start: { x: number; y: number }
    end: { x: number; y: number }
  } | null>(null)
  const [showRoadLengths, setShowRoadLengths] = useState(false)
  const [scaleMetersPerPixel, setScaleMetersPerPixel] = useState(0.1)
  const [selectedRoadId, setSelectedRoadId] = useState<string | null>(null)

  // Pan functionality
  const [isPanning, setIsPanning] = useState(false)
  const [panOffset, setPanOffset] = useState({ x: 0, y: 0 })
  const [lastPanPoint, setLastPanPoint] = useState({ x: 0, y: 0 })

  // Zoom functionality
  const [zoom, setZoom] = useState(1)
  const [mousePosition, setMousePosition] = useState<{ x: number; y: number } | null>(null)

  // Road dragging (only in move mode)
  const [isDraggingRoad, setIsDraggingRoad] = useState(false)
  const [draggedRoadId, setDraggedRoadId] = useState<string | null>(null)
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 })

  // Circle drawing
  const [isDrawingCircle, setIsDrawingCircle] = useState(false)
  const [circleCenter, setCircleCenter] = useState<{ x: number; y: number } | null>(null)
  const [circleRadius, setCircleRadius] = useState(0)

  // Draw the canvas
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const ctx = canvas.getContext("2d")
    if (!ctx) return

    // Clear canvas
    ctx.clearRect(0, 0, canvas.width, canvas.height)

    // Apply transformations
    ctx.save()
    ctx.translate(panOffset.x, panOffset.y)
    ctx.scale(zoom, zoom)

    // Draw grid
    drawGrid(ctx, canvas.width, canvas.height)

    // Draw roads
    roads.forEach((road) => {
      const isSelected = road.id === selectedRoadId
      drawRoad(ctx, road, isSelected)
      if (showRoadLengths) {
        drawRoadLength(ctx, road)
      }
    })

    // Draw current line being drawn
    if (currentLine) {
      const tempRoad: Road = {
        ...currentLine,
        type: curvedRoads ? RoadType.CURVED : RoadType.STRAIGHT,
        width: defaultRoadWidth,
        id: "temp",
      }
      drawRoad(ctx, tempRoad, false)
    }

    // Draw circle preview
    if (isDrawingCircle && circleCenter && circleRadius > 0) {
      drawCirclePreview(ctx, circleCenter, circleRadius)
    }

    // Draw nodes and preview line in node mode
    if (drawingMode === "nodes") {
      nodes.forEach((node, index) => {
        drawNode(ctx, node, index)
      })

      // Draw preview road from last node to mouse position
      if (nodes.length > 0 && mousePosition) {
        const lastNode = nodes[nodes.length - 1]

        // Create a temporary road object for preview
        const previewRoad: Road = {
          start: lastNode,
          end: mousePosition,
          type: curvedRoads ? RoadType.CURVED : RoadType.STRAIGHT,
          width: defaultRoadWidth,
          id: "preview",
        }

        // Draw the preview road with reduced opacity
        ctx.globalAlpha = 0.6
        drawRoad(ctx, previewRoad, false)
        ctx.globalAlpha = 1
      }
    }

    ctx.restore()
  }, [
    nodes,
    roads,
    defaultRoadWidth,
    currentLine,
    showRoadLengths,
    drawingMode,
    curvedRoads,
    selectedRoadId,
    panOffset,
    zoom,
    mousePosition,
    isDrawingCircle,
    circleCenter,
    circleRadius,
  ])

  // Handle window resize
  useEffect(() => {
    const handleResize = () => {
      const canvas = canvasRef.current
      if (!canvas || !containerRef.current) return

      const container = containerRef.current
      canvas.width = container.clientWidth
      canvas.height = container.clientHeight
    }

    window.addEventListener("resize", handleResize)
    handleResize()

    return () => {
      window.removeEventListener("resize", handleResize)
    }
  }, [])

  // Handle keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "c" || e.key === "C") {
        setCurvedRoads((prev) => !prev)
      } else if (e.key === "Shift") {
        setSnapEnabled(true)
      } else if (e.key === "Delete" || e.key === "Backspace") {
        removeLastElement()
      } else if (e.key === "Escape") {
        // Finish current drawing and reset
        setNodes([])
        setCurrentLine(null)
        setIsDrawing(false)
        setIsDrawingCircle(false)
        setCircleCenter(null)
        setCircleRadius(0)
        setSelectedRoadId(null)
      } else if (e.key === "+" || e.key === "=") {
        zoomIn()
      } else if (e.key === "-") {
        zoomOut()
      }
    }

    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.key === "Shift") {
        setSnapEnabled(false)
      }
    }

    window.addEventListener("keydown", handleKeyDown)
    window.addEventListener("keyup", handleKeyUp)

    return () => {
      window.removeEventListener("keydown", handleKeyDown)
      window.removeEventListener("keyup", handleKeyUp)
    }
  }, [])

  // Calculate road length in meters
  const calculateRoadLength = (road: Road): number => {
    let pixelLength: number

    if (road.type === RoadType.STRAIGHT) {
      const dx = road.end.x - road.start.x
      const dy = road.end.y - road.start.y
      pixelLength = Math.sqrt(dx * dx + dy * dy)
    } else if (road.type === RoadType.CURVED) {
      // Approximate curved road length
      const controlPointX = (road.start.x + road.end.x) / 2
      const controlPointY = (road.start.y + road.end.y) / 2
      const offsetX = (road.end.y - road.start.y) * 0.5
      const offsetY = (road.start.x - road.end.x) * 0.5
      const cp = { x: controlPointX + offsetX, y: controlPointY + offsetY }

      const d1 = Math.sqrt((cp.x - road.start.x) ** 2 + (cp.y - road.start.y) ** 2)
      const d2 = Math.sqrt((road.end.x - cp.x) ** 2 + (road.end.y - cp.y) ** 2)
      pixelLength = d1 + d2
    } else {
      // Circle road length
      const radius = Math.sqrt((road.end.x - road.start.x) ** 2 + (road.end.y - road.start.y) ** 2)
      pixelLength = 2 * Math.PI * radius
    }

    return pixelLength * scaleMetersPerPixel
  }

  // Draw circle preview
  const drawCirclePreview = (ctx: CanvasRenderingContext2D, center: { x: number; y: number }, radius: number) => {
    ctx.strokeStyle = "#94a3b8"
    ctx.lineWidth = defaultRoadWidth
    ctx.setLineDash([5, 5])
    ctx.beginPath()
    ctx.arc(center.x, center.y, radius, 0, Math.PI * 2)
    ctx.stroke()
    ctx.setLineDash([])
  }

  // Draw road length
  const drawRoadLength = (ctx: CanvasRenderingContext2D, road: Road) => {
    const length = calculateRoadLength(road)
    let midX: number, midY: number

    if (road.type === RoadType.CIRCLE) {
      midX = road.start.x
      midY = road.start.y - Math.sqrt((road.end.x - road.start.x) ** 2 + (road.end.y - road.start.y) ** 2) / 2
    } else {
      midX = (road.start.x + road.end.x) / 2
      midY = (road.start.y + road.end.y) / 2
    }

    // Draw background for text
    ctx.fillStyle = "rgba(255, 255, 255, 0.9)"
    ctx.strokeStyle = "#e5e7eb"
    ctx.lineWidth = 1
    ctx.fillRect(midX - 25, midY - 10, 50, 20)
    ctx.strokeRect(midX - 25, midY - 10, 50, 20)

    // Draw text
    ctx.fillStyle = "#374151"
    ctx.font = "11px Arial"
    ctx.textAlign = "center"
    ctx.textBaseline = "middle"
    ctx.fillText(`${length.toFixed(1)}m`, midX, midY)
  }

  // Convert screen coordinates to world coordinates
  const getWorldCoordinates = (e: MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current
    if (!canvas) return { x: 0, y: 0 }

    const rect = canvas.getBoundingClientRect()
    let x = (e.clientX - rect.left - panOffset.x) / zoom
    let y = (e.clientY - rect.top - panOffset.y) / zoom

    if (snapEnabled) {
      const snapped = getSnappedPosition(x, y)
      x = snapped.x
      y = snapped.y
    }

    return { x, y }
  }

  // Find road at position (only for move mode)
  const findRoadAtPosition = (x: number, y: number): Road | null => {
    if (drawingMode !== "move") return null

    for (const road of roads) {
      const distance = getDistanceToRoad(road, x, y)
      if (distance < road.width / 2 + 5) {
        return road
      }
    }
    return null
  }

  // Get distance from point to road
  const getDistanceToRoad = (road: Road, x: number, y: number) => {
    if (road.type === RoadType.STRAIGHT) {
      // Distance from point to line segment
      const A = x - road.start.x
      const B = y - road.start.y
      const C = road.end.x - road.start.x
      const D = road.end.y - road.start.y

      const dot = A * C + B * D
      const lenSq = C * C + D * D
      let param = -1
      if (lenSq !== 0) param = dot / lenSq

      let xx, yy
      if (param < 0) {
        xx = road.start.x
        yy = road.start.y
      } else if (param > 1) {
        xx = road.end.x
        yy = road.end.y
      } else {
        xx = road.start.x + param * C
        yy = road.start.y + param * D
      }

      const dx = x - xx
      const dy = y - yy
      return Math.sqrt(dx * dx + dy * dy)
    } else if (road.type === RoadType.CIRCLE) {
      // Distance from point to circle
      const centerX = road.start.x
      const centerY = road.start.y
      const radius = Math.sqrt((road.end.x - road.start.x) ** 2 + (road.end.y - road.start.y) ** 2)
      const distanceToCenter = Math.sqrt((x - centerX) ** 2 + (y - centerY) ** 2)
      return Math.abs(distanceToCenter - radius)
    } else {
      // Simplified distance for curved roads
      const midX = (road.start.x + road.end.x) / 2
      const midY = (road.start.y + road.end.y) / 2
      const dx = x - midX
      const dy = y - midY
      return Math.sqrt(dx * dx + dy * dy)
    }
  }

  // Handle mouse down
  const handleMouseDown = (e: MouseEvent<HTMLCanvasElement>) => {
    const coords = getWorldCoordinates(e)

    if (drawingMode === "pan") {
      setIsPanning(true)
      setLastPanPoint({ x: e.clientX, y: e.clientY })
    } else if (drawingMode === "move") {
      // Check if clicking on existing road to drag it
      const clickedRoad = findRoadAtPosition(coords.x, coords.y)
      if (clickedRoad) {
        setIsDraggingRoad(true)
        setDraggedRoadId(clickedRoad.id)
        setSelectedRoadId(clickedRoad.id)
        const roadCenter = {
          x: (clickedRoad.start.x + clickedRoad.end.x) / 2,
          y: (clickedRoad.start.y + clickedRoad.end.y) / 2,
        }
        setDragOffset({
          x: coords.x - roadCenter.x,
          y: coords.y - roadCenter.y,
        })
      }
    } else if (drawingMode === "nodes") {
      // Only add nodes in node mode - no road dragging
      const newNode = coords
      const newNodes = [...nodes, newNode]
      setNodes(newNodes)

      // Create road if we have at least 2 nodes
      if (newNodes.length > 1) {
        const prevNode = newNodes[newNodes.length - 2]
        const newRoad: Road = {
          start: prevNode,
          end: newNode,
          type: curvedRoads ? RoadType.CURVED : RoadType.STRAIGHT,
          width: defaultRoadWidth,
          id: `road-${Date.now()}-${Math.random()}`,
        }
        setRoads([...roads, newRoad])
      }
    } else if (drawingMode === "lines") {
      // Start drawing a line
      setIsDrawing(true)
      setCurrentLine({ start: coords, end: coords })
    } else if (drawingMode === "circle") {
      if (!isDrawingCircle) {
        // Start drawing circle - set center
        setIsDrawingCircle(true)
        setCircleCenter(coords)
        setCircleRadius(0)
      } else {
        // Finish drawing circle
        if (circleCenter && circleRadius > 10) {
          const newRoad: Road = {
            start: circleCenter,
            end: { x: circleCenter.x + circleRadius, y: circleCenter.y },
            type: RoadType.CIRCLE,
            width: defaultRoadWidth,
            id: `road-${Date.now()}-${Math.random()}`,
          }
          setRoads([...roads, newRoad])
        }
        setIsDrawingCircle(false)
        setCircleCenter(null)
        setCircleRadius(0)
      }
    }
  }

  // Handle mouse move
  const handleMouseMove = (e: MouseEvent<HTMLCanvasElement>) => {
    const coords = getWorldCoordinates(e)

    // Update mouse position for preview line
    if (drawingMode === "nodes") {
      setMousePosition(coords)
    }

    // Update circle radius while drawing
    if (isDrawingCircle && circleCenter) {
      const radius = Math.sqrt((coords.x - circleCenter.x) ** 2 + (coords.y - circleCenter.y) ** 2)
      setCircleRadius(radius)
    }

    if (isPanning && drawingMode === "pan") {
      const deltaX = e.clientX - lastPanPoint.x
      const deltaY = e.clientY - lastPanPoint.y
      setPanOffset((prev) => ({
        x: prev.x + deltaX,
        y: prev.y + deltaY,
      }))
      setLastPanPoint({ x: e.clientX, y: e.clientY })
    } else if (isDraggingRoad && draggedRoadId && drawingMode === "move") {
      // Drag the selected road
      const road = roads.find((r) => r.id === draggedRoadId)
      if (road) {
        const newCenterX = coords.x - dragOffset.x
        const newCenterY = coords.y - dragOffset.y
        const currentCenterX = (road.start.x + road.end.x) / 2
        const currentCenterY = (road.start.y + road.end.y) / 2
        const deltaX = newCenterX - currentCenterX
        const deltaY = newCenterY - currentCenterY

        setRoads(
          roads.map((r) =>
            r.id === draggedRoadId
              ? {
                  ...r,
                  start: { x: r.start.x + deltaX, y: r.start.y + deltaY },
                  end: { x: r.end.x + deltaX, y: r.end.y + deltaY },
                }
              : r,
          ),
        )
      }
    } else if (isDrawing && drawingMode === "lines" && currentLine) {
      setCurrentLine({ ...currentLine, end: coords })
    }
  }

  // Handle mouse up
  const handleMouseUp = () => {
    if (isPanning) {
      setIsPanning(false)
    } else if (isDraggingRoad) {
      setIsDraggingRoad(false)
      setDraggedRoadId(null)
    } else if (isDrawing && currentLine && drawingMode === "lines") {
      // Add the completed road
      const newRoad: Road = {
        start: currentLine.start,
        end: currentLine.end,
        type: curvedRoads ? RoadType.CURVED : RoadType.STRAIGHT,
        width: defaultRoadWidth,
        id: `road-${Date.now()}-${Math.random()}`,
      }
      setRoads([...roads, newRoad])
      setCurrentLine(null)
    }
    setIsDrawing(false)
  }

  // Get snapped position
  const getSnappedPosition = (x: number, y: number) => {
    const gridSize = snapDistance
    return {
      x: Math.round(x / gridSize) * gridSize,
      y: Math.round(y / gridSize) * gridSize,
    }
  }

  // Zoom functions
  const zoomIn = () => {
    setZoom((prev) => Math.min(prev * 1.2, 5))
  }

  const zoomOut = () => {
    setZoom((prev) => Math.max(prev / 1.2, 0.1))
  }

  const resetZoom = () => {
    setZoom(1)
  }

  // Draw grid
  const drawGrid = (ctx: CanvasRenderingContext2D, width: number, height: number) => {
    const gridSize = snapDistance
    ctx.strokeStyle = "#f3f4f6"
    ctx.lineWidth = 0.5

    const startX = Math.floor(-panOffset.x / zoom / gridSize) * gridSize
    const startY = Math.floor(-panOffset.y / zoom / gridSize) * gridSize
    const endX = startX + width / zoom + gridSize
    const endY = startY + height / zoom + gridSize

    // Draw vertical lines
    for (let x = startX; x <= endX; x += gridSize) {
      ctx.beginPath()
      ctx.moveTo(x, startY)
      ctx.lineTo(x, endY)
      ctx.stroke()
    }

    // Draw horizontal lines
    for (let y = startY; y <= endY; y += gridSize) {
      ctx.beginPath()
      ctx.moveTo(startX, y)
      ctx.lineTo(endX, y)
      ctx.stroke()
    }
  }

  // Draw node
  const drawNode = (ctx: CanvasRenderingContext2D, node: { x: number; y: number }, index: number) => {
    ctx.fillStyle = index === nodes.length - 1 ? "#3b82f6" : "#6b7280"
    ctx.beginPath()
    ctx.arc(node.x, node.y, 6, 0, Math.PI * 2)
    ctx.fill()

    ctx.fillStyle = "#ffffff"
    ctx.font = "10px Arial"
    ctx.textAlign = "center"
    ctx.textBaseline = "middle"
    ctx.fillText(index.toString(), node.x, node.y)
  }

  // Draw road
  const drawRoad = (ctx: CanvasRenderingContext2D, road: Road, isSelected: boolean) => {
    ctx.strokeStyle = isSelected ? "#3b82f6" : "#374151"
    ctx.lineWidth = road.width
    ctx.lineCap = "round"
    ctx.lineJoin = "round"

    if (road.type === RoadType.STRAIGHT) {
      ctx.beginPath()
      ctx.moveTo(road.start.x, road.start.y)
      ctx.lineTo(road.end.x, road.end.y)
      ctx.stroke()
    } else if (road.type === RoadType.CURVED) {
      const controlPointX = (road.start.x + road.end.x) / 2
      const controlPointY = (road.start.y + road.end.y) / 2
      const offsetX = (road.end.y - road.start.y) * 0.5
      const offsetY = (road.start.x - road.end.x) * 0.5

      ctx.beginPath()
      ctx.moveTo(road.start.x, road.start.y)
      ctx.quadraticCurveTo(controlPointX + offsetX, controlPointY + offsetY, road.end.x, road.end.y)
      ctx.stroke()
    } else if (road.type === RoadType.CIRCLE) {
      const radius = Math.sqrt((road.end.x - road.start.x) ** 2 + (road.end.y - road.start.y) ** 2)
      ctx.beginPath()
      ctx.arc(road.start.x, road.start.y, radius, 0, Math.PI * 2)
      ctx.stroke()
    }

    // Draw selection outline
    if (isSelected) {
      ctx.strokeStyle = "#3b82f6"
      ctx.lineWidth = road.width + 4
      ctx.globalAlpha = 0.3

      if (road.type === RoadType.STRAIGHT) {
        ctx.beginPath()
        ctx.moveTo(road.start.x, road.start.y)
        ctx.lineTo(road.end.x, road.end.y)
        ctx.stroke()
      } else if (road.type === RoadType.CURVED) {
        const controlPointX = (road.start.x + road.end.x) / 2
        const controlPointY = (road.start.y + road.end.y) / 2
        const offsetX = (road.end.y - road.start.y) * 0.5
        const offsetY = (road.start.x - road.end.x) * 0.5

        ctx.beginPath()
        ctx.moveTo(road.start.x, road.start.y)
        ctx.quadraticCurveTo(controlPointX + offsetX, controlPointY + offsetY, road.end.x, road.end.y)
        ctx.stroke()
      } else if (road.type === RoadType.CIRCLE) {
        const radius = Math.sqrt((road.end.x - road.start.x) ** 2 + (road.end.y - road.start.y) ** 2)
        ctx.beginPath()
        ctx.arc(road.start.x, road.start.y, radius, 0, Math.PI * 2)
        ctx.stroke()
      }

      ctx.globalAlpha = 1
    }
  }

  // Clear canvas
  const clearCanvas = () => {
    setNodes([])
    setRoads([])
    setSelectedRoadId(null)
    setPanOffset({ x: 0, y: 0 })
    setZoom(1)
    setIsDrawingCircle(false)
    setCircleCenter(null)
    setCircleRadius(0)
  }

  // Remove last element
  const removeLastElement = () => {
    if (roads.length > 0) {
      const newRoads = [...roads]
      newRoads.pop()
      setRoads(newRoads)
    } else if (nodes.length > 0) {
      const newNodes = [...nodes]
      newNodes.pop()
      setNodes(newNodes)
    }
  }

  // Delete selected road
  const deleteSelectedRoad = () => {
    if (selectedRoadId) {
      setRoads(roads.filter((road) => road.id !== selectedRoadId))
      setSelectedRoadId(null)
    }
  }

  const updateSelectedRoadWidth = (width: number) => {
    if (selectedRoadId) {
      setRoads(roads.map((road) => (road.id === selectedRoadId ? { ...road, width: width } : road)))
    }
  }

  const selectedRoad = roads.find((r) => r.id === selectedRoadId)
  const totalLength = roads.reduce((sum, road) => sum + calculateRoadLength(road), 0)

  return (
    <div className="flex h-screen bg-gray-50">
      {/* Main Canvas Area */}
      <div className="flex-1 flex flex-col">
        {/* Stats Bar */}
        <div className="bg-white border-b px-4 py-2 flex gap-6 text-sm text-gray-600">
          <span>Roads: {roads.length}</span>
          <span>Total Length: {totalLength.toFixed(1)}m</span>
          <span>Nodes: {nodes.length}</span>
          <span>Zoom: {(zoom * 100).toFixed(0)}%</span>
        </div>

        {/* Canvas Container */}
        <div ref={containerRef} className="relative flex-1 bg-white">
          <canvas
            ref={canvasRef}
            onMouseDown={handleMouseDown}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
            className={`w-full h-full ${
              drawingMode === "pan"
                ? "cursor-move"
                : drawingMode === "move" && isDraggingRoad
                  ? "cursor-grabbing"
                  : drawingMode === "move" && findRoadAtPosition(mousePosition?.x || 0, mousePosition?.y || 0)
                    ? "cursor-pointer"
                    : drawingMode === "circle"
                      ? "cursor-crosshair"
                      : "cursor-crosshair"
            }`}
          />

          {/* Mode indicator */}
          <div className="absolute top-4 left-4 bg-white/90 backdrop-blur-sm px-3 py-2 rounded-lg shadow-sm text-sm font-medium border">
            Mode: {drawingMode.charAt(0).toUpperCase() + drawingMode.slice(1)}
            {isDrawingCircle && " (Click to finish circle)"}
          </div>

          {/* Zoom controls */}
          <div className="absolute top-4 right-4 flex flex-col gap-2">
            <Button variant="outline" size="sm" onClick={zoomIn}>
              <ZoomIn size={16} />
            </Button>
            <Button variant="outline" size="sm" onClick={zoomOut}>
              <ZoomOut size={16} />
            </Button>
            <Button variant="outline" size="sm" onClick={resetZoom} className="text-xs">
              {(zoom * 100).toFixed(0)}%
            </Button>
          </div>
        </div>
      </div>

      {/* Right Tool Panel */}
      <div className="w-80 bg-white border-l border-gray-200 flex flex-col overflow-hidden">
        <div className="flex-1 overflow-y-auto p-4 space-y-6">
          {/* Drawing Tools */}
          <div className="space-y-3">
            <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wide">Drawing Tools</h3>
            <div className="grid grid-cols-2 gap-2">
              <Toggle
                pressed={drawingMode === "nodes"}
                onPressedChange={() => setDrawingMode("nodes")}
                aria-label="Node mode"
                className="flex flex-col items-center gap-1 h-16"
              >
                <MousePointer2 size={20} />
                <span className="text-xs">Nodes</span>
              </Toggle>
              <Toggle
                pressed={drawingMode === "lines"}
                onPressedChange={() => setDrawingMode("lines")}
                aria-label="Line mode"
                className="flex flex-col items-center gap-1 h-16"
              >
                <Minus size={20} />
                <span className="text-xs">Lines</span>
              </Toggle>
            </div>
          </div>

          {/* Navigation Tools */}
          <div className="space-y-3">
            <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wide">Navigation Tools</h3>
            <div className="grid grid-cols-2 gap-2">
              <Toggle
                pressed={drawingMode === "move"}
                onPressedChange={() => setDrawingMode("move")}
                aria-label="Select mode"
                className="flex flex-col items-center gap-1 h-16"
              >
                <MousePointer size={20} />
                <span className="text-xs">Select</span>
              </Toggle>
              <Toggle
                pressed={drawingMode === "pan"}
                onPressedChange={() => setDrawingMode("pan")}
                aria-label="Pan mode"
                className="flex flex-col items-center gap-1 h-16"
              >
                <Move size={20} />
                <span className="text-xs">Pan</span>
              </Toggle>
            </div>
          </div>

          {/* Road Settings */}
          <div className="space-y-4">
            <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wide">Road Settings</h3>

            <div className="space-y-3">
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium">Default Width</span>
                  <Badge variant="secondary">{defaultRoadWidth}px</Badge>
                </div>
                <Slider
                  value={[defaultRoadWidth]}
                  min={5}
                  max={30}
                  step={1}
                  onValueChange={(value) => setDefaultRoadWidth(value[0])}
                />
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium">Scale</span>
                  <Badge variant="secondary">{scaleMetersPerPixel} m/px</Badge>
                </div>
                <Slider
                  value={[scaleMetersPerPixel]}
                  min={0.01}
                  max={1}
                  step={0.01}
                  onValueChange={(value) => setScaleMetersPerPixel(value[0])}
                />
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium">Snap Distance</span>
                  <Badge variant="secondary">{snapDistance}px</Badge>
                </div>
                <Slider
                  value={[snapDistance]}
                  min={10}
                  max={50}
                  step={5}
                  onValueChange={(value) => setSnapDistance(value[0])}
                />
              </div>
            </div>
          </div>

          {/* Options */}
          <div className="space-y-3">
            <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wide">Options</h3>
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-sm">Curved Roads</span>
                <Toggle pressed={curvedRoads} onPressedChange={setCurvedRoads}>
                  {curvedRoads ? <BezierCurve size={16} /> : <StraightLine size={16} />}
                </Toggle>
              </div>

              <div className="flex items-center justify-between">
                <span className="text-sm">Grid Snapping</span>
                <Toggle pressed={snapEnabled} onPressedChange={setSnapEnabled}>
                  <span className="text-xs">Snap</span>
                </Toggle>
              </div>

              <div className="flex items-center justify-between">
                <span className="text-sm">Show Lengths</span>
                <Toggle pressed={showRoadLengths} onPressedChange={setShowRoadLengths}>
                  <Ruler size={16} />
                </Toggle>
              </div>
            </div>
          </div>

          {/* Selected Road Settings */}
          {selectedRoad && (
            <div className="space-y-3">
              <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wide">Selected Road</h3>
              <div className="space-y-3">
                <div className="grid grid-cols-1 gap-2 text-xs">
                  <div className="bg-gray-50 p-2 rounded">
                    <div className="text-gray-500">Length</div>
                    <div className="font-medium">{calculateRoadLength(selectedRoad).toFixed(1)}m</div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Actions */}
          <div className="space-y-3">
            <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wide">Actions</h3>
            <div className="space-y-2">
              <Button variant="outline" size="sm" className="w-full justify-start" onClick={removeLastElement}>
                <Undo2 size={16} className="mr-2" /> Undo Last
              </Button>
              <Button variant="outline" size="sm" className="w-full justify-start" onClick={clearCanvas}>
                <Trash2 size={16} className="mr-2" /> Clear All
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
