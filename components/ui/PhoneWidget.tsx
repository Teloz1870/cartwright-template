"use client";

import { useState } from "react";
import { usePathname } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { Phone, X, Mic, MicOff, PhoneOff } from "lucide-react";

type CallState = "idle" | "ringing" | "connected";

export function PhoneWidget({ workspaceId }: { workspaceId?: string }) {
  const [isOpen, setIsOpen] = useState(false);
  const [callState, setCallState] = useState<CallState>("idle");
  const [isMuted, setIsMuted] = useState(false);

  const pathname = usePathname();

  // If workspaceId is provided, we would normally inject the Phone.inc script here.
  // For now, we simulate the presence of the widget or render the mock.
  if (workspaceId) {
    return (
      <>
        {/* Placeholder for the real Phone.inc widget script */}
        <script 
          src={`https://widget.phone.inc/v1/widget.js?workspace=${workspaceId}`} 
          async 
          defer 
        />
        <div className="fixed bottom-6 left-6 z-50 bg-green-500 text-white text-xs px-2 py-1 rounded-full animate-pulse shadow-lg">
          Phone.inc Active ({workspaceId.substring(0, 8)}...)
        </div>
      </>
    );
  }

  // Mock functions for Phone.inc API integration
  const startCall = () => {
    setCallState("ringing");
    setTimeout(() => setCallState("connected"), 2000); // Simulate connection
  };

  const endCall = () => {
    setCallState("idle");
    setIsOpen(false);
    setIsMuted(false);
  };

  const onPdp = pathname?.startsWith("/produkt/") ?? false;
  const bottomClass = onPdp ? "bottom-24 md:bottom-6" : "bottom-6";

  return (
    <div className={`fixed ${bottomClass} left-6 z-50`}>
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, y: 20, scale: 0.9 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 20, scale: 0.9 }}
            className="mb-4 w-72 md:w-80 overflow-hidden rounded-3xl bg-slate-900/80 backdrop-blur-xl border border-slate-700/50 shadow-2xl"
          >
            {/* Header */}
            <div className="bg-sol-ink p-4 flex items-center justify-between border-b border-white/10">
              <div className="flex items-center gap-2">
                <div className="h-2 w-2 rounded-full bg-green-500 animate-pulse" />
                <span className="text-sm font-semibold text-white">Cartwright Support</span>
              </div>
              <button 
                onClick={() => setIsOpen(false)}
                className="text-slate-400 hover:text-white transition-colors"
                aria-label="Close phone widget"
              >
                <X size={18} />
              </button>
            </div>

            {/* Body */}
            <div className="p-6 flex flex-col items-center text-center">
              <div className={`w-20 h-20 rounded-full flex items-center justify-center mb-4 transition-colors duration-500 ${
                callState === "connected" ? "bg-green-500/20 text-green-400" : 
                callState === "ringing" ? "bg-blue-500/20 text-blue-400 animate-pulse" : 
                "bg-slate-800 text-slate-400"
              }`}>
                <Phone size={32} className={callState === "ringing" ? "animate-bounce" : ""} />
              </div>
              
              <h3 className="text-xl font-bold text-white mb-2">
                {callState === "idle" && "Need Help?"}
                {callState === "ringing" && "Calling..."}
                {callState === "connected" && "00:14"}
              </h3>
              
              <p className="text-sm text-slate-400 mb-6">
                {callState === "idle" && "Speak directly with our team right from your browser."}
                {callState === "ringing" && "Connecting to the next available agent."}
                {callState === "connected" && "Connected via Phone.inc"}
              </p>

              {/* Controls */}
              <div className="flex gap-4 w-full justify-center">
                {callState === "idle" ? (
                  <button 
                    onClick={startCall}
                    className="flex-1 py-3 bg-blue-600 hover:bg-blue-500 text-white rounded-xl font-bold shadow-lg shadow-blue-900/20 transition-all active:scale-95"
                  >
                    Start Web Call
                  </button>
                ) : (
                  <>
                    <button 
                      onClick={() => setIsMuted(!isMuted)}
                      className={`p-4 rounded-xl transition-all active:scale-95 ${
                        isMuted ? "bg-red-500/20 text-red-400" : "bg-slate-800 text-slate-300 hover:bg-slate-700"
                      }`}
                      aria-label="Toggle mute"
                    >
                      {isMuted ? <MicOff size={24} /> : <Mic size={24} />}
                    </button>
                    <button 
                      onClick={endCall}
                      className="p-4 bg-red-600 hover:bg-red-500 text-white rounded-xl transition-all shadow-lg shadow-red-900/20 active:scale-95 flex-1 flex justify-center"
                      aria-label="End call"
                    >
                      <PhoneOff size={24} />
                    </button>
                  </>
                )}
              </div>
            </div>
            
            {/* Footer Branding */}
            <div className="py-3 px-4 bg-black/40 text-center">
              <span className="text-[10px] uppercase tracking-widest text-slate-500 font-bold">
                Powered by Phone.inc
              </span>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Floating Action Button */}
      {!isOpen && (
        <motion.button
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
          onClick={() => setIsOpen(true)}
          className="w-16 h-16 bg-blue-600 text-white rounded-full flex items-center justify-center shadow-2xl shadow-blue-900/30 border border-blue-400/20 group relative"
          aria-label="Open phone widget"
        >
          <div className="absolute inset-0 rounded-full bg-blue-400/20 animate-ping" style={{ animationDuration: "3s" }} />
          <Phone size={28} className="group-hover:rotate-12 transition-transform" />
        </motion.button>
      )}
    </div>
  );
}
