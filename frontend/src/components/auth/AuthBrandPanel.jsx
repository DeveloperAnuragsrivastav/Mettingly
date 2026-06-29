import React from 'react'

/**
 * Shared brand panel used across auth pages (Login, Set Password, etc.).
 * Renders as the left panel in a split-screen auth layout.
 * Hidden on mobile (< lg breakpoint).
 */
export default function AuthBrandPanel() {
  return (
    <div className="hidden lg:flex lg:w-1/2 flex-col justify-between bg-indigo-50 px-12 py-12 xl:px-24 overflow-y-auto">
      <div>
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-lg bg-indigo-600 flex items-center justify-center shadow-sm">
            <span className="text-white font-bold text-xl leading-none">M</span>
          </div>
          <span className="text-xl font-bold tracking-tight text-gray-900">Meeting SaaS</span>
        </div>
      </div>
      
      <div className="flex-1 flex flex-col justify-center my-8">
        <img 
          src="/images/login-hero.png" 
          alt="Effortless Scheduling" 
          className="w-full max-w-md mx-auto object-contain rounded-2xl mb-8 max-h-[45vh]"
          style={{ filter: 'drop-shadow(0 10px 30px rgba(79, 70, 229, 0.12))' }}
        />
        <h2 className="text-3xl xl:text-4xl font-bold tracking-tight text-indigo-950 mb-4 max-w-md leading-tight">
          Effortless team scheduling, unified.
        </h2>
        <p className="text-base xl:text-lg text-indigo-800/70 max-w-md leading-relaxed">
          Coordinate across your entire organization without the back-and-forth emails. Set availability, connect your calendar, and let the meetings flow.
        </p>
      </div>
    </div>
  )
}
