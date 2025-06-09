"use client"

import { useState, useCallback, useRef, useEffect, type MouseEvent } from "react"
import { Button } from "@/components/ui/button"
import { Separator } from "@/components/ui/separator"
import DrawingTools from "@/components/drawing-tools"
import RoadSettings from "@/components/road-settings"
import PolygonSettings from "@/components/polygon-settings"
import ActionsPanel from "@/components/actions-panel"
import SelectedItemPanel from "@/components/selected-item-panel"
import SelectedPolygonPanel from "@/components/selected-polygon-panel"
import RoadCanvas from "@/components/road-canvas"
import StatusBar from "@/components/status-bar"
import { type Road, type Node, type BuildSession, RoadType, type NodePoint, type Polygon, type PolygonSession } from "@/lib/road-types"
import { Toggle } from "@/components/ui/toggle"
import { Eye, EyeOff, Ruler, Type, Grid3X3 } from "lucide-react"

export default function RoadBuilder() {
  const [nodes, setNodes] = useState<Node[]>([])
  const [roads, setRoads] = useState<Road[]>([])
  const [polygons, setPolygons] = useState<Polygon[]>([])
  const [drawingMode, setDrawingMode] = useState<"nodes" | "pan" | "select" | "connect" | "disconnect" | "add-node" | "polygon">("nodes")
  const [selectedRoadId, setSelectedRoadId] = useState<string | null>(null)
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null)
  const [selectedPolygonId, setSelectedPolygonId] = useState<string | null>(null)
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
  const [polygonOpacity, setPolygonOpacity] = useState(0.6)

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
  const draggedNodeId = useRef<string | null>(null)
  const draggedPolygonId = useRef<string | null>(null)
  const draggedPolygonPointIndex = useRef<number | null>(null)
  const draggedControlPointInfo = useRef<{ nodeId: string; roadId: string; type: "cp1" | "cp2" } | null>(null)

  // Mouse event handlers
  const handleMouseDown = useCallback((e: MouseEvent<HTMLCanvasElement>) => {
    const canvas = e.currentTarget
    const rect = canvas.getBoundingClientRect()
    const x = (e.clientX - rect.left - panOffset.x) / zoom
    const y = (e.clientY - rect.top - panOffset.y) / zoom

    if (drawingMode === "pan") {
      isDragging.current = true
      lastMousePos.current = { x: e.clientX, y: e.clientY }
      return
    }

    if (drawingMode === "select") {
      // Check for control point selection first (when a node is selected)
      if (selectedNodeId) {
        const selectedNode = nodes.find(n => n.id === selectedNodeId)
        if (selectedNode) {
          for (const roadId of selectedNode.connectedRoadIds) {
            const road = roads.find(r => r.id === roadId)
            if (road && road.type === RoadType.BEZIER && road.controlPoints) {
              let controlPoint: { x: number; y: number } | undefined
              let controlType: "cp1" | "cp2" | undefined

              if (road.startNodeId === selectedNode.id) {
                controlPoint = road.controlPoints[0]
                controlType = "cp2"
              } else if (road.endNodeId === selectedNode.id) {
                controlPoint = road.controlPoints[1]
                controlType = "cp1"
              }

              if (controlPoint) {
                const distance = Math.sqrt(Math.pow(x - controlPoint.x, 2) + Math.pow(y - controlPoint.y, 2))
                if (distance <= 10 / zoom) {
                  draggedControlPointInfo.current = { nodeId: selectedNode.id, roadId, type: controlType }
                  isDragging.current = true
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
            const distance = Math.sqrt(Math.pow(x - point.x, 2) + Math.pow(y - point.y, 2))
            if (distance <= 10 / zoom) {
              draggedPolygonId.current = selectedPolygon.id
              draggedPolygonPointIndex.current = i
              isDragging.current = true
              return
            }
          }

          // Check if clicking inside polygon for whole polygon drag
          const isInsidePolygon = (px: number, py: number, points: { x: number; y: number }[]) => {
            let inside = false
            for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
              if (((points[i].y > py) !== (points[j].y > py)) &&
                  (px < (points[j].x - points[i].x) * (py - points[i].y) / (points[j].y - points[i].y) + points[i].x)) {
                inside = !inside
              }
            }
            return inside
          }

          if (isInsidePolygon(x, y, selectedPolygon.points)) {
            draggedPolygonId.current = selectedPolygon.id
            draggedPolygonPointIndex.current = null // null means drag whole polygon
            isDragging.current = true
            lastMousePos.current = { x, y }
            return
          }
        }
      }

      // Check for node selection
      for (const node of nodes) {
        const distance = Math.sqrt(Math.pow(x - node.x, 2) + Math.pow(y - node.y, 2))
        if (distance <= 15 / zoom) {
          setSelectedNodeId(node.id)
          setSelectedRoadId(null)
          setSelectedPolygonId(null)
          draggedNodeId.current = node.id
          isDragging.current = true
          return
        }
      }

      // Check for polygon selection
      for (const polygon of polygons) {
        const isInsidePolygon = (px: number, py: number, points: { x: number; y: number }[]) => {
          let inside = false
          for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
            if (((points[i].y > py) !== (points[j].y > py)) &&
                (px < (points[j].x - points[i].x) * (py - points[i].y) / (points[j].y - points[i].y) + points[i].x)) {
              inside = !inside
            }
          }
          return inside
        }

        if (isInsidePolygon(x, y, polygon.points)) {
          setSelectedPolygonId(polygon.id)
          setSelectedRoadId(null)
          setSelectedNodeId(null)
          return
        }
      }

      // Check for road selection
      for (const road of roads) {
        let isNearRoad = false

        if (road.type === RoadType.BEZIER && road.controlPoints) {
          // For bezier curves, check distance to curve
          const steps = 20
          for (let i = 0; i <= steps; i++) {
            const t = i / steps
            const mt = 1 - t
            const px = mt * mt * mt * road.start.x +
                      3 * mt * mt * t * road.controlPoints[0].x +
                      3 * mt * t * t * road.controlPoints[1].x +
                      t * t * t * road.end.x
            const py = mt * mt * mt * road.start.y +
                      3 * mt * mt * t * road.controlPoints[0].y +
                      3 * mt * t * t * road.controlPoints[1].y +
                      t * t * t * road.end.y
            
            const distance = Math.sqrt(Math.pow(x - px, 2) + Math.pow(y - py, 2))
            if (distance <= road.width / 2 + 5) {
              isNearRoad = true
              break
            }
          }
        } else {
          // For straight roads, check distance to line
          const A = y - road.start.y
          const B = road.start.x - x
          const C = road.end.x * road.start.y - road.start.x * road.end.y + x * (road.end.y - road.start.y)
          const distance = Math.abs(A * road.end.x + B * road.end.y + C) / Math.sqrt(A * A + B * B)
          
          // Check if point is within the road segment bounds
          const minX = Math.min(road.start.x, road.end.x) - road.width / 2
          const maxX = Math.max(road.start.x, road.end.x) + road.width / 2
          const minY = Math.min(road.start.y, road.end.y) - road.width / 2
          const maxY = Math.max(road.start.y, road.end.y) + road.width / 2
          
          if (distance <= road.width / 2 + 5 && x >= minX && x <= maxX && y >= minY && y <= maxY) {
            isNearRoad = true
          }
        }

        if (isNearRoad) {
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
      // Find clicked node
      for (const node of nodes) {
        const distance = Math.sqrt(Math.pow(x - node.x, 2) + Math.pow(y - node.y, 2))
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
            setNodes(prev => prev.map(n => 
              n.id === node.id 
                ? { ...n, connectedRoadIds: [...n.connectedRoadIds, newRoad.id] }
                : n
            ))
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
                type: curvedRoads ? RoadType.CURVED : RoadType.STRAIGHT,
                width: defaultRoadWidth,
              }
              setRoads(prev => [...prev, newRoad])
              setNodes(prev => prev.map(n => {
                if (n.id === fromNode.id || n.id === node.id) {
                  return { ...n, connectedRoadIds: [...n.connectedRoadIds, newRoad.id] }
                }
                return n
              }))
            }
            setConnectingFromNodeId(null)
          }
          return
        }
      }
      // If no node was clicked, clear the connection
      setConnectingFromNodeId(null)
      return
    }

    if (drawingMode === "disconnect") {
      // Find clicked road
      for (const road of roads) {
        let isNearRoad = false

        if (road.type === RoadType.BEZIER && road.controlPoints) {
          // For bezier curves, check distance to curve
          const steps = 20
          for (let i = 0; i <= steps; i++) {
            const t = i / steps
            const mt = 1 - t
            const px = mt * mt * mt * road.start.x +
                      3 * mt * mt * t * road.controlPoints[0].x +
                      3 * mt * t * t * road.controlPoints[1].x +
                      t * t * t * road.end.x
            const py = mt * mt * mt * road.start.y +
                      3 * mt * mt * t * road.controlPoints[0].y +
                      3 * mt * t * t * road.controlPoints[1].y +
                      t * t * t * road.end.y
            
            const distance = Math.sqrt(Math.pow(x - px, 2) + Math.pow(y - py, 2))
            if (distance <= road.width / 2 + 5) {
              isNearRoad = true
              break
            }
          }
        } else {
          // For straight roads, check distance to line
          const A = y - road.start.y
          const B = road.start.x - x
          const C = road.end.x * road.start.y - road.start.x * road.end.y + x * (road.end.y - road.start.y)
          const distance = Math.abs(A * road.end.x + B * road.end.y + C) / Math.sqrt(A * A + B * B)
          
          // Check if point is within the road segment bounds
          const minX = Math.min(road.start.x, road.end.x) - road.width / 2
          const maxX = Math.max(road.start.x, road.end.x) + road.width / 2
          const minY = Math.min(road.start.y, road.end.y) - road.width / 2
          const maxY = Math.max(road.start.y, road.end.y) + road.width / 2
          
          if (distance <= road.width / 2 + 5 && x >= minX && x <= maxX && y >= minY && y <= maxY) {
            isNearRoad = true
          }
        }

        if (isNearRoad) {
          if (selectedRoadForDisconnect === road.id) {
            // Delete the road
            deleteRoad(road.id)
            setSelectedRoadForDisconnect(null)
          } else {
            setSelectedRoadForDisconnect(road.id)
          }
          return
        }
      }
      // Clear selection if no road was clicked
      setSelectedRoadForDisconnect(null)
      return
    }

    if (drawingMode === "add-node") {
      // Snap to grid if enabled
      let finalX = x
      let finalY = y
      if (snapEnabled) {
        finalX = Math.round(x / snapDistance) * snapDistance
        finalY = Math.round(y / snapDistance) * snapDistance
      }

      const newNode: Node = {
        id: `node-${Date.now()}`,
        x: finalX,
        y: finalY,
        connectedRoadIds: [],
      }
      setNodes(prev => [...prev, newNode])
      return
    }

    if (drawingMode === "polygon") {
      if (!polygonSession.isActive) {
        // Start new polygon session
        setPolygonSession({
          points: [{ x, y }],
          roadIds: [],
          isActive: true,
          fillColor: polygonFillColor,
          strokeColor: polygonStrokeColor,
          opacity: polygonOpacity,
        })
      } else {
        // Check if clicking on first point to close polygon
        const firstPoint = polygonSession.points[0]
        const distanceToFirst = Math.sqrt(Math.pow(x - firstPoint.x, 2) + Math.pow(y - firstPoint.y, 2))
        
        if (polygonSession.points.length >= 3 && distanceToFirst <= 15 / zoom) {
          // Close polygon
          completePolygonSession()
        } else {
          // Add new point
          setPolygonSession(prev => ({
            ...prev,
            points: [...prev.points, { x, y }]
          }))
        }
      }
      return
    }

    if (drawingMode === "nodes") {
      // Snap to grid if enabled
      let finalX = x
      let finalY = y
      if (snapEnabled) {
        finalX = Math.round(x / snapDistance) * snapDistance
        finalY = Math.round(y / snapDistance) * snapDistance
      }

      if (!buildSession.isActive) {
        // Start new build session
        const newNode: NodePoint = {
          id: `node-${Date.now()}`,
          x: finalX,
          y: finalY,
        }
        setBuildSession({
          nodes: [newNode],
          isActive: true,
          roadType: curvedRoads ? RoadType.BEZIER : RoadType.STRAIGHT,
          roadWidth: defaultRoadWidth,
        })
      } else {
        // Add point to existing session
        const newNode: NodePoint = {
          id: `node-${Date.now()}`,
          x: finalX,
          y: finalY,
        }
        setBuildSession(prev => ({
          ...prev,
          nodes: [...prev.nodes, newNode]
        }))
      }
    }
  }, [drawingMode, panOffset, zoom, nodes, roads, polygons, selectedNodeId, selectedPolygonId, connectingFromNodeId, selectedRoadForDisconnect, snapEnabled, snapDistance, defaultRoadWidth, curvedRoads, buildSession, polygonSession, polygonFillColor, polygonStrokeColor, polygonOpacity])

  const handleMouseMove = useCallback((e: MouseEvent<HTMLCanvasElement> | globalThis.MouseEvent) => {
    const canvas = e.currentTarget as HTMLCanvasElement
    const rect = canvas.getBoundingClientRect()
    const clientX = 'clientX' in e ? e.clientX : (e as any).clientX
    const clientY = 'clientY' in e ? e.clientY : (e as any).clientY
    const x = (clientX - rect.left - panOffset.x) / zoom
    const y = (clientY - rect.top - panOffset.y) / zoom

    setMousePosition({ x, y })

    if (isDragging.current) {
      if (drawingMode === "pan") {
        const deltaX = clientX - lastMousePos.current.x
        const deltaY = clientY - lastMousePos.current.y
        setPanOffset(prev => ({
          x: prev.x + deltaX,
          y: prev.y + deltaY
        }))
        lastMousePos.current = { x: clientX, y: clientY }
      } else if (drawingMode === "select") {
        if (draggedControlPointInfo.current) {
          // Update control point position
          const { nodeId, roadId, type } = draggedControlPointInfo.current
          setRoads(prev => prev.map(road => {
            if (road.id === roadId && road.controlPoints) {
              const newControlPoints: [{ x: number; y: number }, { x: number; y: number }] = [...road.controlPoints]
              if (road.startNodeId === nodeId && type === "cp2") {
                newControlPoints[0] = { x, y }
              } else if (road.endNodeId === nodeId && type === "cp1") {
                newControlPoints[1] = { x, y }
              }
              return { ...road, controlPoints: newControlPoints }
            }
            return road
          }))
        } else if (draggedNodeId.current) {
          // Update node position and connected roads
          setNodes(prev => prev.map(node => {
            if (node.id === draggedNodeId.current) {
              return { ...node, x, y }
            }
            return node
          }))
          
          // Update connected roads
          setRoads(prev => prev.map(road => {
            if (road.startNodeId === draggedNodeId.current) {
              return { ...road, start: { x, y } }
            } else if (road.endNodeId === draggedNodeId.current) {
              return { ...road, end: { x, y } }
            }
            return road
          }))
        } else if (draggedPolygonId.current) {
          if (draggedPolygonPointIndex.current !== null) {
            // Update specific polygon point
            setPolygons(prev => prev.map(polygon => {
              if (polygon.id === draggedPolygonId.current) {
                const newPoints = [...polygon.points]
                newPoints[draggedPolygonPointIndex.current!] = { x, y }
                return { ...polygon, points: newPoints }
              }
              return polygon
            }))
          } else {
            // Move entire polygon
            const deltaX = x - lastMousePos.current.x
            const deltaY = y - lastMousePos.current.y
            setPolygons(prev => prev.map(polygon => {
              if (polygon.id === draggedPolygonId.current) {
                const newPoints = polygon.points.map(point => ({
                  x: point.x + deltaX,
                  y: point.y + deltaY
                }))
                return { ...polygon, points: newPoints }
              }
              return polygon
            }))
            lastMousePos.current = { x, y }
          }
        }
      }
    }
  }, [drawingMode, panOffset, zoom])

  const handleMouseUp = useCallback((e: MouseEvent<HTMLCanvasElement> | globalThis.MouseEvent) => {
    isDragging.current = false
    draggedNodeId.current = null
    draggedPolygonId.current = null
    draggedPolygonPointIndex.current = null
    draggedControlPointInfo.current = null
  }, [])

  // Add global mouse event listeners for dragging
  useEffect(() => {
    const handleGlobalMouseMove = (e: globalThis.MouseEvent) => {
      if (isDragging.current) {
        handleMouseMove(e as any)
      }
    }

    const handleGlobalMouseUp = (e: globalThis.MouseEvent) => {
      handleMouseUp(e as any)
    }

    document.addEventListener('mousemove', handleGlobalMouseMove)
    document.addEventListener('mouseup', handleGlobalMouseUp)

    return () => {
      document.removeEventListener('mousemove', handleGlobalMouseMove)
      document.removeEventListener('mouseup', handleGlobalMouseUp)
    }
  }, [handleMouseMove, handleMouseUp])

  const completePolygonSession = useCallback(() => {
    if (polygonSession.points.length >= 3) {
      // Calculate area using shoelace formula
      const calculateArea = (points: { x: number; y: number }[]) => {
        let area = 0
        for (let i = 0; i < points.length; i++) {
          const j = (i + 1) % points.length
          area += points[i].x * points[j].y
          area -= points[j].x * points[i].y
        }
        return Math.abs(area / 2) * scaleMetersPerPixel * scaleMetersPerPixel
      }

      const newPolygon: Polygon = {
        id: `polygon-${Date.now()}`,
        points: polygonSession.points,
        roadIds: polygonSession.roadIds,
        fillColor: polygonSession.fillColor,
        strokeColor: polygonSession.strokeColor,
        opacity: polygonSession.opacity,
        area: calculateArea(polygonSession.points),
      }
      setPolygons(prev => [...prev, newPolygon])
    }
    setPolygonSession({
      points: [],
      roadIds: [],
      isActive: false,
      fillColor: polygonFillColor,
      strokeColor: polygonStrokeColor,
      opacity: polygonOpacity,
    })
  }, [polygonSession, scaleMetersPerPixel, polygonFillColor, polygonStrokeColor, polygonOpacity])

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

  const completeBuildSession = useCallback(() => {
    if (buildSession.nodes.length < 2) return

    // Create nodes
    const newNodes: Node[] = buildSession.nodes.map(node => ({
      ...node,
      connectedRoadIds: []
    }))

    // Create roads between consecutive nodes
    const newRoads: Road[] = []
    for (let i = 0; i < buildSession.nodes.length - 1; i++) {
      const startNode = buildSession.nodes[i]
      const endNode = buildSession.nodes[i + 1]
      
      const road: Road = {
        id: `road-${Date.now()}-${i}`,
        start: { x: startNode.x, y: startNode.y },
        end: { x: endNode.x, y: endNode.y },
        startNodeId: startNode.id,
        endNodeId: endNode.id,
        type: buildSession.roadType,
        width: buildSession.roadWidth,
      }

      // For bezier roads, set control points
      if (buildSession.roadType === RoadType.BEZIER) {
        const cp1 = startNode.cp2 || { x: startNode.x, y: startNode.y }
        const cp2 = endNode.cp1 || { x: endNode.x, y: endNode.y }
        road.controlPoints = [cp1, cp2]
      }

      newRoads.push(road)
      
      // Update node connections
      newNodes.find(n => n.id === startNode.id)?.connectedRoadIds.push(road.id)
      newNodes.find(n => n.id === endNode.id)?.connectedRoadIds.push(road.id)
    }

    setNodes(prev => [...prev, ...newNodes])
    setRoads(prev => [...prev, ...newRoads])
    setBuildSession({
      nodes: [],
      isActive: false,
      roadType: curvedRoads ? RoadType.BEZIER : RoadType.STRAIGHT,
      roadWidth: defaultRoadWidth,
    })
  }, [buildSession, curvedRoads, defaultRoadWidth])

  const cancelBuildSession = useCallback(() => {
    setBuildSession({
      nodes: [],
      isActive: false,
      roadType: curvedRoads ? RoadType.BEZIER : RoadType.STRAIGHT,
      roadWidth: defaultRoadWidth,
    })
  }, [curvedRoads, defaultRoadWidth])

  const removeLastElement = useCallback(() => {
    if (buildSession.isActive && buildSession.nodes.length > 0) {
      setBuildSession(prev => ({
        ...prev,
        nodes: prev.nodes.slice(0, -1)
      }))
    } else if (polygonSession.isActive && polygonSession.points.length > 0) {
      setPolygonSession(prev => ({
        ...prev,
        points: prev.points.slice(0, -1)
      }))
    } else {
      // Remove last added element
      if (polygons.length > 0) {
        setPolygons(prev => prev.slice(0, -1))
      } else if (roads.length > 0) {
        const lastRoad = roads[roads.length - 1]
        deleteRoad(lastRoad.id)
      } else if (nodes.length > 0) {
        const lastNode = nodes[nodes.length - 1]
        deleteNode(lastNode.id)
      }
    }
  }, [buildSession, polygonSession, polygons, roads, nodes])

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
      roadType: curvedRoads ? RoadType.BEZIER : RoadType.STRAIGHT,
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
  }, [curvedRoads, defaultRoadWidth, polygonFillColor, polygonStrokeColor, polygonOpacity])

  const deleteRoad = useCallback((roadId: string) => {
    setRoads(prev => prev.filter(r => r.id !== roadId))
    setNodes(prev => prev.map(node => ({
      ...node,
      connectedRoadIds: node.connectedRoadIds.filter(id => id !== roadId)
    })))
    if (selectedRoadId === roadId) {
      setSelectedRoadId(null)
    }
  }, [selectedRoadId])

  const deleteNode = useCallback((nodeId: string) => {
    const nodeToDelete = nodes.find(n => n.id === nodeId)
    if (nodeToDelete) {
      // Delete all connected roads
      nodeToDelete.connectedRoadIds.forEach(roadId => {
        deleteRoad(roadId)
      })
      // Delete the node
      setNodes(prev => prev.filter(n => n.id !== nodeId))
      if (selectedNodeId === nodeId) {
        setSelectedNodeId(null)
      }
    }
  }, [nodes, selectedNodeId, deleteRoad])

  const deletePolygon = useCallback((polygonId: string) => {
    setPolygons(prev => prev.filter(p => p.id !== polygonId))
    if (selectedPolygonId === polygonId) {
      setSelectedPolygonId(null)
    }
  }, [selectedPolygonId])

  const calculateRoadLength = useCallback((road: Road): number => {
    if (road.type === RoadType.BEZIER && road.controlPoints) {
      let length = 0
      const steps = 20
      let prevPoint = road.start
      for (let i = 1; i <= steps; i++) {
        const t = i / steps
        const mt = 1 - t
        const x = mt * mt * mt * road.start.x +
                  3 * mt * mt * t * road.controlPoints[0].x +
                  3 * mt * t * t * road.controlPoints[1].x +
                  t * t * t * road.end.x
        const y = mt * mt * mt * road.start.y +
                  3 * mt * mt * t * road.controlPoints[0].y +
                  3 * mt * t * t * road.controlPoints[1].y +
                  t * t * t * road.end.y
        const currentPoint = { x, y }
        length += Math.sqrt(Math.pow(currentPoint.x - prevPoint.x, 2) + Math.pow(currentPoint.y - prevPoint.y, 2))
        prevPoint = currentPoint
      }
      return length * scaleMetersPerPixel
    }
    const dx = road.end.x - road.start.x
    const dy = road.end.y - road.start.y
    return Math.sqrt(dx * dx + dy * dy) * scaleMetersPerPixel
  }, [scaleMetersPerPixel])

  const updateRoadWidth = useCallback((roadId: string, newWidth: number) => {
    setRoads(prev => prev.map(road => 
      road.id === roadId ? { ...road, width: newWidth } : road
    ))
  }, [])

  const updateRoadName = useCallback((roadId: string, newName: string) => {
    setRoads(prev => prev.map(road => 
      road.id === roadId ? { ...road, name: newName } : road
    ))
  }, [])

  const updatePolygonName = useCallback((polygonId: string, newName: string) => {
    setPolygons(prev => prev.map(polygon => 
      polygon.id === polygonId ? { ...polygon, name: newName } : polygon
    ))
  }, [])

  const updatePolygonFillColor = useCallback((polygonId: string, newColor: string) => {
    setPolygons(prev => prev.map(polygon => 
      polygon.id === polygonId ? { ...polygon, fillColor: newColor } : polygon
    ))
  }, [])

  const updatePolygonStrokeColor = useCallback((polygonId: string, newColor: string) => {
    setPolygons(prev => prev.map(polygon => 
      polygon.id === polygonId ? { ...polygon, strokeColor: newColor } : polygon
    ))
  }, [])

  const updatePolygonOpacity = useCallback((polygonId: string, newOpacity: number) => {
    setPolygons(prev => prev.map(polygon => 
      polygon.id === polygonId ? { ...polygon, opacity: newOpacity } : polygon
    ))
  }, [])

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

  // Calculate totals
  const totalLength = roads.reduce((sum, road) => sum + calculateRoadLength(road), 0)
  const totalArea = polygons.reduce((sum, polygon) => sum + (polygon.area || 0), 0)

  const selectedRoad = selectedRoadId ? roads.find(r => r.id === selectedRoadId) : null
  const selectedNode = selectedNodeId ? nodes.find(n => n.id === selectedNodeId) : null
  const selectedPolygon = selectedPolygonId ? polygons.find(p => p.id === selectedPolygonId) : null

  return (
    <div className="flex h-screen bg-gray-50">
      {/* Left Sidebar */}
      <div className="w-40 bg-white border-r border-gray-200 flex flex-col overflow-hidden">
        <div className="flex-1 overflow-y-auto p-4 space-y-6">
          <DrawingTools 
            drawingMode={drawingMode} 
            onDrawingModeChange={setDrawingMode}
          />
          
          <Separator />
          
          <ActionsPanel 
            onRemoveLastElement={removeLastElement}
            onClearCanvas={clearCanvas}
          />
        </div>
      </div>

      {/* Main Canvas */}
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
        
        <div className="flex-1 relative">
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
            onZoomIn={handleZoomIn}
            onZoomOut={handleZoomOut}
            onResetZoom={handleResetZoom}
            onUpdateRoadName={updateRoadName}
            onUpdatePolygonName={updatePolygonName}
          />
          
          {/* Build Session Controls */}
          {buildSession.isActive && (
            <div className="absolute bottom-4 left-1/2 transform -translate-x-1/2 bg-white rounded-lg shadow-lg border p-4 flex gap-2">
              <Button onClick={completeBuildSession} size="sm">
                Complete Path
              </Button>
              <Button onClick={cancelBuildSession} variant="outline" size="sm">
                Cancel
              </Button>
            </div>
          )}

          {/* Polygon Session Controls */}
          {polygonSession.isActive && (
            <div className="absolute bottom-4 left-1/2 transform -translate-x-1/2 bg-white rounded-lg shadow-lg border p-4 flex gap-2">
              <Button onClick={completePolygonSession} size="sm" disabled={polygonSession.points.length < 3}>
                Complete Polygon
              </Button>
              <Button onClick={cancelPolygonSession} variant="outline" size="sm">
                Cancel
              </Button>
            </div>
          )}
        </div>
      </div>

      {/* Right Sidebar */}
      <div className="w-80 bg-white border-l border-gray-200 flex flex-col overflow-hidden">
        <div className="flex-1 overflow-y-auto p-4 space-y-6">
          {/* Display Options - Always visible */}
          <div className="space-y-6">
            <div className="space-y-3">
              <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wide">Display Options</h3>
              <div className="grid grid-cols-2 gap-3">
                <div className="flex flex-col items-center gap-2">
                  <button
                    onClick={() => setSnapEnabled(!snapEnabled)}
                    className={`group relative p-3 rounded-xl transition-all duration-300 transform hover:scale-105 ${
                      snapEnabled 
                        ? 'bg-gradient-to-br from-blue-500 to-blue-600 text-white shadow-lg shadow-blue-500/25' 
                        : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                    }`}
                  >
                    <Grid3X3 size={20} className="transition-transform group-hover:scale-110" />
                    <div className={`absolute inset-0 rounded-xl opacity-0 group-hover:opacity-100 transition-opacity duration-300 ${
                      snapEnabled ? 'bg-blue-400/20' : 'bg-gray-300/20'
                    }`} />
                  </button>
                  <span className="text-xs font-medium text-gray-600">Snap</span>
                </div>

                <div className="flex flex-col items-center gap-2">
                  <button
                    onClick={() => setShowRoadLengths(!showRoadLengths)}
                    className={`group relative p-3 rounded-xl transition-all duration-300 transform hover:scale-105 ${
                      showRoadLengths 
                        ? 'bg-gradient-to-br from-emerald-500 to-emerald-600 text-white shadow-lg shadow-emerald-500/25' 
                        : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                    }`}
                  >
                    <Ruler size={20} className="transition-transform group-hover:scale-110" />
                    <div className={`absolute inset-0 rounded-xl opacity-0 group-hover:opacity-100 transition-opacity duration-300 ${
                      showRoadLengths ? 'bg-emerald-400/20' : 'bg-gray-300/20'
                    }`} />
                  </button>
                  <span className="text-xs font-medium text-gray-600">Lengths</span>
                </div>

                <div className="flex flex-col items-center gap-2">
                  <button
                    onClick={() => setShowRoadNames(!showRoadNames)}
                    className={`group relative p-3 rounded-xl transition-all duration-300 transform hover:scale-105 ${
                      showRoadNames 
                        ? 'bg-gradient-to-br from-purple-500 to-purple-600 text-white shadow-lg shadow-purple-500/25' 
                        : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                    }`}
                  >
                    <Type size={20} className="transition-transform group-hover:scale-110" />
                    <div className={`absolute inset-0 rounded-xl opacity-0 group-hover:opacity-100 transition-opacity duration-300 ${
                      showRoadNames ? 'bg-purple-400/20' : 'bg-gray-300/20'
                    }`} />
                  </button>
                  <span className="text-xs font-medium text-gray-600">Names</span>
                </div>

                <div className="flex flex-col items-center gap-2">
                  <button
                    onClick={() => setShowPolygons(!showPolygons)}
                    className={`group relative p-3 rounded-xl transition-all duration-300 transform hover:scale-105 ${
                      showPolygons 
                        ? 'bg-gradient-to-br from-orange-500 to-orange-600 text-white shadow-lg shadow-orange-500/25' 
                        : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                    }`}
                  >
                    {showPolygons ? <Eye size={20} /> : <EyeOff size={20} />}
                    <div className={`absolute inset-0 rounded-xl opacity-0 group-hover:opacity-100 transition-opacity duration-300 ${
                      showPolygons ? 'bg-orange-400/20' : 'bg-gray-300/20'
                    }`} />
                  </button>
                  <span className="text-xs font-medium text-gray-600">Polygons</span>
                </div>
              </div>
            </div>
          </div>

          <Separator />

          {/* Conditional Content */}
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

          {drawingMode === "select" && (selectedRoad || selectedNode || selectedPolygon) && (
            <>
              {selectedRoad && (
                <SelectedItemPanel
                  selectedRoad={selectedRoad}
                  selectedNode={null}
                  onDeleteRoad={deleteRoad}
                  onDeleteNode={deleteNode}
                  calculateRoadLength={calculateRoadLength}
                  onUpdateRoadWidth={updateRoadWidth}
                  onUpdateRoadName={updateRoadName}
                />
              )}
              {selectedNode && (
                <SelectedItemPanel
                  selectedRoad={null}
                  selectedNode={selectedNode}
                  onDeleteRoad={deleteRoad}
                  onDeleteNode={deleteNode}
                  calculateRoadLength={calculateRoadLength}
                  onUpdateRoadWidth={updateRoadWidth}
                  onUpdateRoadName={updateRoadName}
                />
              )}
              {selectedPolygon && (
                <SelectedPolygonPanel
                  selectedPolygon={selectedPolygon}
                  onDeletePolygon={deletePolygon}
                  onUpdatePolygonName={updatePolygonName}
                  onUpdatePolygonFillColor={updatePolygonFillColor}
                  onUpdatePolygonStrokeColor={updatePolygonStrokeColor}
                  onUpdatePolygonOpacity={updatePolygonOpacity}
                />
              )}
            </>
          )}

          {(drawingMode === "nodes" || drawingMode === "add-node" || drawingMode === "connect" || drawingMode === "disconnect") && (
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
          )}
        </div>
      </div>
    </div>
  )
}