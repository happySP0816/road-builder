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
  const [selectedRoadId, setSelectedRoadId] = useState<string | null>(null)
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null)
  const [selectedPolygonId, setSelectedPolygonId] = useState<string | null>(null)
  const [drawingMode, setDrawingMode] = useState<"nodes" | "pan" | "select" | "connect" | "disconnect" | "add-node" | "polygon">("nodes")
  const [connectingFromNodeId, setConnectingFromNodeId] = useState<string | null>(null)
  const [selectedRoadForDisconnect, setSelectedRoadForDisconnect] = useState<string | null>(null)
  const [panOffset, setPanOffset] = useState({ x: 0, y: 0 })
  const [zoom, setZoom] = useState(1)
  const [mousePosition, setMousePosition] = useState<{ x: number; y: number } | null>(null)
  const [isActivelyDrawingCurve, setIsActivelyDrawingCurve] = useState(false)

  // Settings
  const [defaultRoadWidth, setDefaultRoadWidth] = useState(15)
  const [scaleMetersPerPixel, setScaleMetersPerPixel] = useState(0.1)
  const [snapDistance, setSnapDistance] = useState(20)
  const [curvedRoads, setCurvedRoads] = useState(false)
  const [snapEnabled, setSnapEnabled] = useState(true)
  const [showRoadLengths, setShowRoadLengths] = useState(true)
  const [showRoadNames, setShowRoadNames] = useState(true)
  const [showPolygons, setShowPolygons] = useState(true)

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

  const isDragging = useRef(false)
  const lastMousePos = useRef({ x: 0, y: 0 })
  const dragStartPos = useRef({ x: 0, y: 0 })
  const draggedNodeId = useRef<string | null>(null)
  const draggedPolygonId = useRef<string | null>(null)
  const draggedPolygonPointIndex = useRef<number | null>(null)
  const draggedControlPoint = useRef<{ nodeId: string; type: "cp1" | "cp2" } | null>(null)

  // Helper function to find nearby nodes for snapping
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

  // Helper function to find nearby roads for snapping
  const findNearbyRoad = useCallback((x: number, y: number): { road: Road; snapPoint: { x: number; y: number } } | null => {
    if (!snapEnabled) return null
    
    for (const road of roads) {
      // For straight roads, find the closest point on the line
      if (road.type === RoadType.STRAIGHT) {
        const A = { x: road.start.x, y: road.start.y }
        const B = { x: road.end.x, y: road.end.y }
        const P = { x, y }
        
        // Calculate the closest point on the line segment AB to point P
        const AB = { x: B.x - A.x, y: B.y - A.y }
        const AP = { x: P.x - A.x, y: P.y - A.y }
        
        const ABdotAB = AB.x * AB.x + AB.y * AB.y
        if (ABdotAB === 0) continue // A and B are the same point
        
        const APdotAB = AP.x * AB.x + AP.y * AB.y
        const t = Math.max(0, Math.min(1, APdotAB / ABdotAB))
        
        const closestPoint = {
          x: A.x + t * AB.x,
          y: A.y + t * AB.y
        }
        
        const distance = Math.sqrt(Math.pow(closestPoint.x - P.x, 2) + Math.pow(closestPoint.y - P.y, 2))
        
        if (distance <= snapDistance) {
          return { road, snapPoint: closestPoint }
        }
      }
      // For bezier roads, we could implement more complex snapping logic here
      // For now, just check endpoints
      else {
        const startDistance = Math.sqrt(Math.pow(road.start.x - x, 2) + Math.pow(road.start.y - y, 2))
        const endDistance = Math.sqrt(Math.pow(road.end.x - x, 2) + Math.pow(road.end.y - y, 2))
        
        if (startDistance <= snapDistance) {
          return { road, snapPoint: { x: road.start.x, y: road.start.y } }
        }
        if (endDistance <= snapDistance) {
          return { road, snapPoint: { x: road.end.x, y: road.y } }
        }
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

  // Helper function to connect a road to existing nodes
  const connectRoadToNodes = useCallback((road: Road, startNode: Node | null, endNode: Node | null): Road => {
    const updatedRoad = { ...road }
    
    if (startNode) {
      updatedRoad.startNodeId = startNode.id
      updatedRoad.start = { x: startNode.x, y: startNode.y }
    }
    
    if (endNode) {
      updatedRoad.endNodeId = endNode.id
      updatedRoad.end = { x: endNode.x, y: endNode.y }
    }
    
    return updatedRoad
  }, [])

  // Helper function to update node connections
  const updateNodeConnections = useCallback((roadId: string, startNodeId?: string, endNodeId?: string) => {
    setNodes(prevNodes => 
      prevNodes.map(node => {
        if (node.id === startNodeId || node.id === endNodeId) {
          return {
            ...node,
            connectedRoadIds: [...node.connectedRoadIds, roadId]
          }
        }
        return node
      })
    )
  }, [])

  const getCanvasCoordinates = useCallback((clientX: number, clientY: number) => {
    const canvas = document.querySelector("canvas")
    if (!canvas) return { x: 0, y: 0 }
    const rect = canvas.getBoundingClientRect()
    return {
      x: (clientX - rect.left - panOffset.x) / zoom,
      y: (clientY - rect.top - panOffset.y) / zoom,
    }
  }, [panOffset, zoom])

  const handleMouseDown = useCallback((e: MouseEvent<HTMLCanvasElement>) => {
    const coords = getCanvasCoordinates(e.clientX, e.clientY)
    isDragging.current = true
    lastMousePos.current = { x: e.clientX, y: e.clientY }
    dragStartPos.current = coords

    if (drawingMode === "pan") {
      return
    }

    if (drawingMode === "nodes") {
      // Check for snapping to existing nodes or roads
      const nearbyNode = findNearbyNode(coords.x, coords.y)
      const nearbyRoad = findNearbyRoad(coords.x, coords.y)
      
      let snapPoint = coords
      let existingStartNode: Node | null = null
      let newNodeCreated = false
      
      if (nearbyNode) {
        // Snap to existing node
        snapPoint = { x: nearbyNode.x, y: nearbyNode.y }
        existingStartNode = nearbyNode
      } else if (nearbyRoad) {
        // Snap to road - create a new node at the snap point and split the road
        snapPoint = nearbyRoad.snapPoint
        
        // Create a new node at the snap point
        const newNode = createNodeAtPosition(snapPoint.x, snapPoint.y)
        setNodes(prev => [...prev, newNode])
        existingStartNode = newNode
        newNodeCreated = true
        
        // Split the existing road at this point
        const originalRoad = nearbyRoad.road
        
        // Create two new roads to replace the original
        const road1: Road = {
          ...originalRoad,
          id: `road-${Date.now()}-1`,
          end: snapPoint,
          endNodeId: newNode.id
        }
        
        const road2: Road = {
          ...originalRoad,
          id: `road-${Date.now()}-2`,
          start: snapPoint,
          startNodeId: newNode.id
        }
        
        // Update roads
        setRoads(prev => {
          const filtered = prev.filter(r => r.id !== originalRoad.id)
          return [...filtered, road1, road2]
        })
        
        // Update node connections
        newNode.connectedRoadIds = [road1.id, road2.id]
        if (originalRoad.startNodeId) {
          setNodes(prevNodes => 
            prevNodes.map(node => {
              if (node.id === originalRoad.startNodeId) {
                return {
                  ...node,
                  connectedRoadIds: node.connectedRoadIds.map(id => 
                    id === originalRoad.id ? road1.id : id
                  )
                }
              }
              return node
            })
          )
        }
        if (originalRoad.endNodeId) {
          setNodes(prevNodes => 
            prevNodes.map(node => {
              if (node.id === originalRoad.endNodeId) {
                return {
                  ...node,
                  connectedRoadIds: node.connectedRoadIds.map(id => 
                    id === originalRoad.id ? road2.id : id
                  )
                }
              }
              return node
            })
          )
        }
      }

      if (!buildSession.isActive) {
        // Start new build session
        const startNode: NodePoint = {
          id: existingStartNode?.id || `node-${Date.now()}`,
          x: snapPoint.x,
          y: snapPoint.y,
          connectedRoadIds: existingStartNode?.connectedRoadIds || [],
        }

        if (!existingStartNode && !newNodeCreated) {
          // Create a new node if we didn't snap to an existing one
          const newNode = createNodeAtPosition(snapPoint.x, snapPoint.y)
          setNodes(prev => [...prev, newNode])
          startNode.id = newNode.id
        }

        setBuildSession({
          nodes: [startNode],
          isActive: true,
          roadType: curvedRoads ? RoadType.BEZIER : RoadType.STRAIGHT,
          roadWidth: defaultRoadWidth,
        })
      } else {
        // Continue build session - add point with snapping
        const newNode: NodePoint = {
          id: existingStartNode?.id || `node-${Date.now()}`,
          x: snapPoint.x,
          y: snapPoint.y,
          connectedRoadIds: existingStartNode?.connectedRoadIds || [],
        }

        if (!existingStartNode && !newNodeCreated) {
          // Create a new node if we didn't snap to an existing one
          const actualNewNode = createNodeAtPosition(snapPoint.x, snapPoint.y)
          setNodes(prev => [...prev, actualNewNode])
          newNode.id = actualNewNode.id
        }

        setBuildSession(prev => ({
          ...prev,
          nodes: [...prev.nodes, newNode],
        }))
      }
      return
    }

    // Rest of the existing mouse down logic for other modes...
    if (drawingMode === "polygon") {
      if (!polygonSession.isActive) {
        setPolygonSession({
          points: [coords],
          roadIds: [],
          isActive: true,
          fillColor: polygonFillColor,
          strokeColor: polygonStrokeColor,
          opacity: polygonOpacity,
        })
      } else {
        const firstPoint = polygonSession.points[0]
        const distanceToFirst = Math.sqrt(
          Math.pow(coords.x - firstPoint.x, 2) + Math.pow(coords.y - firstPoint.y, 2)
        )

        if (polygonSession.points.length >= 3 && distanceToFirst <= snapDistance) {
          // Close polygon
          const newPolygon: Polygon = {
            id: `polygon-${Date.now()}`,
            name: "",
            points: polygonSession.points,
            roadIds: polygonSession.roadIds,
            fillColor: polygonSession.fillColor,
            strokeColor: polygonSession.strokeColor,
            opacity: polygonSession.opacity,
          }

          setPolygons(prev => [...prev, newPolygon])
          setPolygonSession({
            points: [],
            roadIds: [],
            isActive: false,
            fillColor: polygonFillColor,
            strokeColor: polygonStrokeColor,
            opacity: polygonOpacity,
          })
        } else {
          setPolygonSession(prev => ({
            ...prev,
            points: [...prev.points, coords],
          }))
        }
      }
      return
    }

    // Existing logic for other drawing modes...
    if (drawingMode === "select") {
      // Check for control point selection first
      if (selectedNodeId) {
        const selectedNode = nodes.find(n => n.id === selectedNodeId)
        if (selectedNode) {
          for (const roadId of selectedNode.connectedRoadIds) {
            const road = roads.find(r => r.id === roadId)
            if (road && road.type === RoadType.BEZIER && road.controlPoints) {
              let controlPoint: { x: number; y: number } | undefined
              let controlType: "cp1" | "cp2" | undefined

              if (road.startNodeId === selectedNode.id && road.controlPoints[0]) {
                controlPoint = road.controlPoints[0]
                controlType = "cp2"
              } else if (road.endNodeId === selectedNode.id && road.controlPoints[1]) {
                controlPoint = road.controlPoints[1]
                controlType = "cp1"
              }

              if (controlPoint) {
                const distance = Math.sqrt(
                  Math.pow(controlPoint.x - coords.x, 2) + Math.pow(controlPoint.y - coords.y, 2)
                )
                if (distance <= 10 / zoom) {
                  draggedControlPoint.current = { nodeId: selectedNode.id, type: controlType }
                  return
                }
              }
            }
          }
        }
      }

      // Check for polygon point selection
      if (selectedPolygonId) {
        const selectedPolygon = polygons.find(p => p.id === selectedPolygonId)
        if (selectedPolygon) {
          for (let i = 0; i < selectedPolygon.points.length; i++) {
            const point = selectedPolygon.points[i]
            const distance = Math.sqrt(Math.pow(point.x - coords.x, 2) + Math.pow(point.y - coords.y, 2))
            if (distance <= 10 / zoom) {
              draggedPolygonPointIndex.current = i
              return
            }
          }
          
          // Check if clicking inside polygon for dragging entire polygon
          const isInside = isPointInPolygon(coords, selectedPolygon.points)
          if (isInside) {
            draggedPolygonId.current = selectedPolygon.id
            return
          }
        }
      }

      // Check for node selection
      for (const node of nodes) {
        const distance = Math.sqrt(Math.pow(node.x - coords.x, 2) + Math.pow(node.y - coords.y, 2))
        if (distance <= 15 / zoom) {
          setSelectedNodeId(node.id)
          setSelectedRoadId(null)
          setSelectedPolygonId(null)
          draggedNodeId.current = node.id
          return
        }
      }

      // Check for polygon selection
      for (const polygon of polygons) {
        const isInside = isPointInPolygon(coords, polygon.points)
        if (isInside) {
          setSelectedPolygonId(polygon.id)
          setSelectedRoadId(null)
          setSelectedNodeId(null)
          return
        }
      }

      // Check for road selection
      for (const road of roads) {
        if (isPointNearRoad(coords, road)) {
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
      for (const node of nodes) {
        const distance = Math.sqrt(Math.pow(node.x - coords.x, 2) + Math.pow(node.y - coords.y, 2))
        if (distance <= 15 / zoom) {
          if (!connectingFromNodeId) {
            setConnectingFromNodeId(node.id)
          } else if (connectingFromNodeId === node.id) {
            // Create a circle road
            const newRoad: Road = {
              id: `road-${Date.now()}`,
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
                n.id === node.id ? { ...n, connectedRoadIds: [...n.connectedRoadIds, newRoad.id] } : n
              )
            )
            setConnectingFromNodeId(null)
          } else {
            // Connect two different nodes
            const fromNode = nodes.find(n => n.id === connectingFromNodeId)
            if (fromNode) {
              const newRoad: Road = {
                id: `road-${Date.now()}`,
                start: { x: fromNode.x, y: fromNode.y },
                end: { x: node.x, y: node.y },
                startNodeId: fromNode.id,
                endNodeId: node.id,
                type: curvedRoads ? RoadType.BEZIER : RoadType.STRAIGHT,
                width: defaultRoadWidth,
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
      setConnectingFromNodeId(null)
      return
    }

    if (drawingMode === "disconnect") {
      for (const road of roads) {
        if (isPointNearRoad(coords, road)) {
          if (selectedRoadForDisconnect === road.id) {
            // Delete the road
            setRoads(prev => prev.filter(r => r.id !== road.id))
            setNodes(prev =>
              prev.map(node => ({
                ...node,
                connectedRoadIds: node.connectedRoadIds.filter(id => id !== road.id),
              }))
            )
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
      // Check for snapping when adding individual nodes
      const nearbyNode = findNearbyNode(coords.x, coords.y)
      const nearbyRoad = findNearbyRoad(coords.x, coords.y)
      
      let snapPoint = coords
      
      if (nearbyNode) {
        // Don't create a new node if snapping to existing one
        return
      } else if (nearbyRoad) {
        // Snap to road and split it
        snapPoint = nearbyRoad.snapPoint
        
        // Create a new node at the snap point
        const newNode = createNodeAtPosition(snapPoint.x, snapPoint.y)
        setNodes(prev => [...prev, newNode])
        
        // Split the existing road
        const originalRoad = nearbyRoad.road
        
        const road1: Road = {
          ...originalRoad,
          id: `road-${Date.now()}-1`,
          end: snapPoint,
          endNodeId: newNode.id
        }
        
        const road2: Road = {
          ...originalRoad,
          id: `road-${Date.now()}-2`,
          start: snapPoint,
          startNodeId: newNode.id
        }
        
        setRoads(prev => {
          const filtered = prev.filter(r => r.id !== originalRoad.id)
          return [...filtered, road1, road2]
        })
        
        // Update connections
        newNode.connectedRoadIds = [road1.id, road2.id]
        updateNodeConnections(road1.id, originalRoad.startNodeId)
        updateNodeConnections(road2.id, originalRoad.endNodeId)
      } else {
        // Create a standalone node
        const newNode = createNodeAtPosition(snapPoint.x, snapPoint.y)
        setNodes(prev => [...prev, newNode])
      }
      return
    }
  }, [
    drawingMode, getCanvasCoordinates, buildSession, polygonSession, selectedNodeId, selectedPolygonId,
    nodes, roads, polygons, connectingFromNodeId, selectedRoadForDisconnect, defaultRoadWidth,
    curvedRoads, snapDistance, polygonFillColor, polygonStrokeColor, polygonOpacity, zoom,
    findNearbyNode, findNearbyRoad, createNodeAtPosition, connectRoadToNodes, updateNodeConnections
  ])

  const handleMouseMove = useCallback((e: MouseEvent<HTMLCanvasElement> | globalThis.MouseEvent) => {
    const coords = getCanvasCoordinates(e.clientX, e.clientY)
    setMousePosition(coords)

    if (!isDragging.current) return

    if (drawingMode === "pan") {
      const deltaX = e.clientX - lastMousePos.current.x
      const deltaY = e.clientY - lastMousePos.current.y
      setPanOffset(prev => ({ x: prev.x + deltaX, y: prev.y + deltaY }))
      lastMousePos.current = { x: e.clientX, y: e.clientY }
      return
    }

    if (drawingMode === "select") {
      if (draggedControlPoint.current) {
        const { nodeId, type } = draggedControlPoint.current
        setRoads(prev =>
          prev.map(road => {
            if (
              (road.startNodeId === nodeId && type === "cp2") ||
              (road.endNodeId === nodeId && type === "cp1")
            ) {
              if (road.controlPoints) {
                const newControlPoints: [{ x: number; y: number }, { x: number; y: number }] = [
                  road.controlPoints[0],
                  road.controlPoints[1],
                ]
                if (road.startNodeId === nodeId && type === "cp2") {
                  newControlPoints[0] = coords
                } else if (road.endNodeId === nodeId && type === "cp1") {
                  newControlPoints[1] = coords
                }
                return { ...road, controlPoints: newControlPoints }
              }
            }
            return road
          })
        )
        return
      }

      if (draggedNodeId.current) {
        const deltaX = coords.x - dragStartPos.current.x
        const deltaY = coords.y - dragStartPos.current.y

        setNodes(prev =>
          prev.map(node =>
            node.id === draggedNodeId.current
              ? { ...node, x: node.x + deltaX, y: node.y + deltaY }
              : node
          )
        )

        setRoads(prev =>
          prev.map(road => {
            if (road.startNodeId === draggedNodeId.current) {
              return { ...road, start: { x: road.start.x + deltaX, y: road.start.y + deltaY } }
            }
            if (road.endNodeId === draggedNodeId.current) {
              return { ...road, end: { x: road.end.x + deltaX, y: road.end.y + deltaY } }
            }
            return road
          })
        )

        dragStartPos.current = coords
        return
      }

      if (draggedPolygonId.current) {
        const deltaX = coords.x - dragStartPos.current.x
        const deltaY = coords.y - dragStartPos.current.y

        setPolygons(prev =>
          prev.map(polygon =>
            polygon.id === draggedPolygonId.current
              ? {
                  ...polygon,
                  points: polygon.points.map(point => ({
                    x: point.x + deltaX,
                    y: point.y + deltaY,
                  })),
                }
              : polygon
          )
        )

        dragStartPos.current = coords
        return
      }

      if (draggedPolygonPointIndex.current !== null) {
        setPolygons(prev =>
          prev.map(polygon =>
            polygon.id === selectedPolygonId
              ? {
                  ...polygon,
                  points: polygon.points.map((point, index) =>
                    index === draggedPolygonPointIndex.current ? coords : point
                  ),
                }
              : polygon
          )
        )
        return
      }
    }
  }, [drawingMode, getCanvasCoordinates, selectedPolygonId])

  const handleMouseUp = useCallback(() => {
    isDragging.current = false
    draggedNodeId.current = null
    draggedPolygonId.current = null
    draggedPolygonPointIndex.current = null
    draggedControlPoint.current = null
  }, [])

  const completeBuildSession = useCallback(() => {
    if (buildSession.nodes.length < 2) return

    for (let i = 0; i < buildSession.nodes.length - 1; i++) {
      const startNode = buildSession.nodes[i]
      const endNode = buildSession.nodes[i + 1]

      const newRoad: Road = {
        id: `road-${Date.now()}-${i}`,
        start: { x: startNode.x, y: startNode.y },
        end: { x: endNode.x, y: endNode.y },
        startNodeId: startNode.id,
        endNodeId: endNode.id,
        type: buildSession.roadType,
        width: buildSession.roadWidth,
      }

      if (buildSession.roadType === RoadType.BEZIER) {
        newRoad.controlPoints = [
          startNode.cp2 || { x: startNode.x, y: startNode.y },
          endNode.cp1 || { x: endNode.x, y: endNode.y },
        ]
      }

      setRoads(prev => [...prev, newRoad])

      // Update node connections
      setNodes(prev =>
        prev.map(node => {
          if (node.id === startNode.id || node.id === endNode.id) {
            return { ...node, connectedRoadIds: [...node.connectedRoadIds, newRoad.id] }
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
  }, [buildSession, defaultRoadWidth])

  const cancelBuildSession = useCallback(() => {
    setBuildSession({
      nodes: [],
      isActive: false,
      roadType: RoadType.STRAIGHT,
      roadWidth: defaultRoadWidth,
    })
  }, [defaultRoadWidth])

  const completePolygonSession = useCallback(() => {
    if (polygonSession.points.length < 3) return

    const newPolygon: Polygon = {
      id: `polygon-${Date.now()}`,
      name: "",
      points: polygonSession.points,
      roadIds: polygonSession.roadIds,
      fillColor: polygonSession.fillColor,
      strokeColor: polygonSession.strokeColor,
      opacity: polygonSession.opacity,
    }

    setPolygons(prev => [...prev, newPolygon])
    setPolygonSession({
      points: [],
      roadIds: [],
      isActive: false,
      fillColor: polygonFillColor,
      strokeColor: polygonStrokeColor,
      opacity: polygonOpacity,
    })
  }, [polygonSession, polygonFillColor, polygonStrokeColor, polygonOpacity])

  const cancelPolygonSession = useCallback(() => {
    setPolygonSession({
      points: [],
      roadIds: [],
      isActive: false,
      fillColor: polygonFillColor,
      strokeColor: polygonStrokeColor,
      opacity: polygonOpacity,
    })
  }, [polygonFillColor, polygonStrokeColor, polygonOpacity])

  const removeLastElement = useCallback(() => {
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
      setRoads(prev => prev.slice(0, -1))
      setNodes(prev =>
        prev.map(node => ({
          ...node,
          connectedRoadIds: node.connectedRoadIds.filter(id => id !== lastRoad.id),
        }))
      )
    } else if (nodes.length > 0) {
      const lastNode = nodes[nodes.length - 1]
      setNodes(prev => prev.slice(0, -1))
      setRoads(prev => prev.filter(road => road.startNodeId !== lastNode.id && road.endNodeId !== lastNode.id))
    }
  }, [buildSession, polygonSession, roads, nodes])

  const clearCanvas = useCallback(() => {
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

  const deleteRoad = useCallback((roadId: string) => {
    setRoads(prev => prev.filter(r => r.id !== roadId))
    setNodes(prev =>
      prev.map(node => ({
        ...node,
        connectedRoadIds: node.connectedRoadIds.filter(id => id !== roadId),
      }))
    )
    setSelectedRoadId(null)
  }, [])

  const deleteNode = useCallback((nodeId: string) => {
    const nodeToDelete = nodes.find(n => n.id === nodeId)
    if (!nodeToDelete) return

    // Delete all connected roads
    const connectedRoadIds = nodeToDelete.connectedRoadIds
    setRoads(prev => prev.filter(road => !connectedRoadIds.includes(road.id)))

    // Delete the node
    setNodes(prev => prev.filter(n => n.id !== nodeId))

    // Update other nodes to remove references to deleted roads
    setNodes(prev =>
      prev.map(node => ({
        ...node,
        connectedRoadIds: node.connectedRoadIds.filter(id => !connectedRoadIds.includes(id)),
      }))
    )

    setSelectedNodeId(null)
  }, [nodes])

  const deletePolygon = useCallback((polygonId: string) => {
    setPolygons(prev => prev.filter(p => p.id !== polygonId))
    setSelectedPolygonId(null)
  }, [])

  const updateRoadWidth = useCallback((roadId: string, newWidth: number) => {
    setRoads(prev => prev.map(road => (road.id === roadId ? { ...road, width: newWidth } : road)))
  }, [])

  const updateRoadName = useCallback((roadId: string, newName: string) => {
    setRoads(prev => prev.map(road => (road.id === roadId ? { ...road, name: newName } : road)))
  }, [])

  const updatePolygonName = useCallback((polygonId: string, newName: string) => {
    setPolygons(prev => prev.map(polygon => (polygon.id === polygonId ? { ...polygon, name: newName } : polygon)))
  }, [])

  const updatePolygonFillColor = useCallback((polygonId: string, newColor: string) => {
    setPolygons(prev => prev.map(polygon => (polygon.id === polygonId ? { ...polygon, fillColor: newColor } : polygon)))
  }, [])

  const updatePolygonStrokeColor = useCallback((polygonId: string, newColor: string) => {
    setPolygons(prev => prev.map(polygon => (polygon.id === polygonId ? { ...polygon, strokeColor: newColor } : polygon)))
  }, [])

  const updatePolygonOpacity = useCallback((polygonId: string, newOpacity: number) => {
    setPolygons(prev => prev.map(polygon => (polygon.id === polygonId ? { ...polygon, opacity: newOpacity } : polygon)))
  }, [])

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

  const isPointNearRoad = useCallback((point: { x: number; y: number }, road: Road): boolean => {
    const threshold = 10 / zoom
    if (road.type === RoadType.STRAIGHT) {
      const A = road.start
      const B = road.end
      const P = point
      const AB = { x: B.x - A.x, y: B.y - A.y }
      const AP = { x: P.x - A.x, y: P.y - A.y }
      const ABdotAB = AB.x * AB.x + AB.y * AB.y
      if (ABdotAB === 0) return false
      const APdotAB = AP.x * AB.x + AP.y * AB.y
      const t = Math.max(0, Math.min(1, APdotAB / ABdotAB))
      const closestPoint = { x: A.x + t * AB.x, y: A.y + t * AB.y }
      const distance = Math.sqrt(Math.pow(closestPoint.x - P.x, 2) + Math.pow(closestPoint.y - P.y, 2))
      return distance <= threshold
    }
    return false
  }, [zoom])

  const isPointInPolygon = useCallback((point: { x: number; y: number }, polygonPoints: { x: number; y: number }[]): boolean => {
    let inside = false
    for (let i = 0, j = polygonPoints.length - 1; i < polygonPoints.length; j = i++) {
      if (
        polygonPoints[i].y > point.y !== polygonPoints[j].y > point.y &&
        point.x < ((polygonPoints[j].x - polygonPoints[i].x) * (point.y - polygonPoints[i].y)) / (polygonPoints[j].y - polygonPoints[i].y) + polygonPoints[i].x
      ) {
        inside = !inside
      }
    }
    return inside
  }, [])

  const zoomIn = useCallback(() => setZoom(prev => Math.min(prev * 1.2, 5)), [])
  const zoomOut = useCallback(() => setZoom(prev => Math.max(prev / 1.2, 0.1)), [])
  const resetZoom = useCallback(() => setZoom(1), [])

  const selectedRoad = selectedRoadId ? roads.find(r => r.id === selectedRoadId) : null
  const selectedNode = selectedNodeId ? nodes.find(n => n.id === selectedNodeId) : null
  const selectedPolygon = selectedPolygonId ? polygons.find(p => p.id === selectedPolygonId) : null

  const totalLength = roads.reduce((sum, road) => sum + calculateRoadLength(road), 0)
  const totalArea = polygons.reduce((sum, polygon) => sum + (polygon.area || 0), 0)

  // Update polygon session colors when settings change
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

  return (
    <div className="flex h-screen bg-gray-50">
      {/* Left Sidebar */}
      <div className="w-64 bg-white border-r border-gray-200 flex flex-col">
        <div className="p-4 border-b border-gray-200">
          <h1 className="text-xl font-bold text-gray-900">Road Map</h1>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-6">
          <DrawingTools drawingMode={drawingMode} onDrawingModeChange={setDrawingMode} />

          {drawingMode === "polygon" && (
            <PolygonSettings
              fillColor={polygonFillColor}
              strokeColor={polygonStrokeColor}
              opacity={polygonOpacity}
              onFillColorChange={setPolygonFillColor}
              onStrokeColorChange={setPolygonStrokeColor}
              onOpacityChange={setPolygonOpacity}
            />
          )}

          {(drawingMode === "select" && (selectedRoad || selectedNode)) && (
            <SelectedItemPanel
              selectedRoad={selectedRoad}
              selectedNode={selectedNode}
              onDeleteRoad={deleteRoad}
              onDeleteNode={deleteNode}
              calculateRoadLength={calculateRoadLength}
              onUpdateRoadWidth={updateRoadWidth}
              onUpdateRoadName={updateRoadName}
            />
          )}

          {(drawingMode === "select" && selectedPolygon) && (
            <SelectedPolygonPanel
              selectedPolygon={selectedPolygon}
              onDeletePolygon={deletePolygon}
              onUpdatePolygonName={updatePolygonName}
              onUpdatePolygonFillColor={updatePolygonFillColor}
              onUpdatePolygonStrokeColor={updatePolygonStrokeColor}
              onUpdatePolygonOpacity={updatePolygonOpacity}
            />
          )}

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

          <ActionsPanel onRemoveLastElement={removeLastElement} onClearCanvas={clearCanvas} />
        </div>

        {/* Build Session Controls */}
        {buildSession.isActive && (
          <div className="p-4 border-t border-gray-200 bg-blue-50">
            <div className="space-y-2">
              <p className="text-sm text-blue-700 font-medium">Building Road ({buildSession.nodes.length} points)</p>
              <div className="flex gap-2">
                <Button size="sm" onClick={completeBuildSession} className="flex-1">
                  Complete
                </Button>
                <Button size="sm" variant="outline" onClick={cancelBuildSession} className="flex-1">
                  Cancel
                </Button>
              </div>
            </div>
          </div>
        )}

        {/* Polygon Session Controls */}
        {polygonSession.isActive && (
          <div className="p-4 border-t border-gray-200 bg-green-50">
            <div className="space-y-2">
              <p className="text-sm text-green-700 font-medium">Drawing Polygon ({polygonSession.points.length} points)</p>
              <div className="flex gap-2">
                <Button size="sm" onClick={completePolygonSession} className="flex-1">
                  Complete
                </Button>
                <Button size="sm" variant="outline" onClick={cancelPolygonSession} className="flex-1">
                  Cancel
                </Button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Main Content */}
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
          onCompleteBuildSession={completeBuildSession}
          onCancelBuildSession={cancelBuildSession}
          onCompletePolygonSession={completePolygonSession}
          onCancelPolygonSession={cancelPolygonSession}
          onZoomIn={zoomIn}
          onZoomOut={zoomOut}
          onResetZoom={resetZoom}
          onUpdateRoadName={updateRoadName}
          onUpdatePolygonName={updatePolygonName}
        />
      </div>
    </div>
  )
}