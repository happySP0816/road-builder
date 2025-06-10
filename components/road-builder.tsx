"use client"

import { useState, useCallback, useRef, useEffect, type MouseEvent } from "react"
import RoadCanvas from "./road-canvas"
import DrawingTools from "./drawing-tools"
import RoadSettings from "./road-settings"
import PolygonSettings from "./polygon-settings"
import SelectedItemPanel from "./selected-item-panel"
import SelectedPolygonPanel from "./selected-polygon-panel"
import ActionsPanel from "./actions-panel"
import StatusBar from "./status-bar"
import { Button } from "@/components/ui/button"
import { Toggle } from "@/components/ui/toggle"
import { Ruler, Type, Eye, EyeOff } from "lucide-react"
import { type Road, type Node, type BuildSession, RoadType, type NodePoint, type Polygon, type PolygonSession } from "@/lib/road-types"

export default function RoadBuilder() {
  const [nodes, setNodes] = useState<Node[]>([])
  const [roads, setRoads] = useState<Road[]>([])
  const [polygons, setPolygons] = useState<Polygon[]>([])
  const [drawingMode, setDrawingMode] = useState<"nodes" | "pan" | "select" | "connect" | "disconnect" | "add-node" | "polygon">("nodes")
  const [defaultRoadWidth, setDefaultRoadWidth] = useState(15)
  const [scaleMetersPerPixel, setScaleMetersPerPixel] = useState(0.1)
  const [snapDistance, setSnapDistance] = useState(20)
  const [curvedRoads, setCurvedRoads] = useState(false)
  const [snapEnabled, setSnapEnabled] = useState(true)
  const [showRoadLengths, setShowRoadLengths] = useState(true)
  const [showRoadNames, setShowRoadNames] = useState(true)
  const [showPolygons, setShowPolygons] = useState(true)
  const [selectedRoadId, setSelectedRoadId] = useState<string | null>(null)
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null)
  const [selectedPolygonId, setSelectedPolygonId] = useState<string | null>(null)
  const [connectingFromNodeId, setConnectingFromNodeId] = useState<string | null>(null)
  const [selectedRoadForDisconnect, setSelectedRoadForDisconnect] = useState<string | null>(null)
  const [panOffset, setPanOffset] = useState({ x: 0, y: 0 })
  const [zoom, setZoom] = useState(1)
  const [mousePosition, setMousePosition] = useState<{ x: number; y: number } | null>(null)
  const [isActivelyDrawingCurve, setIsActivelyDrawingCurve] = useState(false)
  const [isDragging, setIsDragging] = useState(false)
  const [lastMousePos, setLastMousePos] = useState({ x: 0, y: 0 })
  const [draggedNodeId, setDraggedNodeId] = useState<string | null>(null)
  const [draggedPolygonId, setDraggedPolygonId] = useState<string | null>(null)
  const [draggedPolygonPointIndex, setDraggedPolygonPointIndex] = useState<number | null>(null)
  const [draggedControlPoint, setDraggedControlPoint] = useState<{ nodeId: string; type: "cp1" | "cp2" } | null>(null)

  // Polygon settings
  const [polygonFillColor, setPolygonFillColor] = useState("#3b82f6")
  const [polygonStrokeColor, setPolygonStrokeColor] = useState("#1e40af")
  const [polygonOpacity, setPolygonOpacity] = useState(0.3)

  // Build session state
  const [buildSession, setBuildSession] = useState<BuildSession>({
    nodes: [],
    isActive: false,
    roadType: RoadType.STRAIGHT,
    roadWidth: defaultRoadWidth,
  })

  // Polygon session state
  const [polygonSession, setPolygonSession] = useState<PolygonSession>({
    points: [],
    roadIds: [],
    isActive: false,
    fillColor: polygonFillColor,
    strokeColor: polygonStrokeColor,
    opacity: polygonOpacity,
  })

  const canvasRef = useRef<HTMLCanvasElement>(null)

  // Helper function to find nearby nodes
  const findNearbyNode = useCallback((x: number, y: number, excludeNodeId?: string): Node | null => {
    if (!snapEnabled) return null
    
    for (const node of nodes) {
      if (excludeNodeId && node.id === excludeNodeId) continue
      const distance = Math.sqrt(Math.pow(node.x - x, 2) + Math.pow(node.y - y, 2))
      if (distance <= snapDistance) {
        return node
      }
    }
    return null
  }, [nodes, snapEnabled, snapDistance])

  // Helper function to find nearby roads
  const findNearbyRoad = useCallback((x: number, y: number): { road: Road; snapPoint: { x: number; y: number } } | null => {
    if (!snapEnabled) return null
    
    for (const road of roads) {
      let closestPoint: { x: number; y: number } | null = null
      let distance = Infinity
      
      if (road.type === RoadType.STRAIGHT) {
        // Find closest point on line segment
        const A = road.start
        const B = road.end
        const AP = { x: x - A.x, y: y - A.y }
        const AB = { x: B.x - A.x, y: B.y - A.y }
        const AB2 = AB.x * AB.x + AB.y * AB.y
        const AP_AB = AP.x * AB.x + AP.y * AB.y
        let t = AP_AB / AB2
        t = Math.max(0, Math.min(1, t)) // Clamp to line segment
        
        closestPoint = {
          x: A.x + AB.x * t,
          y: A.y + AB.y * t
        }
        distance = Math.sqrt(Math.pow(x - closestPoint.x, 2) + Math.pow(y - closestPoint.y, 2))
      } else if (road.type === RoadType.BEZIER && road.controlPoints) {
        // Sample points along bezier curve to find closest
        let minDist = Infinity
        let bestPoint = { x: 0, y: 0 }
        
        for (let t = 0; t <= 1; t += 0.05) {
          const mt = 1 - t
          const px = mt * mt * mt * road.start.x +
                   3 * mt * mt * t * road.controlPoints[0].x +
                   3 * mt * t * t * road.controlPoints[1].x +
                   t * t * t * road.end.x
          const py = mt * mt * mt * road.start.y +
                   3 * mt * mt * t * road.controlPoints[0].y +
                   3 * mt * t * t * road.controlPoints[1].y +
                   t * t * t * road.end.y
          
          const dist = Math.sqrt(Math.pow(x - px, 2) + Math.pow(y - py, 2))
          if (dist < minDist) {
            minDist = dist
            bestPoint = { x: px, y: py }
          }
        }
        
        closestPoint = bestPoint
        distance = minDist
      }
      
      if (closestPoint && distance <= snapDistance) {
        return { road, snapPoint: closestPoint }
      }
    }
    return null
  }, [roads, snapEnabled, snapDistance])

  // Helper function to create a node at a specific position
  const createNodeAtPosition = useCallback((x: number, y: number): Node => {
    return {
      id: `node-${Date.now()}-${Math.random()}`,
      x,
      y,
      connectedRoadIds: []
    }
  }, [])

  // Helper function to split a road at a point and create a node
  const splitRoadAtPoint = useCallback((road: Road, splitPoint: { x: number; y: number }): Node => {
    const newNode = createNodeAtPosition(splitPoint.x, splitPoint.y)
    
    // Create two new roads from the split
    const road1: Road = {
      ...road,
      id: `road-${Date.now()}-${Math.random()}-1`,
      end: splitPoint,
      endNodeId: newNode.id
    }
    
    const road2: Road = {
      ...road,
      id: `road-${Date.now()}-${Math.random()}-2`,
      start: splitPoint,
      startNodeId: newNode.id
    }
    
    // Handle control points for bezier curves
    if (road.type === RoadType.BEZIER && road.controlPoints) {
      // Calculate split point parameter t
      let t = 0.5 // Default to middle, could be calculated more precisely
      
      // Split the bezier curve
      const mt = 1 - t
      const cp1 = {
        x: mt * road.start.x + t * road.controlPoints[0].x,
        y: mt * road.start.y + t * road.controlPoints[0].y
      }
      const cp2 = {
        x: mt * road.controlPoints[0].x + t * road.controlPoints[1].x,
        y: mt * road.controlPoints[0].y + t * road.controlPoints[1].y
      }
      const cp3 = {
        x: mt * road.controlPoints[1].x + t * road.end.x,
        y: mt * road.controlPoints[1].y + t * road.end.y
      }
      
      road1.controlPoints = [cp1, { x: mt * cp1.x + t * cp2.x, y: mt * cp1.y + t * cp2.y }]
      road2.controlPoints = [{ x: mt * cp2.x + t * cp3.x, y: mt * cp2.y + t * cp3.y }, cp3]
    }
    
    // Update node connections
    newNode.connectedRoadIds = [road1.id, road2.id]
    
    // Update existing nodes
    setNodes(prevNodes => {
      return prevNodes.map(node => {
        if (node.id === road.startNodeId) {
          return {
            ...node,
            connectedRoadIds: node.connectedRoadIds.map(id => id === road.id ? road1.id : id)
          }
        }
        if (node.id === road.endNodeId) {
          return {
            ...node,
            connectedRoadIds: node.connectedRoadIds.map(id => id === road.id ? road2.id : id)
          }
        }
        return node
      }).concat(newNode)
    })
    
    // Replace the original road with the two new roads
    setRoads(prevRoads => {
      return prevRoads.map(r => r.id === road.id ? road1 : r).concat(road2)
    })
    
    return newNode
  }, [createNodeAtPosition])

  // Convert screen coordinates to world coordinates
  const screenToWorld = useCallback((screenX: number, screenY: number) => {
    return {
      x: (screenX - panOffset.x) / zoom,
      y: (screenY - panOffset.y) / zoom,
    }
  }, [panOffset, zoom])

  // Generate unique ID
  const generateId = () => `${Date.now()}-${Math.random()}`

  // Calculate road length
  const calculateRoadLength = useCallback((road: Road): number => {
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
  }, [scaleMetersPerPixel])

  // Calculate polygon area
  const calculatePolygonArea = useCallback((polygon: Polygon): number => {
    if (polygon.points.length < 3) return 0
    
    let area = 0
    for (let i = 0; i < polygon.points.length; i++) {
      const j = (i + 1) % polygon.points.length
      area += polygon.points[i].x * polygon.points[j].y
      area -= polygon.points[j].x * polygon.points[i].y
    }
    area = Math.abs(area) / 2
    return area * scaleMetersPerPixel * scaleMetersPerPixel
  }, [scaleMetersPerPixel])

  const handleMouseDown = useCallback((e: MouseEvent<HTMLCanvasElement>) => {
    const rect = e.currentTarget.getBoundingClientRect()
    const screenX = e.clientX - rect.left
    const screenY = e.clientY - rect.top
    const worldPos = screenToWorld(screenX, screenY)
    
    setLastMousePos({ x: screenX, y: screenY })

    if (drawingMode === "pan") {
      setIsDragging(true)
      return
    }

    if (drawingMode === "select") {
      // Check for control point selection first
      const selectedNode = nodes.find(n => n.id === selectedNodeId)
      if (selectedNode) {
        selectedNode.connectedRoadIds.forEach((roadId) => {
          const road = roads.find((r) => r.id === roadId)
          if (!road || road.type !== RoadType.BEZIER || !road.controlPoints) return

          let controlPoint: { x: number; y: number } | undefined
          let cpType: "cp1" | "cp2" | undefined

          if (road.startNodeId === selectedNode.id) {
            controlPoint = road.controlPoints[0]
            cpType = "cp2"
          } else if (road.endNodeId === selectedNode.id) {
            controlPoint = road.controlPoints[1]
            cpType = "cp1"
          }

          if (controlPoint) {
            const distance = Math.sqrt(
              Math.pow(worldPos.x - controlPoint.x, 2) + Math.pow(worldPos.y - controlPoint.y, 2)
            )
            if (distance <= 10 / zoom) {
              setDraggedControlPoint({ nodeId: selectedNode.id, type: cpType })
              setIsDragging(true)
              return
            }
          }
        })
      }

      if (draggedControlPoint) return

      // Check for polygon point selection
      for (const polygon of polygons) {
        if (polygon.id === selectedPolygonId) {
          for (let i = 0; i < polygon.points.length; i++) {
            const point = polygon.points[i]
            const distance = Math.sqrt(
              Math.pow(worldPos.x - point.x, 2) + Math.pow(worldPos.y - point.y, 2)
            )
            if (distance <= 10 / zoom) {
              setDraggedPolygonId(polygon.id)
              setDraggedPolygonPointIndex(i)
              setIsDragging(true)
              return
            }
          }
        }
      }

      // Check for polygon selection (inside polygon)
      for (const polygon of polygons) {
        if (polygon.points.length >= 3) {
          let inside = false
          for (let i = 0, j = polygon.points.length - 1; i < polygon.points.length; j = i++) {
            if (
              polygon.points[i].y > worldPos.y !== polygon.points[j].y > worldPos.y &&
              worldPos.x <
                ((polygon.points[j].x - polygon.points[i].x) * (worldPos.y - polygon.points[i].y)) /
                  (polygon.points[j].y - polygon.points[i].y) +
                  polygon.points[i].x
            ) {
              inside = !inside
            }
          }
          if (inside) {
            setSelectedPolygonId(polygon.id)
            setSelectedRoadId(null)
            setSelectedNodeId(null)
            setDraggedPolygonId(polygon.id)
            setDraggedPolygonPointIndex(null)
            setIsDragging(true)
            return
          }
        }
      }

      // Check for node selection
      for (const node of nodes) {
        const distance = Math.sqrt(
          Math.pow(worldPos.x - node.x, 2) + Math.pow(worldPos.y - node.y, 2)
        )
        if (distance <= 15 / zoom) {
          setSelectedNodeId(node.id)
          setSelectedRoadId(null)
          setSelectedPolygonId(null)
          setDraggedNodeId(node.id)
          setIsDragging(true)
          return
        }
      }

      // Check for road selection
      for (const road of roads) {
        let onRoad = false
        if (road.type === RoadType.STRAIGHT) {
          const A = road.start
          const B = road.end
          const AP = { x: worldPos.x - A.x, y: worldPos.y - A.y }
          const AB = { x: B.x - A.x, y: B.y - A.y }
          const AB2 = AB.x * AB.x + AB.y * AB.y
          const AP_AB = AP.x * AB.x + AP.y * AB.y
          let t = AP_AB / AB2
          t = Math.max(0, Math.min(1, t))
          const closest = { x: A.x + AB.x * t, y: A.y + AB.y * t }
          const distance = Math.sqrt(
            Math.pow(worldPos.x - closest.x, 2) + Math.pow(worldPos.y - closest.y, 2)
          )
          onRoad = distance <= road.width / 2 / zoom
        } else if (road.type === RoadType.BEZIER && road.controlPoints) {
          let minDistance = Infinity
          for (let t = 0; t <= 1; t += 0.05) {
            const mt = 1 - t
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
            const distance = Math.sqrt(Math.pow(worldPos.x - x, 2) + Math.pow(worldPos.y - y, 2))
            minDistance = Math.min(minDistance, distance)
          }
          onRoad = minDistance <= road.width / 2 / zoom
        }

        if (onRoad) {
          setSelectedRoadId(road.id)
          setSelectedNodeId(null)
          setSelectedPolygonId(null)
          return
        }
      }

      // Clear selection if nothing was clicked
      setSelectedRoadId(null)
      setSelectedNodeId(null)
      setSelectedPolygonId(null)
      return
    }

    if (drawingMode === "connect") {
      // Check if clicking on a node
      for (const node of nodes) {
        const distance = Math.sqrt(
          Math.pow(worldPos.x - node.x, 2) + Math.pow(worldPos.y - node.y, 2)
        )
        if (distance <= 15 / zoom) {
          if (!connectingFromNodeId) {
            setConnectingFromNodeId(node.id)
          } else if (connectingFromNodeId === node.id) {
            // Create a circle road
            const newRoad: Road = {
              id: generateId(),
              start: { x: node.x, y: node.y },
              end: { x: node.x, y: node.y },
              startNodeId: node.id,
              endNodeId: node.id,
              type: RoadType.CIRCLE,
              width: defaultRoadWidth,
            }
            setRoads(prev => [...prev, newRoad])
            setNodes(prev =>
              prev.map(n =>
                n.id === node.id
                  ? { ...n, connectedRoadIds: [...n.connectedRoadIds, newRoad.id] }
                  : n
              )
            )
            setConnectingFromNodeId(null)
          } else {
            // Connect two different nodes
            const fromNode = nodes.find(n => n.id === connectingFromNodeId)
            if (fromNode) {
              const newRoad: Road = {
                id: generateId(),
                start: { x: fromNode.x, y: fromNode.y },
                end: { x: node.x, y: node.y },
                startNodeId: fromNode.id,
                endNodeId: node.id,
                type: curvedRoads ? RoadType.BEZIER : RoadType.STRAIGHT,
                width: defaultRoadWidth,
              }

              if (curvedRoads) {
                const midX = (fromNode.x + node.x) / 2
                const midY = (fromNode.y + node.y) / 2
                const offset = 50
                newRoad.controlPoints = [
                  { x: midX - offset, y: midY - offset },
                  { x: midX + offset, y: midY + offset },
                ]
              }

              setRoads(prev => [...prev, newRoad])
              setNodes(prev =>
                prev.map(n => {
                  if (n.id === fromNode.id || n.id === node.id) {
                    return { ...n, connectedRoadIds: [...n.connectedRoadIds, newRoad.id] }
                  }
                  return n
                })
              )
            }
            setConnectingFromNodeId(null)
          }
          return
        }
      }
      return
    }

    if (drawingMode === "disconnect") {
      // Check if clicking on a road
      for (const road of roads) {
        let onRoad = false
        if (road.type === RoadType.STRAIGHT) {
          const A = road.start
          const B = road.end
          const AP = { x: worldPos.x - A.x, y: worldPos.y - A.y }
          const AB = { x: B.x - A.x, y: B.y - A.y }
          const AB2 = AB.x * AB.x + AB.y * AB.y
          const AP_AB = AP.x * AB.x + AP.y * AB.y
          let t = AP_AB / AB2
          t = Math.max(0, Math.min(1, t))
          const closest = { x: A.x + AB.x * t, y: A.y + AB.y * t }
          const distance = Math.sqrt(
            Math.pow(worldPos.x - closest.x, 2) + Math.pow(worldPos.y - closest.y, 2)
          )
          onRoad = distance <= road.width / 2 / zoom
        }

        if (onRoad) {
          if (selectedRoadForDisconnect === road.id) {
            // Delete the road
            handleDeleteRoad(road.id)
            setSelectedRoadForDisconnect(null)
          } else {
            setSelectedRoadForDisconnect(road.id)
          }
          return
        }
      }
      setSelectedRoadForDisconnect(null)
      return
    }

    if (drawingMode === "add-node") {
      // Check for snapping to existing nodes first
      const nearbyNode = findNearbyNode(worldPos.x, worldPos.y)
      if (nearbyNode) {
        return // Don't create a new node if snapping to existing one
      }

      // Check for snapping to roads
      const nearbyRoad = findNearbyRoad(worldPos.x, worldPos.y)
      if (nearbyRoad) {
        // Split the road and create a node at the snap point
        splitRoadAtPoint(nearbyRoad.road, nearbyRoad.snapPoint)
        return
      }

      // Create a new standalone node
      const newNode = createNodeAtPosition(worldPos.x, worldPos.y)
      setNodes(prev => [...prev, newNode])
      return
    }

    if (drawingMode === "polygon") {
      if (!polygonSession.isActive) {
        // Start new polygon
        setPolygonSession({
          points: [worldPos],
          roadIds: [],
          isActive: true,
          fillColor: polygonFillColor,
          strokeColor: polygonStrokeColor,
          opacity: polygonOpacity,
        })
      } else {
        // Check if clicking near the first point to close polygon
        if (polygonSession.points.length >= 3) {
          const firstPoint = polygonSession.points[0]
          const distance = Math.sqrt(
            Math.pow(worldPos.x - firstPoint.x, 2) + Math.pow(worldPos.y - firstPoint.y, 2)
          )
          if (distance <= 15 / zoom) {
            // Close polygon
            const newPolygon: Polygon = {
              id: generateId(),
              points: polygonSession.points,
              roadIds: polygonSession.roadIds,
              fillColor: polygonSession.fillColor,
              strokeColor: polygonSession.strokeColor,
              opacity: polygonSession.opacity,
              area: 0, // Will be calculated
            }
            newPolygon.area = calculatePolygonArea(newPolygon)
            setPolygons(prev => [...prev, newPolygon])
            setPolygonSession({
              points: [],
              roadIds: [],
              isActive: false,
              fillColor: polygonFillColor,
              strokeColor: polygonStrokeColor,
              opacity: polygonOpacity,
            })
            return
          }
        }
        // Add point to polygon
        setPolygonSession(prev => ({
          ...prev,
          points: [...prev.points, worldPos],
        }))
      }
      return
    }

    if (drawingMode === "nodes") {
      if (!buildSession.isActive) {
        // Check for snapping to existing nodes
        const nearbyNode = findNearbyNode(worldPos.x, worldPos.y)
        let startPoint = worldPos
        let startNodeId: string | undefined

        if (nearbyNode) {
          startPoint = { x: nearbyNode.x, y: nearbyNode.y }
          startNodeId = nearbyNode.id
        } else {
          // Check for snapping to roads
          const nearbyRoad = findNearbyRoad(worldPos.x, worldPos.y)
          if (nearbyRoad) {
            const newNode = splitRoadAtPoint(nearbyRoad.road, nearbyRoad.snapPoint)
            startPoint = { x: newNode.x, y: newNode.y }
            startNodeId = newNode.id
          }
        }

        // Start new build session
        const firstNode: NodePoint = {
          id: startNodeId || generateId(),
          x: startPoint.x,
          y: startPoint.y,
          connectedRoadIds: startNodeId ? nodes.find(n => n.id === startNodeId)?.connectedRoadIds || [] : [],
        }

        setBuildSession({
          nodes: [firstNode],
          isActive: true,
          roadType: curvedRoads ? RoadType.BEZIER : RoadType.STRAIGHT,
          roadWidth: defaultRoadWidth,
        })

        // Create the node if it doesn't exist
        if (!startNodeId) {
          const newNode: Node = {
            id: firstNode.id,
            x: firstNode.x,
            y: firstNode.y,
            connectedRoadIds: [],
          }
          setNodes(prev => [...prev, newNode])
        }
      } else {
        // Continue building
        const lastNode = buildSession.nodes[buildSession.nodes.length - 1]
        
        // Check for snapping to existing nodes
        const nearbyNode = findNearbyNode(worldPos.x, worldPos.y, lastNode.id)
        let endPoint = worldPos
        let endNodeId: string | undefined

        if (nearbyNode) {
          endPoint = { x: nearbyNode.x, y: nearbyNode.y }
          endNodeId = nearbyNode.id
        } else {
          // Check for snapping to roads (but not the road we're currently building)
          const nearbyRoad = findNearbyRoad(worldPos.x, worldPos.y)
          if (nearbyRoad) {
            const newNode = splitRoadAtPoint(nearbyRoad.road, nearbyRoad.snapPoint)
            endPoint = { x: newNode.x, y: newNode.y }
            endNodeId = newNode.id
          }
        }

        const newNode: NodePoint = {
          id: endNodeId || generateId(),
          x: endPoint.x,
          y: endPoint.y,
          connectedRoadIds: endNodeId ? nodes.find(n => n.id === endNodeId)?.connectedRoadIds || [] : [],
        }

        // Create the node if it doesn't exist
        if (!endNodeId) {
          const nodeToAdd: Node = {
            id: newNode.id,
            x: newNode.x,
            y: newNode.y,
            connectedRoadIds: [],
          }
          setNodes(prev => [...prev, nodeToAdd])
        }

        setBuildSession(prev => ({
          ...prev,
          nodes: [...prev.nodes, newNode],
        }))
      }
    }
  }, [
    drawingMode,
    screenToWorld,
    nodes,
    roads,
    polygons,
    selectedNodeId,
    selectedPolygonId,
    connectingFromNodeId,
    selectedRoadForDisconnect,
    buildSession,
    polygonSession,
    defaultRoadWidth,
    curvedRoads,
    polygonFillColor,
    polygonStrokeColor,
    polygonOpacity,
    zoom,
    generateId,
    calculatePolygonArea,
    findNearbyNode,
    findNearbyRoad,
    splitRoadAtPoint,
    createNodeAtPosition
  ])

  const handleMouseMove = useCallback((e: MouseEvent<HTMLCanvasElement> | globalThis.MouseEvent) => {
    const rect = canvasRef.current?.getBoundingClientRect()
    if (!rect) return

    const screenX = e.clientX - rect.left
    const screenY = e.clientY - rect.top
    const worldPos = screenToWorld(screenX, screenY)
    
    setMousePosition(worldPos)

    if (isDragging) {
      const deltaX = screenX - lastMousePos.x
      const deltaY = screenY - lastMousePos.y

      if (drawingMode === "pan") {
        setPanOffset(prev => ({
          x: prev.x + deltaX,
          y: prev.y + deltaY,
        }))
      } else if (draggedControlPoint) {
        // Update control point position
        setNodes(prev =>
          prev.map(node => {
            if (node.id === draggedControlPoint.nodeId) {
              const updatedNode = { ...node }
              
              // Update the control point in connected roads
              node.connectedRoadIds.forEach(roadId => {
                setRoads(prevRoads =>
                  prevRoads.map(road => {
                    if (road.id === roadId && road.type === RoadType.BEZIER && road.controlPoints) {
                      const updatedRoad = { ...road, controlPoints: [...road.controlPoints] }
                      
                      if (road.startNodeId === node.id && draggedControlPoint.type === "cp2") {
                        updatedRoad.controlPoints[0] = worldPos
                        updatedNode.cp2 = worldPos
                      } else if (road.endNodeId === node.id && draggedControlPoint.type === "cp1") {
                        updatedRoad.controlPoints[1] = worldPos
                        updatedNode.cp1 = worldPos
                      }
                      
                      return updatedRoad
                    }
                    return road
                  })
                )
              })
              
              return updatedNode
            }
            return node
          })
        )
      } else if (draggedNodeId) {
        // Update node position and connected roads
        setNodes(prev =>
          prev.map(node => {
            if (node.id === draggedNodeId) {
              return { ...node, x: worldPos.x, y: worldPos.y }
            }
            return node
          })
        )
        
        // Update connected roads
        setRoads(prev =>
          prev.map(road => {
            if (road.startNodeId === draggedNodeId) {
              return { ...road, start: worldPos }
            }
            if (road.endNodeId === draggedNodeId) {
              return { ...road, end: worldPos }
            }
            return road
          })
        )
      } else if (draggedPolygonId) {
        if (draggedPolygonPointIndex !== null) {
          // Update specific polygon point
          setPolygons(prev =>
            prev.map(polygon => {
              if (polygon.id === draggedPolygonId) {
                const newPoints = [...polygon.points]
                newPoints[draggedPolygonPointIndex] = worldPos
                const updatedPolygon = { ...polygon, points: newPoints }
                updatedPolygon.area = calculatePolygonArea(updatedPolygon)
                return updatedPolygon
              }
              return polygon
            })
          )
        } else {
          // Move entire polygon
          const polygon = polygons.find(p => p.id === draggedPolygonId)
          if (polygon) {
            const deltaWorldX = worldPos.x - (lastMousePos.x - panOffset.x) / zoom
            const deltaWorldY = worldPos.y - (lastMousePos.y - panOffset.y) / zoom
            
            setPolygons(prev =>
              prev.map(p => {
                if (p.id === draggedPolygonId) {
                  const newPoints = p.points.map(point => ({
                    x: point.x + deltaWorldX,
                    y: point.y + deltaWorldY,
                  }))
                  const updatedPolygon = { ...p, points: newPoints }
                  updatedPolygon.area = calculatePolygonArea(updatedPolygon)
                  return updatedPolygon
                }
                return p
              })
            )
          }
        }
      }

      setLastMousePos({ x: screenX, y: screenY })
    }
  }, [
    isDragging,
    lastMousePos,
    drawingMode,
    draggedControlPoint,
    draggedNodeId,
    draggedPolygonId,
    draggedPolygonPointIndex,
    screenToWorld,
    panOffset,
    zoom,
    polygons,
    calculatePolygonArea
  ])

  const handleMouseUp = useCallback(() => {
    setIsDragging(false)
    setDraggedNodeId(null)
    setDraggedPolygonId(null)
    setDraggedPolygonPointIndex(null)
    setDraggedControlPoint(null)
  }, [])

  // Add global mouse event listeners
  useEffect(() => {
    const handleGlobalMouseMove = (e: globalThis.MouseEvent) => handleMouseMove(e)
    const handleGlobalMouseUp = () => handleMouseUp()

    if (isDragging) {
      document.addEventListener("mousemove", handleGlobalMouseMove)
      document.addEventListener("mouseup", handleGlobalMouseUp)
    }

    return () => {
      document.removeEventListener("mousemove", handleGlobalMouseMove)
      document.removeEventListener("mouseup", handleGlobalMouseUp)
    }
  }, [isDragging, handleMouseMove, handleMouseUp])

  const handleCompleteBuildSession = useCallback(() => {
    if (buildSession.nodes.length < 2) return

    // Create roads between consecutive nodes
    for (let i = 0; i < buildSession.nodes.length - 1; i++) {
      const startNode = buildSession.nodes[i]
      const endNode = buildSession.nodes[i + 1]

      const newRoad: Road = {
        id: generateId(),
        start: { x: startNode.x, y: startNode.y },
        end: { x: endNode.x, y: endNode.y },
        startNodeId: startNode.id,
        endNodeId: endNode.id,
        type: buildSession.roadType,
        width: buildSession.roadWidth,
      }

      if (buildSession.roadType === RoadType.BEZIER) {
        if (startNode.cp2 && endNode.cp1) {
          newRoad.controlPoints = [startNode.cp2, endNode.cp1]
        } else {
          const midX = (startNode.x + endNode.x) / 2
          const midY = (startNode.y + endNode.y) / 2
          const offset = 50
          newRoad.controlPoints = [
            { x: midX - offset, y: midY - offset },
            { x: midX + offset, y: midY + offset },
          ]
        }
      }

      setRoads(prev => [...prev, newRoad])

      // Update node connections
      setNodes(prev =>
        prev.map(node => {
          if (node.id === startNode.id || node.id === endNode.id) {
            return {
              ...node,
              connectedRoadIds: [...node.connectedRoadIds, newRoad.id],
            }
          }
          return node
        })
      )
    }

    setBuildSession({
      nodes: [],
      isActive: false,
      roadType: RoadType.STRAIGHT,
      roadWidth: defaultRoadWidth,
    })
  }, [buildSession, generateId, defaultRoadWidth])

  const handleCancelBuildSession = useCallback(() => {
    // Remove any nodes that were created during this session and don't have connections
    const nodeIdsToRemove = buildSession.nodes
      .filter(sessionNode => {
        const existingNode = nodes.find(n => n.id === sessionNode.id)
        return existingNode && existingNode.connectedRoadIds.length === 0
      })
      .map(node => node.id)

    setNodes(prev => prev.filter(node => !nodeIdsToRemove.includes(node.id)))

    setBuildSession({
      nodes: [],
      isActive: false,
      roadType: RoadType.STRAIGHT,
      roadWidth: defaultRoadWidth,
    })
  }, [buildSession, nodes, defaultRoadWidth])

  const handleCompletePolygonSession = useCallback(() => {
    if (polygonSession.points.length < 3) return

    const newPolygon: Polygon = {
      id: generateId(),
      points: polygonSession.points,
      roadIds: polygonSession.roadIds,
      fillColor: polygonSession.fillColor,
      strokeColor: polygonSession.strokeColor,
      opacity: polygonSession.opacity,
      area: 0,
    }
    newPolygon.area = calculatePolygonArea(newPolygon)
    setPolygons(prev => [...prev, newPolygon])
    setPolygonSession({
      points: [],
      roadIds: [],
      isActive: false,
      fillColor: polygonFillColor,
      strokeColor: polygonStrokeColor,
      opacity: polygonOpacity,
    })
  }, [polygonSession, generateId, calculatePolygonArea, polygonFillColor, polygonStrokeColor, polygonOpacity])

  const handleCancelPolygonSession = useCallback(() => {
    setPolygonSession({
      points: [],
      roadIds: [],
      isActive: false,
      fillColor: polygonFillColor,
      strokeColor: polygonStrokeColor,
      opacity: polygonOpacity,
    })
  }, [polygonFillColor, polygonStrokeColor, polygonOpacity])

  const handleDeleteRoad = useCallback((roadId: string) => {
    setRoads(prev => prev.filter(road => road.id !== roadId))
    setNodes(prev =>
      prev.map(node => ({
        ...node,
        connectedRoadIds: node.connectedRoadIds.filter(id => id !== roadId),
      }))
    )
    if (selectedRoadId === roadId) {
      setSelectedRoadId(null)
    }
  }, [selectedRoadId])

  const handleDeleteNode = useCallback((nodeId: string) => {
    const node = nodes.find(n => n.id === nodeId)
    if (!node) return

    // Delete all connected roads
    node.connectedRoadIds.forEach(roadId => {
      handleDeleteRoad(roadId)
    })

    // Delete the node
    setNodes(prev => prev.filter(n => n.id !== nodeId))
    if (selectedNodeId === nodeId) {
      setSelectedNodeId(null)
    }
  }, [nodes, selectedNodeId, handleDeleteRoad])

  const handleDeletePolygon = useCallback((polygonId: string) => {
    setPolygons(prev => prev.filter(polygon => polygon.id !== polygonId))
    if (selectedPolygonId === polygonId) {
      setSelectedPolygonId(null)
    }
  }, [selectedPolygonId])

  const handleUpdateRoadWidth = useCallback((roadId: string, newWidth: number) => {
    setRoads(prev =>
      prev.map(road => (road.id === roadId ? { ...road, width: newWidth } : road))
    )
  }, [])

  const handleUpdateRoadName = useCallback((roadId: string, newName: string) => {
    setRoads(prev =>
      prev.map(road => (road.id === roadId ? { ...road, name: newName } : road))
    )
  }, [])

  const handleUpdatePolygonName = useCallback((polygonId: string, newName: string) => {
    setPolygons(prev =>
      prev.map(polygon => (polygon.id === polygonId ? { ...polygon, name: newName } : polygon))
    )
  }, [])

  const handleUpdatePolygonFillColor = useCallback((polygonId: string, newColor: string) => {
    setPolygons(prev =>
      prev.map(polygon => (polygon.id === polygonId ? { ...polygon, fillColor: newColor } : polygon))
    )
  }, [])

  const handleUpdatePolygonStrokeColor = useCallback((polygonId: string, newColor: string) => {
    setPolygons(prev =>
      prev.map(polygon => (polygon.id === polygonId ? { ...polygon, strokeColor: newColor } : polygon))
    )
  }, [])

  const handleUpdatePolygonOpacity = useCallback((polygonId: string, newOpacity: number) => {
    setPolygons(prev =>
      prev.map(polygon => (polygon.id === polygonId ? { ...polygon, opacity: newOpacity } : polygon))
    )
  }, [])

  const handleRemoveLastElement = useCallback(() => {
    if (buildSession.isActive && buildSession.nodes.length > 0) {
      setBuildSession(prev => ({
        ...prev,
        nodes: prev.nodes.slice(0, -1),
      }))
    } else if (polygonSession.isActive && polygonSession.points.length > 0) {
      setPolygonSession(prev => ({
        ...prev,
        points: prev.points.slice(0, -1),
      }))
    } else if (roads.length > 0) {
      const lastRoad = roads[roads.length - 1]
      handleDeleteRoad(lastRoad.id)
    } else if (nodes.length > 0) {
      const lastNode = nodes[nodes.length - 1]
      handleDeleteNode(lastNode.id)
    }
  }, [buildSession, polygonSession, roads, nodes, handleDeleteRoad, handleDeleteNode])

  const handleClearCanvas = useCallback(() => {
    setNodes([])
    setRoads([])
    setPolygons([])
    setSelectedRoadId(null)
    setSelectedNodeId(null)
    setSelectedPolygonId(null)
    setConnectingFromNodeId(null)
    setSelectedRoadForDisconnect(null)
    setBuildSession({
      nodes: [],
      isActive: false,
      roadType: RoadType.STRAIGHT,
      roadWidth: defaultRoadWidth,
    })
    setPolygonSession({
      points: [],
      roadIds: [],
      isActive: false,
      fillColor: polygonFillColor,
      strokeColor: polygonStrokeColor,
      opacity: polygonOpacity,
    })
  }, [defaultRoadWidth, polygonFillColor, polygonStrokeColor, polygonOpacity])

  const handleZoomIn = useCallback(() => {
    setZoom(prev => Math.min(prev * 1.2, 5))
  }, [])

  const handleZoomOut = useCallback(() => {
    setZoom(prev => Math.max(prev / 1.2, 0.1))
  }, [])

  const handleResetZoom = useCallback(() => {
    setZoom(1)
    setPanOffset({ x: 0, y: 0 })
  }, [])

  // Update polygon session colors when global colors change
  useEffect(() => {
    if (!polygonSession.isActive) {
      setPolygonSession(prev => ({
        ...prev,
        fillColor: polygonFillColor,
        strokeColor: polygonStrokeColor,
        opacity: polygonOpacity,
      }))
    }
  }, [polygonFillColor, polygonStrokeColor, polygonOpacity, polygonSession.isActive])

  // Calculate totals
  const totalLength = roads.reduce((sum, road) => sum + calculateRoadLength(road), 0)
  const totalArea = polygons.reduce((sum, polygon) => sum + (polygon.area || 0), 0)

  const selectedRoad = selectedRoadId ? roads.find(r => r.id === selectedRoadId) : null
  const selectedNode = selectedNodeId ? nodes.find(n => n.id === selectedNodeId) : null
  const selectedPolygon = selectedPolygonId ? polygons.find(p => p.id === selectedPolygonId) : null

  // Determine what to show in the right panel
  const showPolygonSettings = drawingMode === "polygon"
  const showSelectedItem = drawingMode === "select" && (selectedRoad || selectedNode)
  const showSelectedPolygon = drawingMode === "select" && selectedPolygon

  return (
    <div className="h-screen flex flex-col bg-gray-50">
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
      
      <div className="flex-1 flex">
        {/* Left Sidebar */}
        <div className="w-64 bg-white border-r border-gray-200 p-4 space-y-6 overflow-y-auto">
          <DrawingTools drawingMode={drawingMode} onDrawingModeChange={setDrawingMode} />
          
          <RoadSettings
            defaultRoadWidth={defaultRoadWidth}
            scaleMetersPerPixel={scaleMetersPerPixel}
            snapDistance={snapDistance}
            curvedRoads={curvedRoads}
            onDefaultRoadWidthChange={setDefaultRoadWidth}
            onScaleChange={setScaleMetersPerPixel}
            onSnapDistanceChange={setSnapDistance}
            onCurvedRoadsChange={setCurvedRoads}
          />

          {/* Always show Display Options */}
          <div className="space-y-3">
            <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wide">Display Options</h3>
            <div className="space-y-3">
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

              <div className="flex items-center justify-between">
                <span className="text-sm">Show Names</span>
                <Toggle pressed={showRoadNames} onPressedChange={setShowRoadNames}>
                  <Type size={16} />
                </Toggle>
              </div>

              <div className="flex items-center justify-between">
                <span className="text-sm">Show Polygons</span>
                <Toggle pressed={showPolygons} onPressedChange={setShowPolygons}>
                  {showPolygons ? <Eye size={16} /> : <EyeOff size={16} />}
                </Toggle>
              </div>
            </div>
          </div>

          <ActionsPanel
            onRemoveLastElement={handleRemoveLastElement}
            onClearCanvas={handleClearCanvas}
          />

          {/* Build Session Controls */}
          {buildSession.isActive && (
            <div className="space-y-3">
              <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wide">Build Session</h3>
              <div className="space-y-2">
                <Button size="sm" className="w-full" onClick={handleCompleteBuildSession}>
                  Complete Road
                </Button>
                <Button variant="outline" size="sm" className="w-full" onClick={handleCancelBuildSession}>
                  Cancel
                </Button>
              </div>
            </div>
          )}

          {/* Polygon Session Controls */}
          {polygonSession.isActive && (
            <div className="space-y-3">
              <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wide">Polygon Session</h3>
              <div className="space-y-2">
                <Button size="sm" className="w-full" onClick={handleCompletePolygonSession}>
                  Complete Polygon
                </Button>
                <Button variant="outline" size="sm" className="w-full" onClick={handleCancelPolygonSession}>
                  Cancel
                </Button>
              </div>
            </div>
          )}
        </div>

        {/* Main Canvas */}
        <RoadCanvas
          ref={canvasRef}
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
          selectedNodeData={selectedNode}
          connectingFromNodeId={connectingFromNodeId}
          selectedRoadForDisconnect={selectedRoadForDisconnect}
          panOffset={panOffset}
          zoom={zoom}
          mousePosition={mousePosition}
          isActivelyDrawingCurve={isActivelyDrawingCurve}
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onCompleteBuildSession={handleCompleteBuildSession}
          onCancelBuildSession={handleCancelBuildSession}
          onCompletePolygonSession={handleCompletePolygonSession}
          onCancelPolygonSession={handleCancelPolygonSession}
          onZoomIn={handleZoomIn}
          onZoomOut={handleZoomOut}
          onResetZoom={handleResetZoom}
          onUpdateRoadName={handleUpdateRoadName}
          onUpdatePolygonName={handleUpdatePolygonName}
        />

        {/* Right Sidebar */}
        <div className="w-80 bg-white border-l border-gray-200 p-4 space-y-6 overflow-y-auto">
          {showPolygonSettings && (
            <PolygonSettings
              fillColor={polygonFillColor}
              strokeColor={polygonStrokeColor}
              opacity={polygonOpacity}
              onFillColorChange={setPolygonFillColor}
              onStrokeColorChange={setPolygonStrokeColor}
              onOpacityChange={setPolygonOpacity}
            />
          )}

          {showSelectedItem && (
            <SelectedItemPanel
              selectedRoad={selectedRoad}
              selectedNode={selectedNode}
              onDeleteRoad={handleDeleteRoad}
              onDeleteNode={handleDeleteNode}
              calculateRoadLength={calculateRoadLength}
              onUpdateRoadWidth={handleUpdateRoadWidth}
              onUpdateRoadName={handleUpdateRoadName}
            />
          )}

          {showSelectedPolygon && (
            <SelectedPolygonPanel
              selectedPolygon={selectedPolygon}
              onDeletePolygon={handleDeletePolygon}
              onUpdatePolygonName={handleUpdatePolygonName}
              onUpdatePolygonFillColor={handleUpdatePolygonFillColor}
              onUpdatePolygonStrokeColor={handleUpdatePolygonStrokeColor}
              onUpdatePolygonOpacity={handleUpdatePolygonOpacity}
            />
          )}
        </div>
      </div>
    </div>
  )
}