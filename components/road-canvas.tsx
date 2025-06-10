import { useRef, useEffect, type MouseEvent, useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { ZoomIn, ZoomOut } from "lucide-react"
import { type Road, type Node, type BuildSession, RoadType, type NodePoint, type Polygon, type PolygonSession, type BackgroundImage } from "@/lib/road-types"

interface RoadCanvasProps {
  nodes: Node[]
  roads: Road[]
  polygons: Polygon[]
  backgroundImages: BackgroundImage[]
  showBackgroundLayer: boolean
  selectedBackgroundImageId: string | null
  buildSession: BuildSession
  polygonSession: PolygonSession
  drawingMode: "nodes" | "pan" | "select" | "connect" | "disconnect" | "add-node" | "polygon" | "background-image"
  snapEnabled: boolean
  snapDistance: number
  defaultRoadWidth: number
  showRoadLengths: boolean
  showRoadNames: boolean
  showPolygons: boolean
  scaleMetersPerPixel: number
  selectedRoadId: string | null
  selectedNodeId: string | null
  selectedPolygonId: string | null
  selectedNodeData: Node | null
  connectingFromNodeId?: string | null
  selectedRoadForDisconnect?: string | null
  panOffset: { x: number; y: number }
  zoom: number
  mousePosition: { x: number; y: number } | null
  isActivelyDrawingCurve?: boolean
  onMouseDown: (e: MouseEvent<HTMLCanvasElement>) => void
  onMouseMove: (e: MouseEvent<HTMLCanvasElement> | globalThis.MouseEvent) => void
  onMouseUp: (e: MouseEvent<HTMLCanvasElement> | globalThis.MouseEvent) => void
  onCompleteBuildSession: () => void
  onCancelBuildSession: () => void
  onCompletePolygonSession: () => void
  onCancelPolygonSession: () => void
  onZoomIn: () => void
  onZoomOut: () => void
  onResetZoom: () => void
  onAddRoad?: (road: Omit<Road, "id">) => void
  onUpdateRoadName?: (roadId: string, newName: string) => void
  onUpdatePolygonName?: (polygonId: string, newName: string) => void
}

export default function RoadCanvas({
  nodes,
  roads,
  polygons,
  backgroundImages,
  showBackgroundLayer,
  selectedBackgroundImageId,
  buildSession,
  polygonSession,
  drawingMode,
  snapDistance,
  defaultRoadWidth,
  showRoadLengths,
  showRoadNames,
  showPolygons,
  scaleMetersPerPixel,
  selectedRoadId,
  selectedNodeId,
  selectedPolygonId,
  selectedNodeData,
  connectingFromNodeId,
  selectedRoadForDisconnect,
  panOffset,
  zoom,
  mousePosition,
  isActivelyDrawingCurve,
  onMouseDown,
  onMouseMove,
  onMouseUp,
  onCompleteBuildSession,
  onCancelBuildSession,
  onCompletePolygonSession,
  onCancelPolygonSession,
  onZoomIn,
  onZoomOut,
  onResetZoom,
  onUpdateRoadName,
  onUpdatePolygonName,
}: RoadCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const [editingRoadName, setEditingRoadName] = useState<string | null>(null)
  const [tempRoadName, setTempRoadName] = useState("")
  const [editingPolygonName, setEditingPolygonName] = useState<string | null>(null)
  const [tempPolygonName, setTempPolygonName] = useState("")

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

  // Calculate road name position for inline editing
  const getRoadNamePosition = (road: Road) => {
    if (road.type === RoadType.STRAIGHT) {
      const midX = (road.start.x + road.end.x) / 2
      const midY = (road.start.y + road.end.y) / 2
      return {
        x: midX * zoom + panOffset.x,
        y: midY * zoom + panOffset.y - (road.width / 2 + 30)
      }
    } else if (road.type === RoadType.BEZIER && road.controlPoints) {
      const t = 0.5
      const mt = 1 - t
      
      const x = mt * mt * mt * road.start.x +
                3 * mt * mt * t * road.controlPoints[0].x +
                3 * mt * t * t * road.controlPoints[1].x +
                t * t * t * road.end.x
      const y = mt * mt * mt * road.start.y +
                3 * mt * mt * t * road.controlPoints[0].y +
                3 * mt * t * t * road.controlPoints[1].y +
                t * t * t * road.end.y
      
      return {
        x: x * zoom + panOffset.x,
        y: y * zoom + panOffset.y - (road.width / 2 + 30)
      }
    }
    return { x: 0, y: 0 }
  }

  // Calculate polygon name position for inline editing (at centroid)
  const getPolygonNamePosition = (polygon: Polygon) => {
    let centroidX = 0
    let centroidY = 0
    for (const point of polygon.points) {
      centroidX += point.x
      centroidY += point.y
    }
    centroidX /= polygon.points.length
    centroidY /= polygon.points.length

    return {
      x: centroidX * zoom + panOffset.x,
      y: centroidY * zoom + panOffset.y
    }
  }

  const handleRoadNameClick = (roadId: string, currentName: string) => {
    setEditingRoadName(roadId)
    setTempRoadName(currentName || "")
  }

  const handleRoadNameSubmit = (roadId: string) => {
    if (onUpdateRoadName) {
      onUpdateRoadName(roadId, tempRoadName)
    }
    setEditingRoadName(null)
    setTempRoadName("")
  }

  const handleRoadNameCancel = () => {
    setEditingRoadName(null)
    setTempRoadName("")
  }

  const handlePolygonNameClick = (polygonId: string, currentName: string) => {
    setEditingPolygonName(polygonId)
    setTempPolygonName(currentName || "")
  }

  const handlePolygonNameSubmit = (polygonId: string) => {
    if (onUpdatePolygonName) {
      onUpdatePolygonName(polygonId, tempPolygonName)
    }
    setEditingPolygonName(null)
    setTempPolygonName("")
  }

  const handlePolygonNameCancel = () => {
    setEditingPolygonName(null)
    setTempPolygonName("")
  }

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

  // Draw background images
  const drawBackgroundImages = (ctx: CanvasRenderingContext2D) => {
    if (!showBackgroundLayer) return

    backgroundImages
      .filter(img => img.visible)
      .forEach((image) => {
        const img = new Image()
        img.onload = () => {
          ctx.save()
          
          // Apply transformations
          ctx.globalAlpha = image.opacity
          
          // Translate to image center for rotation
          const centerX = image.x + image.width / 2
          const centerY = image.y + image.height / 2
          ctx.translate(centerX, centerY)
          ctx.rotate((image.rotation * Math.PI) / 180)
          
          // Draw image centered at origin
          ctx.drawImage(img, -image.width / 2, -image.height / 2, image.width, image.height)
          
          // Draw selection outline if selected
          if (selectedBackgroundImageId === image.id) {
            ctx.strokeStyle = "#3b82f6"
            ctx.lineWidth = 2 / zoom
            ctx.setLineDash([5 / zoom, 5 / zoom])
            ctx.strokeRect(-image.width / 2, -image.height / 2, image.width, image.height)
            ctx.setLineDash([])
            
            // Draw resize handles
            const handleSize = 8 / zoom
            ctx.fillStyle = "#3b82f6"
            ctx.fillRect(-image.width / 2 - handleSize / 2, -image.height / 2 - handleSize / 2, handleSize, handleSize)
            ctx.fillRect(image.width / 2 - handleSize / 2, -image.height / 2 - handleSize / 2, handleSize, handleSize)
            ctx.fillRect(-image.width / 2 - handleSize / 2, image.height / 2 - handleSize / 2, handleSize, handleSize)
            ctx.fillRect(image.width / 2 - handleSize / 2, image.height / 2 - handleSize / 2, handleSize, handleSize)
          }
          
          ctx.restore()
        }
        img.src = image.url
      })
  }

  // Helper function to calculate road length
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

  // Helper function to draw text along a path
  const drawTextAlongPath = (ctx: CanvasRenderingContext2D, text: string, road: Road) => {
    if (!text || text.trim() === "") return

    const fontSize = Math.max(16 / zoom, 12)
    ctx.font = `bold ${fontSize}px Arial`
    ctx.fillStyle = "#1f2937"
    ctx.strokeStyle = "#ffffff"
    ctx.lineWidth = 3 / zoom
    ctx.textAlign = "center"
    ctx.textBaseline = "middle"

    if (road.type === RoadType.STRAIGHT) {
      // For straight roads, draw text at the midpoint
      const midX = (road.start.x + road.end.x) / 2
      const midY = (road.start.y + road.end.y) / 2
      
      // Calculate angle for text rotation
      const angle = Math.atan2(road.end.y - road.start.y, road.end.x - road.start.x)
      
      ctx.save()
      ctx.translate(midX, midY)
      ctx.rotate(angle)
      
      // Ensure text is always readable (not upside down)
      if (Math.abs(angle) > Math.PI / 2) {
        ctx.rotate(Math.PI)
      }
      
      // Draw text with white outline for better visibility
      ctx.strokeText(text, 0, -road.width / 2 - 5 / zoom)
      ctx.fillText(text, 0, -road.width / 2 - 5 / zoom)
      ctx.restore()
    } else if (road.type === RoadType.BEZIER && road.controlPoints) {
      // For bezier roads, draw text along the curve at t=0.5
      const t = 0.5
      const mt = 1 - t
      
      // Calculate position at t=0.5
      const x = mt * mt * mt * road.start.x +
                3 * mt * mt * t * road.controlPoints[0].x +
                3 * mt * t * t * road.controlPoints[1].x +
                t * t * t * road.end.x
      const y = mt * mt * mt * road.start.y +
                3 * mt * mt * t * road.controlPoints[0].y +
                3 * mt * t * t * road.controlPoints[1].y +
                t * t * t * road.end.y
      
      // Calculate tangent for rotation
      const dx = 3 * mt * mt * (road.controlPoints[0].x - road.start.x) +
                 6 * mt * t * (road.controlPoints[1].x - road.controlPoints[0].x) +
                 3 * t * t * (road.end.x - road.controlPoints[1].x)
      const dy = 3 * mt * mt * (road.controlPoints[0].y - road.start.y) +
                 6 * mt * t * (road.controlPoints[1].y - road.controlPoints[0].y) +
                 3 * t * t * (road.end.y - road.controlPoints[1].y)
      
      const angle = Math.atan2(dy, dx)
      
      ctx.save()
      ctx.translate(x, y)
      ctx.rotate(angle)
      
      // Ensure text is always readable (not upside down)
      if (Math.abs(angle) > Math.PI / 2) {
        ctx.rotate(Math.PI)
      }
      
      // Draw text with white outline for better visibility
      ctx.strokeText(text, 0, -road.width / 2 - 5 / zoom)
      ctx.fillText(text, 0, -road.width / 2 - 5 / zoom)
      ctx.restore()
    }
  }

  const drawPolygon = (ctx: CanvasRenderingContext2D, polygon: Polygon, isSelected: boolean) => {
    if (polygon.points.length < 3) return

    // Set fill style with opacity
    const fillColor = polygon.fillColor
    const strokeColor = polygon.strokeColor
    
    // Convert hex to rgba for opacity
    const hexToRgba = (hex: string, alpha: number) => {
      const r = parseInt(hex.slice(1, 3), 16)
      const g = parseInt(hex.slice(3, 5), 16)
      const b = parseInt(hex.slice(5, 7), 16)
      return `rgba(${r}, ${g}, ${b}, ${alpha})`
    }

    ctx.fillStyle = hexToRgba(fillColor, polygon.opacity)
    ctx.strokeStyle = isSelected ? "#3b82f6" : strokeColor
    ctx.lineWidth = isSelected ? 3 / zoom : 2 / zoom

    // Draw polygon
    ctx.beginPath()
    ctx.moveTo(polygon.points[0].x, polygon.points[0].y)
    for (let i = 1; i < polygon.points.length; i++) {
      ctx.lineTo(polygon.points[i].x, polygon.points[i].y)
    }
    ctx.closePath()
    ctx.fill()
    ctx.stroke()

    // Draw polygon name if it has one - always show polygon names regardless of showRoadNames setting
    // Note: We'll handle inline editing separately, so we only draw the name when not editing
    if (polygon.name && polygon.name.trim() !== "" && editingPolygonName !== polygon.id) {
      // Calculate centroid for text placement
      let centroidX = 0
      let centroidY = 0
      for (const point of polygon.points) {
        centroidX += point.x
        centroidY += point.y
      }
      centroidX /= polygon.points.length
      centroidY /= polygon.points.length

      const fontSize = Math.max(16 / zoom, 12)
      ctx.font = `bold ${fontSize}px Arial`
      ctx.fillStyle = "#1f2937"
      ctx.strokeStyle = "#ffffff"
      ctx.lineWidth = 3 / zoom
      ctx.textAlign = "center"
      ctx.textBaseline = "middle"
      
      // Draw text with white outline for better visibility
      ctx.strokeText(polygon.name, centroidX, centroidY)
      ctx.fillText(polygon.name, centroidX, centroidY)
    }

    // Draw selection highlight and edit handles
    if (isSelected) {
      ctx.strokeStyle = "#3b82f6"
      ctx.lineWidth = 1 / zoom
      ctx.setLineDash([5 / zoom, 5 / zoom])
      ctx.beginPath()
      ctx.moveTo(polygon.points[0].x, polygon.points[0].y)
      for (let i = 1; i < polygon.points.length; i++) {
        ctx.lineTo(polygon.points[i].x, polygon.points[i].y)
      }
      ctx.closePath()
      ctx.stroke()
      ctx.setLineDash([])

      // Draw edit handles on polygon points when in select mode
      if (drawingMode === "select") {
        ctx.fillStyle = "#3b82f6"
        ctx.strokeStyle = "#ffffff"
        ctx.lineWidth = 2 / zoom
        
        for (const point of polygon.points) {
          ctx.beginPath()
          ctx.arc(point.x, point.y, 6 / zoom, 0, Math.PI * 2)
          ctx.fill()
          ctx.stroke()
        }
      }
    }
  }

  const drawPolygonSession = (ctx: CanvasRenderingContext2D, session: PolygonSession, currentMousePos: { x: number; y: number } | null) => {
    if (!session.isActive || session.points.length === 0) return

    // Use the session's colors for preview
    const hexToRgba = (hex: string, alpha: number) => {
      const r = parseInt(hex.slice(1, 3), 16)
      const g = parseInt(hex.slice(3, 5), 16)
      const b = parseInt(hex.slice(5, 7), 16)
      return `rgba(${r}, ${g}, ${b}, ${alpha})`
    }

    // Draw preview fill if we have enough points
    if (session.points.length >= 3 && currentMousePos) {
      ctx.fillStyle = hexToRgba(session.fillColor, session.opacity * 0.5) // Reduced opacity for preview
      ctx.beginPath()
      ctx.moveTo(session.points[0].x, session.points[0].y)
      for (let i = 1; i < session.points.length; i++) {
        ctx.lineTo(session.points[i].x, session.points[i].y)
      }
      ctx.lineTo(currentMousePos.x, currentMousePos.y)
      ctx.closePath()
      ctx.fill()
    }

    ctx.strokeStyle = session.strokeColor
    ctx.lineWidth = 2 / zoom
    ctx.setLineDash([5 / zoom, 5 / zoom])

    // Draw lines between points
    if (session.points.length > 1) {
      ctx.beginPath()
      ctx.moveTo(session.points[0].x, session.points[0].y)
      for (let i = 1; i < session.points.length; i++) {
        ctx.lineTo(session.points[i].x, session.points[i].y)
      }
      ctx.stroke()
    }

    // Draw line to mouse position
    if (currentMousePos && session.points.length > 0) {
      ctx.beginPath()
      ctx.moveTo(session.points[session.points.length - 1].x, session.points[session.points.length - 1].y)
      ctx.lineTo(currentMousePos.x, currentMousePos.y)
      ctx.stroke()

      // Draw line back to first point if we have enough points
      if (session.points.length >= 3) {
        ctx.strokeStyle = "#10b981"
        ctx.beginPath()
        ctx.moveTo(currentMousePos.x, currentMousePos.y)
        ctx.lineTo(session.points[0].x, session.points[0].y)
        ctx.stroke()
      }
    }

    ctx.setLineDash([])

    // Draw points
    ctx.fillStyle = session.strokeColor
    for (const point of session.points) {
      ctx.beginPath()
      ctx.arc(point.x, point.y, 4 / zoom, 0, Math.PI * 2)
      ctx.fill()
    }

    // Highlight first point if we can close the polygon
    if (session.points.length >= 3) {
      ctx.strokeStyle = "#10b981"
      ctx.lineWidth = 2 / zoom
      ctx.beginPath()
      ctx.arc(session.points[0].x, session.points[0].y, 8 / zoom, 0, Math.PI * 2)
      ctx.stroke()
    }
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
    
    // Draw background images first (behind everything)
    drawBackgroundImages(ctx)
    
    // Draw polygons
    if (showPolygons) {
      polygons.forEach((polygon) => drawPolygon(ctx, polygon, polygon.id === selectedPolygonId))
    }
    
    // Draw roads and nodes
    roads.forEach((road) => drawRoad(ctx, road, road.id === selectedRoadId, road.id === selectedRoadForDisconnect))
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

    if (polygonSession.isActive) {
      drawPolygonSession(ctx, polygonSession, mousePosition)
    }

    ctx.restore()
  }, [
    nodes,
    roads,
    polygons,
    backgroundImages,
    showBackgroundLayer,
    selectedBackgroundImageId,
    buildSession,
    polygonSession,
    selectedRoadId,
    selectedNodeId,
    selectedPolygonId,
    selectedNodeData,
    connectingFromNodeId,
    selectedRoadForDisconnect,
    drawingMode,
    panOffset,
    zoom,
    mousePosition,
    showRoadLengths,
    showRoadNames,
    showPolygons,
    scaleMetersPerPixel,
    snapDistance,
    isActivelyDrawingCurve,
    editingPolygonName,
  ])

  const getCursorClass = () => {
    if (drawingMode === "pan") return "cursor-grab"
    if (drawingMode === "select") return "cursor-pointer"
    if (drawingMode === "nodes") return "cursor-crosshair"
    if (drawingMode === "connect") return "cursor-pointer"
    if (drawingMode === "disconnect") return "cursor-pointer"
    if (drawingMode === "add-node") return "cursor-crosshair"
    if (drawingMode === "polygon") return "cursor-crosshair"
    if (drawingMode === "background-image") return "cursor-move"
    return "cursor-default"
  }

  const getModeDisplayName = () => {
    switch (drawingMode) {
      case "nodes": return "Build"
      case "pan": return "Pan"
      case "select": return "Select"
      case "connect": return "Connect"
      case "disconnect": return "Disconnect"
      case "add-node": return "Add Node"
      case "polygon": return "Draw Polygon"
      case "background-image": return "Background Images"
      default: return drawingMode
    }
  }

  const getStatusMessage = () => {
    if (connectingFromNodeId) return " (Click target node or same node for circle)"
    if (selectedRoadForDisconnect) return " (Click again to delete road)"
    if (buildSession.isActive) return " (Building...)"
    if (polygonSession.isActive) {
      if (polygonSession.points.length >= 3) {
        return " (Click first point to close polygon)"
      }
      return " (Click to add points)"
    }
    if (drawingMode === "select" && selectedPolygonId) {
      return " (Drag polygon or points to edit)"
    }
    if (drawingMode === "background-image") {
      return " (Click and drag to move images)"
    }
    return ""
  }

  // Get the selected road and polygon for inline editing
  const selectedRoad = selectedRoadId ? roads.find(r => r.id === selectedRoadId) : null
  const selectedPolygon = selectedPolygonId ? polygons.find(p => p.id === selectedPolygonId) : null

  return (
    <div ref={containerRef} className="relative flex-1 bg-white">
      <canvas ref={canvasRef} onMouseDown={onMouseDown} className={`w-full h-full ${getCursorClass()}`} />

      <div className="absolute top-4 left-4 bg-white/90 backdrop-blur-sm px-3 py-2 rounded-lg shadow-sm text-sm font-medium border">
        Mode: {getModeDisplayName()}{getStatusMessage()}
      </div>

      {/* Inline Road Name Editor - only show if showRoadNames is true */}
      {selectedRoad && onUpdateRoadName && showRoadNames && (
        <div
          className="absolute z-10"
          style={{
            left: `${getRoadNamePosition(selectedRoad).x}px`,
            top: `${getRoadNamePosition(selectedRoad).y}px`,
            transform: 'translateX(-50%)',
          }}
        >
          {editingRoadName === selectedRoad.id ? (
            <div className="bg-white border border-blue-300 rounded-lg shadow-lg p-2 w-[200px]">
              <Input
                type="text"
                value={tempRoadName}
                onChange={(e) => setTempRoadName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    handleRoadNameSubmit(selectedRoad.id)
                  } else if (e.key === "Escape") {
                    handleRoadNameCancel()
                  }
                }}
                onBlur={() => handleRoadNameSubmit(selectedRoad.id)}
                placeholder="Enter road name..."
                className="text-sm"
                autoFocus
              />
            </div>
          ) : (
            <div
              className="group relative inline-flex items-center justify-center px-4 py-2 text-sm font-medium text-white bg-gradient-to-r from-emerald-500 to-teal-600 rounded-full shadow-lg hover:shadow-xl transform hover:scale-105 transition-all duration-200 cursor-pointer border-2 border-white/20 backdrop-blur-sm w-[200px]"
              onClick={() => handleRoadNameClick(selectedRoad.id, selectedRoad.name || "")}
            >
              <div className="absolute inset-0 bg-gradient-to-r from-emerald-400 to-teal-500 rounded-full opacity-0 group-hover:opacity-100 transition-opacity duration-200 blur-sm"></div>
              <span className="relative z-10 drop-shadow-sm">
                {selectedRoad.name || "+ Add name"}
              </span>
              <div className="absolute inset-0 rounded-full bg-gradient-to-r from-white/10 to-white/5 group-hover:from-white/20 group-hover:to-white/10 transition-all duration-200"></div>
            </div>
          )}
        </div>
      )}

      {/* Inline Polygon Name Editor - always show for polygons regardless of showRoadNames */}
      {selectedPolygon && onUpdate