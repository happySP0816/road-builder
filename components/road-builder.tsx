"use client"

import { useState, type MouseEvent, useEffect, useRef, useCallback } from "react"
import { type Road, type Node, type BuildSession, RoadType, type NodePoint, type Polygon, type PolygonSession, type BackgroundImage, type PolygonVertex } from "@/lib/road-types"
import { downloadCanvasState, readCanvasStateFile, type CanvasState } from "@/lib/save-load"
import RoadCanvas from "./road-canvas"
import StatusBar from "./status-bar"
import DrawingTools from "./drawing-tools"
import RoadSettings from "./road-settings"
import PolygonSettings from "./polygon-settings"
import SelectedItemPanel from "./selected-item-panel"
import SelectedPolygonPanel from "./selected-polygon-panel"
import ActionsPanel from "./actions-panel"
import { Input } from "@/components/ui/input"
import { Magnet, Ruler, Tag, Shapes, Save, Upload } from "lucide-react"
import MapNameModal from "./map-name-modal"

// Helper function for distance from point to line segment
function distToSegmentSquared(p: { x: number; y: number }, v: { x: number; y: number }, w: { x: number; y: number }) {
  const l2 = (v.x - w.x) ** 2 + (v.y - w.y) ** 2
  if (l2 === 0) return (p.x - v.x) ** 2 + (p.y - v.y) ** 2
  let t = ((p.x - v.x) * (w.x - v.x) + (p.y - v.y) * (w.y - v.y)) / l2
  t = Math.max(0, Math.min(1, t))
  return (p.x - (v.x + t * (w.x - v.x))) ** 2 + (p.y - (v.y + t * (w.y - v.y))) ** 2
}

function distToSegment(p: { x: number; y: number }, v: { x: number; y: number }, w: { x: number; y: number }) {
  return Math.sqrt(distToSegmentSquared(p, v, w))
}

// Helper function to calculate polygon area using shoelace formula on sampled points from bezier curves
function calculatePolygonArea(vertices: PolygonVertex[], scaleMetersPerPixel: number): number {
  if (vertices.length < 2) return 0

  const sampledPoints: { x: number; y: number }[] = []
  const samplesPerSegment = 20 // More samples = more accurate area

  for (let i = 0; i < vertices.length; i++) {
    const p0 = vertices[i]
    const p1 = vertices[(i + 1) % vertices.length]
    
    // The control points for the segment from p0 to p1 are p0.cp2 and p1.cp1
    const cp0 = p0.cp2
    const cp1 = p1.cp1

    // We only need to add the sampled points for the curve, not the vertices themselves,
    // as the shoelace formula works on a continuous boundary.
    for (let j = 0; j < samplesPerSegment; j++) {
      const t = j / samplesPerSegment
      const mt = 1 - t
      const x = mt * mt * mt * p0.x + 3 * mt * mt * t * cp0.x + 3 * mt * t * t * cp1.x + t * t * t * p1.x
      const y = mt * mt * mt * p0.y + 3 * mt * mt * t * cp0.y + 3 * mt * t * t * cp1.y + t * t * t * p1.y
      sampledPoints.push({ x, y })
    }
  }
  
  if (sampledPoints.length < 3) return 0

  let area = 0
  for (let i = 0; i < sampledPoints.length; i++) {
    const j = (i + 1) % sampledPoints.length
    area += sampledPoints[i].x * sampledPoints[j].y
    area -= sampledPoints[j].x * sampledPoints[i].y
  }
  area = Math.abs(area) / 2

  // Convert from pixels² to meters²
  return area * scaleMetersPerPixel * scaleMetersPerPixel
}

// Helper function to check if point is inside polygon by sampling bezier edges
function isPointInPolygon(point: { x: number; y: number }, polygon: PolygonVertex[]): boolean {
  if (polygon.length < 2) return false

  const sampledPoints: { x: number; y: number }[] = []
  const samplesPerSegment = 20

  for (let i = 0; i < polygon.length; i++) {
    const p0 = polygon[i]
    const p1 = polygon[(i + 1) % polygon.length]
    const cp0 = p0.cp2
    const cp1 = p1.cp1
    
    for (let j = 0; j < samplesPerSegment; j++) {
        const t = j / samplesPerSegment
        const mt = 1 - t
        const x = mt * mt * mt * p0.x + 3 * mt * mt * t * cp0.x + 3 * mt * t * t * cp1.x + t * t * t * p1.x
        const y = mt * mt * mt * p0.y + 3 * mt * mt * t * cp0.y + 3 * mt * t * t * cp1.y + t * t * t * p1.y
        sampledPoints.push({ x, y })
    }
  }
  
  let inside = false
  for (let i = 0, j = sampledPoints.length - 1; i < sampledPoints.length; j = i++) {
    if (((sampledPoints[i].y > point.y) !== (sampledPoints[j].y > point.y)) &&
        (point.x < (sampledPoints[j].x - sampledPoints[i].x) * (point.y - sampledPoints[i].y) / (sampledPoints[j].y - sampledPoints[i].y) + sampledPoints[i].x)) {
      inside = !inside
    }
  }
  return inside
}

// Utility: Split cubic bezier at t, return two sets of control points
function splitCubicBezier(
  p0: { x: number; y: number },
  c1: { x: number; y: number },
  c2: { x: number; y: number },
  p3: { x: number; y: number },
  t: number
) {
  // de Casteljau's algorithm
  const lerp = (a: { x: number; y: number }, b: { x: number; y: number }, t: number) => ({
    x: a.x + (b.x - a.x) * t,
    y: a.y + (b.y - a.y) * t,
  })
  const p01 = lerp(p0, c1, t)
  const p12 = lerp(c1, c2, t)
  const p23 = lerp(c2, p3, t)
  const p012 = lerp(p01, p12, t)
  const p123 = lerp(p12, p23, t)
  const p0123 = lerp(p012, p123, t)
  // First segment: p0, p01, p012, p0123
  // Second segment: p0123, p123, p23, p3
  return {
    left: [p0, p01, p012, p0123],
    right: [p0123, p123, p23, p3],
    splitPoint: p0123,
  }
}

export default function RoadBuilder() {
  const [nodes, setNodes] = useState<Node[]>([])
  const [roads, setRoads] = useState<Road[]>([])
  const [polygons, setPolygons] = useState<Polygon[]>([])
  const [buildSession, setBuildSession] = useState<BuildSession>({
    nodes: [],
    isActive: false,
    roadType: RoadType.BEZIER,
    roadWidth: 10,
    isDraggingControlPoint: null,
    currentSegmentStartNodeIndex: null,
  })

  const [polygonSession, setPolygonSession] = useState<PolygonSession>({
    points: [],
    roadIds: [],
    isActive: false,
    fillColor: "#3b82f6",
    strokeColor: "#1e40af",
    opacity: 0.3,
  })

  const buildSessionRef = useRef(buildSession)
  buildSessionRef.current = buildSession

  const [snapEnabled, setSnapEnabled] = useState(true)
  const [snapDistance, setSnapDistance] = useState(20)
  const [defaultRoadWidth, setDefaultRoadWidth] = useState(10)
  const [drawingMode, setDrawingMode] = useState<"nodes" | "pan" | "select" | "connect" | "disconnect" | "add-node" | "polygon" | "add-image">("nodes")
  const [showRoadLengths, setShowRoadLengths] = useState(false)
  const [showRoadNames, setShowRoadNames] = useState(true)
  const [showPolygons, setShowPolygons] = useState(true)
  const [scaleMetersPerPixel, setScaleMetersPerPixel] = useState(0.1)
  const [selectedRoadId, setSelectedRoadId] = useState<string | null>(null)
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null)
  const [selectedPolygonId, setSelectedPolygonId] = useState<string | null>(null)
  const [panOffset, setPanOffset] = useState({ x: 0, y: 0 })
  const [zoom, setZoom] = useState(1)
  const [mousePosition, setMousePosition] = useState<{ x: number; y: number } | null>(null)

  const [isPanning, setIsPanning] = useState(false)
  const [lastPanPoint, setLastPanPoint] = useState({ x: 0, y: 0 })
  const [isDraggingNode, setIsDraggingNode] = useState(false)
  const [draggedNodeId, setDraggedNodeId] = useState<string | null>(null)
  const [isDraggingNewPointHandle, setIsDraggingNewPointHandle] = useState(false)
  const [draggedControlPointInfo, setDraggedControlPointInfo] = useState<{
    roadId: string
    pointIndex: 0 | 1
  } | null>(null)

  // Polygon editing state
  const [isDraggingPolygon, setIsDraggingPolygon] = useState(false)
  const [isDraggingPolygonPoint, setIsDraggingPolygonPoint] = useState(false)
  const [draggedPolygonPointIndex, setDraggedPolygonPointIndex] = useState<number | null>(null)
  const [polygonDragOffset, setPolygonDragOffset] = useState({ x: 0, y: 0 })
  const [isDraggingPolygonHandle, setIsDraggingPolygonHandle] = useState(false)
  const [draggedPolygonControlPointInfo, setDraggedPolygonControlPointInfo] = useState<{
    polygonId: string
    pointIndex: number
    handle: "cp1" | "cp2"
  } | null>(null)

  // Connection mode state
  const [connectingFromNodeId, setConnectingFromNodeId] = useState<string | null>(null)
  
  // Disconnect mode state - two-step selection
  const [selectedRoadForDisconnect, setSelectedRoadForDisconnect] = useState<string | null>(null)

  // Background images state
  const [backgroundImages, setBackgroundImages] = useState<BackgroundImage[]>([])

  // Add error state for polygon vertex placement
  const [polygonVertexError, setPolygonVertexError] = useState<string | null>(null)

  // Node dragging state for control points
  const [nodeDragStartPos, setNodeDragStartPos] = useState<{ x: number; y: number } | null>(null)
  const [nodeDragControlOffsets, setNodeDragControlOffsets] = useState<{
    [roadId: string]: { cp0: { x: number; y: number } | null; cp1: { x: number; y: number } | null }
  }>({})

  const [isMapNameModalOpen, setIsMapNameModalOpen] = useState(false)

  // Add new state for polygon drag start
  const [polygonDragStartMousePos, setPolygonDragStartMousePos] = useState<{ x: number; y: number } | null>(null)
  const [polygonDragStartPoints, setPolygonDragStartPoints] = useState<PolygonVertex[] | null>(null)

  const completeBuildSession = useCallback(() => {
    setBuildSession({
      nodes: [],
      isActive: false,
      roadType: RoadType.BEZIER,
      roadWidth: defaultRoadWidth,
      currentSegmentStartNodeIndex: null,
      isDraggingControlPoint: null,
    })
    setIsDraggingNewPointHandle(false)
  }, [defaultRoadWidth])

  const cancelBuildSession = useCallback(() => {
    setBuildSession({
      nodes: [],
      isActive: false,
      roadType: RoadType.BEZIER,
      roadWidth: defaultRoadWidth,
      currentSegmentStartNodeIndex: null,
      isDraggingControlPoint: null,
    })
    setIsDraggingNewPointHandle(false)
  }, [defaultRoadWidth])

  const completePolygonSession = useCallback(() => {
    if (polygonSession.points.length >= 2) {
      const polygonId = `polygon-${Date.now()}`

      const finalPoints = [...polygonSession.points]
      if (finalPoints.length >= 2) {
        const firstPoint = finalPoints[0]
        // To make a smooth closing loop, automatically adjust the first point's
        // incoming control point (cp1) to be a reflection of its outgoing control point (cp2).
        if (firstPoint.cp2) {
          firstPoint.cp1 = {
            x: firstPoint.x - (firstPoint.cp2.x - firstPoint.x),
            y: firstPoint.y - (firstPoint.cp2.y - firstPoint.y),
          }
        }
      }

      const area = calculatePolygonArea(finalPoints, scaleMetersPerPixel)

      const newPolygon: Polygon = {
        id: polygonId,
        name: "",
        points: finalPoints,
        roadIds: [...polygonSession.roadIds],
        fillColor: polygonSession.fillColor,
        strokeColor: polygonSession.strokeColor,
        opacity: polygonSession.opacity,
        area: area,
      }

      setPolygons((prev) => [...prev, newPolygon])
    }

    setPolygonSession({
      points: [],
      roadIds: [],
      isActive: false,
      fillColor: polygonSession.fillColor,
      strokeColor: polygonSession.strokeColor,
      opacity: polygonSession.opacity,
    })
  }, [polygonSession, scaleMetersPerPixel])

  const cancelPolygonSession = useCallback(() => {
    setPolygonSession({
      points: [],
      roadIds: [],
      isActive: false,
      fillColor: polygonSession.fillColor,
      strokeColor: polygonSession.strokeColor,
      opacity: polygonSession.opacity,
    })
  }, [polygonSession.fillColor, polygonSession.strokeColor, polygonSession.opacity])

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (buildSessionRef.current.isActive) {
        if (event.key === "Enter") {
          event.preventDefault()
          completeBuildSession()
        } else if (event.key === "Escape") {
          event.preventDefault()
          cancelBuildSession()
        }
      }
      
      if (polygonSession.isActive) {
        if (event.key === "Enter") {
          event.preventDefault()
          completePolygonSession()
        } else if (event.key === "Escape") {
          event.preventDefault()
          cancelPolygonSession()
        }
      }
      
      // Reset connection mode on Escape
      if (event.key === "Escape") {
        setConnectingFromNodeId(null)
        setSelectedRoadForDisconnect(null)
      }

      // Delete selected polygon with Delete key
      if (event.key === "Delete" && selectedPolygonId) {
        deletePolygon(selectedPolygonId)
      }
    }
    window.addEventListener("keydown", handleKeyDown)
    return () => {
      window.removeEventListener("keydown", handleKeyDown)
    }
  }, [completeBuildSession, cancelBuildSession, completePolygonSession, cancelPolygonSession, polygonSession.isActive, selectedPolygonId])

  const getWorldCoordinates = (e: MouseEvent<HTMLCanvasElement> | globalThis.MouseEvent): { x: number; y: number } => {
    const canvas = document.querySelector("canvas")
    if (!canvas) return { x: 0, y: 0 }
    const rect = canvas.getBoundingClientRect()
    const x = (e.clientX - rect.left - panOffset.x) / zoom
    const y = (e.clientY - rect.top - panOffset.y) / zoom
    return { x, y }
  }

  const findNearbyNode = (x: number, y: number, excludeIds: string[] = []): Node | null => {
    for (const node of nodes) {
      if (excludeIds.includes(node.id)) continue
      const distance = Math.sqrt((node.x - x) ** 2 + (node.y - y) ** 2)
      if (distance <= snapDistance / zoom) {
        return node
      }
    }
    return null
  }

  const findNearbyControlPoint = (worldCoords: { x: number; y: number }): {
    roadId: string
    pointIndex: 0 | 1
  } | null => {
    if (!selectedNodeId) return null
    const selectedNode = nodes.find((n) => n.id === selectedNodeId)
    if (!selectedNode) return null

    for (const roadId of selectedNode.connectedRoadIds) {
      const road = roads.find((r) => r.id === roadId)
      if (!road || road.type !== RoadType.BEZIER || !road.controlPoints) continue

      if (road.startNodeId === selectedNodeId) {
        const cp = road.controlPoints[0]
        const distance = Math.sqrt((cp.x - worldCoords.x) ** 2 + (cp.y - worldCoords.y) ** 2)
        if (distance < 10 / zoom) {
          return { roadId: road.id, pointIndex: 0 }
        }
      }
      if (road.endNodeId === selectedNodeId) {
        const cp = road.controlPoints[1]
        const distance = Math.sqrt((cp.x - worldCoords.x) ** 2 + (cp.y - worldCoords.y) ** 2)
        if (distance < 10 / zoom) {
          return { roadId: road.id, pointIndex: 1 }
        }
      }
    }
    return null
  }

  const findRoadAtPosition = (worldCoords: { x: number; y: number }): Road | null => {
    const clickTolerance = 5 / zoom
    for (const road of roads) {
      const roadHalfWidth = road.width / 2 / zoom
      const effectiveTolerance = roadHalfWidth + clickTolerance

      if (road.type === RoadType.BEZIER && road.controlPoints) {
        const samples = 20
        let p0 = road.start
        for (let i = 1; i <= samples; i++) {
          const t = i / samples
          const mt = 1 - t
          const p1x =
            mt * mt * mt * road.start.x +
            3 * mt * mt * t * road.controlPoints[0].x +
            3 * mt * t * t * road.controlPoints[1].x +
            t * t * t * road.end.x
          const p1y =
            mt * mt * mt * road.start.y +
            3 * mt * mt * t * road.controlPoints[0].y +
            3 * mt * t * t * road.controlPoints[1].y +
            t * t * t * road.end.y
          const p1 = { x: p1x, y: p1y }
          if (distToSegment(worldCoords, p0, p1) < effectiveTolerance) {
            return road
          }
          p0 = p1
        }
      }
    }
    return null
  }

  const findPolygonAtPosition = (worldCoords: { x: number; y: number }): Polygon | null => {
    // Check polygons in reverse order (last drawn first)
    for (let i = polygons.length - 1; i >= 0; i--) {
      const polygon = polygons[i]
      if (isPointInPolygon(worldCoords, polygon.points)) {
        return polygon
      }
    }
    return null
  }

  const findPolygonPointAtPosition = (worldCoords: { x: number; y: number }, polygonId: string): number | null => {
    const polygon = polygons.find(p => p.id === polygonId)
    if (!polygon) return null

    const tolerance = 8 / zoom
    for (let i = 0; i < polygon.points.length; i++) {
      const point = polygon.points[i]
      const distance = Math.sqrt((point.x - worldCoords.x) ** 2 + (point.y - worldCoords.y) ** 2)
      if (distance <= tolerance) {
        return i
      }
    }
    return null
  }

  const findNearbyPolygonControlPoint = (worldCoords: { x: number; y: number }): {
    polygonId: string
    pointIndex: number
    handle: "cp1" | "cp2"
  } | null => {
    if (!selectedPolygonId) return null
    const polygon = polygons.find((p) => p.id === selectedPolygonId)
    if (!polygon) return null

    for (let i = 0; i < polygon.points.length; i++) {
      const point = polygon.points[i]
      const tolerance = 10 / zoom

      if (point.cp1) {
        const distCp1 = Math.sqrt((point.cp1.x - worldCoords.x) ** 2 + (point.cp1.y - worldCoords.y) ** 2)
        if (distCp1 < tolerance) {
          return { polygonId: polygon.id, pointIndex: i, handle: "cp1" }
        }
      }

      if (point.cp2) {
        const distCp2 = Math.sqrt((point.cp2.x - worldCoords.x) ** 2 + (point.cp2.y - worldCoords.y) ** 2)
        if (distCp2 < tolerance) {
          return { polygonId: polygon.id, pointIndex: i, handle: "cp2" }
        }
      }
    }

    return null
  }

  const getSnappedPosition = (x: number, y: number, excludeNodeIds: string[] = []) => {
    const nearbyNode = findNearbyNode(x, y, excludeNodeIds)
    if (nearbyNode) {
      return { x: nearbyNode.x, y: nearbyNode.y, snappedToNodeId: nearbyNode.id, snappedToRoadId: null }
    }
    // --- New: Snap to road if close enough ---
    let closestRoad: Road | null = null
    let closestPoint: { x: number; y: number } | null = null
    let minDist = Infinity
    for (const road of roads) {
      let candidatePoint: { x: number; y: number } | null = null
      let dist = Infinity
      if (road.type === RoadType.BEZIER && road.controlPoints) {
        // Sample points along the bezier curve
        const samples = 30
        for (let i = 0; i <= samples; i++) {
          const t = i / samples
          const mt = 1 - t
          const bx = mt * mt * mt * road.start.x +
            3 * mt * mt * t * road.controlPoints[0].x +
            3 * mt * t * t * road.controlPoints[1].x +
            t * t * t * road.end.x
          const by = mt * mt * mt * road.start.y +
            3 * mt * mt * t * road.controlPoints[0].y +
            3 * mt * t * t * road.controlPoints[1].y +
            t * t * t * road.end.y
          const d = Math.sqrt((x - bx) ** 2 + (y - by) ** 2)
          if (d < dist) {
            dist = d
            candidatePoint = { x: bx, y: by }
          }
        }
      }
      if (candidatePoint && dist < minDist) {
        minDist = dist
        closestRoad = road
        closestPoint = candidatePoint
      }
    }
    if (closestRoad && minDist <= snapDistance / zoom) {
      return { x: closestPoint!.x, y: closestPoint!.y, snappedToNodeId: null, snappedToRoadId: closestRoad.id }
    }
    if (snapEnabled) {
      const gridSize = snapDistance
      return {
        x: Math.round(x / gridSize) * gridSize,
        y: Math.round(y / gridSize) * gridSize,
        snappedToNodeId: null,
        snappedToRoadId: null,
      }
    }
    return { x, y, snappedToNodeId: null, snappedToRoadId: null }
  }

  const createRoadBetweenNodes = (startNodeId: string, endNodeId: string) => {
    const startNode = nodes.find(n => n.id === startNodeId)
    const endNode = nodes.find(n => n.id === endNodeId)
    
    if (!startNode || !endNode) return
    
    // Allow circular roads (same start and end node)
    if (startNodeId === endNodeId) {
      // Create a circular road
      const roadId = `road-${Date.now()}`
      const radius = 50 // Default radius for circular road
      
      const newRoad: Road = {
        id: roadId,
        start: { x: startNode.x, y: startNode.y },
        end: { x: startNode.x, y: startNode.y },
        startNodeId: startNodeId,
        endNodeId: endNodeId,
        type: RoadType.BEZIER,
        width: defaultRoadWidth,
        name: "",
        controlPoints: [
          { x: startNode.x + radius, y: startNode.y - radius },
          { x: startNode.x - radius, y: startNode.y + radius }
        ]
      }
      
      setRoads(prev => [...prev, newRoad])
      setNodes(prev => prev.map(node => {
        if (node.id === startNodeId) {
          return {
            ...node,
            connectedRoadIds: [...node.connectedRoadIds, roadId]
          }
        }
        return node
      }))
      return
    }
    
    // Check if road already exists between these nodes
    const existingRoad = roads.find(road => 
      (road.startNodeId === startNodeId && road.endNodeId === endNodeId) ||
      (road.startNodeId === endNodeId && road.endNodeId === startNodeId)
    )
    
    if (existingRoad) return // Road already exists
    
    const roadId = `road-${Date.now()}`
    const newRoad: Road = {
      id: roadId,
      start: { x: startNode.x, y: startNode.y },
      end: { x: endNode.x, y: endNode.y },
      startNodeId: startNodeId,
      endNodeId: endNodeId,
      type: RoadType.BEZIER,
      width: defaultRoadWidth,
      name: "", // Default empty name
      controlPoints: [
        { x: startNode.x, y: startNode.y },
        { x: endNode.x, y: endNode.y }
      ]
    }
    
    setRoads(prev => [...prev, newRoad])
    setNodes(prev => prev.map(node => {
      if (node.id === startNodeId || node.id === endNodeId) {
        return {
          ...node,
          connectedRoadIds: [...node.connectedRoadIds, roadId]
        }
      }
      return node
    }))
  }

  const disconnectRoadFromNode = (roadId: string) => {
    const road = roads.find(r => r.id === roadId)
    if (!road) return
    
    // Remove the road entirely
    setRoads(prev => prev.filter(r => r.id !== roadId))
    
    // Update node connections
    setNodes(prev => prev.map(node => ({
      ...node,
      connectedRoadIds: node.connectedRoadIds.filter(id => id !== roadId)
    })))
    
    // Clear selection if this road was selected
    if (selectedRoadId === roadId) {
      setSelectedRoadId(null)
    }
    
    // Clear disconnect selection
    setSelectedRoadForDisconnect(null)
  }

  const createNode = (x: number, y: number) => {
    const snappedPos = getSnappedPosition(x, y)
    
    // Don't create if snapping to existing node
    if (snappedPos.snappedToNodeId) return
    
    const newNodeId = `node-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`
    const newNode: Node = {
      id: newNodeId,
      x: snappedPos.x,
      y: snappedPos.y,
      connectedRoadIds: [],
      controlPoints: [],
      cp1: { x: snappedPos.x, y: snappedPos.y },
      cp2: { x: snappedPos.x, y: snappedPos.y },
    }
    
    setNodes(prev => [...prev, newNode])
  }

  const handleMouseDown = (e: MouseEvent<HTMLCanvasElement>) => {
    const worldCoords = getWorldCoordinates(e)
    setMousePosition(worldCoords)

    if (drawingMode === "pan") {
      setIsPanning(true)
      setLastPanPoint({ x: e.clientX, y: e.clientY })
      return
    }

    if (drawingMode === "add-node") {
      createNode(worldCoords.x, worldCoords.y)
      return
    }

    if (drawingMode === "polygon") {
      if (!polygonSession.isActive) {
        // Start new polygon session - Pen Tool style
        const startVertex: PolygonVertex = {
          id: `pvertex-${Date.now()}`,
          x: worldCoords.x,
          y: worldCoords.y,
          cp1: { ...worldCoords }, // Handles are initially at the point itself
          cp2: { ...worldCoords },
        }
        setPolygonSession(prev => ({
          ...prev,
          isActive: true,
          points: [startVertex],
        }))
        setIsDraggingPolygonHandle(true) // Immediately allow dragging handles
      } else {
        // Add a new point to the existing polygon session
        const firstPoint = polygonSession.points[0]
        const distanceToFirst = Math.sqrt(
          (worldCoords.x - firstPoint.x) ** 2 + (worldCoords.y - firstPoint.y) ** 2
        )

        // If clicking near the first point and we have enough points, complete the polygon
        if (distanceToFirst < (10 / zoom) && polygonSession.points.length >= 2) {
          completePolygonSession()
          return
        }

        // Add new vertex
        const newVertex: PolygonVertex = {
          id: `pvertex-${Date.now()}`,
          x: worldCoords.x,
          y: worldCoords.y,
          cp1: { ...worldCoords },
          cp2: { ...worldCoords },
        }

        setPolygonSession(prev => ({
          ...prev,
          points: [...prev.points, newVertex],
        }))
        setIsDraggingPolygonHandle(true) // Drag handles for the new point
      }
      return
    }

    if (drawingMode === "select") {
      // Unified select mode - check for control points first, then nodes, then polygons, then roads
      const clickedPolygonControlPoint = findNearbyPolygonControlPoint(worldCoords)
      if (clickedPolygonControlPoint) {
        setDraggedPolygonControlPointInfo(clickedPolygonControlPoint)
        setIsDraggingNode(false)
        setIsDraggingPolygon(false)
        setIsDraggingPolygonPoint(false)
        return
      }

      const clickedControlPoint = findNearbyControlPoint(worldCoords)
      if (clickedControlPoint) {
        setIsDraggingNode(false)
        setDraggedControlPointInfo(clickedControlPoint)
        return
      }

      const clickedNode = findNearbyNode(worldCoords.x, worldCoords.y)
      if (clickedNode) {
        setSelectedNodeId(clickedNode.id)
        setSelectedRoadId(null)
        setSelectedPolygonId(null)
        setIsDraggingNode(true)
        setDraggedNodeId(clickedNode.id)
        
        // Store initial node position and control point offsets
        setNodeDragStartPos({ x: clickedNode.x, y: clickedNode.y })
        
        // Calculate and store control point offsets for all connected roads
        const controlOffsets: { [roadId: string]: { cp0: { x: number; y: number } | null; cp1: { x: number; y: number } | null } } = {}
        
        for (const roadId of clickedNode.connectedRoadIds) {
          const road = roads.find(r => r.id === roadId)
          if (road && road.type === RoadType.BEZIER && road.controlPoints) {
            if (road.startNodeId === clickedNode.id) {
              controlOffsets[roadId] = {
                cp0: {
                  x: road.controlPoints[0].x - clickedNode.x,
                  y: road.controlPoints[0].y - clickedNode.y
                },
                cp1: null
              }
            } else if (road.endNodeId === clickedNode.id) {
              controlOffsets[roadId] = {
                cp0: null,
                cp1: {
                  x: road.controlPoints[1].x - clickedNode.x,
                  y: road.controlPoints[1].y - clickedNode.y
                }
              }
            }
          }
        }
        setNodeDragControlOffsets(controlOffsets)
        return
      }

      const clickedPolygon = findPolygonAtPosition(worldCoords)
      if (clickedPolygon) {
        setSelectedPolygonId(clickedPolygon.id)
        setSelectedRoadId(null)
        setSelectedNodeId(null)

        // Check if clicking on a polygon point for editing
        const pointIndex = findPolygonPointAtPosition(worldCoords, clickedPolygon.id)
        if (pointIndex !== null) {
          setIsDraggingPolygonPoint(true)
          setDraggedPolygonPointIndex(pointIndex)
        } else {
          // Start dragging the entire polygon
          setIsDraggingPolygon(true)
          // Store initial mouse position and polygon points for accurate dragging
          setPolygonDragStartMousePos(worldCoords)
          setPolygonDragStartPoints(clickedPolygon.points.map(p => ({ 
            ...p, 
            cp1: { ...p.cp1 },
            cp2: { ...p.cp2 }
          })))
        }
        return
      }
      
      const clickedRoad = findRoadAtPosition(worldCoords)
      if (clickedRoad) {
        setSelectedRoadId(clickedRoad.id)
        setSelectedNodeId(null)
        setSelectedPolygonId(null)
      } else {
        setSelectedRoadId(null)
        setSelectedNodeId(null)
        setSelectedPolygonId(null)
      }
      return
    }

    if (drawingMode === "connect") {
      const clickedNode = findNearbyNode(worldCoords.x, worldCoords.y)
      if (clickedNode) {
        if (!connectingFromNodeId) {
          // Start connection from this node
          setConnectingFromNodeId(clickedNode.id)
          setSelectedNodeId(clickedNode.id)
        } else {
          // Complete connection to this node (allow same node for circular roads)
          createRoadBetweenNodes(connectingFromNodeId, clickedNode.id)
          setConnectingFromNodeId(null)
          setSelectedNodeId(null)
        }
      } else {
        // Clicked empty space, cancel connection
        setConnectingFromNodeId(null)
        setSelectedNodeId(null)
      }
      return
    }

    if (drawingMode === "disconnect") {
      const clickedRoad = findRoadAtPosition(worldCoords)
      
      if (!selectedRoadForDisconnect) {
        // First click: select road to disconnect
        if (clickedRoad) {
          setSelectedRoadForDisconnect(clickedRoad.id)
          setSelectedRoadId(clickedRoad.id)
        }
      } else {
        // Second click: confirm deletion
        if (clickedRoad && clickedRoad.id === selectedRoadForDisconnect) {
          disconnectRoadFromNode(clickedRoad.id)
        } else {
          // Clicked different road or empty space, select new road or cancel
          if (clickedRoad) {
            setSelectedRoadForDisconnect(clickedRoad.id)
            setSelectedRoadId(clickedRoad.id)
          } else {
            setSelectedRoadForDisconnect(null)
            setSelectedRoadId(null)
          }
        }
      }
      return
    }

    if (drawingMode === "nodes") {
      const snappedPos = getSnappedPosition(worldCoords.x, worldCoords.y)
      const currentSession = buildSessionRef.current

      // --- New: If snapping to a road, split the road and insert a node ---
      if (snappedPos.snappedToRoadId) {
        const roadToSplit = roads.find(r => r.id === snappedPos.snappedToRoadId)
        if (roadToSplit) {
          const newNodeId = `node-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`
          const newNode: Node = {
            id: newNodeId,
            x: snappedPos.x,
            y: snappedPos.y,
            connectedRoadIds: [],
            controlPoints: [],
            cp1: { x: snappedPos.x, y: snappedPos.y },
            cp2: { x: snappedPos.x, y: snappedPos.y },
          }
          setRoads(prev => prev.filter(r => r.id !== roadToSplit.id))

          // --- Improved: If bezier, split using de Casteljau ---
          if (roadToSplit.type === RoadType.BEZIER && roadToSplit.controlPoints) {
            // Find closest t on bezier to snappedPos
            let minDist = Infinity
            let bestT = 0.5
            for (let i = 0; i <= 100; i++) {
              const t = i / 100
              const mt = 1 - t
              const bx = mt * mt * mt * roadToSplit.start.x +
                3 * mt * mt * t * roadToSplit.controlPoints[0].x +
                3 * mt * t * t * roadToSplit.controlPoints[1].x +
                t * t * t * roadToSplit.end.x
              const by = mt * mt * mt * roadToSplit.start.y +
                3 * mt * mt * t * roadToSplit.controlPoints[0].y +
                3 * mt * t * t * roadToSplit.controlPoints[1].y +
                t * t * t * roadToSplit.end.y
              const d = Math.sqrt((snappedPos.x - bx) ** 2 + (snappedPos.y - by) ** 2)
              if (d < minDist) {
                minDist = d
                bestT = t
              }
            }
            // Split bezier at bestT
            const split = splitCubicBezier(
              roadToSplit.start,
              roadToSplit.controlPoints[0],
              roadToSplit.controlPoints[1],
              roadToSplit.end,
              bestT
            )
            // left: [start, c1, c2, split]
            // right: [split, c3, c4, end]
            const roadId1 = `road-${Date.now()}-a`
            const roadId2 = `road-${Date.now()}-b`
            const newRoad1: Road = {
              id: roadId1,
              start: { ...split.left[0] },
              end: { ...split.left[3] },
              startNodeId: roadToSplit.startNodeId,
              endNodeId: newNodeId,
              type: RoadType.BEZIER,
              width: roadToSplit.width,
              name: roadToSplit.name ? roadToSplit.name + " (1)" : "",
              controlPoints: [split.left[1], split.left[2]],
            }
            const newRoad2: Road = {
              id: roadId2,
              start: { ...split.right[0] },
              end: { ...split.right[3] },
              startNodeId: newNodeId,
              endNodeId: roadToSplit.endNodeId,
              type: RoadType.BEZIER,
              width: roadToSplit.width,
              name: roadToSplit.name ? roadToSplit.name + " (2)" : "",
              controlPoints: [split.right[1], split.right[2]],
            }
            setRoads(prev => [...prev, newRoad1, newRoad2])
            setNodes(prev => prev.map(n => {
              if (n.id === roadToSplit.startNodeId) {
                return { ...n, connectedRoadIds: [...n.connectedRoadIds.filter(id => id !== roadToSplit.id), roadId1] }
              }
              if (n.id === roadToSplit.endNodeId) {
                return { ...n, connectedRoadIds: [...n.connectedRoadIds.filter(id => id !== roadToSplit.id), roadId2] }
              }
              return n
            }))
            setNodes(prev => [...prev, { ...newNode, connectedRoadIds: [roadId1, roadId2] }])
            if (currentSession.isActive) {
              setBuildSession(prev => ({
                ...prev,
                nodes: [...prev.nodes, { ...newNode }],
                roadType: RoadType.BEZIER,
              }))
              setIsDraggingNewPointHandle(true)
            } else {
              setBuildSession({
                nodes: [{ ...newNode }],
                isActive: true,
                roadType: RoadType.BEZIER,
                roadWidth: defaultRoadWidth,
                currentSegmentStartNodeIndex: 0,
              })
              setIsDraggingNewPointHandle(true)
            }
            return
          }
          // --- End improved bezier split ---

          // Default: BEZIER or other types
          const roadId1 = `road-${Date.now()}-a`
          const roadId2 = `road-${Date.now()}-b`
          const newRoad1: Road = {
            id: roadId1,
            start: { ...roadToSplit.start },
            end: { x: snappedPos.x, y: snappedPos.y },
            startNodeId: roadToSplit.startNodeId,
            endNodeId: newNodeId,
            type: roadToSplit.type,
            width: roadToSplit.width,
            name: roadToSplit.name ? roadToSplit.name + " (1)" : "",
          }
          const newRoad2: Road = {
            id: roadId2,
            start: { x: snappedPos.x, y: snappedPos.y },
            end: { ...roadToSplit.end },
            startNodeId: newNodeId,
            endNodeId: roadToSplit.endNodeId,
            type: roadToSplit.type,
            width: roadToSplit.width,
            name: roadToSplit.name ? roadToSplit.name + " (2)" : "",
          }
          setRoads(prev => [...prev, newRoad1, newRoad2])
          setNodes(prev => prev.map(n => {
            if (n.id === roadToSplit.startNodeId) {
              return { ...n, connectedRoadIds: [...n.connectedRoadIds.filter(id => id !== roadToSplit.id), roadId1] }
            }
            if (n.id === roadToSplit.endNodeId) {
              return { ...n, connectedRoadIds: [...n.connectedRoadIds.filter(id => id !== roadToSplit.id), roadId2] }
            }
            return n
          }))
          setNodes(prev => [...prev, { ...newNode, connectedRoadIds: [roadId1, roadId2] }])
          if (currentSession.isActive) {
            setBuildSession(prev => ({
              ...prev,
              nodes: [...prev.nodes, { ...newNode }],
              roadType: RoadType.BEZIER,
            }))
            setIsDraggingNewPointHandle(true)
          } else {
            setBuildSession({
              nodes: [{ ...newNode }],
              isActive: true,
              roadType: RoadType.BEZIER,
              roadWidth: defaultRoadWidth,
              currentSegmentStartNodeIndex: 0,
            })
            setIsDraggingNewPointHandle(true)
          }
          return
        }
      }

      if (currentSession.isActive) {
        const firstNodeInSession = currentSession.nodes[0]
        
        // Check for closing the path by clicking on the first node
        if (
          snappedPos.snappedToNodeId &&
          snappedPos.snappedToNodeId === firstNodeInSession.id &&
          currentSession.nodes.length > 2
        ) {
          const lastPointInSession = currentSession.nodes[currentSession.nodes.length - 1]
          const roadId = `road-${Date.now()}`
          let closingRoad: Road

          const isLastSegmentBezier = buildSessionRef.current.roadType === RoadType.BEZIER

          if (isLastSegmentBezier && lastPointInSession.cp2) {
            const cp2ForStartOfClosingRoad = lastPointInSession.cp2
            const cp1ForEndOfClosingRoad = {
              x: firstNodeInSession.x - (lastPointInSession.cp2.x - lastPointInSession.x),
              y: firstNodeInSession.y - (lastPointInSession.cp2.y - lastPointInSession.y),
            }
            closingRoad = {
              id: roadId,
              start: { x: lastPointInSession.x, y: lastPointInSession.y },
              end: { x: firstNodeInSession.x, y: firstNodeInSession.y },
              startNodeId: lastPointInSession.id,
              endNodeId: firstNodeInSession.id,
              type: RoadType.BEZIER,
              width: currentSession.roadWidth,
              name: "", // Default empty name
              controlPoints: [cp2ForStartOfClosingRoad, cp1ForEndOfClosingRoad],
            }
          } else {
            closingRoad = {
              id: roadId,
              start: { x: lastPointInSession.x, y: lastPointInSession.y },
              end: { x: firstNodeInSession.x, y: firstNodeInSession.y },
              startNodeId: lastPointInSession.id,
              endNodeId: firstNodeInSession.id,
              type: RoadType.BEZIER,
              width: currentSession.roadWidth,
              name: "", // Default empty name
            }
          }
          setRoads((prev) => [...prev, closingRoad])
          setNodes((prevNodes) =>
            prevNodes.map((n) => {
              if (n.id === lastPointInSession.id || n.id === firstNodeInSession.id) {
                return { ...n, connectedRoadIds: [...n.connectedRoadIds, roadId] }
              }
              return n
            }),
          )
          completeBuildSession()
          return
        }

        // Add new point to existing session
        const existingNodeInfo = snappedPos.snappedToNodeId
          ? nodes.find((n) => n.id === snappedPos.snappedToNodeId)
          : null
        const newNodeId =
          snappedPos.snappedToNodeId || `node-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`

        const newPoint: NodePoint = {
          id: newNodeId,
          x: snappedPos.x,
          y: snappedPos.y,
          connectedRoadIds: existingNodeInfo ? existingNodeInfo.connectedRoadIds : [],
          controlPoints: existingNodeInfo ? existingNodeInfo.controlPoints : [],
          cp1: { x: snappedPos.x, y: snappedPos.y },
          cp2: { x: snappedPos.x, y: snappedPos.y },
        }

        setBuildSession((prev) => ({
          ...prev,
          nodes: [...prev.nodes, newPoint],
          roadType: RoadType.BEZIER,
        }))
        setIsDraggingNewPointHandle(true)
      } else {
        // Start new session
        let startNodePoint: NodePoint
        const existingNode = snappedPos.snappedToNodeId ? nodes.find((n) => n.id === snappedPos.snappedToNodeId) : null

        if (existingNode) {
          startNodePoint = {
            ...existingNode,
            cp1: existingNode.cp1 || { x: existingNode.x, y: existingNode.y },
            cp2: existingNode.cp2 || { x: existingNode.x, y: existingNode.y },
          }
        } else {
          const newNodeId = `node-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`
          startNodePoint = {
            id: newNodeId,
            x: snappedPos.x,
            y: snappedPos.y,
            connectedRoadIds: [],
            controlPoints: [],
            cp1: { x: snappedPos.x, y: snappedPos.y },
            cp2: { x: snappedPos.x, y: snappedPos.y },
          }
          setNodes((prev) => [
            ...prev,
            {
              id: startNodePoint.id,
              x: startNodePoint.x,
              y: startNodePoint.y,
              connectedRoadIds: [],
              controlPoints: [],
              cp1: startNodePoint.cp1,
              cp2: startNodePoint.cp2,
            },
          ])
        }

        setBuildSession({
          nodes: [startNodePoint],
          isActive: true,
          roadType: RoadType.BEZIER,
          roadWidth: defaultRoadWidth,
          currentSegmentStartNodeIndex: 0,
        })
        setIsDraggingNewPointHandle(true)
      }
    }
  }

  const handleMouseMove = (e: MouseEvent<HTMLCanvasElement> | globalThis.MouseEvent) => {
    const worldCoords = getWorldCoordinates(e)
    setMousePosition(worldCoords)

    if (isPanning) {
      const deltaX = e.clientX - lastPanPoint.x
      const deltaY = e.clientY - lastPanPoint.y
      setPanOffset((prev) => ({ x: prev.x + deltaX, y: prev.y + deltaY }))
      setLastPanPoint({ x: e.clientX, y: e.clientY })
      return
    }

    if (draggedPolygonControlPointInfo) {
      const { polygonId, pointIndex, handle } = draggedPolygonControlPointInfo
      const maintainSymmetry = !e.shiftKey // Break symmetry if Shift is held

      setPolygons((prevPolygons) =>
        prevPolygons.map((p) => {
          if (p.id === polygonId) {
            const newPoints = [...p.points]
            const pointToUpdate = { ...newPoints[pointIndex] }

            pointToUpdate[handle] = { x: worldCoords.x, y: worldCoords.y }

            if (maintainSymmetry) {
              const dx = worldCoords.x - pointToUpdate.x
              const dy = worldCoords.y - pointToUpdate.y

              if (handle === "cp1") {
                pointToUpdate.cp2 = { x: pointToUpdate.x - dx, y: pointToUpdate.y - dy }
              } else {
                // handle === 'cp2'
                pointToUpdate.cp1 = { x: pointToUpdate.x - dx, y: pointToUpdate.y - dy }
              }
            }

            newPoints[pointIndex] = pointToUpdate

            return {
              ...p,
              points: newPoints,
              area: calculatePolygonArea(newPoints, scaleMetersPerPixel),
            }
          }
          return p
        }),
      )
      return
    }

    if (isDraggingPolygon && selectedPolygonId && polygonDragStartMousePos && polygonDragStartPoints) {
      const dx = worldCoords.x - polygonDragStartMousePos.x
      const dy = worldCoords.y - polygonDragStartMousePos.y
      setPolygons(prev => prev.map(p => {
        if (p.id === selectedPolygonId) {
          const newPoints = polygonDragStartPoints.map(v => ({ 
            ...v,
            x: v.x + dx, 
            y: v.y + dy,
            cp1: { x: v.cp1.x + dx, y: v.cp1.y + dy },
            cp2: { x: v.cp2.x + dx, y: v.cp2.y + dy },
          }))
          return {
            ...p,
            points: newPoints,
            area: calculatePolygonArea(newPoints, scaleMetersPerPixel)
          }
        }
        return p
      }))
      return
    }

    if (isDraggingPolygonPoint && selectedPolygonId && draggedPolygonPointIndex !== null) {
      const snappedPos = getSnappedPosition(worldCoords.x, worldCoords.y)
      setPolygons(prev => prev.map(p => {
        if (p.id === selectedPolygonId) {
          const newPoints = [...p.points]
          const oldPoint = newPoints[draggedPolygonPointIndex]
          const dx = snappedPos.x - oldPoint.x
          const dy = snappedPos.y - oldPoint.y
          
          newPoints[draggedPolygonPointIndex] = { 
            ...oldPoint,
            x: snappedPos.x, 
            y: snappedPos.y,
            cp1: { x: oldPoint.cp1.x + dx, y: oldPoint.cp1.y + dy },
            cp2: { x: oldPoint.cp2.x + dx, y: oldPoint.cp2.y + dy },
           }
          return {
            ...p,
            points: newPoints,
            area: calculatePolygonArea(newPoints, scaleMetersPerPixel)
          }
        }
        return p
      }))
      return
    }

    if (draggedControlPointInfo) {
      const { roadId, pointIndex } = draggedControlPointInfo
      setRoads((prevRoads) =>
        prevRoads.map((r) => {
          if (r.id === roadId && r.controlPoints) {
            const newControlPoints = [...r.controlPoints] as [{ x: number; y: number }, { x: number; y: number }]
            newControlPoints[pointIndex] = { x: worldCoords.x, y: worldCoords.y }
            return { ...r, controlPoints: newControlPoints }
          }
          return r
        }),
      )
      return
    }

    if (isDraggingNode && draggedNodeId && nodeDragStartPos) {
      const node = nodes.find((n) => n.id === draggedNodeId)
      if (node) {
        const snappedPos = getSnappedPosition(worldCoords.x, worldCoords.y, [draggedNodeId])
        
        setNodes((prev) => prev.map((n) => (n.id === draggedNodeId ? { ...n, ...snappedPos } : n)))
        
        // Update roads and their control points using stored offsets
        setRoads((prevRoads) =>
          prevRoads.map((r) => {
            if (r.startNodeId === draggedNodeId) {
              const updatedRoad = { ...r, start: { x: snappedPos.x, y: snappedPos.y } }
              // Update control points if this is a bezier road
              if (r.type === RoadType.BEZIER && r.controlPoints && nodeDragControlOffsets[r.id]?.cp0) {
                const newControlPoints = [...r.controlPoints] as [{ x: number; y: number }, { x: number; y: number }]
                const offset = nodeDragControlOffsets[r.id].cp0!
                // Use stored offset to maintain constant distance and direction
                newControlPoints[0] = {
                  x: snappedPos.x + offset.x,
                  y: snappedPos.y + offset.y
                }
                updatedRoad.controlPoints = newControlPoints
              }
              return updatedRoad
            }
            if (r.endNodeId === draggedNodeId) {
              const updatedRoad = { ...r, end: { x: snappedPos.x, y: snappedPos.y } }
              // Update control points if this is a bezier road
              if (r.type === RoadType.BEZIER && r.controlPoints && nodeDragControlOffsets[r.id]?.cp1) {
                const newControlPoints = [...r.controlPoints] as [{ x: number; y: number }, { x: number; y: number }]
                const offset = nodeDragControlOffsets[r.id].cp1!
                // Use stored offset to maintain constant distance and direction
                newControlPoints[1] = {
                  x: snappedPos.x + offset.x,
                  y: snappedPos.y + offset.y
                }
                updatedRoad.controlPoints = newControlPoints
              }
              return updatedRoad
            }
            return r
          }),
        )
      }
      return
    }

    const currentSession = buildSessionRef.current
    if (
      drawingMode === "nodes" &&
      currentSession.isActive &&
      isDraggingNewPointHandle &&
      currentSession.nodes.length > 0
    ) {
      const currentPointIndex = currentSession.nodes.length - 1
      const currentPoint = currentSession.nodes[currentPointIndex]

      const dx = worldCoords.x - currentPoint.x
      const dy = worldCoords.y - currentPoint.y

      const newCp2 = { x: currentPoint.x + dx, y: currentPoint.y + dy }
      const newCp1ForCurrent = { x: currentPoint.x - dx, y: currentPoint.y - dy }

      setBuildSession((prev) => {
        const updatedNodes = [...prev.nodes]
        updatedNodes[currentPointIndex] = {
          ...updatedNodes[currentPointIndex],
          cp1: newCp1ForCurrent,
          cp2: newCp2,
        }
        return {
          ...prev,
          nodes: updatedNodes,
          roadType: RoadType.BEZIER,
        }
      })
    }

    if (isDraggingPolygonHandle && polygonSession.isActive && polygonSession.points.length > 0) {
      const currentPointIndex = polygonSession.points.length - 1
      const currentPoint = polygonSession.points[currentPointIndex]
  
      const dx = worldCoords.x - currentPoint.x
      const dy = worldCoords.y - currentPoint.y
  
      // This creates the outgoing handle (cp2)
      const newCp2 = { x: currentPoint.x + dx, y: currentPoint.y + dy }
      // The incoming handle (cp1) is a reflection to maintain a smooth curve
      const newCp1 = { x: currentPoint.x - dx, y: currentPoint.y - dy }
  
      setPolygonSession(prev => {
          const updatedPoints = [...prev.points]
          updatedPoints[currentPointIndex] = {
              ...updatedPoints[currentPointIndex],
              cp1: newCp1,
              cp2: newCp2,
          }
          return { ...prev, points: updatedPoints }
      })
    }
  }

  const handleMouseUp = (e: MouseEvent<HTMLCanvasElement> | globalThis.MouseEvent) => {
    setIsPanning(false)
    setIsDraggingNode(false)
    setDraggedNodeId(null)
    setDraggedControlPointInfo(null)
    setDraggedPolygonControlPointInfo(null)
    setIsDraggingPolygon(false)
    setIsDraggingPolygonPoint(false)
    setDraggedPolygonPointIndex(null)
    const wasDraggingPolygonHandle = isDraggingPolygonHandle
    setIsDraggingPolygonHandle(false)
    
    // Clear node dragging state
    setNodeDragStartPos(null)
    setNodeDragControlOffsets({})
    // Clear polygon drag start state
    setPolygonDragStartMousePos(null)
    setPolygonDragStartPoints(null)

    const currentSession = buildSessionRef.current
    const wasDraggingHandle = isDraggingNewPointHandle
    setIsDraggingNewPointHandle(false)

    if (wasDraggingPolygonHandle) {
      // The polygon vertex and its handles have been set on mouse move.
      // Nothing more to do here for the Pen Tool logic.
    }

    if (drawingMode === "nodes" && currentSession.isActive) {
      if (currentSession.nodes.length >= 2) {
        const lastPoint = currentSession.nodes[currentSession.nodes.length - 1]
        const secondLastPoint = currentSession.nodes[currentSession.nodes.length - 2]

        const newNodesToAdd: Node[] = []
        if (!nodes.find((n) => n.id === secondLastPoint.id)) {
          newNodesToAdd.push({
            id: secondLastPoint.id,
            x: secondLastPoint.x,
            y: secondLastPoint.y,
            connectedRoadIds: secondLastPoint.connectedRoadIds || [],
            cp1: secondLastPoint.cp1,
            cp2: secondLastPoint.cp2,
            controlPoints: secondLastPoint.controlPoints,
          })
        }
        if (!nodes.find((n) => n.id === lastPoint.id)) {
          newNodesToAdd.push({
            id: lastPoint.id,
            x: lastPoint.x,
            y: lastPoint.y,
            connectedRoadIds: lastPoint.connectedRoadIds || [],
            cp1: lastPoint.cp1,
            cp2: lastPoint.cp2,
            controlPoints: lastPoint.controlPoints,
          })
        }
        if (newNodesToAdd.length > 0) {
          setNodes((prev) => [...prev, ...newNodesToAdd])
        }

        const roadId = `road-${Date.now()}`
        let newRoad: Road

        if (currentSession.roadType === RoadType.BEZIER && wasDraggingHandle) {
          const cp2_start = secondLastPoint.cp2 || { x: secondLastPoint.x, y: secondLastPoint.y }
          const cp1_end = lastPoint.cp1 || { x: lastPoint.x, y: lastPoint.y }
          newRoad = {
            id: roadId,
            start: { x: secondLastPoint.x, y: secondLastPoint.y },
            end: { x: lastPoint.x, y: lastPoint.y },
            startNodeId: secondLastPoint.id,
            endNodeId: lastPoint.id,
            type: RoadType.BEZIER,
            width: currentSession.roadWidth,
            name: "", // Default empty name
            controlPoints: [cp2_start, cp1_end],
          }
        } else {
          newRoad = {
            id: roadId,
            start: { x: secondLastPoint.x, y: secondLastPoint.y },
            end: { x: lastPoint.x, y: lastPoint.y },
            startNodeId: secondLastPoint.id,
            endNodeId: lastPoint.id,
            type: RoadType.BEZIER,
            width: currentSession.roadWidth,
            name: "", // Default empty name
            controlPoints: [
              { x: secondLastPoint.x, y: secondLastPoint.y },
              { x: lastPoint.x, y: lastPoint.y },
            ],
          }
        }
        setRoads((prev) => [...prev, newRoad])

        setNodes((prevNodes) =>
          prevNodes.map((n) => {
            if (n.id === secondLastPoint.id || n.id === lastPoint.id) {
              const updatedNode = { ...n, connectedRoadIds: [...new Set([...n.connectedRoadIds, roadId])] }
              if (n.id === secondLastPoint.id && newRoad.type === RoadType.BEZIER && newRoad.controlPoints) {
                updatedNode.cp2 = newRoad.controlPoints[0]
              } else if (n.id === secondLastPoint.id && newRoad.type === RoadType.BEZIER) {
                updatedNode.cp2 = { x: n.x, y: n.y }
              }
              if (n.id === lastPoint.id && newRoad.type === RoadType.BEZIER && newRoad.controlPoints) {
                updatedNode.cp1 = newRoad.controlPoints[1]
              } else if (n.id === lastPoint.id && newRoad.type === RoadType.BEZIER) {
                updatedNode.cp1 = { x: n.x, y: n.y }
              }
              return updatedNode
            }
            return n
          }),
        )

        setBuildSession((prevSession) => {
          const updatedSessionNodes = prevSession.nodes.map((node, index) => {
            if (index === prevSession.nodes.length - 1) {
              return {
                ...node,
                cp2: { x: node.x, y: node.y },
                cp1: prevSession.nodes.length === 1 ? { x: node.x, y: node.y } : node.cp1,
              }
            }
            return node
          })

          return {
            ...prevSession,
            nodes: updatedSessionNodes,
            currentSegmentStartNodeIndex: updatedSessionNodes.length - 1,
            roadType: RoadType.BEZIER,
            isDraggingControlPoint: null,
          }
        })
      }
    }
  }

  useEffect(() => {
    const handleGlobalMouseMove = (event: globalThis.MouseEvent) => {
      if (
        isPanning ||
        draggedControlPointInfo ||
        (drawingMode === "nodes" && buildSessionRef.current.isActive && isDraggingNewPointHandle) ||
        isDraggingNode ||
        isDraggingPolygon ||
        isDraggingPolygonPoint ||
        isDraggingPolygonHandle ||
        draggedPolygonControlPointInfo
      ) {
        handleMouseMove(event as any)
      }
    }
    const handleGlobalMouseUp = (event: globalThis.MouseEvent) => {
      if (
        isPanning ||
        draggedControlPointInfo ||
        (drawingMode === "nodes" && buildSessionRef.current.isActive && isDraggingNewPointHandle) ||
        isDraggingNode ||
        isDraggingPolygon ||
        isDraggingPolygonPoint ||
        isDraggingPolygonHandle ||
        draggedPolygonControlPointInfo
      ) {
        handleMouseUp(event as any)
      }
    }

    if (
      isPanning ||
      draggedControlPointInfo ||
      (drawingMode === "nodes" && buildSessionRef.current.isActive && isDraggingNewPointHandle) ||
      isDraggingNode ||
      isDraggingPolygon ||
      isDraggingPolygonPoint ||
      isDraggingPolygonHandle ||
      draggedPolygonControlPointInfo
    ) {
      window.addEventListener("mousemove", handleGlobalMouseMove)
      window.addEventListener("mouseup", handleGlobalMouseUp)
    }
    return () => {
      window.removeEventListener("mousemove", handleGlobalMouseMove)
      window.removeEventListener("mouseup", handleGlobalMouseUp)
    }
  }, [isPanning, draggedControlPointInfo, drawingMode, isDraggingNewPointHandle, isDraggingNode, isDraggingPolygon, isDraggingPolygonPoint, isDraggingPolygonHandle, panOffset, zoom, draggedPolygonControlPointInfo])

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

  const deleteNode = (nodeId: string) => {
    const nodeToDelete = nodes.find((n) => n.id === nodeId)
    if (!nodeToDelete) return

    const roadsToRemove = roads.filter((r) => r.startNodeId === nodeId || r.endNodeId === nodeId)
    const roadIdsToRemove = roadsToRemove.map((r) => r.id)

    setRoads((prev) => prev.filter((r) => !roadIdsToRemove.includes(r.id)))
    setNodes((prev) =>
      prev
        .filter((n) => n.id !== nodeId)
        .map((n) => ({
          ...n,
          connectedRoadIds: n.connectedRoadIds.filter((id) => !roadIdsToRemove.includes(id)),
        })),
    )
    if (selectedNodeId === nodeId) setSelectedNodeId(null)
    if (buildSessionRef.current.isActive && buildSessionRef.current.nodes.some((n) => n.id === nodeId)) {
      cancelBuildSession()
    }
  }

  const deleteRoad = (roadId: string) => {
    const roadToDelete = roads.find((r) => r.id === roadId)
    if (!roadToDelete) return

    setRoads((prev) => prev.filter((r) => r.id !== roadId))
    setNodes((prev) =>
      prev.map((n) => ({
        ...n,
        connectedRoadIds: n.connectedRoadIds.filter((id) => id !== roadId),
      })),
    )
    if (selectedRoadId === roadId) setSelectedRoadId(null)
  }

  const deletePolygon = (polygonId: string) => {
    setPolygons((prev) => prev.filter((p) => p.id !== polygonId))
    if (selectedPolygonId === polygonId) setSelectedPolygonId(null)
  }

  const clearCanvas = () => {
    setNodes([])
    setRoads([])
    setPolygons([])
    setBackgroundImages([])
    cancelBuildSession()
    cancelPolygonSession()
    setSelectedNodeId(null)
    setSelectedRoadId(null)
    setSelectedPolygonId(null)
    setConnectingFromNodeId(null)
    setSelectedRoadForDisconnect(null)
  }

  const removeLastElement = () => {
    const currentSession = buildSessionRef.current
    if (currentSession.isActive && currentSession.nodes.length > 0) {
      if (currentSession.nodes.length === 1) {
        const startNodeId = currentSession.nodes[0].id
        cancelBuildSession()
        const nodeToRemove = nodes.find((n) => n.id === startNodeId && n.connectedRoadIds.length === 0)
        if (nodeToRemove && !roads.some((r) => r.startNodeId === startNodeId || r.endNodeId === startNodeId)) {
          setNodes((prev) => prev.filter((n) => n.id !== startNodeId))
        }
        return
      }

      const roadToRemove = roads.find(
        (r) =>
          r.endNodeId === currentSession.nodes[currentSession.nodes.length - 1].id &&
          r.startNodeId === currentSession.nodes[currentSession.nodes.length - 2]?.id,
      )
      if (roadToRemove) {
        deleteRoad(roadToRemove.id)
      }

      const lastPointRemoved = currentSession.nodes[currentSession.nodes.length - 1]
      const remainingNodesInSession = currentSession.nodes.slice(0, -1)

      setBuildSession((prev) => ({
        ...prev,
        nodes: remainingNodesInSession,
        roadType: remainingNodesInSession.length > 1 ? prev.roadType : RoadType.BEZIER,
      }))

      const nodeInMainList = nodes.find((n) => n.id === lastPointRemoved.id)
      if (
        nodeInMainList &&
        nodeInMainList.connectedRoadIds.length === 0 &&
        !roads.some((r) => r.startNodeId === lastPointRemoved.id || r.endNodeId === lastPointRemoved.id)
      ) {
        const updatedNode = nodes.find((n) => n.id === lastPointRemoved.id)
        if (updatedNode && updatedNode.connectedRoadIds.length === 0) {
          setNodes((prev) => prev.filter((n) => n.id !== lastPointRemoved.id))
        }
      }
    } else if (polygonSession.isActive && polygonSession.points.length > 0) {
      // Remove last point from polygon session
      setPolygonSession(prev => ({
        ...prev,
        points: prev.points.slice(0, -1),
      }))
    } else if (polygons.length > 0) {
      const lastPolygon = polygons[polygons.length - 1]
      deletePolygon(lastPolygon.id)
    } else if (roads.length > 0) {
      const lastRoad = roads[roads.length - 1]
      deleteRoad(lastRoad.id)
    }
  }

  const zoomIn = () => setZoom((prev) => Math.min(prev * 1.2, 5))
  const zoomOut = () => setZoom((prev) => Math.max(prev / 1.2, 0.1))
  const resetZoom = () => {
    setZoom(1)
    setPanOffset({ x: 0, y: 0 })
  }

  const onUpdateRoadWidth = (roadId: string, newWidth: number) => {
    setRoads((prevRoads) => prevRoads.map((r) => (r.id === roadId ? { ...r, width: newWidth } : r)))
  }

  const onUpdateRoadName = (roadId: string, newName: string) => {
    setRoads((prevRoads) => prevRoads.map((r) => (r.id === roadId ? { ...r, name: newName } : r)))
  }

  const onUpdatePolygonName = (polygonId: string, newName: string) => {
    setPolygons((prev) => prev.map((p) => (p.id === polygonId ? { ...p, name: newName } : p)))
  }

  const onUpdatePolygonFillColor = (polygonId: string, newColor: string) => {
    setPolygons((prev) => prev.map((p) => (p.id === polygonId ? { ...p, fillColor: newColor } : p)))
  }

  const onUpdatePolygonStrokeColor = (polygonId: string, newColor: string) => {
    setPolygons((prev) => prev.map((p) => (p.id === polygonId ? { ...p, strokeColor: newColor } : p)))
  }

  const onUpdatePolygonOpacity = (polygonId: string, newOpacity: number) => {
    setPolygons((prev) => prev.map((p) => (p.id === polygonId ? { ...p, opacity: newOpacity } : p)))
  }

  const selectedRoadData = roads.find((r) => r.id === selectedRoadId) || null
  const selectedNodeData = nodes.find((n) => n.id === selectedNodeId) || null
  const selectedPolygonData = polygons.find((p) => p.id === selectedPolygonId) || null
  const totalLength = roads.reduce((sum, road) => sum + calculateRoadLength(road), 0)
  const totalArea = polygons.reduce((sum, polygon) => sum + (polygon.area || 0), 0)

  // Add a new background image
  const addBackgroundImage = (img: Omit<BackgroundImage, 'id'>) => {
    setBackgroundImages(prev => [
      ...prev,
      { ...img, id: `bgimg-${Date.now()}` }
    ])
  }

  // Update a background image (by id)
  const updateBackgroundImage = (id: string, updates: Partial<BackgroundImage>) => {
    setBackgroundImages(prev => prev.map(img => img.id === id ? { ...img, ...updates } : img))
  }

  // Remove a background image (by id)
  const removeBackgroundImage = (id: string) => {
    setBackgroundImages(prev => prev.filter(img => img.id !== id))
  }

  // Toggle visibility of a background image
  const toggleBackgroundImageVisibility = (id: string) => {
    setBackgroundImages(prev => prev.map(img => img.id === id ? { ...img, visible: !img.visible } : img))
  }

  // Add inside the RoadBuilder component, near other button handlers
  const handleSaveCanvas = () => {
    setIsMapNameModalOpen(true)
  }

  const handleSaveWithName = (mapName: string) => {
    const state: CanvasState = {
      nodes,
      roads,  // Don't modify road names
      polygons,
      backgroundImages,
      panOffset,
      zoom,
    }
    downloadCanvasState(state, `${mapName}.json`)
    setIsMapNameModalOpen(false)
  }

  const handleLoadCanvas = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    try {
      const state = await readCanvasStateFile(file)
      setNodes(state.nodes)
      setRoads(state.roads)
      setPolygons(state.polygons)
      setBackgroundImages(state.backgroundImages)
      setPanOffset(state.panOffset)
      setZoom(state.zoom)
    } catch (error) {
      console.error('Error loading canvas:', error)
      // You might want to show an error message to the user here
    }
  }

  return (
    <div className="flex h-screen bg-gray-50 overflow-hidden">
      {/* Left Sidebar - Drawing Tools Only */}
      <div className="w-32 bg-white border-r border-gray-200 flex flex-col overflow-hidden">
        <div className="flex-1 overflow-y-auto p-4 space-y-6">
          <DrawingTools drawingMode={drawingMode} onDrawingModeChange={setDrawingMode} />
          <ActionsPanel onRemoveLastElement={removeLastElement} onClearCanvas={clearCanvas} />
        </div>
      </div>

      {/* Main Canvas Area */}
      <div className="flex-1 flex flex-col">
        <StatusBar
          roadCount={roads.length}
          nodeCount={nodes.length}
          polygonCount={polygons.length}
          totalLength={totalLength}
          totalArea={totalArea}
          zoom={zoom}
          buildSession={buildSession}
          polygonSession={polygonSession}
        />
        <RoadCanvas
          nodes={nodes}
          roads={roads}
          polygons={polygons}
          buildSession={buildSession}
          polygonSession={polygonSession}
          drawingMode={drawingMode}
          snapEnabled={snapEnabled}
          snapDistance={snapDistance}
          defaultRoadWidth={defaultRoadWidth}
          showRoadLengths={showRoadLengths}
          showRoadNames={showRoadNames}
          showPolygons={showPolygons}
          scaleMetersPerPixel={scaleMetersPerPixel}
          selectedRoadId={selectedRoadId}
          selectedNodeId={selectedNodeId}
          selectedPolygonId={selectedPolygonId}
          selectedNodeData={selectedNodeData}
          connectingFromNodeId={connectingFromNodeId}
          selectedRoadForDisconnect={selectedRoadForDisconnect}
          panOffset={panOffset}
          zoom={zoom}
          mousePosition={mousePosition}
          isActivelyDrawingCurve={(isDraggingNewPointHandle && buildSession.roadType === RoadType.BEZIER) || isDraggingPolygonHandle || !!draggedPolygonControlPointInfo}
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onCompleteBuildSession={completeBuildSession}
          onCancelBuildSession={cancelBuildSession}
          onCompletePolygonSession={completePolygonSession}
          onCancelPolygonSession={cancelPolygonSession}
          onZoomIn={zoomIn}
          onZoomOut={zoomOut}
          onResetZoom={resetZoom}
          onUpdateRoadName={onUpdateRoadName}
          onUpdatePolygonName={onUpdatePolygonName}
          backgroundImages={backgroundImages}
        />
      </div>

      {/* Right Sidebar - Settings and Edit Panels */}
      <div className="w-80 bg-white border-l border-gray-200 flex flex-col overflow-hidden">
        <div className="flex-1 overflow-y-auto p-4 space-y-6">

          {/* Always show Display Options */}
          <div className="space-y-6">
            <div className="space-y-3">
              <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wide flex items-center gap-2">
                <span>Display Options</span>
              </h3>
              <div className="flex gap-2">
                {/* Auto Snapping */}
                <button
                  className={`flex-1 p-2 rounded-md border transition-colors flex flex-col items-center text-xs ${snapEnabled ? 'bg-blue-100 border-blue-400 text-blue-700 shadow' : 'bg-white border-gray-200 text-gray-400 hover:bg-gray-100'}`}
                  title="Auto Snapping"
                  onClick={() => setSnapEnabled(v => !v)}
                  type="button"
                >
                  <Magnet className="w-6 h-6 mb-1" />
                  Snap
                </button>
                {/* Show Lengths */}
                <button
                  className={`flex-1 p-2 rounded-md border transition-colors flex flex-col items-center text-xs ${showRoadLengths ? 'bg-blue-100 border-blue-400 text-blue-700 shadow' : 'bg-white border-gray-200 text-gray-400 hover:bg-gray-100'}`}
                  title="Show Lengths"
                  onClick={() => setShowRoadLengths(v => !v)}
                  type="button"
                >
                  <Ruler className="w-6 h-6 mb-1" />
                  Lengths
                </button>
                {/* Show Names */}
                <button
                  className={`flex-1 p-2 rounded-md border transition-colors flex flex-col items-center text-xs ${showRoadNames ? 'bg-blue-100 border-blue-400 text-blue-700 shadow' : 'bg-white border-gray-200 text-gray-400 hover:bg-gray-100'}`}
                  title="Show Names"
                  onClick={() => setShowRoadNames(v => !v)}
                  type="button"
                >
                  <Tag className="w-6 h-6 mb-1" />
                  Names
                </button>
                {/* Show Polygons */}
                <button
                  className={`flex-1 p-2 rounded-md border transition-colors flex flex-col items-center text-xs ${showPolygons ? 'bg-blue-100 border-blue-400 text-blue-700 shadow' : 'bg-white border-gray-200 text-gray-400 hover:bg-gray-100'}`}
                  title="Show Polygons"
                  onClick={() => setShowPolygons(v => !v)}
                  type="button"
                >
                  <Shapes className="w-6 h-6 mb-1" />
                  Polygons
                </button>
              </div>
            </div>
          </div>

          {/* Add Save/Load buttons */}
          <div className="space-y-3">
            <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wide flex items-center gap-2">
              <span>Save/Load</span>
            </h3>
            <div className="flex gap-2">
              <button
                className="flex-1 p-2 rounded-md border transition-colors flex flex-col items-center text-xs bg-white border-gray-200 text-gray-400 hover:bg-gray-100"
                title="Save Canvas"
                onClick={handleSaveCanvas}
                type="button"
              >
                <Save className="w-6 h-6 mb-1" />
                Save
              </button>

              <label className="flex-1 p-2 rounded-md border transition-colors flex flex-col items-center text-xs bg-white border-gray-200 text-gray-400 hover:bg-gray-100 cursor-pointer">
                <Upload className="w-6 h-6 mb-1" />
                Load
                <input
                  type="file"
                  accept=".json"
                  onChange={handleLoadCanvas}
                  className="hidden"
                />
              </label>
            </div>
          </div>

          {/* Background Images Section */}
          {drawingMode === "add-image" && (
            <div className="space-y-4">
              <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wide">Background Images</h3>
              {/* Upload new background image */}
              <Input
                type="file"
                accept="image/*"
                onChange={async (e: React.ChangeEvent<HTMLInputElement>) => {
                  const file = e.target.files?.[0]
                  if (!file) return
                  const reader = new FileReader()
                  reader.onload = (ev) => {
                    const img = new window.Image()
                    img.onload = () => {
                      // Place image at bottom-center of the current visible canvas
                      const margin = 20
                      const canvas = document.querySelector("canvas") as HTMLCanvasElement | null
                      let x = 0, y = 0
                      if (canvas) {
                        const canvasWidth = canvas.width
                        const canvasHeight = canvas.height
                        // Adjust for panOffset and zoom
                        x = ((canvasWidth - img.width) / 2 - panOffset.x) / zoom
                        y = (canvasHeight - img.height - margin - panOffset.y) / zoom
                      }
                      addBackgroundImage({
                        src: ev.target?.result as string,
                        x,
                        y,
                        scale: 1,
                        width: img.width,
                        height: img.height,
                        opacity: 1,
                        visible: true,
                        name: file.name,
                      })
                    }
                    img.src = ev.target?.result as string
                  }
                  reader.readAsDataURL(file)
                  // Reset input value so same file can be uploaded again
                  e.target.value = ""
                }}
              />
              {/* List of background images */}
              <div className="space-y-2">
                {backgroundImages.length === 0 && (
                  <div className="text-xs text-gray-400">No background images</div>
                )}
                {backgroundImages.map((img) => (
                  <div key={img.id} className="border rounded p-2 flex flex-col gap-2 bg-gray-50">
                    <div className="flex items-center justify-between gap-2">
                      <span className="truncate text-xs font-medium">{img.name || 'Image'}</span>
                      <button
                        className="text-red-500 hover:text-red-700 text-xs ml-2"
                        title="Remove"
                        onClick={() => removeBackgroundImage(img.id)}
                      >
                        ✕
                      </button>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        className="px-1 text-xs border rounded hover:bg-gray-200"
                        title="Move Left"
                        onClick={() => updateBackgroundImage(img.id, { x: img.x - 10 })}
                      >←</button>
                      <button
                        className="px-1 text-xs border rounded hover:bg-gray-200"
                        title="Move Right"
                        onClick={() => updateBackgroundImage(img.id, { x: img.x + 10 })}
                      >→</button>
                      <button
                        className="px-1 text-xs border rounded hover:bg-gray-200"
                        title="Move Up"
                        onClick={() => updateBackgroundImage(img.id, { y: img.y - 10 })}
                      >↑</button>
                      <button
                        className="px-1 text-xs border rounded hover:bg-gray-200"
                        title="Move Down"
                        onClick={() => updateBackgroundImage(img.id, { y: img.y + 10 })}
                      >↓</button>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs">Scale</span>
                      <input
                        type="range"
                        min={0.1}
                        max={5}
                        step={0.01}
                        value={img.scale}
                        onChange={e => updateBackgroundImage(img.id, { scale: parseFloat(e.target.value) })}
                        className="flex-1"
                      />
                      <span className="text-xs w-8 text-right">{img.scale.toFixed(2)}x</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs">Opacity</span>
                      <input
                        type="range"
                        min={0}
                        max={1}
                        step={0.01}
                        value={img.opacity}
                        onChange={e => updateBackgroundImage(img.id, { opacity: parseFloat(e.target.value) })}
                        className="flex-1"
                      />
                      <span className="text-xs w-8 text-right">{Math.round(img.opacity * 100)}%</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs">Visible</span>
                      <input
                        type="checkbox"
                        checked={img.visible}
                        onChange={() => toggleBackgroundImageVisibility(img.id)}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Show Road Settings only when Build tool is selected */}
          {drawingMode === "nodes" && (
            <RoadSettings
              defaultRoadWidth={defaultRoadWidth}
              scaleMetersPerPixel={scaleMetersPerPixel}
              snapDistance={snapDistance}
              curvedRoads={false}
              onDefaultRoadWidthChange={setDefaultRoadWidth}
              onScaleChange={setScaleMetersPerPixel}
              onSnapDistanceChange={setSnapDistance}
              onCurvedRoadsChange={() => {}}
            />
          )}

          {/* Show Polygon Settings only when Draw Polygon tool is selected */}
          {drawingMode === "polygon" && (
            <PolygonSettings
              fillColor={polygonSession.fillColor}
              strokeColor={polygonSession.strokeColor}
              opacity={polygonSession.opacity}
              onFillColorChange={(color) => setPolygonSession(prev => ({ ...prev, fillColor: color }))}
              onStrokeColorChange={(color) => setPolygonSession(prev => ({ ...prev, strokeColor: color }))}
              onOpacityChange={(opacity) => setPolygonSession(prev => ({ ...prev, opacity }))}
            />
          )}

          {/* Show Edit Selection panels only when Select tool is selected and something is selected */}
          {drawingMode === "select" && (
            <>
              <SelectedItemPanel
                selectedRoad={selectedRoadData}
                selectedNode={selectedNodeData}
                onDeleteRoad={deleteRoad}
                onDeleteNode={deleteNode}
                calculateRoadLength={calculateRoadLength}
                onUpdateRoadWidth={onUpdateRoadWidth}
                onUpdateRoadName={onUpdateRoadName}
              />
              <SelectedPolygonPanel
                selectedPolygon={selectedPolygonData}
                onDeletePolygon={deletePolygon}
                onUpdatePolygonName={onUpdatePolygonName}
                onUpdatePolygonFillColor={onUpdatePolygonFillColor}
                onUpdatePolygonStrokeColor={onUpdatePolygonStrokeColor}
                onUpdatePolygonOpacity={onUpdatePolygonOpacity}
              />
            </>
          )}
        </div>
      </div>
      {drawingMode === "polygon" && polygonVertexError && (
        <div className="text-red-600 text-xs font-semibold p-2 bg-red-50 border border-red-200 rounded mb-2">
          {polygonVertexError}
        </div>
      )}
      
      <MapNameModal 
        isOpen={isMapNameModalOpen}
        onClose={() => setIsMapNameModalOpen(false)}
        onSave={handleSaveWithName}
      />
    </div>
  )
}