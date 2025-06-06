"use client"

import { useRef, useState, useEffect, type MouseEvent } from "react"
import { Button } from "@/components/ui/button"
import { Toggle } from "@/components/ui/toggle"
import { Slider } from "@/components/ui/slider"
import { Badge } from "@/components/ui/badge"
import { type Road, type Node, type BuildSession, RoadType } from "@/lib/road-types"
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
  Check,
  X,
} from "lucide-react"

export default function RoadBuilder() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [nodes, setNodes] = useState<Node[]>([])
  const [roads, setRoads] = useState<Road[]>([])
  const [buildSession, setBuildSession] = useState<BuildSession>({
    nodes: [],
    isActive: false,
    roadType: RoadType.STRAIGHT,
    roadWidth: 10,
  })
  const [curvedRoads, setCurvedRoads] = useState(false)
  const [snapEnabled, setSnapEnabled] = useState(true)
  const [snapDistance, setSnapDistance] = useState(20)
  const [defaultRoadWidth, setDefaultRoadWidth] = useState(10)
  const containerRef = useRef<HTMLDivElement>(null)

  // Updated states
  const [drawingMode, setDrawingMode] = useState<"nodes" | "lines" | "pan" | "move" | "select-node">("nodes")
  const [isDrawing, setIsDrawing] = useState(false)
  const [currentLine, setCurrentLine] = useState<{
    start: { x: number; y: number }
    end: { x: number; y: number }
  } | null>(null)
  const [showRoadLengths, setShowRoadLengths] = useState(false)
  const [scaleMetersPerPixel, setScaleMetersPerPixel] = useState(0.1)
  const [selectedRoadId, setSelectedRoadId] = useState<string | null>(null)
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null)

  // Pan functionality
  const [isPanning, setIsPanning] = useState(false)
  const [panOffset, setPanOffset] = useState({ x: 0, y: 0 })
  const [lastPanPoint, setLastPanPoint] = useState({ x: 0, y: 0 })

  // Zoom functionality
  const [zoom, setZoom] = useState(1)
  const [mousePosition, setMousePosition] = useState<{ x: number; y: number } | null>(null)

  // Road dragging
  const [isDraggingRoad, setIsDraggingRoad] = useState(false)
  const [draggedRoadId, setDraggedRoadId] = useState<string | null>(null)
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 })

  // Node dragging
  const [isDraggingNode, setIsDraggingNode] = useState(false)
  const [draggedNodeId, setDraggedNodeId] = useState<string | null>(null)

  // Circle drawing
  const [isDrawingCircle, setIsDrawingCircle] = useState(false)
  const [circleCenter, setCircleCenter] = useState<{ x: number; y: number } | null>(null)
  const [circleRadius, setCircleRadius] = useState(0)

  // Snap preview
  const [snapPreview, setSnapPreview] = useState<{ x: number; y: number } | null>(null)

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

    // Draw nodes
    nodes.forEach((node) => {
      const isSelected = node.id === selectedNodeId
      drawNode(ctx, node, isSelected)
    })

    // Draw build session
    if (buildSession.isActive) {
      drawBuildSession(ctx)
    }

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

    // Draw snap preview
    if (snapPreview) {
      drawSnapPreview(ctx, snapPreview)
    }

    ctx.restore()
  }, [
    nodes,
    roads,
    buildSession,
    defaultRoadWidth,
    currentLine,
    showRoadLengths,
    drawingMode,
    curvedRoads,
    selectedRoadId,
    selectedNodeId,
    panOffset,
    zoom,
    mousePosition,
    isDrawingCircle,
    circleCenter,
    circleRadius,
    snapPreview,
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
        if (buildSession.isActive) {
          setBuildSession((prev) => ({ ...prev, roadType: !curvedRoads ? RoadType.CURVED : RoadType.STRAIGHT }))
        }
      } else if (e.key === "Shift") {
        setSnapEnabled(true)
      } else if (e.key === "Delete" || e.key === "Backspace") {
        if (selectedNodeId) {
          deleteNode(selectedNodeId)
        } else if (selectedRoadId) {
          deleteRoad(selectedRoadId)
        } else {
          removeLastElement()
        }
      } else if (e.key === "Escape") {
        cancelBuildSession()
        setSelectedRoadId(null)
        setSelectedNodeId(null)
        setCurrentLine(null)
        setIsDrawing(false)
        setIsDrawingCircle(false)
        setCircleCenter(null)
        setCircleRadius(0)
      } else if (e.key === "Enter" || e.key === " ") {
        if (buildSession.isActive && buildSession.nodes.length >= 2) {
          completeBuildSession()
        }
      } else if (e.key === "+" || e.key === "=") {
        zoomIn()
      } else if (e.key === "-") {
        zoomOut()
      } else if (e.ctrlKey && e.key === "z") {
        e.preventDefault()
        removeLastElement()
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
  }, [buildSession, selectedNodeId, selectedRoadId, curvedRoads])

  // Calculate road length in meters
  const calculateRoadLength = (road: Road): number => {
    let pixelLength: number

    if (road.type === RoadType.STRAIGHT) {
      const dx = road.end.x - road.start.x
      const dy = road.end.y - road.start.y
      pixelLength = Math.sqrt(dx * dx + dy * dy)
    } else if (road.type === RoadType.CURVED) {
      const controlPointX = (road.start.x + road.end.x) / 2
      const controlPointY = (road.start.y + road.end.y) / 2
      const offsetX = (road.end.y - road.start.y) * 0.5
      const offsetY = (road.start.x - road.end.x) * 0.5
      const cp = { x: controlPointX + offsetX, y: controlPointY + offsetY }

      const d1 = Math.sqrt((cp.x - road.start.x) ** 2 + (cp.y - road.start.y) ** 2)
      const d2 = Math.sqrt((road.end.x - cp.x) ** 2 + (road.end.y - cp.y) ** 2)
      pixelLength = d1 + d2
    } else {
      const radius = Math.sqrt((road.end.x - road.start.x) ** 2 + (road.end.y - road.start.y) ** 2)
      pixelLength = 2 * Math.PI * radius
    }

    return pixelLength * scaleMetersPerPixel
  }

  // Find nearby node for snapping
  const findNearbyNode = (x: number, y: number, excludeIds: string[] = []): Node | null => {
    for (const node of nodes) {
      if (excludeIds.includes(node.id)) continue
      const distance = Math.sqrt((node.x - x) ** 2 + (node.y - y) ** 2)
      if (distance <= snapDistance) {
        return node
      }
    }
    return null
  }

  // Find nearby road for snapping
  const findNearbyRoadPoint = (x: number, y: number): { x: number; y: number; roadId: string } | null => {
    for (const road of roads) {
      if (road.type === RoadType.STRAIGHT) {
        const distance = getDistanceToRoad(road, x, y)
        if (distance <= snapDistance) {
          // Find the closest point on the road
          const A = x - road.start.x
          const B = y - road.start.y
          const C = road.end.x - road.start.x
          const D = road.end.y - road.start.y

          const dot = A * C + B * D
          const lenSq = C * C + D * D
          let param = -1
          if (lenSq !== 0) param = dot / lenSq

          param = Math.max(0, Math.min(1, param))
          const closestX = road.start.x + param * C
          const closestY = road.start.y + param * D

          return { x: closestX, y: closestY, roadId: road.id }
        }
      }
    }
    return null
  }

  // Convert screen coordinates to world coordinates
  const getWorldCoordinates = (e: MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current
    if (!canvas) return { x: 0, y: 0 }

    const rect = canvas.getBoundingClientRect()
    const x = (e.clientX - rect.left - panOffset.x) / zoom
    const y = (e.clientY - rect.top - panOffset.y) / zoom

    return { x, y }
  }

  // Get snapped position with preview
  const getSnappedPosition = (x: number, y: number, excludeNodeIds: string[] = []) => {
    // First try to snap to existing nodes
    const nearbyNode = findNearbyNode(x, y, excludeNodeIds)
    if (nearbyNode) {
      setSnapPreview({ x: nearbyNode.x, y: nearbyNode.y })
      return { x: nearbyNode.x, y: nearbyNode.y, snappedToNode: nearbyNode }
    }

    // Then try to snap to roads
    const nearbyRoadPoint = findNearbyRoadPoint(x, y)
    if (nearbyRoadPoint) {
      setSnapPreview({ x: nearbyRoadPoint.x, y: nearbyRoadPoint.y })
      return { x: nearbyRoadPoint.x, y: nearbyRoadPoint.y, snappedToRoad: nearbyRoadPoint.roadId }
    }

    // Grid snapping
    if (snapEnabled) {
      const gridSize = snapDistance
      const snappedX = Math.round(x / gridSize) * gridSize
      const snappedY = Math.round(y / gridSize) * gridSize
      setSnapPreview(null)
      return { x: snappedX, y: snappedY }
    }

    setSnapPreview(null)
    return { x, y }
  }

  // Find node at position
  const findNodeAtPosition = (x: number, y: number): Node | null => {
    for (const node of nodes) {
      const distance = Math.sqrt((node.x - x) ** 2 + (node.y - y) ** 2)
      if (distance <= 10) {
        return node
      }
    }
    return null
  }

  // Find road at position
  const findRoadAtPosition = (x: number, y: number): Road | null => {
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
      const centerX = road.start.x
      const centerY = road.start.y
      const radius = Math.sqrt((road.end.x - road.start.x) ** 2 + (road.end.y - road.start.y) ** 2)
      const distanceToCenter = Math.sqrt((x - centerX) ** 2 + (y - centerY) ** 2)
      return Math.abs(distanceToCenter - radius)
    } else {
      const midX = (road.start.x + road.end.x) / 2
      const midY = (road.start.y + road.end.y) / 2
      const dx = x - midX
      const dy = y - midY
      return Math.sqrt(dx * dx + dy * dy)
    }
  }

  // Start build session
  const startBuildSession = () => {
    setBuildSession({
      nodes: [],
      isActive: true,
      roadType: curvedRoads ? RoadType.CURVED : RoadType.STRAIGHT,
      roadWidth: defaultRoadWidth,
    })
  }

  // Add node to build session
  const addNodeToBuildSession = (x: number, y: number, snappedNode?: Node, snappedRoadId?: string) => {
    let nodeId: string
    let finalX = x
    let finalY = y

    if (snappedNode) {
      // Use existing node
      nodeId = snappedNode.id
      finalX = snappedNode.x
      finalY = snappedNode.y
    } else {
      // Create new node
      nodeId = `node-${Date.now()}-${Math.random()}`
      const newNode: Node = {
        id: nodeId,
        x: finalX,
        y: finalY,
        connectedRoadIds: [],
      }

      // If snapped to a road, split the road
      if (snappedRoadId) {
        splitRoadAtPoint(snappedRoadId, finalX, finalY, nodeId)
      }

      setNodes((prev) => [...prev, newNode])
    }

    setBuildSession((prev) => ({
      ...prev,
      nodes: [...prev.nodes, { id: nodeId, x: finalX, y: finalY, connectedRoadIds: [] }],
    }))
  }

  // Split road at point
  const splitRoadAtPoint = (roadId: string, x: number, y: number, newNodeId: string) => {
    const road = roads.find((r) => r.id === roadId)
    if (!road) return

    // Create two new roads
    const road1: Road = {
      ...road,
      id: `road-${Date.now()}-${Math.random()}-1`,
      end: { x, y },
      endNodeId: newNodeId,
    }

    const road2: Road = {
      ...road,
      id: `road-${Date.now()}-${Math.random()}-2`,
      start: { x, y },
      startNodeId: newNodeId,
    }

    // Update roads
    setRoads((prev) => prev.filter((r) => r.id !== roadId).concat([road1, road2]))

    // Update node connections
    setNodes((prev) =>
      prev.map((node) => {
        if (node.id === newNodeId) {
          return { ...node, connectedRoadIds: [road1.id, road2.id] }
        }
        if (node.connectedRoadIds.includes(roadId)) {
          const updatedRoadIds = node.connectedRoadIds.filter((id) => id !== roadId)
          if (node.id === road.startNodeId) {
            updatedRoadIds.push(road1.id)
          } else if (node.id === road.endNodeId) {
            updatedRoadIds.push(road2.id)
          }
          return { ...node, connectedRoadIds: updatedRoadIds }
        }
        return node
      }),
    )
  }

  // Complete build session
  const completeBuildSession = () => {
    if (buildSession.nodes.length < 2) return

    // Create roads between consecutive nodes
    for (let i = 0; i < buildSession.nodes.length - 1; i++) {
      const startNode = buildSession.nodes[i]
      const endNode = buildSession.nodes[i + 1]

      const roadId = `road-${Date.now()}-${Math.random()}-${i}`
      const newRoad: Road = {
        start: { x: startNode.x, y: startNode.y },
        end: { x: endNode.x, y: endNode.y },
        startNodeId: startNode.id,
        endNodeId: endNode.id,
        type: buildSession.roadType,
        width: buildSession.roadWidth,
        id: roadId,
      }

      setRoads((prev) => [...prev, newRoad])

      // Update node connections
      setNodes((prev) =>
        prev.map((node) => {
          if (node.id === startNode.id || node.id === endNode.id) {
            return {
              ...node,
              connectedRoadIds: [...node.connectedRoadIds, roadId],
            }
          }
          return node
        }),
      )
    }

    setBuildSession({ nodes: [], isActive: false, roadType: RoadType.STRAIGHT, roadWidth: 10 })
  }

  // Cancel build session
  const cancelBuildSession = () => {
    // Remove any nodes that were created during this session and aren't connected to existing roads
    const sessionNodeIds = buildSession.nodes.map((n) => n.id)
    setNodes((prev) =>
      prev.filter((node) => {
        if (sessionNodeIds.includes(node.id)) {
          return node.connectedRoadIds.some((roadId) => roads.some((road) => road.id === roadId))
        }
        return true
      }),
    )

    setBuildSession({ nodes: [], isActive: false, roadType: RoadType.STRAIGHT, roadWidth: 10 })
  }

  // Move node and update connected roads
  const moveNode = (nodeId: string, newX: number, newY: number) => {
    setNodes((prev) => prev.map((node) => (node.id === nodeId ? { ...node, x: newX, y: newY } : node)))

    // Update all roads connected to this node
    setRoads((prev) =>
      prev.map((road) => {
        if (road.startNodeId === nodeId) {
          return { ...road, start: { x: newX, y: newY } }
        }
        if (road.endNodeId === nodeId) {
          return { ...road, end: { x: newX, y: newY } }
        }
        return road
      }),
    )
  }

  // Delete node and connected roads
  const deleteNode = (nodeId: string) => {
    const node = nodes.find((n) => n.id === nodeId)
    if (!node) return

    // Remove connected roads
    setRoads((prev) => prev.filter((road) => !node.connectedRoadIds.includes(road.id)))

    // Remove node
    setNodes((prev) => prev.filter((n) => n.id !== nodeId))

    // Update other nodes' connections
    setNodes((prev) =>
      prev.map((n) => ({
        ...n,
        connectedRoadIds: n.connectedRoadIds.filter((roadId) => !node.connectedRoadIds.includes(roadId)),
      })),
    )

    setSelectedNodeId(null)
  }

  // Delete road
  const deleteRoad = (roadId: string) => {
    setRoads((prev) => prev.filter((road) => road.id !== roadId))

    // Update node connections
    setNodes((prev) =>
      prev.map((node) => ({
        ...node,
        connectedRoadIds: node.connectedRoadIds.filter((id) => id !== roadId),
      })),
    )

    setSelectedRoadId(null)
  }

  // Handle mouse down
  const handleMouseDown = (e: MouseEvent<HTMLCanvasElement>) => {
    const coords = getWorldCoordinates(e)

    if (drawingMode === "pan") {
      setIsPanning(true)
      setLastPanPoint({ x: e.clientX, y: e.clientY })
    } else if (drawingMode === "move") {
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
    } else if (drawingMode === "select-node") {
      const clickedNode = findNodeAtPosition(coords.x, coords.y)
      if (clickedNode) {
        setSelectedNodeId(clickedNode.id)
        setIsDraggingNode(true)
        setDraggedNodeId(clickedNode.id)
      } else {
        setSelectedNodeId(null)
      }
    } else if (drawingMode === "nodes") {
      if (!buildSession.isActive) {
        startBuildSession()
      }

      const snappedPos = getSnappedPosition(
        coords.x,
        coords.y,
        buildSession.nodes.map((n) => n.id),
      )
      addNodeToBuildSession(snappedPos.x, snappedPos.y, snappedPos.snappedToNode, snappedPos.snappedToRoad)
    } else if (drawingMode === "lines") {
      setIsDrawing(true)
      setCurrentLine({ start: coords, end: coords })
    }
  }

  // Handle mouse move
  const handleMouseMove = (e: MouseEvent<HTMLCanvasElement>) => {
    const coords = getWorldCoordinates(e)

    if (drawingMode === "nodes" && buildSession.isActive) {
      const snappedPos = getSnappedPosition(
        coords.x,
        coords.y,
        buildSession.nodes.map((n) => n.id),
      )
      setMousePosition({ x: snappedPos.x, y: snappedPos.y })
    } else {
      setMousePosition(coords)
      setSnapPreview(null)
    }

    if (isPanning && drawingMode === "pan") {
      const deltaX = e.clientX - lastPanPoint.x
      const deltaY = e.clientY - lastPanPoint.y
      setPanOffset((prev) => ({
        x: prev.x + deltaX,
        y: prev.y + deltaY,
      }))
      setLastPanPoint({ x: e.clientX, y: e.clientY })
    } else if (isDraggingNode && draggedNodeId) {
      const snappedPos = getSnappedPosition(coords.x, coords.y, [draggedNodeId])
      moveNode(draggedNodeId, snappedPos.x, snappedPos.y)
    } else if (isDraggingRoad && draggedRoadId && drawingMode === "move") {
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
    } else if (isDraggingNode) {
      setIsDraggingNode(false)
      setDraggedNodeId(null)
    } else if (isDrawing && currentLine && drawingMode === "lines") {
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

  // Draw snap preview
  const drawSnapPreview = (ctx: CanvasRenderingContext2D, pos: { x: number; y: number }) => {
    ctx.strokeStyle = "#3b82f6"
    ctx.lineWidth = 2
    ctx.setLineDash([4, 4])
    ctx.beginPath()
    ctx.arc(pos.x, pos.y, 12, 0, Math.PI * 2)
    ctx.stroke()
    ctx.setLineDash([])
  }

  // Draw node
  const drawNode = (ctx: CanvasRenderingContext2D, node: Node, isSelected: boolean) => {
    // Node circle
    ctx.fillStyle = isSelected ? "#3b82f6" : node.connectedRoadIds.length > 0 ? "#059669" : "#6b7280"
    ctx.strokeStyle = "#ffffff"
    ctx.lineWidth = 2
    ctx.beginPath()
    ctx.arc(node.x, node.y, 8, 0, Math.PI * 2)
    ctx.fill()
    ctx.stroke()

    // Selection ring
    if (isSelected) {
      ctx.strokeStyle = "#3b82f6"
      ctx.lineWidth = 2
      ctx.setLineDash([3, 3])
      ctx.beginPath()
      ctx.arc(node.x, node.y, 15, 0, Math.PI * 2)
      ctx.stroke()
      ctx.setLineDash([])
    }
  }

  // Draw build session
  const drawBuildSession = (ctx: CanvasRenderingContext2D) => {
    // Draw nodes in build session
    buildSession.nodes.forEach((node, index) => {
      ctx.fillStyle = index === buildSession.nodes.length - 1 ? "#ef4444" : "#f59e0b"
      ctx.strokeStyle = "#ffffff"
      ctx.lineWidth = 2
      ctx.beginPath()
      ctx.arc(node.x, node.y, 8, 0, Math.PI * 2)
      ctx.fill()
      ctx.stroke()
    })

    // Draw roads between nodes in build session
    for (let i = 0; i < buildSession.nodes.length - 1; i++) {
      const start = buildSession.nodes[i]
      const end = buildSession.nodes[i + 1]

      ctx.strokeStyle = "#f59e0b"
      ctx.lineWidth = buildSession.roadWidth
      ctx.lineCap = "round"
      ctx.setLineDash([10, 5])

      if (buildSession.roadType === RoadType.STRAIGHT) {
        ctx.beginPath()
        ctx.moveTo(start.x, start.y)
        ctx.lineTo(end.x, end.y)
        ctx.stroke()
      } else if (buildSession.roadType === RoadType.CURVED) {
        const controlPointX = (start.x + end.x) / 2
        const controlPointY = (start.y + end.y) / 2
        const offsetX = (end.y - start.y) * 0.5
        const offsetY = (start.x - end.x) * 0.5

        ctx.beginPath()
        ctx.moveTo(start.x, start.y)
        ctx.quadraticCurveTo(controlPointX + offsetX, controlPointY + offsetY, end.x, end.y)
        ctx.stroke()
      }

      ctx.setLineDash([])
    }

    // Draw preview line from last node to mouse
    if (buildSession.nodes.length > 0 && mousePosition) {
      const lastNode = buildSession.nodes[buildSession.nodes.length - 1]

      ctx.strokeStyle = "#f59e0b"
      ctx.lineWidth = buildSession.roadWidth
      ctx.globalAlpha = 0.5
      ctx.setLineDash([5, 5])

      if (buildSession.roadType === RoadType.STRAIGHT) {
        ctx.beginPath()
        ctx.moveTo(lastNode.x, lastNode.y)
        ctx.lineTo(mousePosition.x, mousePosition.y)
        ctx.stroke()
      } else if (buildSession.roadType === RoadType.CURVED) {
        const controlPointX = (lastNode.x + mousePosition.x) / 2
        const controlPointY = (lastNode.y + mousePosition.y) / 2
        const offsetX = (mousePosition.y - lastNode.y) * 0.5
        const offsetY = (lastNode.x - mousePosition.x) * 0.5

        ctx.beginPath()
        ctx.moveTo(lastNode.x, lastNode.y)
        ctx.quadraticCurveTo(controlPointX + offsetX, controlPointY + offsetY, mousePosition.x, mousePosition.y)
        ctx.stroke()
      }

      ctx.setLineDash([])
      ctx.globalAlpha = 1

      // Calculate and display preview distance
      let previewDistance: number
      if (buildSession.roadType === RoadType.STRAIGHT) {
        const dx = mousePosition.x - lastNode.x
        const dy = mousePosition.y - lastNode.y
        previewDistance = Math.sqrt(dx * dx + dy * dy) * scaleMetersPerPixel
      } else {
        const controlPointX = (lastNode.x + mousePosition.x) / 2
        const controlPointY = (lastNode.y + mousePosition.y) / 2
        const offsetX = (mousePosition.y - lastNode.y) * 0.5
        const offsetY = (lastNode.x - mousePosition.x) * 0.5
        const cp = { x: controlPointX + offsetX, y: controlPointY + offsetY }

        const d1 = Math.sqrt((cp.x - lastNode.x) ** 2 + (cp.y - lastNode.y) ** 2)
        const d2 = Math.sqrt((mousePosition.x - cp.x) ** 2 + (mousePosition.y - cp.y) ** 2)
        previewDistance = (d1 + d2) * scaleMetersPerPixel
      }

      // Draw distance label
      const midX = (lastNode.x + mousePosition.x) / 2
      const midY = (lastNode.y + mousePosition.y) / 2

      ctx.fillStyle = "rgba(59, 130, 246, 0.9)"
      ctx.strokeStyle = "#ffffff"
      ctx.lineWidth = 1
      const textWidth = 60
      const textHeight = 20
      ctx.fillRect(midX - textWidth / 2, midY - textHeight / 2, textWidth, textHeight)
      ctx.strokeRect(midX - textWidth / 2, midY - textHeight / 2, textWidth, textHeight)

      ctx.fillStyle = "#ffffff"
      ctx.font = "12px Arial"
      ctx.textAlign = "center"
      ctx.textBaseline = "middle"
      ctx.fillText(`${previewDistance.toFixed(1)}m`, midX, midY)
    }
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

    ctx.fillStyle = "rgba(255, 255, 255, 0.9)"
    ctx.strokeStyle = "#e5e7eb"
    ctx.lineWidth = 1
    ctx.fillRect(midX - 25, midY - 10, 50, 20)
    ctx.strokeRect(midX - 25, midY - 10, 50, 20)

    ctx.fillStyle = "#374151"
    ctx.font = "11px Arial"
    ctx.textAlign = "center"
    ctx.textBaseline = "middle"
    ctx.fillText(`${length.toFixed(1)}m`, midX, midY)
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
    setBuildSession({ nodes: [], isActive: false, roadType: RoadType.STRAIGHT, roadWidth: 10 })
    setSelectedRoadId(null)
    setSelectedNodeId(null)
    setPanOffset({ x: 0, y: 0 })
    setZoom(1)
  }

  // Remove last element
  const removeLastElement = () => {
    if (buildSession.isActive && buildSession.nodes.length > 0) {
      const lastNode = buildSession.nodes[buildSession.nodes.length - 1]
      setBuildSession((prev) => ({
        ...prev,
        nodes: prev.nodes.slice(0, -1),
      }))

      // Remove the node if it was created in this session and has no other connections
      const node = nodes.find((n) => n.id === lastNode.id)
      if (node && node.connectedRoadIds.length === 0) {
        setNodes((prev) => prev.filter((n) => n.id !== lastNode.id))
      }
    } else if (roads.length > 0) {
      const newRoads = [...roads]
      newRoads.pop()
      setRoads(newRoads)
    }
  }

  const selectedRoad = roads.find((r) => r.id === selectedRoadId)
  const selectedNode = nodes.find((n) => n.id === selectedNodeId)
  const totalLength = roads.reduce((sum, road) => sum + calculateRoadLength(road), 0)

  return (
    <div className="flex h-screen bg-gray-50">
      <div className="flex-1 flex flex-col">
        <div className="bg-white border-b px-4 py-2 flex gap-6 text-sm text-gray-600">
          <span>Roads: {roads.length}</span>
          <span>Nodes: {nodes.length}</span>
          <span>Total Length: {totalLength.toFixed(1)}m</span>
          <span>Zoom: {(zoom * 100).toFixed(0)}%</span>
          {buildSession.isActive && <Badge variant="secondary">Building: {buildSession.nodes.length} nodes</Badge>}
        </div>

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
                  : drawingMode === "select-node" && isDraggingNode
                    ? "cursor-grabbing"
                    : drawingMode === "select-node"
                      ? "cursor-pointer"
                      : "cursor-crosshair"
            }`}
          />

          <div className="absolute top-4 left-4 bg-white/90 backdrop-blur-sm px-3 py-2 rounded-lg shadow-sm text-sm font-medium border">
            Mode: {drawingMode.charAt(0).toUpperCase() + drawingMode.slice(1).replace("-", " ")}
            {buildSession.isActive && " (Building road...)"}
          </div>

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

          {buildSession.isActive && buildSession.nodes.length >= 2 && (
            <div className="absolute bottom-4 left-1/2 transform -translate-x-1/2 bg-white/90 backdrop-blur-sm px-4 py-2 rounded-lg shadow-sm border flex gap-2">
              <Button size="sm" onClick={completeBuildSession} className="bg-green-600 hover:bg-green-700">
                <Check size={16} className="mr-1" />
                Complete Road
              </Button>
              <Button size="sm" variant="outline" onClick={cancelBuildSession}>
                <X size={16} className="mr-1" />
                Cancel
              </Button>
            </div>
          )}
        </div>
      </div>

      <div className="w-80 bg-white border-l border-gray-200 flex flex-col overflow-hidden">
        <div className="flex-1 overflow-y-auto p-4 space-y-6">
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
                <span className="text-xs">Build</span>
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

          <div className="space-y-3">
            <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wide">Selection Tools</h3>
            <div className="grid grid-cols-2 gap-2">
              <Toggle
                pressed={drawingMode === "select-node"}
                onPressedChange={() => setDrawingMode("select-node")}
                aria-label="Select node mode"
                className="flex flex-col items-center gap-1 h-16"
              >
                <MousePointer size={20} />
                <span className="text-xs">Nodes</span>
              </Toggle>
              <Toggle
                pressed={drawingMode === "move"}
                onPressedChange={() => setDrawingMode("move")}
                aria-label="Select road mode"
                className="flex flex-col items-center gap-1 h-16"
              >
                <Move size={20} />
                <span className="text-xs">Roads</span>
              </Toggle>
            </div>
            <Toggle
              pressed={drawingMode === "pan"}
              onPressedChange={() => setDrawingMode("pan")}
              aria-label="Pan mode"
              className="flex flex-col items-center gap-1 h-12 w-full"
            >
              <Move size={20} />
              <span className="text-xs">Pan View</span>
            </Toggle>
          </div>

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
                <span className="text-sm">Auto Snapping</span>
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

          {selectedNode && (
            <div className="space-y-3">
              <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wide">Selected Node</h3>
              <div className="space-y-2">
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div className="bg-gray-50 p-2 rounded">
                    <div className="text-gray-500">Position</div>
                    <div className="font-medium">
                      {selectedNode.x.toFixed(0)}, {selectedNode.y.toFixed(0)}
                    </div>
                  </div>
                  <div className="bg-gray-50 p-2 rounded">
                    <div className="text-gray-500">Roads</div>
                    <div className="font-medium">{selectedNode.connectedRoadIds.length}</div>
                  </div>
                </div>
                <Button variant="destructive" size="sm" className="w-full" onClick={() => deleteNode(selectedNode.id)}>
                  <Trash2 size={16} className="mr-1" />
                  Delete Node
                </Button>
              </div>
            </div>
          )}

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
                <Button variant="destructive" size="sm" className="w-full" onClick={() => deleteRoad(selectedRoad.id)}>
                  <Trash2 size={16} className="mr-1" />
                  Delete Road
                </Button>
              </div>
            </div>
          )}

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

          <div className="text-xs text-gray-500 space-y-1">
            <div>
              <strong>Shortcuts:</strong>
            </div>
            <div>C - Toggle curved roads</div>
            <div>Shift - Enable snapping</div>
            <div>Enter/Space - Complete road</div>
            <div>Escape - Cancel/Clear selection</div>
            <div>Delete - Remove selected item</div>
            <div>Ctrl+Z - Undo last</div>
          </div>
        </div>
      </div>
    </div>
  )
}
