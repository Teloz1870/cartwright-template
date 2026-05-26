"use client";

import { motion } from "framer-motion";
import { Cpu, Zap, Code2, Layers } from "lucide-react";

export function BentoGrid() {
  const containerVariants = {
    hidden: { opacity: 0 },
    visible: {
      opacity: 1,
      transition: {
        staggerChildren: 0.1,
      },
    },
  };

  const itemVariants = {
    hidden: { opacity: 0, y: 30 },
    visible: {
      opacity: 1,
      y: 0,
      transition: { type: "spring" as const, stiffness: 100, damping: 20 },
    },
  };

  return (
    <section className="py-24 px-6 max-w-7xl mx-auto w-full">
      <div className="mb-16 text-center">
        <h2 className="text-sm text-blue-400 tracking-widest font-bold uppercase mb-4">
          The Cartwright Architecture
        </h2>
        <h3 className="text-4xl md:text-5xl font-bold text-white tracking-tight">
          Next-Generation Performance.
        </h3>
      </div>

      <motion.div 
        variants={containerVariants}
        initial="hidden"
        whileInView="visible"
        viewport={{ once: true, margin: "-100px" }}
        className="grid grid-cols-1 md:grid-cols-3 gap-6"
      >
        {/* Large Feature */}
        <motion.div variants={itemVariants} className="md:col-span-2 p-8 md:p-12 rounded-3xl bg-slate-900/40 border border-slate-700/50 backdrop-blur-xl relative overflow-hidden group">
          <div className="absolute top-0 right-0 p-8 opacity-5 group-hover:opacity-10 transition-opacity">
            <Cpu size={160} />
          </div>
          <div className="relative z-10 h-full flex flex-col justify-between">
            <div>
              <div className="w-12 h-12 rounded-full bg-blue-500/20 flex items-center justify-center text-blue-400 mb-6 shadow-[0_0_30px_rgba(59,130,246,0.3)]">
                <Cpu size={24} />
              </div>
              <h4 className="text-2xl font-bold text-white mb-4">AI-First Core</h4>
              <p className="text-slate-300 max-w-md leading-relaxed text-lg">
                Cartwright is built from the ground up to integrate AI flawlessly. 
                From our generative cinematic videos using Luma API, to intelligent caching. Welcome to the future of digital commerce and B2B solutions.
              </p>
            </div>
          </div>
        </motion.div>

        {/* Small Feature 1 */}
        <motion.div variants={itemVariants} className="p-8 rounded-3xl bg-slate-900/40 border border-slate-700/50 backdrop-blur-xl relative overflow-hidden group hover:bg-slate-800/60 transition-colors">
          <div className="w-12 h-12 rounded-full bg-cyan-500/20 flex items-center justify-center text-cyan-400 mb-6">
            <Zap size={24} />
          </div>
          <h4 className="text-xl font-bold text-white mb-4">100/100 Speed</h4>
          <p className="text-slate-300 leading-relaxed text-sm">
            Powered by Next.js 15, Turbopack, and deployed on Edge networks. Instant loading times anywhere in the world.
          </p>
        </motion.div>

        {/* Small Feature 2 */}
        <motion.div variants={itemVariants} className="p-8 rounded-3xl bg-slate-900/40 border border-slate-700/50 backdrop-blur-xl relative overflow-hidden group hover:bg-slate-800/60 transition-colors">
          <div className="w-12 h-12 rounded-full bg-purple-500/20 flex items-center justify-center text-purple-400 mb-6">
            <Code2 size={24} />
          </div>
          <h4 className="text-xl font-bold text-white mb-4">Hybrid Ready</h4>
          <p className="text-slate-300 leading-relaxed text-sm">
            Use it as a high-conversion webshop or strip away e-commerce to create a lean, powerful lead-generating Agency site.
          </p>
        </motion.div>

        {/* Medium Feature */}
        <motion.div variants={itemVariants} className="md:col-span-2 p-8 rounded-3xl bg-gradient-to-br from-blue-900/30 to-transparent border border-blue-500/20 backdrop-blur-xl relative overflow-hidden group">
          <div className="flex flex-col md:flex-row gap-8 items-center h-full">
            <div className="flex-1">
              <h4 className="text-2xl font-bold text-white mb-4">Modular Design Components</h4>
              <p className="text-slate-300 leading-relaxed">
                Beautiful glassmorphism, fluid physics-based animations, and responsive grids. 
                Cartwright isn&apos;t just fast; it&apos;s a visual masterpiece crafted for 2026 standards.
              </p>
            </div>
            <div className="w-24 h-24 rounded-full bg-blue-500/10 border border-blue-500/30 flex items-center justify-center animate-pulse">
              <Layers size={40} className="text-blue-400" />
            </div>
          </div>
        </motion.div>

      </motion.div>
    </section>
  );
}
