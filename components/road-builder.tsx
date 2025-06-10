"use client"

import { useState } from "react"

export default function RoadBuilder() {
  return (
    <div className="h-screen w-full bg-gray-100">
      <div className="flex h-full">
        {/* Sidebar */}
        <div className="w-80 bg-white border-r border-gray-200 p-4">
          <h2 className="text-lg font-semibold mb-4">Road Builder</h2>
          <p className="text-gray-600">Tools and settings will go here.</p>
        </div>
        
        {/* Main Canvas Area */}
        <div className="flex-1 relative">
          <div className="w-full h-full bg-white">
            <p className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 text-gray-500">
              Canvas area - ready for development
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}