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
  Maximize2,
  Minimize2,
  Trash2,
  Undo2,
  MousePointer2,
  Minus,
  Hand,
  Move,
  Ruler,
  Settings,
  Play,
  Pause,
} from "lucide-react"

export default function RoadBuilder() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [nodes, setNodes] = useState<{ x: number; y: number }[]>([])
  const [roads, setRoads] = useState<Road[]>([])
  const [curvedRoads, setCurvedRoads] = useState(false)
  const [snapEnabled, setSnapEnabled] = useState(false)
  const [snapDistance, setSnapDistance] = useState(20)
  const [defaultRoadWidth, setDefaultRoadWidth] = useState(10)
  const [fullscreen, setFullscreen] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)

  // New states
  const [drawingMode, setDrawingMode] = useState<"nodes" | "lines" | "pan" | "marker">("nodes")
  const [isDrawing, setIsDrawing] = useState(false)
  const [currentLine, setCurrentLine] = useState<{
    start: { x: number; y: number }
    end: { x: number; y: number }
  } | null>(null)
  const [showRoadLengths, setShowRoadLengths] = useState(true)
  const [scaleMetersPerPixel, setScaleMetersPerPixel] = useState(0.1) // 1 pixel = 0.1 meters
  const [selectedRoadId, setSelectedRoadId] = useState<string | null>(null)

  // Pan functionality
  const [isPanning, setIsPanning] = useState(false)
  const [panOffset, setPanOffset] = useState({ x: 0, y: 0 })
  const [lastPanPoint, setLastPanPoint] = useState({ x: 0, y: 0 })

  // Marker functionality
  const [markerPosition, setMarkerPosition] = useState<{
    x: number
    y: number
    roadId: string
    progress: number
  } | null>(null)
  const [markerMoving, setMarkerMoving] = useState(false)
  const markerAnimationRef = useRef<number>()

  // Draw the canvas
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const ctx = canvas.getContext("2d")
    if (!ctx) return

    // Clear canvas
    ctx.clearRect(0, 0, canvas.width, canvas.height)

    // Apply pan offset
    ctx.save()
    ctx.translate(panOffset.x, panOffset.y)

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

    // Draw nodes (only in node mode)
    if (drawingMode === "nodes") {
      nodes.forEach((node, index) => {
        drawNode(ctx, node, index)
      })
    }

    // Draw marker
    if (markerPosition) {
      drawMarker(ctx, markerPosition)
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
    markerPosition,
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

  // Marker animation
  useEffect(() => {
    if (markerMoving && markerPosition) {
      const animate = () => {
        setMarkerPosition((prev) => {
          if (!prev) return null

          const road = roads.find((r) => r.id === prev.roadId)
          if (!road) return null

          let newProgress = prev.progress + 0.005
          if (newProgress >= 1) {
            // Find next connected road or loop back
            newProgress = 0
          }

          const newPos = getPositionOnRoad(road, newProgress)
          return {
            ...prev,
            ...newPos,
            progress: newProgress,
          }
        })

        markerAnimationRef.current = requestAnimationFrame(animate)
      }

      markerAnimationRef.current = requestAnimationFrame(animate)
    } else {
      if (markerAnimationRef.current) {
        cancelAnimationFrame(markerAnimationRef.current)
      }
    }

    return () => {
      if (markerAnimationRef.current) {
        cancelAnimationFrame(markerAnimationRef.current)
      }
    }
  }, [markerMoving, markerPosition, roads])

  // Get position on road at given progress (0-1)
  const getPositionOnRoad = (road: Road, progress: number) => {
    if (road.type === RoadType.STRAIGHT) {
      return {
        x: road.start.x + (road.end.x - road.start.x) * progress,
        y: road.start.y + (road.end.y - road.start.y) * progress,
      }
    } else {
      // Quadratic bezier curve
      const controlPointX = (road.start.x + road.end.x) / 2
      const controlPointY = (road.start.y + road.end.y) / 2
      const offsetX = (road.end.y - road.start.y) * 0.5
      const offsetY = (road.start.x - road.end.x) * 0.5
      const cp = { x: controlPointX + offsetX, y: controlPointY + offsetY }

      const t = progress
      const x = (1 - t) * (1 - t) * road.start.x + 2 * (1 - t) * t * cp.x + t * t * road.end.x
      const y = (1 - t) * (1 - t) * road.start.y + 2 * (1 - t) * t * cp.y + t * t * road.end.y

      return { x, y }
    }
  }

  // Calculate road length in meters
  const calculateRoadLength = (road: Road): number => {
    let pixelLength: number

    if (road.type === RoadType.STRAIGHT) {
      const dx = road.end.x - road.start.x
      const dy = road.end.y - road.start.y
      pixelLength = Math.sqrt(dx * dx + dy * dy)
    } else {
      // Approximate curved road length
      const controlPointX = (road.start.x + road.end.x) / 2
      const controlPointY = (road.start.y + road.end.y) / 2
      const offsetX = (road.end.y - road.start.y) * 0.5
      const offsetY = (road.start.x - road.end.x) * 0.5
      const cp = { x: controlPointX + offsetX, y: controlPointY + offsetY }

      const d1 = Math.sqrt((cp.x - road.start.x) ** 2 + (cp.y - road.start.y) ** 2)
      const d2 = Math.sqrt((road.end.x - cp.x) ** 2 + (road.end.y - cp.y) ** 2)
      pixelLength = d1 + d2
    }

    return pixelLength * scaleMetersPerPixel
  }

  // Draw marker
  const drawMarker = (ctx: CanvasRenderingContext2D, marker: { x: number; y: number }) => {
    ctx.fillStyle = "#ef4444"
    ctx.strokeStyle = "#ffffff"
    ctx.lineWidth = 2

    // Draw hand cursor shape
    ctx.beginPath()
    ctx.arc(marker.x, marker.y, 8, 0, Math.PI * 2)
    ctx.fill()
    ctx.stroke()

    // Draw direction indicator
    ctx.fillStyle = "#ffffff"
    ctx.beginPath()
    ctx.arc(marker.x, marker.y, 3, 0, Math.PI * 2)
    ctx.fill()
  }

  // Draw road length
  const drawRoadLength = (ctx: CanvasRenderingContext2D, road: Road) => {
    const length = calculateRoadLength(road)
    const midX = (road.start.x + road.end.x) / 2
    const midY = (road.start.y + road.end.y) / 2

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

  // Convert screen coordinates to canvas coordinates
  const getCanvasCoordinates = (e: MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current
    if (!canvas) return { x: 0, y: 0 }

    const rect = canvas.getBoundingClientRect()
    let x = e.clientX - rect.left
    let y = e.clientY - rect.top

    // Apply inverse pan offset to get world coordinates
    x = x - panOffset.x
    y = y - panOffset.y

    if (snapEnabled) {
      const snapped = getSnappedPosition(x, y)
      x = snapped.x
      y = snapped.y
    }

    return { x, y }
  }

  // Handle mouse down
  const handleMouseDown = (e: MouseEvent<HTMLCanvasElement>) => {
    const coords = getCanvasCoordinates(e)

    if (drawingMode === "pan") {
      setIsPanning(true)
      setLastPanPoint({ x: e.clientX, y: e.clientY })
    } else if (drawingMode === "marker") {
      // Place marker on nearest road
      const nearestRoad = findNearestRoad(coords.x, coords.y)
      if (nearestRoad) {
        const progress = getProgressOnRoad(nearestRoad.road, coords.x, coords.y)
        const position = getPositionOnRoad(nearestRoad.road, progress)
        setMarkerPosition({
          ...position,
          roadId: nearestRoad.road.id,
          progress,
        })
      }
    } else if (drawingMode === "nodes") {
      // Add new node
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
    }
  }

  // Find nearest road to point
  const findNearestRoad = (x: number, y: number) => {
    let nearestRoad = null
    let minDistance = Number.POSITIVE_INFINITY

    roads.forEach((road) => {
      const distance = getDistanceToRoad(road, x, y)
      if (distance < minDistance) {
        minDistance = distance
        nearestRoad = { road, distance }
      }
    })

    return nearestRoad && nearestRoad.distance < 20 ? nearestRoad : null
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
    } else {
      // Simplified distance for curved roads
      const midX = (road.start.x + road.end.x) / 2
      const midY = (road.start.y + road.end.y) / 2
      const dx = x - midX
      const dy = y - midY
      return Math.sqrt(dx * dx + dy * dy)
    }
  }

  // Get progress along road (0-1) for given point
  const getProgressOnRoad = (road: Road, x: number, y: number) => {
    if (road.type === RoadType.STRAIGHT) {
      const totalLength = Math.sqrt((road.end.x - road.start.x) ** 2 + (road.end.y - road.start.y) ** 2)
      const currentLength = Math.sqrt((x - road.start.x) ** 2 + (y - road.start.y) ** 2)
      return Math.min(1, Math.max(0, currentLength / totalLength))
    } else {
      // Simplified for curved roads
      return 0.5
    }
  }

  // Handle mouse move
  const handleMouseMove = (e: MouseEvent<HTMLCanvasElement>) => {
    if (isPanning && drawingMode === "pan") {
      const deltaX = e.clientX - lastPanPoint.x
      const deltaY = e.clientY - lastPanPoint.y
      setPanOffset((prev) => ({
        x: prev.x + deltaX,
        y: prev.y + deltaY,
      }))
      setLastPanPoint({ x: e.clientX, y: e.clientY })
    } else if (isDrawing && drawingMode === "lines" && currentLine) {
      const coords = getCanvasCoordinates(e)
      setCurrentLine({ ...currentLine, end: coords })
    }
  }

  // Handle mouse up
  const handleMouseUp = () => {
    if (isPanning) {
      setIsPanning(false)
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

  // Draw grid
  const drawGrid = (ctx: CanvasRenderingContext2D, width: number, height: number) => {
    const gridSize = snapDistance
    ctx.strokeStyle = "#f3f4f6"
    ctx.lineWidth = 0.5

    const startX = Math.floor(-panOffset.x / gridSize) * gridSize
    const startY = Math.floor(-panOffset.y / gridSize) * gridSize

    // Draw vertical lines
    for (let x = startX; x <= width - panOffset.x; x += gridSize) {
      ctx.beginPath()
      ctx.moveTo(x, -panOffset.y)
      ctx.lineTo(x, height - panOffset.y)
      ctx.stroke()
    }

    // Draw horizontal lines
    for (let y = startY; y <= height - panOffset.y; y += gridSize) {
      ctx.beginPath()
      ctx.moveTo(-panOffset.x, y)
      ctx.lineTo(width - panOffset.x, y)
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
    } else {
      const controlPointX = (road.start.x + road.end.x) / 2
      const controlPointY = (road.start.y + road.end.y) / 2
      const offsetX = (road.end.y - road.start.y) * 0.5
      const offsetY = (road.start.x - road.end.x) * 0.5

      ctx.beginPath()
      ctx.moveTo(road.start.x, road.start.y)
      ctx.quadraticCurveTo(controlPointX + offsetX, controlPointY + offsetY, road.end.x, road.end.y)
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
      } else {
        const controlPointX = (road.start.x + road.end.x) / 2
        const controlPointY = (road.start.y + road.end.y) / 2
        const offsetX = (road.end.y - road.start.y) * 0.5
        const offsetY = (road.start.x - road.end.x) * 0.5

        ctx.beginPath()
        ctx.moveTo(road.start.x, road.start.y)
        ctx.quadraticCurveTo(controlPointX + offsetX, controlPointY + offsetY, road.end.x, road.end.y)
        ctx.stroke()
      }

      ctx.globalAlpha = 1
    }
  }

  // Clear canvas
  const clearCanvas = () => {
    setNodes([])
    setRoads([])
    setMarkerPosition(null)
    setPanOffset({ x: 0, y: 0 })
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

  // Toggle fullscreen
  const toggleFullscreen = () => {
    setFullscreen(!fullscreen)
  }

  // Update selected road width
  const updateSelectedRoadWidth = (width: number) => {
    if (selectedRoadId) {
      setRoads(roads.map((road) => (road.id === selectedRoadId ? { ...road, width } : road)))
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
        </div>

        {/* Canvas Container */}
        <div ref={containerRef} className={`relative flex-1 bg-white ${fullscreen ? "fixed inset-0 z-50" : ""}`}>
          <canvas
            ref={canvasRef}
            onMouseDown={handleMouseDown}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
            className={`w-full h-full ${
              drawingMode === "pan" ? "cursor-move" : drawingMode === "marker" ? "cursor-pointer" : "cursor-crosshair"
            }`}
          />

          {/* Mode indicator */}
          <div className="absolute top-4 left-4 bg-white/90 backdrop-blur-sm px-3 py-2 rounded-lg shadow-sm text-sm font-medium border">
            Mode: {drawingMode.charAt(0).toUpperCase() + drawingMode.slice(1)}
          </div>

          {fullscreen && (
            <Button variant="outline" size="sm" className="absolute top-4 right-4" onClick={toggleFullscreen}>
              <Minimize2 size={16} />
            </Button>
          )}
        </div>
      </div>

      {/* Right Tool Panel */}
      <div className="w-80 bg-white border-l border-gray-200 flex flex-col overflow-hidden">
        <div className="p-4 border-b bg-gray-50">
          <h2 className="text-lg font-semibold flex items-center gap-2">
            <Settings size={20} />
            Road Builder Tools
          </h2>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-6">
          {/* Drawing Modes */}
          <div className="space-y-3">
            <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wide">Drawing Mode</h3>
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
              <Toggle
                pressed={drawingMode === "pan"}
                onPressedChange={() => setDrawingMode("pan")}
                aria-label="Pan mode"
                className="flex flex-col items-center gap-1 h-16"
              >
                <Move size={20} />
                <span className="text-xs">Pan</span>
              </Toggle>
              <Toggle
                pressed={drawingMode === "marker"}
                onPressedChange={() => setDrawingMode("marker")}
                aria-label="Marker mode"
                className="flex flex-col items-center gap-1 h-16"
              >
                <Hand size={20} />
                <span className="text-xs">Marker</span>
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

          {/* Marker Controls */}
          {markerPosition && (
            <div className="space-y-3">
              <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wide">Marker Control</h3>
              <Button
                className="w-full"
                variant={markerMoving ? "default" : "outline"}
                onClick={() => setMarkerMoving(!markerMoving)}
              >
                {markerMoving ? <Pause size={16} className="mr-2" /> : <Play size={16} className="mr-2" />}
                {markerMoving ? "Pause" : "Start"} Movement
              </Button>
            </div>
          )}

          {/* Selected Road Settings */}
          {selectedRoad && (
            <div className="space-y-3">
              <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wide">Selected Road</h3>
              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div className="bg-gray-50 p-2 rounded">
                    <div className="text-gray-500">Length</div>
                    <div className="font-medium">{calculateRoadLength(selectedRoad).toFixed(1)}m</div>
                  </div>
                  <div className="bg-gray-50 p-2 rounded">
                    <div className="text-gray-500">Type</div>
                    <div className="font-medium">{selectedRoad.type === RoadType.CURVED ? "Curved" : "Straight"}</div>
                  </div>
                </div>
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium">Width</span>
                    <Badge variant="secondary">{selectedRoad.width}px</Badge>
                  </div>
                  <Slider
                    value={[selectedRoad.width]}
                    min={5}
                    max={30}
                    step={1}
                    onValueChange={(value) => updateSelectedRoadWidth(value[0])}
                  />
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
              <Button variant="outline" size="sm" className="w-full justify-start" onClick={toggleFullscreen}>
                {fullscreen ? <Minimize2 size={16} className="mr-2" /> : <Maximize2 size={16} className="mr-2" />}
                {fullscreen ? "Exit Fullscreen" : "Fullscreen"}
              </Button>
            </div>
          </div>

          {/* Instructions */}
          <div className="space-y-3">
            <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wide">Instructions</h3>
            <div className="text-xs text-gray-600 space-y-2 bg-gray-50 p-3 rounded">
              <p>
                <strong>Nodes:</strong> Click to place connected nodes
              </p>
              <p>
                <strong>Lines:</strong> Click and drag to draw roads
              </p>
              <p>
                <strong>Pan:</strong> Click and drag to move map
              </p>
              <p>
                <strong>Marker:</strong> Click roads to place marker
              </p>
              <p>
                <strong>Tips:</strong> Hold Shift for snapping, 'C' for curves
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
