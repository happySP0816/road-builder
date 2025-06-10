"use client"

import { useState, useCallback, useRef, useEffect, type MouseEvent } from "react"
import { Button } from "@/components/ui/button"
import RoadCanvas from "./road-canvas"
import DrawingTools from "./drawing-tools"
import RoadSettings from "./road-settings"
import ViewSettings from "./view-settings"
import PolygonSettings from "./polygon-settings"
import ActionsPanel from "./actions-panel"
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
  RoadType 
} from "@/lib/road-types"

export default function RoadBuilder() {
  const [nodes, setNodes] = useState<Node[]>([])
  const [roads, setRoads] = useState<Road[]>([])
  const [polygons, setPolygons] = useState<Polygon[]>([])
  const [backgroundImages, setBackgroundImages] = useState<BackgroundImage[]>([])
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
  const [drawingMode, setDrawingMode] = useState<"nodes" | "pan" | "select" | "connect" | "disconnect" | "add-node" | "polygon" | "background-image">("nodes")
  const [snapEnabled] = useState(true)
  const [snapDistance, setSnapDistance] = useState(20)
  const [defaultRoadWidth, setDefaultRoadWidth] = useState(15)
  const [showRoadLengths, setShowRoadLengths] = useState(true)
  const [showRoadNames, setShowRoadNames] = useState(true)
  const [showPolygons, setShowPolygons] = useState(true)
  const [showBackgroundLayer, setShowBackgroundLayer] = useState(true)
  const [scaleMetersPerPixel, setScaleMetersPerPixel] = useState(0.1)
  const [selectedRoadId, setSelectedRoadId] = useState<string | null>(null)
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null)
  const [selectedPolygonId, setSelectedPolygonId] = useState<string | null>(null)
  const [selectedBackgroundImageId, setSelectedBackgroundImageId] = useState<string | null>(null)
  const [connectingFromNodeId, setConnectingFromNodeId] = useState<string | null>(null)
  const [selectedRoadForDisconnect, setSelectedRoadForDisconnect] = useState<string | null>(null)
  const [panOffset, setPanOffset] = useState({ x: 0, y: 0 })
  const [zoom, setZoom] = useState(1)
  const [mousePosition, setMousePosition] = useState<{ x: number; y: number } | null>(null)
  const [isActivelyDrawingCurve, setIsActivelyDrawingCurve] = useState(false)
  const [curvedRoads, setCurvedRoads] = useState(false)

  const selectedNodeData = selectedNodeId ? nodes.find(n => n.id === selectedNodeId) : null
  const selectedRoad = selectedRoadId ? roads.find(r => r.id === selectedRoadId) : null
  const selectedPolygon = selectedPolygonId ? polygons.find(p => p.id === selectedPolygonId) : null

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
  }, [])

  const handleToggleBackgroundLayer = useCallback((show: boolean) => {
    setShowBackgroundLayer(show)
  }, [])

  // Canvas event handlers
  const handleMouseDown = useCallback((e: MouseEvent<HTMLCanvasElement>) => {
    const canvas = e.currentTarget
    const rect = canvas.getBoundingClientRect()
    const x = (e.clientX - rect.left - panOffset.x) / zoom
    const y = (e.clientY - rect.top - panOffset.y) / zoom

    if (drawingMode === "nodes") {
      if (!buildSession.isActive) {
        setBuildSession({
          nodes: [{ id: `node-${Date.now()}`, x, y }],
          isActive: true,
          roadType: curvedRoads ? RoadType.BEZIER : RoadType.STRAIGHT,
          roadWidth: defaultRoadWidth,
        })
      } else {
        setBuildSession(prev => ({
          ...prev,
          nodes: [...prev.nodes, { id: `node-${Date.now()}`, x, y }],
        }))
      }
    } else if (drawingMode === "polygon") {
      if (!polygonSession.isActive) {
        setPolygonSession(prev => ({
          ...prev,
          points: [{ x, y }],
          isActive: true,
        }))
      } else {
        const firstPoint = polygonSession.points[0]
        const distanceToFirst = Math.sqrt(
          Math.pow(x - firstPoint.x, 2) + Math.pow(y - firstPoint.y, 2)
        )
        
        if (polygonSession.points.length >= 3 && distanceToFirst < 20) {
          handleCompletePolygonSession()
        } else {
          setPolygonSession(prev => ({
            ...prev,
            points: [...prev.points, { x, y }],
          }))
        }
      }
    } else if (drawingMode === "add-node") {
      const newNode: Node = {
        id: `node-${Date.now()}`,
        x,
        y,
        connectedRoadIds: [],
      }
      setNodes(prev => [...prev, newNode])
    } else if (drawingMode === "select") {
      // Handle selection logic
      const clickedNode = nodes.find(node => {
        const distance = Math.sqrt(Math.pow(x - node.x, 2) + Math.pow(y - node.y, 2))
        return distance < 15
      })
      
      if (clickedNode) {
        setSelectedNodeId(clickedNode.id)
        setSelectedRoadId(null)
        setSelectedPolygonId(null)
        setSelectedBackgroundImageId(null)
        return
      }

      const clickedRoad = roads.find(road => {
        // Simple distance check for road selection
        const midX = (road.start.x + road.end.x) / 2
        const midY = (road.start.y + road.end.y) / 2
        const distance = Math.sqrt(Math.pow(x - midX, 2) + Math.pow(y - midY, 2))
        return distance < road.width
      })
      
      if (clickedRoad) {
        setSelectedRoadId(clickedRoad.id)
        setSelectedNodeId(null)
        setSelectedPolygonId(null)
        setSelectedBackgroundImageId(null)
        return
      }

      const clickedPolygon = polygons.find(polygon => {
        // Point in polygon test
        let inside = false
        for (let i = 0, j = polygon.points.length - 1; i < polygon.points.length; j = i++) {
          if (((polygon.points[i].y > y) !== (polygon.points[j].y > y)) &&
              (x < (polygon.points[j].x - polygon.points[i].x) * (y - polygon.points[i].y) / (polygon.points[j].y - polygon.points[i].y) + polygon.points[i].x)) {
            inside = !inside
          }
        }
        return inside
      })
      
      if (clickedPolygon) {
        setSelectedPolygonId(clickedPolygon.id)
        setSelectedNodeId(null)
        setSelectedRoadId(null)
        setSelectedBackgroundImageId(null)
        return
      }

      // Clear all selections if nothing was clicked
      setSelectedNodeId(null)
      setSelectedRoadId(null)
      setSelectedPolygonId(null)
      setSelectedBackgroundImageId(null)
    } else if (drawingMode === "connect") {
      const clickedNode = nodes.find(node => {
        const distance = Math.sqrt(Math.pow(x - node.x, 2) + Math.pow(y - node.y, 2))
        return distance < 15
      })
      
      if (clickedNode) {
        if (!connectingFromNodeId) {
          setConnectingFromNodeId(clickedNode.id)
        } else if (connectingFromNodeId === clickedNode.id) {
          // Create a circle road
          const newRoad: Road = {
            id: `road-${Date.now()}`,
            start: { x: clickedNode.x, y: clickedNode.y },
            end: { x: clickedNode.x, y: clickedNode.y },
            startNodeId: clickedNode.id,
            endNodeId: clickedNode.id,
            type: RoadType.CIRCLE,
            width: defaultRoadWidth,
          }
          setRoads(prev => [...prev, newRoad])
          setNodes(prev => prev.map(node => 
            node.id === clickedNode.id 
              ? { ...node, connectedRoadIds: [...node.connectedRoadIds, newRoad.id] }
              : node
          ))
          setConnectingFromNodeId(null)
        } else {
          // Create a road between two different nodes
          const fromNode = nodes.find(n => n.id === connectingFromNodeId)
          if (fromNode) {
            const newRoad: Road = {
              id: `road-${Date.now()}`,
              start: { x: fromNode.x, y: fromNode.y },
              end: { x: clickedNode.x, y: clickedNode.y },
              startNodeId: fromNode.id,
              endNodeId: clickedNode.id,
              type: curvedRoads ? RoadType.BEZIER : RoadType.STRAIGHT,
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
    } else if (drawingMode === "disconnect") {
      const clickedRoad = roads.find(road => {
        const midX = (road.start.x + road.end.x) / 2
        const midY = (road.start.y + road.end.y) / 2
        const distance = Math.sqrt(Math.pow(x - midX, 2) + Math.pow(y - midY, 2))
        return distance < road.width
      })
      
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
    }
  }, [drawingMode, buildSession, polygonSession, nodes, roads, polygons, connectingFromNodeId, selectedRoadForDisconnect, panOffset, zoom, defaultRoadWidth, curvedRoads])

  const handleMouseMove = useCallback((e: MouseEvent<HTMLCanvasElement> | globalThis.MouseEvent) => {
    const canvas = e.currentTarget as HTMLCanvasElement
    const rect = canvas.getBoundingClientRect()
    const x = (e.clientX - rect.left - panOffset.x) / zoom
    const y = (e.clientY - rect.top - panOffset.y) / zoom
    setMousePosition({ x, y })
  }, [panOffset, zoom])

  const handleMouseUp = useCallback((e: MouseEvent<HTMLCanvasElement> | globalThis.MouseEvent) => {
    // Handle mouse up events if needed
  }, [])

  const handleCompleteBuildSession = useCallback(() => {
    if (buildSession.nodes.length < 2) return

    const newNodes: Node[] = []
    const newRoads: Road[] = []

    // Create nodes
    buildSession.nodes.forEach((sessionNode, index) => {
      const newNode: Node = {
        id: sessionNode.id,
        x: sessionNode.x,
        y: sessionNode.y,
        connectedRoadIds: [],
      }
      newNodes.push(newNode)
    })

    // Create roads between consecutive nodes
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
      
      if (buildSession.roadType === RoadType.BEZIER && startNode.cp2 && endNode.cp1) {
        newRoad.controlPoints = [startNode.cp2, endNode.cp1]
      }
      
      newRoads.push(newRoad)
      
      // Update node connections
      const startNodeIndex = newNodes.findIndex(n => n.id === startNode.id)
      const endNodeIndex = newNodes.findIndex(n => n.id === endNode.id)
      if (startNodeIndex !== -1) newNodes[startNodeIndex].connectedRoadIds.push(newRoad.id)
      if (endNodeIndex !== -1) newNodes[endNodeIndex].connectedRoadIds.push(newRoad.id)
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

  const handleCancelBuildSession = useCallback(() => {
    setBuildSession({
      nodes: [],
      isActive: false,
      roadType: RoadType.STRAIGHT,
      roadWidth: defaultRoadWidth,
    })
  }, [defaultRoadWidth])

  const handleCompletePolygonSession = useCallback(() => {
    if (polygonSession.points.length < 3) return

    const newPolygon: Polygon = {
      id: `polygon-${Date.now()}`,
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
      fillColor: "#3b82f6",
      strokeColor: "#1e40af",
      opacity: 0.3,
    })
  }, [polygonSession])

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

    // Remove all roads connected to this node
    const roadsToDelete = nodeToDelete.connectedRoadIds
    setRoads(prev => prev.filter(r => !roadsToDelete.includes(r.id)))
    
    // Remove the node
    setNodes(prev => prev.filter(n => n.id !== nodeId))
    
    // Update other nodes to remove references to deleted roads
    setNodes(prev => prev.map(node => ({
      ...node,
      connectedRoadIds: node.connectedRoadIds.filter(id => !roadsToDelete.includes(id))
    })))
    
    setSelectedNodeId(null)
  }, [nodes])

  const handleDeletePolygon = useCallback((polygonId: string) => {
    setPolygons(prev => prev.filter(p => p.id !== polygonId))
    setSelectedPolygonId(null)
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

  const totalLength = roads.reduce((sum, road) => sum + calculateRoadLength(road), 0)
  const totalArea = polygons.reduce((sum, polygon) => sum + (polygon.area || 0), 0)

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
          <DrawingTools
            drawingMode={drawingMode}
            onDrawingModeChange={setDrawingMode}
          />
          
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
          
          <PolygonSettings
            fillColor={polygonSession.fillColor}
            strokeColor={polygonSession.strokeColor}
            opacity={polygonSession.opacity}
            onFillColorChange={(color) => setPolygonSession(prev => ({ ...prev, fillColor: color }))}
            onStrokeColorChange={(color) => setPolygonSession(prev => ({ ...prev, strokeColor: color }))}
            onOpacityChange={(opacity) => setPolygonSession(prev => ({ ...prev, opacity }))}
          />
          
          <ActionsPanel
            onRemoveLastElement={handleRemoveLastElement}
            onClearCanvas={handleClearCanvas}
          />
        </div>

        {/* Main Canvas Area */}
        <div className="flex-1 flex flex-col">
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
        </div>

        {/* Right Sidebar */}
        <div className="w-80 bg-white border-l border-gray-200 p-4 space-y-6 overflow-y-auto">
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
            onToggleBackgroundLayer={handleToggleBackgroundLayer}
            onSelectBackgroundImage={handleSelectBackgroundImage}
          />
          
          <SelectedItemPanel
            selectedRoad={selectedRoad}
            selectedNode={selectedNodeData}
            onDeleteRoad={handleDeleteRoad}
            onDeleteNode={handleDeleteNode}
            calculateRoadLength={calculateRoadLength}
            onUpdateRoadWidth={handleUpdateRoadWidth}
            onUpdateRoadName={handleUpdateRoadName}
          />
          
          <SelectedPolygonPanel
            selectedPolygon={selectedPolygon}
            onDeletePolygon={handleDeletePolygon}
            onUpdatePolygonName={handleUpdatePolygonName}
            onUpdatePolygonFillColor={handleUpdatePolygonFillColor}
            onUpdatePolygonStrokeColor={handleUpdatePolygonStrokeColor}
            onUpdatePolygonOpacity={handleUpdatePolygonOpacity}
          />
        </div>
      </div>
    </div>
  )
}