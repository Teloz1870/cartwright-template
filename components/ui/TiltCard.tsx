"use client";

import { useRef, useState } from "react";
import { motion } from "framer-motion";

export function TiltCard({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [rotateX, setRotateX] = useState(0);
  const [rotateY, setRotateY] = useState(0);
  const [glarePosition, setGlarePosition] = useState({ x: 0, y: 0 });

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!ref.current) return;
    const rect = ref.current.getBoundingClientRect();
    const width = rect.width;
    const height = rect.height;

    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;

    const rotateYVal = ((mouseX / width) - 0.5) * 20;
    const rotateXVal = ((mouseY / height) - 0.5) * -20;

    setRotateX(rotateXVal);
    setRotateY(rotateYVal);
    setGlarePosition({ x: mouseX, y: mouseY });
  };

  const handleMouseLeave = () => {
    setRotateX(0);
    setRotateY(0);
  };

  return (
    <motion.div
      ref={ref}
      className={`relative overflow-hidden group perspective-1000 ${className}`}
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
      animate={{ rotateX, rotateY }}
      transition={{ type: "spring", stiffness: 300, damping: 30 }}
      style={{ transformStyle: "preserve-3d" }}
    >
      <div 
        className="pointer-events-none absolute inset-0 z-10 opacity-0 group-hover:opacity-100 transition-opacity duration-300 rounded-[inherit]"
        style={{
          background: `radial-gradient(circle at ${glarePosition.x}px ${glarePosition.y}px, rgba(255,255,255,0.15) 0%, transparent 80%)`,
        }}
      />
      {children}
    </motion.div>
  );
}
