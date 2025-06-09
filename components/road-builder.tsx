"use client"

import { useState, useCallback, useRef, useEffect, type MouseEvent } from "react"
import { Button } from "@/components/ui/button"
import { Separator } from "@/components/ui/separator"
import RoadCanvas from "@/components/road-canvas"
import DrawingTools from "@/components/drawing-tools"
import RoadSettings from "@/components/road-settings"
import PolygonSettings from "@/components/polygon-settings"
import SelectedItemPanel from "@/components/selected-item-panel"
import SelectedPolygonPanel from "@/components/selected-polygon-panel"
import ActionsPanel from "@/components/actions-panel"
import StatusBar from "@/components/status-bar"
import DisplayOptions from "@/components/display-options"
import { type Road, type Node, type BuildSession, RoadType, type NodePoint, type Polygon, type PolygonSession } from "@/lib/road-types"

export default function RoadBuilder() {
  const [nodes, setNodes] = useState<Node[]>([])
  const [roads, setRoads] = useState<Road[]>([])
  const [polygons, setPolygons] = useState<Polygon[]>([])
  const [drawingMode, setDrawingMode] = useState<"nodes" | "pan" | "select" | "connect" | "disconnect" | "add-node" | "polygon">("nodes")
  const [buildSession, setBuildSession] = useState<BuildSession>({
    nodes: [],
    isActive: false,
    roadType: RoadType.STRAIGHT,
    roadWidth: 15,
  })
  const [polygonSession, setPolygonSession] = useState<PolygonSession>({
    points: [],
    roadIds: [],
    isActive: false,
    fillColor: "#3b82f6",
    strokeColor: "#1e40af",
    opacity: 0.6,
  })

  // Settings
  const [defaultRoadWidth, setDefaultRoadWidth] = useState(15)
  const [scaleMetersPerPixel, setScaleMetersPerPixel] = useState(0.1)
  const [snapDistance, setSnapDistance] = useState(20)
  const [curvedRoads, setCurvedRoads] = useState(false)
  const [snapEnabled, setSnapEnabled] = useState(true)
  const [showRoadLengths, setShowRoadLengths] = useState(true)
  const [showRoadNames, setShowRoadNames] = useState(true)
  const [showPolygons, setShowPolygons] = useState(true)

  // Selection state
  const [selectedRoadId, setSelectedRoadId] = useState<string | null>(null)
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null)
  const [selectedPolygonId, setSelectedPolygonId] = useState<string | null>(null)
  const [connectingFromNodeId, setConnectingFromNodeId] = useState<string | null>(null)
  const [selectedRoadForDisconnect, setSelectedRoadForDisconnect] = useState<string | null>(null)

  // Canvas state
  const [panOffset, setPanOffset] = useState({ x: 0, y: 0 })
  const [zoom, setZoom] = useState(1)
  const [mousePosition, setMousePosition] = useState<{ x: number; y: number } | null>(null)
  const [isActivelyDrawingCurve, setIsActivelyDrawingCurve] = useState(false)

  // Refs for mouse handling
  const isDraggingRef = useRef(false)
  const lastMousePosRef = useRef({ x: 0, y: 0 })
  const dragStartPosRef = useRef({ x: 0, y: 0 })

  // Get selected items
  const selectedRoad = selectedRoadId ? roads.find(r => r.id === selectedRoadId) : null
  const selectedNode = selectedNodeId ? nodes.find(n => n.id === selectedNodeId) : null
  const selectedPolygon = selectedPolygonId ? polygons.find(p => p.id === selectedPolygonId) : null

  // Calculate totals
  const totalLength = roads.reduce((sum, road) => sum + calculateRoadLength(road), 0)
  const totalArea = polygons.reduce((sum, polygon) => sum + (polygon.area || 0), 0)

  // Helper functions
  const generateId = () => Math.random().toString(36).substr(2, 9)

  const snapToGrid = useCallback((x: number, y: number) => {
    if (!snapEnabled) return { x, y }
    const snappedX = Math.round(x / snapDistance) * snapDistance
    const snappedY = Math.round(y / snapDistance) * snapDistance
    return { x: snappedX, y: snappedY }
  }, [snapEnabled, snapDistance])

  const getCanvasCoordinates = useCallback((clientX: number, clientY: number, canvas: HTMLCanvasElement) => {
    const rect = canvas.getBoundingClientRect()
    const x = (clientX - rect.left - panOffset.x) / zoom
    const y = (clientY - rect.top - panOffset.y) / zoom
    return snapToGrid(x, y)
  }, [panOffset, zoom, snapToGrid])

  const findNearbyNode = useCallback((x: number, y: number, threshold = 20) => {
    return nodes.find(node => {
      const distance = Math.sqrt(Math.pow(node.x - x, 2) + Math.pow(node.y - y, 2))
      return distance <= threshold / zoom
    })
  }, [nodes, zoom])

  const findNearbyRoad = useCallback((x: number, y: number, threshold = 10) => {
    return roads.find(road => {
      if (road.type === RoadType.BEZIER && road.controlPoints) {
        // For bezier curves, we need to check distance to the curve
        // This is a simplified check - in practice you'd want more precise curve distance calculation
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
          
          const distance = Math.sqrt(Math.pow(px - x, 2) + Math.pow(py - y, 2))
          if (distance <= threshold / zoom) return true
        }
        return false
      } else {
        // For straight roads, calculate distance to line segment
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

        const distance = Math.sqrt(Math.pow(x - xx, 2) + Math.pow(y - yy, 2))
        return distance <= threshold / zoom
      }
    })
  }, [roads, zoom])

  const findNearbyPolygon = useCallback((x: number, y: number) => {
    return polygons.find(polygon => {
      // Point-in-polygon test using ray casting algorithm
      let inside = false
      for (let i = 0, j = polygon.points.length - 1; i < polygon.points.length; j = i++) {
        if (((polygon.points[i].y > y) !== (polygon.points[j].y > y)) &&
            (x < (polygon.points[j].x - polygon.points[i].x) * (y - polygon.points[i].y) / (polygon.points[j].y - polygon.points[i].y) + polygon.points[i].x)) {
          inside = !inside
        }
      }
      return inside
    })
  }, [polygons])

  const calculateRoadLength = useCallback((road: Road): number => {
    if (road.type === RoadType.BEZIER && road.controlPoints) {
      // Approximate bezier curve length
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

  const calculatePolygonArea = useCallback((points: { x: number; y: number }[]): number => {
    if (points.length < 3) return 0
    
    let area = 0
    for (let i = 0; i < points.length; i++) {
      const j = (i + 1) % points.length
      area += points[i].x * points[j].y
      area -= points[j].x * points[i].y
    }
    area = Math.abs(area) / 2
    
    // Convert from pixels to square meters
    return area * scaleMetersPerPixel * scaleMetersPerPixel
  }, [scaleMetersPerPixel])

  // Mouse event handlers
  const handleMouseDown = useCallback((e: MouseEvent<HTMLCanvasElement>) => {
    const canvas = e.currentTarget
    const coords = getCanvasCoordinates(e.clientX, e.clientY, canvas)
    
    isDraggingRef.current = true
    lastMousePosRef.current = { x: e.clientX, y: e.clientY }
    dragStartPosRef.current = { x: e.clientX, y: e.clientY }

    if (drawingMode === "pan") {
      return
    }

    if (drawingMode === "polygon") {
      if (!polygonSession.isActive) {
        // Start new polygon
        setPolygonSession(prev => ({
          ...prev,
          isActive: true,
          points: [coords],
          roadIds: []
        }))
      } else {
        // Add point to existing polygon or close it
        const firstPoint = polygonSession.points[0]
        const distanceToFirst = Math.sqrt(
          Math.pow(coords.x - firstPoint.x, 2) + Math.pow(coords.y - firstPoint.y, 2)
        )
        
        if (polygonSession.points.length >= 3 && distanceToFirst <= 20 / zoom) {
          // Close polygon
          const newPolygon: Polygon = {
            id: generateId(),
            name: "",
            points: polygonSession.points,
            roadIds: polygonSession.roadIds,
            fillColor: polygonSession.fillColor,
            strokeColor: polygonSession.strokeColor,
            opacity: polygonSession.opacity,
            area: calculatePolygonArea(polygonSession.points)
          }
          
          setPolygons(prev => [...prev, newPolygon])
          setPolygonSession(prev => ({
            ...prev,
            isActive: false,
            points: [],
            roadIds: []
          }))
          setSelectedPolygonId(newPolygon.id)
        } else {
          // Add point
          setPolygonSession(prev => ({
            ...prev,
            points: [...prev.points, coords]
          }))
        }
      }
      return
    }

    if (drawingMode === "select") {
      // Clear previous selections
      setSelectedRoadId(null)
      setSelectedNodeId(null)
      setSelectedPolygonId(null)

      // Check for polygon selection first (since they might overlap with roads/nodes)
      const clickedPolygon = findNearbyPolygon(coords.x, coords.y)
      if (clickedPolygon) {
        setSelectedPolygonId(clickedPolygon.id)
        return
      }

      // Check for node selection
      const clickedNode = findNearbyNode(coords.x, coords.y)
      if (clickedNode) {
        setSelectedNodeId(clickedNode.id)
        return
      }

      // Check for road selection
      const clickedRoad = findNearbyRoad(coords.x, coords.y)
      if (clickedRoad) {
        setSelectedRoadId(clickedRoad.id)
        return
      }
    }

    if (drawingMode === "connect") {
      const clickedNode = findNearbyNode(coords.x, coords.y)
      if (clickedNode) {
        if (!connectingFromNodeId) {
          setConnectingFromNodeId(clickedNode.id)
        } else if (connectingFromNodeId === clickedNode.id) {
          // Create circle road
          const circleRoad: Road = {
            id: generateId(),
            start: { x: clickedNode.x, y: clickedNode.y },
            end: { x: clickedNode.x, y: clickedNode.y },
            startNodeId: clickedNode.id,
            endNodeId: clickedNode.id,
            type: RoadType.CIRCLE,
            width: defaultRoadWidth,
          }
          
          setRoads(prev => [...prev, circleRoad])
          setNodes(prev => prev.map(node => 
            node.id === clickedNode.id 
              ? { ...node, connectedRoadIds: [...node.connectedRoadIds, circleRoad.id] }
              : node
          ))
          setConnectingFromNodeId(null)
        } else {
          // Connect two different nodes
          const fromNode = nodes.find(n => n.id === connectingFromNodeId)
          if (fromNode) {
            const newRoad: Road = {
              id: generateId(),
              start: { x: fromNode.x, y: fromNode.y },
              end: { x: clickedNode.x, y: clickedNode.y },
              startNodeId: fromNode.id,
              endNodeId: clickedNode.id,
              type: curvedRoads ? RoadType.CURVED : RoadType.STRAIGHT,
              width: defaultRoadWidth,
            }
            
            setRoads(prev => [...prev, newRoad])
            setNodes(prev => prev.map(node => {
              if (node.id === fromNode.id || node.id === clickedNode.id) {
                return { ...node, connectedRoadIds: [...node.connectedRoadIds, newRoad.id] }
              }
              return node
            }))
          }
          setConnectingFromNodeId(null)
        }
      }
      return
    }

    if (drawingMode === "disconnect") {
      const clickedRoad = findNearbyRoad(coords.x, coords.y)
      if (clickedRoad) {
        if (selectedRoadForDisconnect === clickedRoad.id) {
          // Delete the road
          deleteRoad(clickedRoad.id)
          setSelectedRoadForDisconnect(null)
        } else {
          setSelectedRoadForDisconnect(clickedRoad.id)
        }
      } else {
        setSelectedRoadForDisconnect(null)
      }
      return
    }

    if (drawingMode === "add-node") {
      const nearbyNode = findNearbyNode(coords.x, coords.y)
      if (!nearbyNode) {
        const newNode: Node = {
          id: generateId(),
          x: coords.x,
          y: coords.y,
          connectedRoadIds: [],
        }
        setNodes(prev => [...prev, newNode])
      }
      return
    }

    if (drawingMode === "nodes") {
      if (!buildSession.isActive) {
        // Start new build session
        const newNode: NodePoint = {
          id: generateId(),
          x: coords.x,
          y: coords.y,
          connectedRoadIds: [],
        }
        
        setBuildSession({
          nodes: [newNode],
          isActive: true,
          roadType: curvedRoads ? RoadType.BEZIER : RoadType.STRAIGHT,
          roadWidth: defaultRoadWidth,
        })
      } else {
        // Add node to existing session
        const newNode: NodePoint = {
          id: generateId(),
          x: coords.x,
          y: coords.y,
          connectedRoadIds: [],
        }
        
        setBuildSession(prev => ({
          ...prev,
          nodes: [...prev.nodes, newNode]
        }))
      }
    }
  }, [
    drawingMode, getCanvasCoordinates, polygonSession, findNearbyPolygon, findNearbyNode, 
    findNearbyRoad, connectingFromNodeId, nodes, selectedRoadForDisconnect, buildSession,
    curvedRoads, defaultRoadWidth, calculatePolygonArea, zoom
  ])

  const handleMouseMove = useCallback((e: MouseEvent<HTMLCanvasElement> | globalThis.MouseEvent) => {
    const canvas = e.currentTarget as HTMLCanvasElement
    const coords = getCanvasCoordinates(e.clientX, e.clientY, canvas)
    setMousePosition(coords)

    if (isDraggingRef.current && drawingMode === "pan") {
      const deltaX = e.clientX - lastMousePosRef.current.x
      const deltaY = e.clientY - lastMousePosRef.current.y
      
      setPanOffset(prev => ({
        x: prev.x + deltaX,
        y: prev.y + deltaY
      }))
      
      lastMousePosRef.current = { x: e.clientX, y: e.clientY }
    }
  }, [drawingMode, getCanvasCoordinates])

  const handleMouseUp = useCallback((e: MouseEvent<HTMLCanvasElement> | globalThis.MouseEvent) => {
    isDraggingRef.current = false
  }, [])

  // Build session handlers
  const completeBuildSession = useCallback(() => {
    if (!buildSession.isActive || buildSession.nodes.length < 2) return

    const newNodes: Node[] = []
    const newRoads: Road[] = []

    // Create nodes
    buildSession.nodes.forEach(sessionNode => {
      const node: Node = {
        id: sessionNode.id,
        x: sessionNode.x,
        y: sessionNode.y,
        connectedRoadIds: [],
      }
      newNodes.push(node)
    })

    // Create roads between consecutive nodes
    for (let i = 0; i < buildSession.nodes.length - 1; i++) {
      const startNode = buildSession.nodes[i]
      const endNode = buildSession.nodes[i + 1]
      
      const road: Road = {
        id: generateId(),
        start: { x: startNode.x, y: startNode.y },
        end: { x: endNode.x, y: endNode.y },
        startNodeId: startNode.id,
        endNodeId: endNode.id,
        type: buildSession.roadType,
        width: buildSession.roadWidth,
      }

      // Add control points for bezier curves
      if (buildSession.roadType === RoadType.BEZIER) {
        const cp1 = startNode.cp2 || { x: startNode.x, y: startNode.y }
        const cp2 = endNode.cp1 || { x: endNode.x, y: endNode.y }
        road.controlPoints = [cp1, cp2]
      }

      newRoads.push(road)

      // Update node connections
      const startNodeIndex = newNodes.findIndex(n => n.id === startNode.id)
      const endNodeIndex = newNodes.findIndex(n => n.id === endNode.id)
      
      if (startNodeIndex !== -1) {
        newNodes[startNodeIndex].connectedRoadIds.push(road.id)
      }
      if (endNodeIndex !== -1) {
        newNodes[endNodeIndex].connectedRoadIds.push(road.id)
      }
    }

    setNodes(prev => [...prev, ...newNodes])
    setRoads(prev => [...prev, ...newRoads])
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
    if (!polygonSession.isActive || polygonSession.points.length < 3) return

    const newPolygon: Polygon = {
      id: generateId(),
      name: "",
      points: polygonSession.points,
      roadIds: polygonSession.roadIds,
      fillColor: polygonSession.fillColor,
      strokeColor: polygonSession.strokeColor,
      opacity: polygonSession.opacity,
      area: calculatePolygonArea(polygonSession.points)
    }
    
    setPolygons(prev => [...prev, newPolygon])
    setPolygonSession(prev => ({
      ...prev,
      isActive: false,
      points: [],
      roadIds: []
    }))
    setSelectedPolygonId(newPolygon.id)
  }, [polygonSession, calculatePolygonArea])

  const cancelPolygonSession = useCallback(() => {
    setPolygonSession(prev => ({
      ...prev,
      isActive: false,
      points: [],
      roadIds: []
    }))
  }, [])

  // Delete functions
  const deleteRoad = useCallback((roadId: string) => {
    setRoads(prev => prev.filter(r => r.id !== roadId))
    setNodes(prev => prev.map(node => ({
      ...node,
      connectedRoadIds: node.connectedRoadIds.filter(id => id !== roadId)
    })))
    setSelectedRoadId(null)
  }, [])

  const deleteNode = useCallback((nodeId: string) => {
    const node = nodes.find(n => n.id === nodeId)
    if (node) {
      // Delete all connected roads
      node.connectedRoadIds.forEach(roadId => {
        deleteRoad(roadId)
      })
      // Delete the node
      setNodes(prev => prev.filter(n => n.id !== nodeId))
      setSelectedNodeId(null)
    }
  }, [nodes, deleteRoad])

  const deletePolygon = useCallback((polygonId: string) => {
    setPolygons(prev => prev.filter(p => p.id !== polygonId))
    setSelectedPolygonId(null)
  }, [])

  // Update functions
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

  // Action functions
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
    } else if (roads.length > 0) {
      const lastRoad = roads[roads.length - 1]
      deleteRoad(lastRoad.id)
    } else if (nodes.length > 0) {
      const lastNode = nodes[nodes.length - 1]
      deleteNode(lastNode.id)
    }
  }, [buildSession, polygonSession, roads, nodes, deleteRoad, deleteNode])

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
      fillColor: "#3b82f6",
      strokeColor: "#1e40af",
      opacity: 0.6,
    })
  }, [defaultRoadWidth])

  // Zoom functions
  const zoomIn = useCallback(() => {
    setZoom(prev => Math.min(prev * 1.2, 5))
  }, [])

  const zoomOut = useCallback(() => {
    setZoom(prev => Math.max(prev / 1.2, 0.1))
  }, [])

  const resetZoom = useCallback(() => {
    setZoom(1)
    setPanOffset({ x: 0, y: 0 })
  }, [])

  // Global mouse event listeners
  useEffect(() => {
    const handleGlobalMouseMove = (e: globalThis.MouseEvent) => {
      if (isDraggingRef.current) {
        handleMouseMove(e)
      }
    }

    const handleGlobalMouseUp = (e: globalThis.MouseEvent) => {
      handleMouseUp(e)
    }

    document.addEventListener('mousemove', handleGlobalMouseMove)
    document.addEventListener('mouseup', handleGlobalMouseUp)

    return () => {
      document.removeEventListener('mousemove', handleGlobalMouseMove)
      document.removeEventListener('mouseup', handleGlobalMouseUp)
    }
  }, [handleMouseMove, handleMouseUp])

  return (
    <div className="flex h-screen bg-gray-50">
      {/* Left Sidebar */}
      <div className="w-80 bg-white border-r border-gray-200 flex flex-col overflow-hidden">
        <div className="p-4 border-b border-gray-200">
          <h1 className="text-xl font-bold text-gray-900">Road Map</h1>
          <p className="text-sm text-gray-600 mt-1">Design and build road networks</p>
        </div>
        
        <div className="flex-1 overflow-y-auto p-4 space-y-6">
          <DrawingTools 
            drawingMode={drawingMode} 
            onDrawingModeChange={setDrawingMode} 
          />
          
          <Separator />
          
          {/* Always show Display Options */}
          <DisplayOptions
            snapEnabled={snapEnabled}
            showRoadLengths={showRoadLengths}
            showRoadNames={showRoadNames}
            showPolygons={showPolygons}
            onSnapEnabledChange={setSnapEnabled}
            onShowRoadLengthsChange={setShowRoadLengths}
            onShowRoadNamesChange={setShowRoadNames}
            onShowPolygonsChange={setShowPolygons}
          />

          <Separator />

          {/* Conditional panels based on mode and selection */}
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

          {drawingMode === "select" && selectedPolygon && (
            <SelectedPolygonPanel
              selectedPolygon={selectedPolygon}
              onDeletePolygon={deletePolygon}
              onUpdatePolygonName={updatePolygonName}
              onUpdatePolygonFillColor={updatePolygonFillColor}
              onUpdatePolygonStrokeColor={updatePolygonStrokeColor}
              onUpdatePolygonOpacity={updatePolygonOpacity}
            />
          )}

          {drawingMode === "select" && (selectedRoad || selectedNode) && (
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

          {(drawingMode === "nodes" || drawingMode === "connect" || drawingMode === "add-node") && (
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

          <Separator />
          
          <ActionsPanel
            onRemoveLastElement={removeLastElement}
            onClearCanvas={clearCanvas}
          />
        </div>

        {/* Build Session Controls */}
        {buildSession.isActive && (
          <div className="p-4 border-t border-gray-200 bg-gray-50">
            <div className="flex gap-2">
              <Button onClick={completeBuildSession} size="sm" className="flex-1">
                Complete
              </Button>
              <Button onClick={cancelBuildSession} variant="outline" size="sm" className="flex-1">
                Cancel
              </Button>
            </div>
          </div>
        )}

        {/* Polygon Session Controls */}
        {polygonSession.isActive && (
          <div className="p-4 border-t border-gray-200 bg-gray-50">
            <div className="flex gap-2">
              <Button onClick={completePolygonSession} size="sm" className="flex-1">
                Complete
              </Button>
              <Button onClick={cancelPolygonSession} variant="outline" size="sm" className="flex-1">
                Cancel
              </Button>
            </div>
          </div>
        )}
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