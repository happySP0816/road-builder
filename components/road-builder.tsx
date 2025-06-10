"use client"

import { useState, useCallback, useRef, useEffect, type MouseEvent } from "react"
import { Button } from "@/components/ui/button"
import { Separator } from "@/components/ui/separator"
import { Check, X } from "lucide-react"
import RoadCanvas from "./road-canvas"
import DrawingTools from "./drawing-tools"
import RoadSettings from "./road-settings"
import PolygonSettings from "./polygon-settings"
import ActionsPanel from "./actions-panel"
import SelectedItemPanel from "./selected-item-panel"
import SelectedPolygonPanel from "./selected-polygon-panel"
import ViewSettings from "./view-settings"
import StatusBar from "./status-bar"
import { 
  type Road, 
  type Node, 
  type Polygon,
  type BuildSession, 
  type PolygonSession,
  type BackgroundImage,
  RoadType 
} from "@/lib/road-types"

export default function RoadBuilder() {
  // Core state
  const [nodes, setNodes] = useState<Node[]>([])
  const [roads, setRoads] = useState<Road[]>([])
  const [polygons, setPolygons] = useState<Polygon[]>([])
  const [backgroundImages, setBackgroundImages] = useState<BackgroundImage[]>([])
  
  // Drawing mode and sessions
  const [drawingMode, setDrawingMode] = useState<"nodes" | "pan" | "select" | "connect" | "disconnect" | "add-node" | "polygon" | "background-image">("nodes")
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
    opacity: 0.3,
  })

  // Selection state
  const [selectedRoadId, setSelectedRoadId] = useState<string | null>(null)
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null)
  const [selectedPolygonId, setSelectedPolygonId] = useState<string | null>(null)
  const [selectedBackgroundImageId, setSelectedBackgroundImageId] = useState<string | null>(null)
  const [connectingFromNodeId, setConnectingFromNodeId] = useState<string | null>(null)
  const [selectedRoadForDisconnect, setSelectedRoadForDisconnect] = useState<string | null>(null)

  // Settings state
  const [snapEnabled] = useState(true)
  const [snapDistance, setSnapDistance] = useState(20)
  const [defaultRoadWidth, setDefaultRoadWidth] = useState(15)
  const [scaleMetersPerPixel, setScaleMetersPerPixel] = useState(0.1)
  const [curvedRoads, setCurvedRoads] = useState(false)
  const [showRoadLengths, setShowRoadLengths] = useState(true)
  const [showRoadNames, setShowRoadNames] = useState(true)
  const [showPolygons, setShowPolygons] = useState(true)
  const [showBackgroundLayer, setShowBackgroundLayer] = useState(true)

  // Canvas state
  const [panOffset, setPanOffset] = useState({ x: 0, y: 0 })
  const [zoom, setZoom] = useState(1)
  const [mousePosition, setMousePosition] = useState<{ x: number; y: number } | null>(null)
  const [isActivelyDrawingCurve, setIsActivelyDrawingCurve] = useState(false)
  const [isPanning, setIsPanning] = useState(false)
  const [lastPanPoint, setLastPanPoint] = useState<{ x: number; y: number } | null>(null)
  const [isDraggingImage, setIsDraggingImage] = useState(false)
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 })

  // Refs
  const canvasRef = useRef<HTMLCanvasElement>(null)

  // Derived state
  const selectedNodeData = selectedNodeId ? nodes.find(n => n.id === selectedNodeId) || null : null
  const selectedRoad = selectedRoadId ? roads.find(r => r.id === selectedRoadId) || null : null
  const selectedPolygon = selectedPolygonId ? polygons.find(p => p.id === selectedPolygonId) || null : null

  // Utility functions
  const generateId = () => `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`

  const getCanvasCoordinates = useCallback((clientX: number, clientY: number) => {
    const canvas = canvasRef.current
    if (!canvas) return { x: 0, y: 0 }
    const rect = canvas.getBoundingClientRect()
    return {
      x: (clientX - rect.left - panOffset.x) / zoom,
      y: (clientY - rect.top - panOffset.y) / zoom,
    }
  }, [panOffset, zoom])

  const snapToGrid = useCallback((x: number, y: number) => {
    if (!snapEnabled) return { x, y }
    return {
      x: Math.round(x / snapDistance) * snapDistance,
      y: Math.round(y / snapDistance) * snapDistance,
    }
  }, [snapEnabled, snapDistance])

  const findNearbyNode = useCallback((x: number, y: number, threshold = 20) => {
    return nodes.find(node => {
      const distance = Math.sqrt(Math.pow(node.x - x, 2) + Math.pow(node.y - y, 2))
      return distance <= threshold / zoom
    })
  }, [nodes, zoom])

  const findClickedRoad = useCallback((x: number, y: number, threshold = 10) => {
    return roads.find(road => {
      if (road.type === RoadType.STRAIGHT) {
        const A = road.start
        const B = road.end
        const C = { x, y }
        
        const crossProduct = (C.y - A.y) * (B.x - A.x) - (C.x - A.x) * (B.y - A.y)
        const distance = Math.abs(crossProduct) / Math.sqrt(Math.pow(B.x - A.x, 2) + Math.pow(B.y - A.y, 2))
        
        const dotProduct = (C.x - A.x) * (B.x - A.x) + (C.y - A.y) * (B.y - A.y)
        const squaredLength = Math.pow(B.x - A.x, 2) + Math.pow(B.y - A.y, 2)
        const param = dotProduct / squaredLength
        
        return distance <= threshold / zoom && param >= 0 && param <= 1
      }
      return false
    })
  }, [roads, zoom])

  const findClickedPolygon = useCallback((x: number, y: number) => {
    return polygons.find(polygon => {
      if (polygon.points.length < 3) return false
      
      let inside = false
      for (let i = 0, j = polygon.points.length - 1; i < polygon.points.length; j = i++) {
        const xi = polygon.points[i].x, yi = polygon.points[i].y
        const xj = polygon.points[j].x, yj = polygon.points[j].y
        
        if (((yi > y) !== (yj > y)) && (x < (xj - xi) * (y - yi) / (yj - yi) + xi)) {
          inside = !inside
        }
      }
      return inside
    })
  }, [polygons])

  const findClickedBackgroundImage = useCallback((x: number, y: number) => {
    // Check images in reverse order (top to bottom)
    for (let i = backgroundImages.length - 1; i >= 0; i--) {
      const image = backgroundImages[i]
      if (!image.visible) continue
      
      // Simple bounding box check
      if (x >= image.x && x <= image.x + image.width &&
          y >= image.y && y <= image.y + image.height) {
        return image
      }
    }
    return null
  }, [backgroundImages])

  const calculateRoadLength = useCallback((road: Road): number => {
    if (road.type === RoadType.BEZIER && road.controlPoints) {
      let len = 0
      const steps = 20
      let p0 = road.start
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

  // Background image handlers
  const handleAddBackgroundImage = useCallback((image: BackgroundImage) => {
    setBackgroundImages(prev => [...prev, image])
    setSelectedBackgroundImageId(image.id)
  }, [])

  const handleUpdateBackgroundImage = useCallback((id: string, updates: Partial<BackgroundImage>) => {
    setBackgroundImages(prev => prev.map(img => 
      img.id === id ? { ...img, ...updates } : img
    ))
  }, [])

  const handleRemoveBackgroundImage = useCallback((id: string) => {
    setBackgroundImages(prev => prev.filter(img => img.id !== id))
    if (selectedBackgroundImageId === id) {
      setSelectedBackgroundImageId(null)
    }
  }, [selectedBackgroundImageId])

  const handleSelectBackgroundImage = useCallback((id: string | null) => {
    setSelectedBackgroundImageId(id)
    // Clear other selections when selecting background image
    if (id) {
      setSelectedRoadId(null)
      setSelectedNodeId(null)
      setSelectedPolygonId(null)
    }
  }, [])

  // Mouse event handlers
  const handleMouseDown = useCallback((e: MouseEvent<HTMLCanvasElement>) => {
    const coords = getCanvasCoordinates(e.clientX, e.clientY)
    const snappedCoords = snapToGrid(coords.x, coords.y)

    if (drawingMode === "pan") {
      setIsPanning(true)
      setLastPanPoint({ x: e.clientX, y: e.clientY })
      return
    }

    if (drawingMode === "background-image") {
      const clickedImage = findClickedBackgroundImage(coords.x, coords.y)
      if (clickedImage) {
        setSelectedBackgroundImageId(clickedImage.id)
        setIsDraggingImage(true)
        setDragOffset({
          x: coords.x - clickedImage.x,
          y: coords.y - clickedImage.y
        })
        // Clear other selections
        setSelectedRoadId(null)
        setSelectedNodeId(null)
        setSelectedPolygonId(null)
      } else {
        setSelectedBackgroundImageId(null)
      }
      return
    }

    if (drawingMode === "select") {
      const nearbyNode = findNearbyNode(coords.x, coords.y)
      const clickedRoad = findClickedRoad(coords.x, coords.y)
      const clickedPolygon = findClickedPolygon(coords.x, coords.y)

      if (nearbyNode) {
        setSelectedNodeId(nearbyNode.id)
        setSelectedRoadId(null)
        setSelectedPolygonId(null)
        setSelectedBackgroundImageId(null)
      } else if (clickedRoad) {
        setSelectedRoadId(clickedRoad.id)
        setSelectedNodeId(null)
        setSelectedPolygonId(null)
        setSelectedBackgroundImageId(null)
      } else if (clickedPolygon) {
        setSelectedPolygonId(clickedPolygon.id)
        setSelectedRoadId(null)
        setSelectedNodeId(null)
        setSelectedBackgroundImageId(null)
      } else {
        setSelectedRoadId(null)
        setSelectedNodeId(null)
        setSelectedPolygonId(null)
        setSelectedBackgroundImageId(null)
      }
      return
    }

    if (drawingMode === "connect") {
      const nearbyNode = findNearbyNode(coords.x, coords.y)
      if (nearbyNode) {
        if (!connectingFromNodeId) {
          setConnectingFromNodeId(nearbyNode.id)
        } else if (connectingFromNodeId === nearbyNode.id) {
          // Create circle road
          const newRoad: Road = {
            id: generateId(),
            start: { x: nearbyNode.x, y: nearbyNode.y },
            end: { x: nearbyNode.x, y: nearbyNode.y },
            startNodeId: nearbyNode.id,
            endNodeId: nearbyNode.id,
            type: RoadType.CIRCLE,
            width: defaultRoadWidth,
          }
          setRoads(prev => [...prev, newRoad])
          setNodes(prev => prev.map(node => 
            node.id === nearbyNode.id 
              ? { ...node, connectedRoadIds: [...node.connectedRoadIds, newRoad.id] }
              : node
          ))
          setConnectingFromNodeId(null)
        } else {
          // Create straight road between nodes
          const fromNode = nodes.find(n => n.id === connectingFromNodeId)!
          const newRoad: Road = {
            id: generateId(),
            start: { x: fromNode.x, y: fromNode.y },
            end: { x: nearbyNode.x, y: nearbyNode.y },
            startNodeId: fromNode.id,
            endNodeId: nearbyNode.id,
            type: RoadType.STRAIGHT,
            width: defaultRoadWidth,
          }
          setRoads(prev => [...prev, newRoad])
          setNodes(prev => prev.map(node => {
            if (node.id === fromNode.id || node.id === nearbyNode.id) {
              return { ...node, connectedRoadIds: [...node.connectedRoadIds, newRoad.id] }
            }
            return node
          }))
          setConnectingFromNodeId(null)
        }
      }
      return
    }

    if (drawingMode === "disconnect") {
      const clickedRoad = findClickedRoad(coords.x, coords.y)
      if (clickedRoad) {
        if (selectedRoadForDisconnect === clickedRoad.id) {
          // Delete the road
          setRoads(prev => prev.filter(r => r.id !== clickedRoad.id))
          setNodes(prev => prev.map(node => ({
            ...node,
            connectedRoadIds: node.connectedRoadIds.filter(id => id !== clickedRoad.id)
          })))
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
      const newNode: Node = {
        id: generateId(),
        x: snappedCoords.x,
        y: snappedCoords.y,
        connectedRoadIds: [],
      }
      setNodes(prev => [...prev, newNode])
      return
    }

    if (drawingMode === "polygon") {
      if (!polygonSession.isActive) {
        setPolygonSession(prev => ({
          ...prev,
          isActive: true,
          points: [snappedCoords],
        }))
      } else {
        const firstPoint = polygonSession.points[0]
        const distanceToFirst = Math.sqrt(
          Math.pow(snappedCoords.x - firstPoint.x, 2) + 
          Math.pow(snappedCoords.y - firstPoint.y, 2)
        )
        
        if (polygonSession.points.length >= 3 && distanceToFirst <= 20 / zoom) {
          // Close polygon
          const newPolygon: Polygon = {
            id: generateId(),
            points: polygonSession.points,
            roadIds: [],
            fillColor: polygonSession.fillColor,
            strokeColor: polygonSession.strokeColor,
            opacity: polygonSession.opacity,
          }
          setPolygons(prev => [...prev, newPolygon])
          setPolygonSession(prev => ({
            ...prev,
            isActive: false,
            points: [],
            roadIds: [],
          }))
        } else {
          // Add point
          setPolygonSession(prev => ({
            ...prev,
            points: [...prev.points, snappedCoords],
          }))
        }
      }
      return
    }

    if (drawingMode === "nodes") {
      if (!buildSession.isActive) {
        setBuildSession(prev => ({
          ...prev,
          isActive: true,
          nodes: [{
            id: generateId(),
            x: snappedCoords.x,
            y: snappedCoords.y,
            connectedRoadIds: [],
          }],
        }))
      } else {
        const lastNode = buildSession.nodes[buildSession.nodes.length - 1]
        const newNode = {
          id: generateId(),
          x: snappedCoords.x,
          y: snappedCoords.y,
          connectedRoadIds: [],
        }
        setBuildSession(prev => ({
          ...prev,
          nodes: [...prev.nodes, newNode],
        }))
      }
    }
  }, [
    drawingMode, getCanvasCoordinates, snapToGrid, findNearbyNode, findClickedRoad, 
    findClickedPolygon, findClickedBackgroundImage, connectingFromNodeId, 
    selectedRoadForDisconnect, polygonSession, buildSession, nodes, defaultRoadWidth, 
    zoom, generateId
  ])

  const handleMouseMove = useCallback((e: MouseEvent<HTMLCanvasElement> | globalThis.MouseEvent) => {
    const coords = getCanvasCoordinates(e.clientX, e.clientY)
    setMousePosition(coords)

    if (isPanning && lastPanPoint) {
      const deltaX = e.clientX - lastPanPoint.x
      const deltaY = e.clientY - lastPanPoint.y
      setPanOffset(prev => ({
        x: prev.x + deltaX,
        y: prev.y + deltaY,
      }))
      setLastPanPoint({ x: e.clientX, y: e.clientY })
      return
    }

    if (isDraggingImage && selectedBackgroundImageId) {
      const newX = coords.x - dragOffset.x
      const newY = coords.y - dragOffset.y
      handleUpdateBackgroundImage(selectedBackgroundImageId, { x: newX, y: newY })
      return
    }
  }, [
    getCanvasCoordinates, isPanning, lastPanPoint, isDraggingImage, 
    selectedBackgroundImageId, dragOffset, handleUpdateBackgroundImage
  ])

  const handleMouseUp = useCallback(() => {
    setIsPanning(false)
    setLastPanPoint(null)
    setIsDraggingImage(false)
    setDragOffset({ x: 0, y: 0 })
  }, [])

  // Build session handlers
  const handleCompleteBuildSession = useCallback(() => {
    if (buildSession.nodes.length < 2) return

    const newNodes: Node[] = []
    const newRoads: Road[] = []

    buildSession.nodes.forEach((sessionNode, index) => {
      const newNode: Node = {
        id: sessionNode.id,
        x: sessionNode.x,
        y: sessionNode.y,
        connectedRoadIds: [],
      }
      newNodes.push(newNode)

      if (index > 0) {
        const prevNode = buildSession.nodes[index - 1]
        const roadId = generateId()
        
        const newRoad: Road = {
          id: roadId,
          start: { x: prevNode.x, y: prevNode.y },
          end: { x: sessionNode.x, y: sessionNode.y },
          startNodeId: prevNode.id,
          endNodeId: sessionNode.id,
          type: buildSession.roadType,
          width: buildSession.roadWidth,
        }

        if (buildSession.roadType === RoadType.BEZIER) {
          newRoad.controlPoints = [
            sessionNode.cp1 || { x: sessionNode.x, y: sessionNode.y },
            prevNode.cp2 || { x: prevNode.x, y: prevNode.y },
          ]
        }

        newRoads.push(newRoad)
        newNodes[index - 1].connectedRoadIds.push(roadId)
        newNodes[index].connectedRoadIds.push(roadId)
      }
    })

    setNodes(prev => [...prev, ...newNodes])
    setRoads(prev => [...prev, ...newRoads])
    setBuildSession({
      nodes: [],
      isActive: false,
      roadType: RoadType.STRAIGHT,
      roadWidth: defaultRoadWidth,
    })
  }, [buildSession, generateId, defaultRoadWidth])

  const handleCancelBuildSession = useCallback(() => {
    setBuildSession({
      nodes: [],
      isActive: false,
      roadType: RoadType.STRAIGHT,
      roadWidth: defaultRoadWidth,
    })
  }, [defaultRoadWidth])

  // Polygon session handlers
  const handleCompletePolygonSession = useCallback(() => {
    if (polygonSession.points.length >= 3) {
      const newPolygon: Polygon = {
        id: generateId(),
        points: polygonSession.points,
        roadIds: [],
        fillColor: polygonSession.fillColor,
        strokeColor: polygonSession.strokeColor,
        opacity: polygonSession.opacity,
      }
      setPolygons(prev => [...prev, newPolygon])
    }
    setPolygonSession({
      points: [],
      roadIds: [],
      isActive: false,
      fillColor: "#3b82f6",
      strokeColor: "#1e40af",
      opacity: 0.3,
    })
  }, [polygonSession, generateId])

  const handleCancelPolygonSession = useCallback(() => {
    setPolygonSession({
      points: [],
      roadIds: [],
      isActive: false,
      fillColor: "#3b82f6",
      strokeColor: "#1e40af",
      opacity: 0.3,
    })
  }, [])

  // Action handlers
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
      setRoads(prev => prev.slice(0, -1))
      setNodes(prev => prev.map(node => ({
        ...node,
        connectedRoadIds: node.connectedRoadIds.filter(id => id !== lastRoad.id)
      })))
    }
  }, [buildSession, polygonSession, roads])

  const handleClearCanvas = useCallback(() => {
    setNodes([])
    setRoads([])
    setPolygons([])
    setBackgroundImages([])
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
      opacity: 0.3,
    })
    setSelectedRoadId(null)
    setSelectedNodeId(null)
    setSelectedPolygonId(null)
    setSelectedBackgroundImageId(null)
    setConnectingFromNodeId(null)
    setSelectedRoadForDisconnect(null)
  }, [defaultRoadWidth])

  // Delete handlers
  const handleDeleteRoad = useCallback((roadId: string) => {
    setRoads(prev => prev.filter(r => r.id !== roadId))
    setNodes(prev => prev.map(node => ({
      ...node,
      connectedRoadIds: node.connectedRoadIds.filter(id => id !== roadId)
    })))
    setSelectedRoadId(null)
  }, [])

  const handleDeleteNode = useCallback((nodeId: string) => {
    const nodeToDelete = nodes.find(n => n.id === nodeId)
    if (!nodeToDelete) return

    // Remove all connected roads
    nodeToDelete.connectedRoadIds.forEach(roadId => {
      setRoads(prev => prev.filter(r => r.id !== roadId))
    })

    // Remove the node
    setNodes(prev => prev.filter(n => n.id !== nodeId))
    
    // Update other nodes to remove references to deleted roads
    setNodes(prev => prev.map(node => ({
      ...node,
      connectedRoadIds: node.connectedRoadIds.filter(roadId => 
        !nodeToDelete.connectedRoadIds.includes(roadId)
      )
    })))
    
    setSelectedNodeId(null)
  }, [nodes])

  const handleDeletePolygon = useCallback((polygonId: string) => {
    setPolygons(prev => prev.filter(p => p.id !== polygonId))
    setSelectedPolygonId(null)
  }, [])

  // Update handlers
  const handleUpdateRoadWidth = useCallback((roadId: string, newWidth: number) => {
    setRoads(prev => prev.map(road => 
      road.id === roadId ? { ...road, width: newWidth } : road
    ))
  }, [])

  const handleUpdateRoadName = useCallback((roadId: string, newName: string) => {
    setRoads(prev => prev.map(road => 
      road.id === roadId ? { ...road, name: newName } : road
    ))
  }, [])

  const handleUpdatePolygonName = useCallback((polygonId: string, newName: string) => {
    setPolygons(prev => prev.map(polygon => 
      polygon.id === polygonId ? { ...polygon, name: newName } : polygon
    ))
  }, [])

  const handleUpdatePolygonFillColor = useCallback((polygonId: string, newColor: string) => {
    setPolygons(prev => prev.map(polygon => 
      polygon.id === polygonId ? { ...polygon, fillColor: newColor } : polygon
    ))
  }, [])

  const handleUpdatePolygonStrokeColor = useCallback((polygonId: string, newColor: string) => {
    setPolygons(prev => prev.map(polygon => 
      polygon.id === polygonId ? { ...polygon, strokeColor: newColor } : polygon
    ))
  }, [])

  const handleUpdatePolygonOpacity = useCallback((polygonId: string, newOpacity: number) => {
    setPolygons(prev => prev.map(polygon => 
      polygon.id === polygonId ? { ...polygon, opacity: newOpacity } : polygon
    ))
  }, [])

  // Zoom handlers
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

  // Global mouse event listeners
  useEffect(() => {
    const handleGlobalMouseMove = (e: globalThis.MouseEvent) => {
      if (isPanning || isDraggingImage) {
        handleMouseMove(e)
      }
    }

    const handleGlobalMouseUp = () => {
      handleMouseUp()
    }

    if (isPanning || isDraggingImage) {
      document.addEventListener('mousemove', handleGlobalMouseMove)
      document.addEventListener('mouseup', handleGlobalMouseUp)
    }

    return () => {
      document.removeEventListener('mousemove', handleGlobalMouseMove)
      document.removeEventListener('mouseup', handleGlobalMouseUp)
    }
  }, [isPanning, isDraggingImage, handleMouseMove, handleMouseUp])

  // Calculate totals
  const totalLength = roads.reduce((sum, road) => sum + calculateRoadLength(road), 0)
  const totalArea = polygons.reduce((sum, polygon) => {
    if (polygon.points.length < 3) return sum
    let area = 0
    for (let i = 0; i < polygon.points.length; i++) {
      const j = (i + 1) % polygon.points.length
      area += polygon.points[i].x * polygon.points[j].y
      area -= polygon.points[j].x * polygon.points[i].y
    }
    return sum + Math.abs(area) / 2 * scaleMetersPerPixel * scaleMetersPerPixel
  }, 0)

  return (
    <div className="flex h-screen bg-gray-50">
      {/* Left Sidebar */}
      <div className="w-64 bg-white border-r border-gray-200 flex flex-col">
        <div className="p-4 border-b border-gray-200">
          <h1 className="text-xl font-bold text-gray-900">Road Map</h1>
        </div>
        
        <div className="flex-1 overflow-y-auto p-4 space-y-6">
          <DrawingTools 
            drawingMode={drawingMode} 
            onDrawingModeChange={setDrawingMode} 
          />
          
          <Separator />
          
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
          
          {drawingMode === "polygon" && (
            <>
              <Separator />
              <PolygonSettings
                fillColor={polygonSession.fillColor}
                strokeColor={polygonSession.strokeColor}
                opacity={polygonSession.opacity}
                onFillColorChange={(color) => setPolygonSession(prev => ({ ...prev, fillColor: color }))}
                onStrokeColorChange={(color) => setPolygonSession(prev => ({ ...prev, strokeColor: color }))}
                onOpacityChange={(opacity) => setPolygonSession(prev => ({ ...prev, opacity }))}
              />
            </>
          )}
          
          <Separator />
          
          <ActionsPanel
            onRemoveLastElement={handleRemoveLastElement}
            onClearCanvas={handleClearCanvas}
          />
        </div>

        {/* Build Session Controls */}
        {(buildSession.isActive || polygonSession.isActive) && (
          <div className="p-4 border-t border-gray-200 bg-gray-50">
            <div className="flex gap-2">
              <Button 
                size="sm" 
                onClick={buildSession.isActive ? handleCompleteBuildSession : handleCompletePolygonSession}
                className="flex-1"
              >
                <Check size={16} className="mr-1" />
                Complete
              </Button>
              <Button 
                variant="outline" 
                size="sm" 
                onClick={buildSession.isActive ? handleCancelBuildSession : handleCancelPolygonSession}
                className="flex-1"
              >
                <X size={16} className="mr-1" />
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
        
        <div className="flex-1 flex">
          <RoadCanvas
            ref={canvasRef}
            nodes={nodes}
            roads={roads}
            polygons={polygons}
            backgroundImages={backgroundImages}
            showBackgroundLayer={showBackgroundLayer}
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
            selectedBackgroundImageId={selectedBackgroundImageId}
            selectedNodeData={selectedNodeData}
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
          <div className="w-64 bg-white border-l border-gray-200 flex flex-col">
            <div className="p-4 border-b border-gray-200">
              <h2 className="text-lg font-semibold text-gray-900">Settings</h2>
            </div>
            
            <div className="flex-1 overflow-y-auto p-4 space-y-6">
              <ViewSettings
                showRoadLengths={showRoadLengths}
                showRoadNames={showRoadNames}
                showPolygons={showPolygons}
                onShowRoadLengthsChange={setShowRoadLengths}
                onShowRoadNamesChange={setShowRoadNames}
                onShowPolygonsChange={setShowPolygons}
                drawingMode={drawingMode}
                backgroundImages={backgroundImages}
                showBackgroundLayer={showBackgroundLayer}
                selectedBackgroundImageId={selectedBackgroundImageId}
                onAddBackgroundImage={handleAddBackgroundImage}
                onUpdateBackgroundImage={handleUpdateBackgroundImage}
                onRemoveBackgroundImage={handleRemoveBackgroundImage}
                onToggleBackgroundLayer={setShowBackgroundLayer}
                onSelectBackgroundImage={handleSelectBackgroundImage}
              />
              
              {selectedRoad && (
                <>
                  <Separator />
                  <SelectedItemPanel
                    selectedRoad={selectedRoad}
                    selectedNode={selectedNodeData}
                    onDeleteRoad={handleDeleteRoad}
                    onDeleteNode={handleDeleteNode}
                    calculateRoadLength={calculateRoadLength}
                    onUpdateRoadWidth={handleUpdateRoadWidth}
                    onUpdateRoadName={handleUpdateRoadName}
                  />
                </>
              )}
              
              {selectedNodeData && !selectedRoad && (
                <>
                  <Separator />
                  <SelectedItemPanel
                    selectedRoad={null}
                    selectedNode={selectedNodeData}
                    onDeleteRoad={handleDeleteRoad}
                    onDeleteNode={handleDeleteNode}
                    calculateRoadLength={calculateRoadLength}
                  />
                </>
              )}
              
              {selectedPolygon && (
                <>
                  <Separator />
                  <SelectedPolygonPanel
                    selectedPolygon={selectedPolygon}
                    onDeletePolygon={handleDeletePolygon}
                    onUpdatePolygonName={handleUpdatePolygonName}
                    onUpdatePolygonFillColor={handleUpdatePolygonFillColor}
                    onUpdatePolygonStrokeColor={handleUpdatePolygonStrokeColor}
                    onUpdatePolygonOpacity={handleUpdatePolygonOpacity}
                  />
                </>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}