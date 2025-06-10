"use client"

import { useState, useCallback, useRef, useEffect, type MouseEvent } from "react"
import { Button } from "@/components/ui/button"
import { Toggle } from "@/components/ui/toggle"
import { Separator } from "@/components/ui/separator"
import { Eye, EyeOff, Check, X } from "lucide-react"
import DrawingTools from "./drawing-tools"
import RoadSettings from "./road-settings"
import PolygonSettings from "./polygon-settings"
import ActionsPanel from "./actions-panel"
import RoadCanvas from "./road-canvas"
import SelectedItemPanel from "./selected-item-panel"
import SelectedPolygonPanel from "./selected-polygon-panel"
import BackgroundImagePanel from "./background-image-panel"
import StatusBar from "./status-bar"
import { 
  type Road, 
  type Node, 
  type BuildSession, 
  type PolygonSession, 
  type Polygon, 
  type BackgroundImage,
  RoadType, 
  type NodePoint 
} from "@/lib/road-types"

export default function RoadBuilder() {
  // Core state
  const [nodes, setNodes] = useState<Node[]>([])
  const [roads, setRoads] = useState<Road[]>([])
  const [polygons, setPolygons] = useState<Polygon[]>([])
  const [backgroundImages, setBackgroundImages] = useState<BackgroundImage[]>([])
  
  // UI state
  const [drawingMode, setDrawingMode] = useState<"nodes" | "pan" | "select" | "connect" | "disconnect" | "add-node" | "polygon">("nodes")
  const [selectedRoadId, setSelectedRoadId] = useState<string | null>(null)
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null)
  const [selectedPolygonId, setSelectedPolygonId] = useState<string | null>(null)
  const [selectedBackgroundImageId, setSelectedBackgroundImageId] = useState<string | null>(null)
  const [connectingFromNodeId, setConnectingFromNodeId] = useState<string | null>(null)
  const [selectedRoadForDisconnect, setSelectedRoadForDisconnect] = useState<string | null>(null)
  
  // Settings
  const [snapEnabled, setSnapEnabled] = useState(true)
  const [snapDistance, setSnapDistance] = useState(20)
  const [defaultRoadWidth, setDefaultRoadWidth] = useState(12)
  const [scaleMetersPerPixel, setScaleMetersPerPixel] = useState(0.1)
  const [curvedRoads, setCurvedRoads] = useState(false)
  const [showRoadLengths, setShowRoadLengths] = useState(false)
  const [showRoadNames, setShowRoadNames] = useState(true)
  const [showPolygons, setShowPolygons] = useState(true)
  const [showBackgroundLayer, setShowBackgroundLayer] = useState(true)
  
  // Polygon settings
  const [polygonFillColor, setPolygonFillColor] = useState("#3b82f6")
  const [polygonStrokeColor, setPolygonStrokeColor] = useState("#1e40af")
  const [polygonOpacity, setPolygonOpacity] = useState(0.3)
  
  // Canvas state
  const [panOffset, setPanOffset] = useState({ x: 0, y: 0 })
  const [zoom, setZoom] = useState(1)
  const [mousePosition, setMousePosition] = useState<{ x: number; y: number } | null>(null)
  const [isDragging, setIsDragging] = useState(false)
  const [dragStart, setDragStart] = useState<{ x: number; y: number } | null>(null)
  const [isActivelyDrawingCurve, setIsActivelyDrawingCurve] = useState(false)
  
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

  // Helper functions
  const generateId = () => `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`

  const getCanvasCoordinates = useCallback((e: MouseEvent<HTMLCanvasElement> | globalThis.MouseEvent) => {
    const canvas = canvasRef.current
    if (!canvas) return { x: 0, y: 0 }
    
    const rect = canvas.getBoundingClientRect()
    const clientX = 'clientX' in e ? e.clientX : (e as any).clientX
    const clientY = 'clientY' in e ? e.clientY : (e as any).clientY
    
    return {
      x: (clientX - rect.left - panOffset.x) / zoom,
      y: (clientY - rect.top - panOffset.y) / zoom,
    }
  }, [panOffset, zoom])

  const snapToGrid = useCallback((point: { x: number; y: number }) => {
    if (!snapEnabled) return point
    return {
      x: Math.round(point.x / snapDistance) * snapDistance,
      y: Math.round(point.y / snapDistance) * snapDistance,
    }
  }, [snapEnabled, snapDistance])

  const findNearbyNode = useCallback((point: { x: number; y: number }, threshold = 20) => {
    return nodes.find(node => {
      const distance = Math.sqrt(Math.pow(node.x - point.x, 2) + Math.pow(node.y - point.y, 2))
      return distance <= threshold / zoom
    })
  }, [nodes, zoom])

  const findClickedRoad = useCallback((point: { x: number; y: number }, threshold = 10) => {
    return roads.find(road => {
      if (road.type === RoadType.STRAIGHT) {
        const A = { x: road.start.x, y: road.start.y }
        const B = { x: road.end.x, y: road.end.y }
        const P = point
        
        const AB = { x: B.x - A.x, y: B.y - A.y }
        const AP = { x: P.x - A.x, y: P.y - A.y }
        
        const ABdotAB = AB.x * AB.x + AB.y * AB.y
        if (ABdotAB === 0) return false
        
        const t = Math.max(0, Math.min(1, (AP.x * AB.x + AP.y * AB.y) / ABdotAB))
        const closest = { x: A.x + t * AB.x, y: A.y + t * AB.y }
        
        const distance = Math.sqrt(Math.pow(P.x - closest.x, 2) + Math.pow(P.y - closest.y, 2))
        return distance <= (threshold + road.width / 2) / zoom
      }
      return false
    })
  }, [roads, zoom])

  const findClickedPolygon = useCallback((point: { x: number; y: number }) => {
    return polygons.find(polygon => {
      if (polygon.points.length < 3) return false
      
      let inside = false
      for (let i = 0, j = polygon.points.length - 1; i < polygon.points.length; j = i++) {
        const xi = polygon.points[i].x, yi = polygon.points[i].y
        const xj = polygon.points[j].x, yj = polygon.points[j].y
        
        if (((yi > point.y) !== (yj > point.y)) && 
            (point.x < (xj - xi) * (point.y - yi) / (yj - yi) + xi)) {
          inside = !inside
        }
      }
      return inside
    })
  }, [polygons])

  const findClickedBackgroundImage = useCallback((point: { x: number; y: number }) => {
    // Check images in reverse order (top to bottom)
    for (let i = backgroundImages.length - 1; i >= 0; i--) {
      const image = backgroundImages[i]
      if (!image.visible) continue
      
      // Simple bounding box check (could be enhanced for rotation)
      if (point.x >= image.x && point.x <= image.x + image.width &&
          point.y >= image.y && point.y <= image.y + image.height) {
        return image
      }
    }
    return null
  }, [backgroundImages])

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

  const handleAddBackgroundImageFromDrop = useCallback((image: BackgroundImage) => {
    setBackgroundImages(prev => [...prev, image])
    setSelectedBackgroundImageId(image.id)
  }, [])

  // Mouse event handlers
  const handleMouseDown = useCallback((e: MouseEvent<HTMLCanvasElement>) => {
    const coords = getCanvasCoordinates(e)
    const snappedCoords = snapToGrid(coords)
    
    setMousePosition(coords)
    
    if (drawingMode === "pan") {
      setIsDragging(true)
      setDragStart({ x: e.clientX, y: e.clientY })
      return
    }
    
    if (drawingMode === "select") {
      // Check for background image first (top layer)
      if (showBackgroundLayer) {
        const clickedImage = findClickedBackgroundImage(coords)
        if (clickedImage) {
          handleSelectBackgroundImage(clickedImage.id)
          return
        }
      }
      
      // Check for polygon
      if (showPolygons) {
        const clickedPolygon = findClickedPolygon(coords)
        if (clickedPolygon) {
          setSelectedPolygonId(clickedPolygon.id)
          setSelectedRoadId(null)
          setSelectedNodeId(null)
          setSelectedBackgroundImageId(null)
          return
        }
      }
      
      // Check for road
      const clickedRoad = findClickedRoad(coords)
      if (clickedRoad) {
        setSelectedRoadId(clickedRoad.id)
        setSelectedNodeId(null)
        setSelectedPolygonId(null)
        setSelectedBackgroundImageId(null)
        return
      }
      
      // Check for node
      const clickedNode = findNearbyNode(coords)
      if (clickedNode) {
        setSelectedNodeId(clickedNode.id)
        setSelectedRoadId(null)
        setSelectedPolygonId(null)
        setSelectedBackgroundImageId(null)
        return
      }
      
      // Clear all selections
      setSelectedRoadId(null)
      setSelectedNodeId(null)
      setSelectedPolygonId(null)
      setSelectedBackgroundImageId(null)
      return
    }
    
    if (drawingMode === "connect") {
      const clickedNode = findNearbyNode(coords)
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
      const clickedRoad = findClickedRoad(coords)
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
      const existingNode = findNearbyNode(coords)
      if (!existingNode) {
        const newNode: Node = {
          id: generateId(),
          x: snappedCoords.x,
          y: snappedCoords.y,
          connectedRoadIds: [],
        }
        setNodes(prev => [...prev, newNode])
      }
      return
    }
    
    if (drawingMode === "polygon") {
      if (!polygonSession.isActive) {
        setPolygonSession({
          points: [snappedCoords],
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
        
        if (polygonSession.points.length >= 3 && distanceToFirst <= 15 / zoom) {
          // Close polygon
          const newPolygon: Polygon = {
            id: generateId(),
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
          // Add point
          setPolygonSession(prev => ({
            ...prev,
            points: [...prev.points, snappedCoords]
          }))
        }
      }
      return
    }
    
    if (drawingMode === "nodes") {
      const existingNode = findNearbyNode(coords)
      if (existingNode) {
        if (!buildSession.isActive) {
          setBuildSession({
            nodes: [{ ...existingNode }],
            isActive: true,
            roadType: curvedRoads ? RoadType.BEZIER : RoadType.STRAIGHT,
            roadWidth: defaultRoadWidth,
          })
        }
      } else {
        const newNodePoint: NodePoint = {
          id: generateId(),
          x: snappedCoords.x,
          y: snappedCoords.y,
        }
        
        if (!buildSession.isActive) {
          setBuildSession({
            nodes: [newNodePoint],
            isActive: true,
            roadType: curvedRoads ? RoadType.BEZIER : RoadType.STRAIGHT,
            roadWidth: defaultRoadWidth,
          })
        } else {
          setBuildSession(prev => ({
            ...prev,
            nodes: [...prev.nodes, newNodePoint]
          }))
        }
      }
    }
  }, [
    drawingMode, getCanvasCoordinates, snapToGrid, showBackgroundLayer, showPolygons,
    findClickedBackgroundImage, findClickedPolygon, findClickedRoad, findNearbyNode,
    handleSelectBackgroundImage, connectingFromNodeId, selectedRoadForDisconnect,
    polygonSession, polygonFillColor, polygonStrokeColor, polygonOpacity,
    buildSession, curvedRoads, defaultRoadWidth, nodes, zoom
  ])

  const handleMouseMove = useCallback((e: MouseEvent<HTMLCanvasElement> | globalThis.MouseEvent) => {
    const coords = getCanvasCoordinates(e)
    setMousePosition(coords)
    
    if (isDragging && drawingMode === "pan" && dragStart) {
      const clientX = 'clientX' in e ? e.clientX : (e as any).clientX
      const clientY = 'clientY' in e ? e.clientY : (e as any).clientY
      
      setPanOffset(prev => ({
        x: prev.x + (clientX - dragStart.x),
        y: prev.y + (clientY - dragStart.y),
      }))
      setDragStart({ x: clientX, y: clientY })
    }
  }, [getCanvasCoordinates, isDragging, drawingMode, dragStart])

  const handleMouseUp = useCallback((e: MouseEvent<HTMLCanvasElement> | globalThis.MouseEvent) => {
    setIsDragging(false)
    setDragStart(null)
  }, [])

  // Build session handlers
  const handleCompleteBuildSession = useCallback(() => {
    if (buildSession.nodes.length < 2) return
    
    const newNodes: Node[] = []
    const newRoads: Road[] = []
    
    // Create nodes
    buildSession.nodes.forEach(nodePoint => {
      const existingNode = nodes.find(n => n.id === nodePoint.id)
      if (!existingNode) {
        newNodes.push({
          id: nodePoint.id,
          x: nodePoint.x,
          y: nodePoint.y,
          connectedRoadIds: [],
        })
      }
    })
    
    // Create roads
    for (let i = 0; i < buildSession.nodes.length - 1; i++) {
      const startNode = buildSession.nodes[i]
      const endNode = buildSession.nodes[i + 1]
      
      const roadId = generateId()
      const road: Road = {
        id: roadId,
        start: { x: startNode.x, y: startNode.y },
        end: { x: endNode.x, y: endNode.y },
        startNodeId: startNode.id,
        endNodeId: endNode.id,
        type: buildSession.roadType,
        width: buildSession.roadWidth,
      }
      
      if (buildSession.roadType === RoadType.BEZIER && startNode.cp2 && endNode.cp1) {
        road.controlPoints = [startNode.cp2, endNode.cp1]
      }
      
      newRoads.push(road)
      
      // Update node connections
      const updateNodeConnections = (nodeId: string) => {
        const existingNode = nodes.find(n => n.id === nodeId)
        if (existingNode) {
          setNodes(prev => prev.map(n => 
            n.id === nodeId 
              ? { ...n, connectedRoadIds: [...n.connectedRoadIds, roadId] }
              : n
          ))
        } else {
          const newNode = newNodes.find(n => n.id === nodeId)
          if (newNode) {
            newNode.connectedRoadIds.push(roadId)
          }
        }
      }
      
      updateNodeConnections(startNode.id)
      updateNodeConnections(endNode.id)
    }
    
    setNodes(prev => [...prev, ...newNodes])
    setRoads(prev => [...prev, ...newRoads])
    setBuildSession({
      nodes: [],
      isActive: false,
      roadType: curvedRoads ? RoadType.BEZIER : RoadType.STRAIGHT,
      roadWidth: defaultRoadWidth,
    })
  }, [buildSession, nodes, curvedRoads, defaultRoadWidth])

  const handleCancelBuildSession = useCallback(() => {
    setBuildSession({
      nodes: [],
      isActive: false,
      roadType: curvedRoads ? RoadType.BEZIER : RoadType.STRAIGHT,
      roadWidth: defaultRoadWidth,
    })
  }, [curvedRoads, defaultRoadWidth])

  // Polygon session handlers
  const handleCompletePolygonSession = useCallback(() => {
    if (polygonSession.points.length >= 3) {
      const newPolygon: Polygon = {
        id: generateId(),
        points: polygonSession.points,
        roadIds: polygonSession.roadIds,
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
      fillColor: polygonFillColor,
      strokeColor: polygonStrokeColor,
      opacity: polygonOpacity,
    })
  }, [polygonSession, polygonFillColor, polygonStrokeColor, polygonOpacity])

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

  // Action handlers
  const handleRemoveLastElement = useCallback(() => {
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
    setSelectedRoadId(null)
    setSelectedNodeId(null)
    setSelectedPolygonId(null)
    setSelectedBackgroundImageId(null)
    setConnectingFromNodeId(null)
    setSelectedRoadForDisconnect(null)
  }, [curvedRoads, defaultRoadWidth, polygonFillColor, polygonStrokeColor, polygonOpacity])

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
    const node = nodes.find(n => n.id === nodeId)
    if (node) {
      // Remove all connected roads
      node.connectedRoadIds.forEach(roadId => {
        setRoads(prev => prev.filter(r => r.id !== roadId))
      })
      // Remove the node
      setNodes(prev => prev.filter(n => n.id !== nodeId))
      setSelectedNodeId(null)
    }
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
    area = Math.abs(area) / 2
    return sum + area * scaleMetersPerPixel * scaleMetersPerPixel
  }, 0)

  // Get selected items
  const selectedRoad = selectedRoadId ? roads.find(r => r.id === selectedRoadId) : null
  const selectedNode = selectedNodeId ? nodes.find(n => n.id === selectedNodeId) : null
  const selectedPolygon = selectedPolygonId ? polygons.find(p => p.id === selectedPolygonId) : null

  // Update polygon session when settings change
  useEffect(() => {
    if (polygonSession.isActive) {
      setPolygonSession(prev => ({
        ...prev,
        fillColor: polygonFillColor,
        strokeColor: polygonStrokeColor,
        opacity: polygonOpacity,
      }))
    }
  }, [polygonFillColor, polygonStrokeColor, polygonOpacity, polygonSession.isActive])

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
        <div className="w-80 bg-white border-r border-gray-200 overflow-y-auto">
          <div className="p-4 space-y-6">
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
            
            <Separator />
            
            <PolygonSettings
              fillColor={polygonFillColor}
              strokeColor={polygonStrokeColor}
              opacity={polygonOpacity}
              onFillColorChange={setPolygonFillColor}
              onStrokeColorChange={setPolygonStrokeColor}
              onOpacityChange={setPolygonOpacity}
            />
            
            <Separator />
            
            <BackgroundImagePanel
              backgroundImages={backgroundImages}
              showBackgroundLayer={showBackgroundLayer}
              selectedBackgroundImageId={selectedBackgroundImageId}
              onAddBackgroundImage={handleAddBackgroundImage}
              onUpdateBackgroundImage={handleUpdateBackgroundImage}
              onRemoveBackgroundImage={handleRemoveBackgroundImage}
              onToggleBackgroundLayer={setShowBackgroundLayer}
              onSelectBackgroundImage={handleSelectBackgroundImage}
            />
            
            <Separator />
            
            <ActionsPanel
              onRemoveLastElement={handleRemoveLastElement}
              onClearCanvas={handleClearCanvas}
            />
          </div>
        </div>

        {/* Main Canvas */}
        <div className="flex-1 flex flex-col">
          {/* Canvas Controls */}
          <div className="bg-white border-b border-gray-200 px-4 py-2 flex items-center gap-4">
            <div className="flex items-center gap-2">
              <Toggle
                pressed={showRoadLengths}
                onPressedChange={setShowRoadLengths}
                aria-label="Show road lengths"
                size="sm"
              >
                Lengths
              </Toggle>
              <Toggle
                pressed={showRoadNames}
                onPressedChange={setShowRoadNames}
                aria-label="Show road names"
                size="sm"
              >
                Names
              </Toggle>
              <Toggle
                pressed={showPolygons}
                onPressedChange={setShowPolygons}
                aria-label="Show polygons"
                size="sm"
              >
                {showPolygons ? <Eye size={16} /> : <EyeOff size={16} />}
                Polygons
              </Toggle>
            </div>
            
            {buildSession.isActive && (
              <div className="flex items-center gap-2 ml-auto">
                <Button size="sm" variant="outline" onClick={handleCancelBuildSession}>
                  <X size={16} className="mr-1" />
                  Cancel
                </Button>
                <Button size="sm" onClick={handleCompleteBuildSession}>
                  <Check size={16} className="mr-1" />
                  Complete
                </Button>
              </div>
            )}
            
            {polygonSession.isActive && (
              <div className="flex items-center gap-2 ml-auto">
                <Button size="sm" variant="outline" onClick={handleCancelPolygonSession}>
                  <X size={16} className="mr-1" />
                  Cancel
                </Button>
                <Button size="sm" onClick={handleCompletePolygonSession}>
                  <Check size={16} className="mr-1" />
                  Complete
                </Button>
              </div>
            )}
          </div>

          <RoadCanvas
            ref={canvasRef}
            nodes={nodes}
            roads={roads}
            polygons={polygons}
            backgroundImages={backgroundImages}
            buildSession={buildSession}
            polygonSession={polygonSession}
            drawingMode={drawingMode}
            snapEnabled={snapEnabled}
            snapDistance={snapDistance}
            defaultRoadWidth={defaultRoadWidth}
            showRoadLengths={showRoadLengths}
            showRoadNames={showRoadNames}
            showPolygons={showPolygons}
            showBackgroundLayer={showBackgroundLayer}
            scaleMetersPerPixel={scaleMetersPerPixel}
            selectedRoadId={selectedRoadId}
            selectedNodeId={selectedNodeId}
            selectedPolygonId={selectedPolygonId}
            selectedBackgroundImageId={selectedBackgroundImageId}
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
            onUpdateBackgroundImage={handleUpdateBackgroundImage}
            onSelectBackgroundImage={handleSelectBackgroundImage}
            onAddBackgroundImageFromDrop={handleAddBackgroundImageFromDrop}
          />
        </div>

        {/* Right Sidebar */}
        <div className="w-80 bg-white border-l border-gray-200 overflow-y-auto">
          <div className="p-4 space-y-6">
            <SelectedItemPanel
              selectedRoad={selectedRoad}
              selectedNode={selectedNode}
              onDeleteRoad={handleDeleteRoad}
              onDeleteNode={handleDeleteNode}
              calculateRoadLength={calculateRoadLength}
              onUpdateRoadWidth={handleUpdateRoadWidth}
              onUpdateRoadName={handleUpdateRoadName}
            />
            
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
  )
}