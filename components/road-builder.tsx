"use client"

import { useState, useCallback, useRef, useEffect, type MouseEvent } from "react"
import { Button } from "@/components/ui/button"
import { Toggle } from "@/components/ui/toggle"
import { Separator } from "@/components/ui/separator"
import { Checkbox } from "@/components/ui/checkbox"
import { Label } from "@/components/ui/label"
import { Eye, EyeOff, Type, Ruler } from "lucide-react"
import RoadCanvas from "./road-canvas"
import DrawingTools from "./drawing-tools"
import RoadSettings from "./road-settings"
import PolygonSettings from "./polygon-settings"
import BackgroundImagePanel from "./background-image-panel"
import SelectedItemPanel from "./selected-item-panel"
import SelectedPolygonPanel from "./selected-polygon-panel"
import ActionsPanel from "./actions-panel"
import StatusBar from "./status-bar"
import { 
  type Road, 
  type Node, 
  type Polygon,
  type BackgroundImage,
  type BuildSession, 
  type PolygonSession,
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
  
  // Canvas state
  const [panOffset, setPanOffset] = useState({ x: 0, y: 0 })
  const [zoom, setZoom] = useState(1)
  const [mousePosition, setMousePosition] = useState<{ x: number; y: number } | null>(null)
  const [isDragging, setIsDragging] = useState(false)
  const [dragStart, setDragStart] = useState<{ x: number; y: number } | null>(null)
  const [isActivelyDrawingCurve, setIsActivelyDrawingCurve] = useState(false)
  
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
  
  // Sessions
  const [buildSession, setBuildSession] = useState<BuildSession>({
    nodes: [],
    isActive: false,
    roadType: RoadType.STRAIGHT,
    roadWidth: defaultRoadWidth,
  })
  
  const [polygonSession, setPolygonSession] = useState<PolygonSession>({
    points: [],
    roadIds: [],
    isActive: false,
    fillColor: polygonFillColor,
    strokeColor: polygonStrokeColor,
    opacity: polygonOpacity,
  })

  const canvasRef = useRef<HTMLCanvasElement>(null)

  // Background image functions
  const handleAddBackgroundImage = useCallback((file: File) => {
    const url = URL.createObjectURL(file)
    const img = new Image()
    
    img.onload = () => {
      const newImage: BackgroundImage = {
        id: `bg-${Date.now()}`,
        name: file.name,
        url,
        x: 0,
        y: 0,
        width: img.naturalWidth,
        height: img.naturalHeight,
        opacity: 1,
        rotation: 0,
        visible: true,
        locked: false,
        originalWidth: img.naturalWidth,
        originalHeight: img.naturalHeight,
        maintainAspectRatio: true,
      }
      
      setBackgroundImages(prev => [...prev, newImage])
      setSelectedBackgroundImageId(newImage.id)
    }
    
    img.src = url
  }, [])

  const handleUpdateBackgroundImage = useCallback((id: string, updates: Partial<BackgroundImage>) => {
    setBackgroundImages(prev => 
      prev.map(img => img.id === id ? { ...img, ...updates } : img)
    )
  }, [])

  const handleDeleteBackgroundImage = useCallback((id: string) => {
    setBackgroundImages(prev => {
      const imageToDelete = prev.find(img => img.id === id)
      if (imageToDelete) {
        URL.revokeObjectURL(imageToDelete.url)
      }
      return prev.filter(img => img.id !== id)
    })
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

  const handleToggleBackgroundLayer = useCallback(() => {
    setShowBackgroundLayer(prev => !prev)
  }, [])

  // Utility functions
  const generateId = () => Math.random().toString(36).substr(2, 9)

  const snapToGrid = useCallback((x: number, y: number) => {
    if (!snapEnabled) return { x, y }
    return {
      x: Math.round(x / snapDistance) * snapDistance,
      y: Math.round(y / snapDistance) * snapDistance,
    }
  }, [snapEnabled, snapDistance])

  const getCanvasCoordinates = useCallback((e: MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current
    if (!canvas) return { x: 0, y: 0 }
    const rect = canvas.getBoundingClientRect()
    const x = (e.clientX - rect.left - panOffset.x) / zoom
    const y = (e.clientY - rect.top - panOffset.y) / zoom
    return snapToGrid(x, y)
  }, [panOffset, zoom, snapToGrid])

  const findNearbyNode = useCallback((x: number, y: number, threshold = 20) => {
    return nodes.find(node => {
      const distance = Math.sqrt(Math.pow(node.x - x, 2) + Math.pow(node.y - y, 2))
      return distance <= threshold / zoom
    })
  }, [nodes, zoom])

  const findClickedRoad = useCallback((x: number, y: number, threshold = 10) => {
    return roads.find(road => {
      if (road.type === RoadType.BEZIER && road.controlPoints) {
        // For bezier curves, check multiple points along the curve
        for (let t = 0; t <= 1; t += 0.1) {
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
          if (distance <= (road.width / 2 + threshold) / zoom) {
            return true
          }
        }
        return false
      } else {
        // For straight roads, use line-to-point distance
        const A = road.end.y - road.start.y
        const B = road.start.x - road.end.x
        const C = road.end.x * road.start.y - road.start.x * road.end.y
        const distance = Math.abs(A * x + B * y + C) / Math.sqrt(A * A + B * B)
        
        // Check if point is within the road segment bounds
        const minX = Math.min(road.start.x, road.end.x) - threshold / zoom
        const maxX = Math.max(road.start.x, road.end.x) + threshold / zoom
        const minY = Math.min(road.start.y, road.end.y) - threshold / zoom
        const maxY = Math.max(road.start.y, road.end.y) + threshold / zoom
        
        return distance <= (road.width / 2 + threshold) / zoom && 
               x >= minX && x <= maxX && y >= minY && y <= maxY
      }
    })
  }, [roads, zoom])

  const findClickedPolygon = useCallback((x: number, y: number) => {
    return polygons.find(polygon => {
      // Point-in-polygon test using ray casting
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

  // Calculate road length
  const calculateRoadLength = useCallback((road: Road): number => {
    if (road.type === RoadType.BEZIER && road.controlPoints) {
      let length = 0
      const steps = 20
      let prevPoint = road.start
      
      for (let i = 1; i <= steps; i++) {
        const t = i / steps
        const mt = 1 - t
        const currentPoint = {
          x: mt * mt * mt * road.start.x +
             3 * mt * mt * t * road.controlPoints[0].x +
             3 * mt * t * t * road.controlPoints[1].x +
             t * t * t * road.end.x,
          y: mt * mt * mt * road.start.y +
             3 * mt * mt * t * road.controlPoints[0].y +
             3 * mt * t * t * road.controlPoints[1].y +
             t * t * t * road.end.y
        }
        
        length += Math.sqrt(
          Math.pow(currentPoint.x - prevPoint.x, 2) + 
          Math.pow(currentPoint.y - prevPoint.y, 2)
        )
        prevPoint = currentPoint
      }
      
      return length * scaleMetersPerPixel
    }
    
    const dx = road.end.x - road.start.x
    const dy = road.end.y - road.start.y
    return Math.sqrt(dx * dx + dy * dy) * scaleMetersPerPixel
  }, [scaleMetersPerPixel])

  // Calculate polygon area
  const calculatePolygonArea = useCallback((points: { x: number; y: number }[]): number => {
    if (points.length < 3) return 0
    
    let area = 0
    for (let i = 0; i < points.length; i++) {
      const j = (i + 1) % points.length
      area += points[i].x * points[j].y
      area -= points[j].x * points[i].y
    }
    area = Math.abs(area) / 2
    
    // Convert to square meters
    return area * scaleMetersPerPixel * scaleMetersPerPixel
  }, [scaleMetersPerPixel])

  // Mouse event handlers
  const handleMouseDown = useCallback((e: MouseEvent<HTMLCanvasElement>) => {
    const coords = getCanvasCoordinates(e)
    setMousePosition(coords)

    if (drawingMode === "pan") {
      setIsDragging(true)
      setDragStart({ x: e.clientX - panOffset.x, y: e.clientY - panOffset.y })
      return
    }

    if (drawingMode === "select") {
      // Clear selections first
      setSelectedRoadId(null)
      setSelectedNodeId(null)
      setSelectedPolygonId(null)
      setSelectedBackgroundImageId(null)

      // Check for node selection first (highest priority)
      const clickedNode = findNearbyNode(coords.x, coords.y)
      if (clickedNode) {
        setSelectedNodeId(clickedNode.id)
        return
      }

      // Then check for road selection
      const clickedRoad = findClickedRoad(coords.x, coords.y)
      if (clickedRoad) {
        setSelectedRoadId(clickedRoad.id)
        return
      }

      // Then check for polygon selection
      if (showPolygons) {
        const clickedPolygon = findClickedPolygon(coords.x, coords.y)
        if (clickedPolygon) {
          setSelectedPolygonId(clickedPolygon.id)
          return
        }
      }
      return
    }

    if (drawingMode === "connect") {
      const clickedNode = findNearbyNode(coords.x, coords.y)
      if (clickedNode) {
        if (!connectingFromNodeId) {
          setConnectingFromNodeId(clickedNode.id)
        } else if (connectingFromNodeId === clickedNode.id) {
          // Create a circle road
          const circleRoad: Omit<Road, "id"> = {
            start: { x: clickedNode.x, y: clickedNode.y },
            end: { x: clickedNode.x + 50, y: clickedNode.y },
            startNodeId: clickedNode.id,
            endNodeId: clickedNode.id,
            type: RoadType.CIRCLE,
            width: defaultRoadWidth,
          }
          
          const roadId = generateId()
          setRoads(prev => [...prev, { ...circleRoad, id: roadId }])
          
          // Update node connections
          setNodes(prev => prev.map(node => 
            node.id === clickedNode.id 
              ? { ...node, connectedRoadIds: [...node.connectedRoadIds, roadId] }
              : node
          ))
          
          setConnectingFromNodeId(null)
        } else {
          // Connect two different nodes
          const fromNode = nodes.find(n => n.id === connectingFromNodeId)
          if (fromNode) {
            const newRoad: Omit<Road, "id"> = {
              start: { x: fromNode.x, y: fromNode.y },
              end: { x: clickedNode.x, y: clickedNode.y },
              startNodeId: fromNode.id,
              endNodeId: clickedNode.id,
              type: curvedRoads ? RoadType.BEZIER : RoadType.STRAIGHT,
              width: defaultRoadWidth,
            }

            if (curvedRoads) {
              // Add default control points for bezier curve
              const midX = (fromNode.x + clickedNode.x) / 2
              const midY = (fromNode.y + clickedNode.y) / 2
              const offset = 50
              newRoad.controlPoints = [
                { x: midX - offset, y: midY - offset },
                { x: midX + offset, y: midY + offset }
              ]
            }
            
            const roadId = generateId()
            setRoads(prev => [...prev, { ...newRoad, id: roadId }])
            
            // Update both nodes' connections
            setNodes(prev => prev.map(node => {
              if (node.id === fromNode.id || node.id === clickedNode.id) {
                return { ...node, connectedRoadIds: [...node.connectedRoadIds, roadId] }
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
      const clickedRoad = findClickedRoad(coords.x, coords.y)
      if (clickedRoad) {
        if (selectedRoadForDisconnect === clickedRoad.id) {
          // Delete the road
          setRoads(prev => prev.filter(r => r.id !== clickedRoad.id))
          
          // Update node connections
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
        x: coords.x,
        y: coords.y,
        connectedRoadIds: [],
      }
      setNodes(prev => [...prev, newNode])
      return
    }

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
        // Check if clicking near the first point to close polygon
        const firstPoint = polygonSession.points[0]
        const distanceToFirst = Math.sqrt(
          Math.pow(coords.x - firstPoint.x, 2) + Math.pow(coords.y - firstPoint.y, 2)
        )
        
        if (polygonSession.points.length >= 3 && distanceToFirst <= 20 / zoom) {
          // Close the polygon
          const newPolygon: Polygon = {
            id: generateId(),
            points: polygonSession.points,
            roadIds: polygonSession.roadIds,
            fillColor: polygonSession.fillColor,
            strokeColor: polygonSession.strokeColor,
            opacity: polygonSession.opacity,
            area: calculatePolygonArea(polygonSession.points),
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
          // Add point to current polygon
          setPolygonSession(prev => ({
            ...prev,
            points: [...prev.points, coords]
          }))
        }
      }
      return
    }

    if (drawingMode === "nodes") {
      if (!buildSession.isActive) {
        const roadType = curvedRoads ? RoadType.BEZIER : RoadType.STRAIGHT
        setBuildSession({
          nodes: [{ id: generateId(), x: coords.x, y: coords.y }],
          isActive: true,
          roadType,
          roadWidth: defaultRoadWidth,
        })
      } else {
        const newNodePoint: NodePoint = {
          id: generateId(),
          x: coords.x,
          y: coords.y,
        }

        if (buildSession.roadType === RoadType.BEZIER) {
          // For bezier roads, add control points
          const lastNode = buildSession.nodes[buildSession.nodes.length - 1]
          const dx = coords.x - lastNode.x
          const dy = coords.y - lastNode.y
          const distance = Math.sqrt(dx * dx + dy * dy)
          const controlOffset = distance * 0.3

          // Add control point to the last node (cp2)
          const updatedLastNode = {
            ...lastNode,
            cp2: {
              x: lastNode.x + (dx * controlOffset) / distance,
              y: lastNode.y + (dy * controlOffset) / distance,
            }
          }

          // Add control point to the new node (cp1)
          newNodePoint.cp1 = {
            x: coords.x - (dx * controlOffset) / distance,
            y: coords.y - (dy * controlOffset) / distance,
          }

          setBuildSession(prev => ({
            ...prev,
            nodes: [...prev.nodes.slice(0, -1), updatedLastNode, newNodePoint]
          }))
        } else {
          setBuildSession(prev => ({
            ...prev,
            nodes: [...prev.nodes, newNodePoint]
          }))
        }
      }
    }
  }, [
    drawingMode, getCanvasCoordinates, panOffset, findNearbyNode, findClickedRoad, 
    findClickedPolygon, showPolygons, connectingFromNodeId, nodes, defaultRoadWidth, 
    curvedRoads, selectedRoadForDisconnect, polygonSession, polygonFillColor, 
    polygonStrokeColor, polygonOpacity, calculatePolygonArea, buildSession, zoom
  ])

  const handleMouseMove = useCallback((e: MouseEvent<HTMLCanvasElement> | globalThis.MouseEvent) => {
    if (isDragging && drawingMode === "pan" && dragStart) {
      const clientX = 'clientX' in e ? e.clientX : 0
      const clientY = 'clientY' in e ? e.clientY : 0
      setPanOffset({
        x: clientX - dragStart.x,
        y: clientY - dragStart.y,
      })
      return
    }

    const coords = getCanvasCoordinates(e as MouseEvent<HTMLCanvasElement>)
    setMousePosition(coords)
  }, [isDragging, drawingMode, dragStart, getCanvasCoordinates])

  const handleMouseUp = useCallback(() => {
    setIsDragging(false)
    setDragStart(null)
  }, [])

  // Build session handlers
  const handleCompleteBuildSession = useCallback(() => {
    if (!buildSession.isActive || buildSession.nodes.length < 2) return

    const newNodes: Node[] = []
    const newRoads: Road[] = []

    // Create nodes
    buildSession.nodes.forEach(nodePoint => {
      const newNode: Node = {
        id: nodePoint.id,
        x: nodePoint.x,
        y: nodePoint.y,
        connectedRoadIds: [],
      }
      newNodes.push(newNode)
    })

    // Create roads between consecutive nodes
    for (let i = 0; i < buildSession.nodes.length - 1; i++) {
      const startNode = buildSession.nodes[i]
      const endNode = buildSession.nodes[i + 1]
      
      const roadId = generateId()
      const newRoad: Road = {
        id: roadId,
        start: { x: startNode.x, y: startNode.y },
        end: { x: endNode.x, y: endNode.y },
        startNodeId: startNode.id,
        endNodeId: endNode.id,
        type: buildSession.roadType,
        width: buildSession.roadWidth,
      }

      if (buildSession.roadType === RoadType.BEZIER && startNode.cp2 && endNode.cp1) {
        newRoad.controlPoints = [startNode.cp2, endNode.cp1]
      }

      newRoads.push(newRoad)

      // Update node connections
      const startNodeIndex = newNodes.findIndex(n => n.id === startNode.id)
      const endNodeIndex = newNodes.findIndex(n => n.id === endNode.id)
      
      if (startNodeIndex !== -1) {
        newNodes[startNodeIndex].connectedRoadIds.push(roadId)
      }
      if (endNodeIndex !== -1) {
        newNodes[endNodeIndex].connectedRoadIds.push(roadId)
      }
    }

    // Add to state
    setNodes(prev => [...prev, ...newNodes])
    setRoads(prev => [...prev, ...newRoads])

    // Reset build session
    setBuildSession({
      nodes: [],
      isActive: false,
      roadType: RoadType.STRAIGHT,
      roadWidth: defaultRoadWidth,
    })
  }, [buildSession, defaultRoadWidth])

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
    if (!polygonSession.isActive || polygonSession.points.length < 3) return

    const newPolygon: Polygon = {
      id: generateId(),
      points: polygonSession.points,
      roadIds: polygonSession.roadIds,
      fillColor: polygonSession.fillColor,
      strokeColor: polygonSession.strokeColor,
      opacity: polygonSession.opacity,
      area: calculatePolygonArea(polygonSession.points),
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
  }, [polygonSession, calculatePolygonArea, polygonFillColor, polygonStrokeColor, polygonOpacity])

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

    // Delete all connected roads
    nodeToDelete.connectedRoadIds.forEach(roadId => {
      setRoads(prev => prev.filter(r => r.id !== roadId))
    })

    // Remove node
    setNodes(prev => prev.filter(n => n.id !== nodeId))
    
    // Update remaining nodes to remove references to deleted roads
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
    } else {
      // Remove last added element
      if (roads.length > 0) {
        const lastRoad = roads[roads.length - 1]
        handleDeleteRoad(lastRoad.id)
      } else if (nodes.length > 0) {
        const lastNode = nodes[nodes.length - 1]
        handleDeleteNode(lastNode.id)
      } else if (polygons.length > 0) {
        const lastPolygon = polygons[polygons.length - 1]
        handleDeletePolygon(lastPolygon.id)
      }
    }
  }, [buildSession, polygonSession, roads, nodes, polygons, handleDeleteRoad, handleDeleteNode, handleDeletePolygon])

  const handleClearCanvas = useCallback(() => {
    setNodes([])
    setRoads([])
    setPolygons([])
    setBackgroundImages(prev => {
      // Clean up object URLs
      prev.forEach(img => URL.revokeObjectURL(img.url))
      return []
    })
    setSelectedRoadId(null)
    setSelectedNodeId(null)
    setSelectedPolygonId(null)
    setSelectedBackgroundImageId(null)
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

  // Update build session when settings change
  useEffect(() => {
    setBuildSession(prev => ({
      ...prev,
      roadWidth: defaultRoadWidth,
      roadType: curvedRoads ? RoadType.BEZIER : RoadType.STRAIGHT,
    }))
  }, [defaultRoadWidth, curvedRoads])

  // Calculate totals
  const totalLength = roads.reduce((sum, road) => sum + calculateRoadLength(road), 0)
  const totalArea = polygons.reduce((sum, polygon) => sum + (polygon.area || 0), 0)

  // Get selected items
  const selectedRoad = selectedRoadId ? roads.find(r => r.id === selectedRoadId) : null
  const selectedNode = selectedNodeId ? nodes.find(n => n.id === selectedNodeId) : null
  const selectedPolygon = selectedPolygonId ? polygons.find(p => p.id === selectedPolygonId) : null

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
        <div className="w-64 bg-white border-r border-gray-200 p-4 overflow-y-auto">
          <div className="space-y-6">
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
                  fillColor={polygonFillColor}
                  strokeColor={polygonStrokeColor}
                  opacity={polygonOpacity}
                  onFillColorChange={setPolygonFillColor}
                  onStrokeColorChange={setPolygonStrokeColor}
                  onOpacityChange={setPolygonOpacity}
                />
              </>
            )}
            
            <Separator />
            
            <BackgroundImagePanel
              backgroundImages={backgroundImages}
              showBackgroundLayer={showBackgroundLayer}
              selectedBackgroundImageId={selectedBackgroundImageId}
              onToggleBackgroundLayer={handleToggleBackgroundLayer}
              onAddBackgroundImage={handleAddBackgroundImage}
              onUpdateBackgroundImage={handleUpdateBackgroundImage}
              onDeleteBackgroundImage={handleDeleteBackgroundImage}
              onSelectBackgroundImage={handleSelectBackgroundImage}
            />
            
            <Separator />
            
            <ActionsPanel
              onRemoveLastElement={handleRemoveLastElement}
              onClearCanvas={handleClearCanvas}
            />
          </div>
        </div>

        {/* Canvas */}
        <div className="flex-1 relative">
          <RoadCanvas
            ref={canvasRef}
            nodes={nodes}
            roads={roads}
            polygons={polygons}
            backgroundImages={backgroundImages}
            showBackgroundLayer={showBackgroundLayer}
            selectedBackgroundImageId={selectedBackgroundImageId}
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
            onUpdateBackgroundImage={handleUpdateBackgroundImage}
            onSelectBackgroundImage={handleSelectBackgroundImage}
          />
        </div>

        {/* Right Sidebar */}
        <div className="w-80 bg-white border-l border-gray-200 p-4 overflow-y-auto">
          <div className="space-y-6">
            {/* Display Options - Always Visible */}
            <div className="space-y-4">
              <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wide">Display Options</h3>
              <div className="space-y-3">
                <div className="flex items-center space-x-2">
                  <Checkbox
                    id="show-road-lengths"
                    checked={showRoadLengths}
                    onCheckedChange={setShowRoadLengths}
                  />
                  <Label htmlFor="show-road-lengths" className="text-sm flex items-center gap-2">
                    <Ruler size={14} />
                    Show Lengths
                  </Label>
                </div>
                <div className="flex items-center space-x-2">
                  <Checkbox
                    id="show-road-names"
                    checked={showRoadNames}
                    onCheckedChange={setShowRoadNames}
                  />
                  <Label htmlFor="show-road-names" className="text-sm flex items-center gap-2">
                    <Type size={14} />
                    Show Names
                  </Label>
                </div>
                <div className="flex items-center space-x-2">
                  <Checkbox
                    id="show-polygons"
                    checked={showPolygons}
                    onCheckedChange={setShowPolygons}
                  />
                  <Label htmlFor="show-polygons" className="text-sm flex items-center gap-2">
                    {showPolygons ? <Eye size={14} /> : <EyeOff size={14} />}
                    Show Polygons
                  </Label>
                </div>
              </div>
            </div>

            {/* Conditional Panels Based on Selection/Mode */}
            {drawingMode === "select" && (selectedRoad || selectedNode) && (
              <>
                <Separator />
                <SelectedItemPanel
                  selectedRoad={selectedRoad}
                  selectedNode={selectedNode}
                  onDeleteRoad={handleDeleteRoad}
                  onDeleteNode={handleDeleteNode}
                  calculateRoadLength={calculateRoadLength}
                  onUpdateRoadWidth={handleUpdateRoadWidth}
                  onUpdateRoadName={handleUpdateRoadName}
                />
              </>
            )}

            {drawingMode === "select" && selectedPolygon && (
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

            {/* Build Session Controls */}
            {buildSession.isActive && (
              <>
                <Separator />
                <div className="space-y-3">
                  <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wide">Build Session</h3>
                  <div className="space-y-2">
                    <Button variant="default" size="sm" className="w-full" onClick={handleCompleteBuildSession}>
                      Complete Road
                    </Button>
                    <Button variant="outline" size="sm" className="w-full" onClick={handleCancelBuildSession}>
                      Cancel
                    </Button>
                  </div>
                </div>
              </>
            )}

            {/* Polygon Session Controls */}
            {polygonSession.isActive && (
              <>
                <Separator />
                <div className="space-y-3">
                  <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wide">Polygon Session</h3>
                  <div className="space-y-2">
                    <Button 
                      variant="default" 
                      size="sm" 
                      className="w-full" 
                      onClick={handleCompletePolygonSession}
                      disabled={polygonSession.points.length < 3}
                    >
                      Complete Polygon
                    </Button>
                    <Button variant="outline" size="sm" className="w-full" onClick={handleCancelPolygonSession}>
                      Cancel
                    </Button>
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}