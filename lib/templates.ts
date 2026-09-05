export const VIBE_TEMPLATES = {
  ecommerce: `
<div class="min-h-screen bg-white">
  <!-- Hero Section -->
  <section class="relative h-[80vh] flex items-center justify-center overflow-hidden">
    <div class="absolute inset-0 bg-black/40 z-10"></div>
    <img src="https://images.unsplash.com/photo-1441984904996-e0b6ba687e04?auto=format&fit=crop&q=80" alt="Hero" class="absolute inset-0 w-full h-full object-cover" />
    <div class="relative z-20 text-center px-4 max-w-4xl mx-auto">
      <span class="uppercase tracking-[0.3em] text-white/80 text-sm font-bold mb-4 block">New Collection</span>
      <h1 class="text-5xl md:text-7xl font-black text-white mb-6 leading-tight">Elevate Your Style</h1>
      <p class="text-lg text-white/90 mb-8 max-w-2xl mx-auto">Discover the latest trends in sustainable fashion. Designed for comfort, built for longevity.</p>
      <a href="/produkter" class="inline-block bg-white text-black px-8 py-4 rounded-full font-bold hover:scale-105 transition-transform uppercase tracking-wider text-sm">Shop Now</a>
    </div>
  </section>

  <!-- Featured Categories -->
  <section class="py-20 px-4 max-w-7xl mx-auto">
    <div class="flex justify-between items-end mb-12">
      <h2 class="text-3xl font-black">Shop by Category</h2>
      <a href="/produkter" class="text-sm font-bold uppercase tracking-wider underline">View All</a>
    </div>
    <div class="grid grid-cols-1 md:grid-cols-3 gap-6">
      <div class="relative h-[400px] rounded-2xl overflow-hidden group cursor-pointer">
        <img src="https://images.unsplash.com/photo-1490481651871-ab68de25d43d?auto=format&fit=crop&q=80" class="absolute inset-0 w-full h-full object-cover transition-transform duration-700 group-hover:scale-110" />
        <div class="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent"></div>
        <div class="absolute bottom-6 left-6">
          <h3 class="text-2xl font-bold text-white mb-2">Womenswear</h3>
          <span class="text-white/80 text-sm uppercase tracking-wider font-semibold">Explore →</span>
        </div>
      </div>
      <div class="relative h-[400px] rounded-2xl overflow-hidden group cursor-pointer">
        <img src="https://images.unsplash.com/photo-1516257984-b1b4d707412e?auto=format&fit=crop&q=80" class="absolute inset-0 w-full h-full object-cover transition-transform duration-700 group-hover:scale-110" />
        <div class="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent"></div>
        <div class="absolute bottom-6 left-6">
          <h3 class="text-2xl font-bold text-white mb-2">Menswear</h3>
          <span class="text-white/80 text-sm uppercase tracking-wider font-semibold">Explore →</span>
        </div>
      </div>
      <div class="relative h-[400px] rounded-2xl overflow-hidden group cursor-pointer">
        <img src="https://images.unsplash.com/photo-1543163521-1bf539c55dd2?auto=format&fit=crop&q=80" class="absolute inset-0 w-full h-full object-cover transition-transform duration-700 group-hover:scale-110" />
        <div class="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent"></div>
        <div class="absolute bottom-6 left-6">
          <h3 class="text-2xl font-bold text-white mb-2">Accessories</h3>
          <span class="text-white/80 text-sm uppercase tracking-wider font-semibold">Explore →</span>
        </div>
      </div>
    </div>
  </section>

  <!-- Banner -->
  <section class="bg-[#111] text-white py-24 px-4 text-center">
    <div class="max-w-3xl mx-auto">
      <h2 class="text-4xl font-black mb-6">Join the Revolution</h2>
      <p class="text-white/70 mb-8 text-lg">Sign up for our newsletter and get 15% off your first order.</p>
      <form class="flex flex-col sm:flex-row gap-4 justify-center max-w-md mx-auto">
        <input type="email" placeholder="Your email address" class="px-6 py-4 rounded-full bg-white/10 border border-white/20 text-white placeholder-white/50 focus:outline-none focus:border-white/50 w-full" />
        <button type="submit" class="bg-white text-black px-8 py-4 rounded-full font-bold uppercase tracking-wider text-sm whitespace-nowrap">Subscribe</button>
      </form>
    </div>
  </section>
</div>`,

  saas: `
<div class="min-h-screen bg-[#0A0A0A] text-white font-sans selection:bg-blue-500/30">
  <!-- Glowing Orb -->
  <div class="absolute top-0 left-1/2 -translate-x-1/2 w-[800px] h-[400px] bg-blue-500/20 blur-[120px] rounded-full pointer-events-none"></div>

  <!-- Hero -->
  <section class="relative pt-32 pb-20 px-4 max-w-7xl mx-auto text-center z-10">
    <div class="inline-flex items-center gap-2 px-3 py-1.5 rounded-full border border-white/10 bg-white/5 backdrop-blur-md mb-8 text-sm font-medium text-white/80">
      <span class="w-2 h-2 rounded-full bg-blue-500 animate-pulse"></span>
      The Cartwright Engine is now available
    </div>
    <h1 class="text-6xl md:text-8xl font-black mb-6 tracking-tight bg-clip-text text-transparent bg-gradient-to-b from-white to-white/60">
      Build software<br/>faster than ever.
    </h1>
    <p class="text-xl text-white/60 max-w-2xl mx-auto mb-10 font-medium">
      The ultimate platform for modern teams. Deploy globally, scale instantly, and create software that feels like magic.
    </p>
    <div class="flex flex-col sm:flex-row gap-4 justify-center">
      <a href="/start" class="bg-white text-black px-8 py-4 rounded-lg font-bold hover:bg-white/90 transition-colors shadow-[0_0_40px_rgba(255,255,255,0.3)]">Start for free</a>
      <a href="/contact" class="px-8 py-4 rounded-lg font-bold border border-white/20 hover:bg-white/5 transition-colors">Book a demo</a>
    </div>
  </section>

  <!-- Bento Grid Features -->
  <section class="py-20 px-4 max-w-7xl mx-auto relative z-10">
    <div class="grid grid-cols-1 md:grid-cols-3 gap-6">
      
      <!-- Big Feature -->
      <div class="md:col-span-2 bg-white/5 border border-white/10 rounded-3xl p-10 overflow-hidden relative group">
        <div class="absolute inset-0 bg-gradient-to-br from-blue-500/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity"></div>
        <div class="relative z-10">
          <h3 class="text-2xl font-bold mb-3">Global Edge Network</h3>
          <p class="text-white/60 max-w-sm mb-8">Deploy your code globally in milliseconds. No configuration required.</p>
          <div class="w-full h-48 bg-black/40 rounded-xl border border-white/10 flex items-center justify-center shadow-2xl">
            <pre class="text-xs text-blue-400 font-mono"><code>$ cartwright deploy --prod<br/><span class="text-green-400">✔ Ready in 450ms</span></code></pre>
          </div>
        </div>
      </div>

      <!-- Small Feature 1 -->
      <div class="bg-white/5 border border-white/10 rounded-3xl p-10 relative group overflow-hidden">
        <div class="absolute inset-0 bg-gradient-to-br from-purple-500/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity"></div>
        <div class="relative z-10">
          <div class="w-12 h-12 rounded-full bg-purple-500/20 border border-purple-500/30 flex items-center justify-center mb-6 text-xl">⚡️</div>
          <h3 class="text-xl font-bold mb-2">Instant Previews</h3>
          <p class="text-white/60 text-sm">Every commit generates a live preview URL automatically.</p>
        </div>
      </div>

      <!-- Small Feature 2 -->
      <div class="bg-white/5 border border-white/10 rounded-3xl p-10 relative group overflow-hidden">
        <div class="absolute inset-0 bg-gradient-to-br from-emerald-500/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity"></div>
        <div class="relative z-10">
          <div class="w-12 h-12 rounded-full bg-emerald-500/20 border border-emerald-500/30 flex items-center justify-center mb-6 text-xl">🔒</div>
          <h3 class="text-xl font-bold mb-2">Secure by default</h3>
          <p class="text-white/60 text-sm">Enterprise-grade security built directly into the core.</p>
        </div>
      </div>

      <!-- Big Feature 2 -->
      <div class="md:col-span-2 bg-white/5 border border-white/10 rounded-3xl p-10 relative group overflow-hidden flex flex-col justify-between">
        <div class="absolute inset-0 bg-gradient-to-br from-orange-500/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity"></div>
        <div class="relative z-10 mb-8">
          <h3 class="text-2xl font-bold mb-3">AI Native Architecture</h3>
          <p class="text-white/60 max-w-sm">Write software 10x faster with built-in AI agents that understand your codebase.</p>
        </div>
        <div class="flex gap-3">
          <div class="h-2 w-1/3 bg-white/10 rounded-full"></div>
          <div class="h-2 w-full bg-gradient-to-r from-orange-500/50 to-purple-500/50 rounded-full"></div>
        </div>
      </div>

    </div>
  </section>
</div>`,

  minimalist: `
<div class="min-h-screen bg-[#F5F5F0] text-[#111] font-serif">
  <!-- Minimal Hero -->
  <section class="h-screen flex flex-col justify-center px-6 md:px-20">
    <div class="max-w-5xl">
      <p class="text-sm font-sans tracking-widest uppercase mb-8 text-[#111]/50">Selected Works</p>
      <h1 class="text-6xl md:text-[8rem] leading-[0.9] font-medium tracking-tight mb-12">
        Designing<br/>for the future.
      </h1>
      <div class="flex items-center gap-6">
        <div class="w-24 h-[1px] bg-[#111]"></div>
        <p class="font-sans text-lg max-w-md text-[#111]/70 leading-relaxed">We are a creative studio specializing in digital experiences, brand identity, and art direction.</p>
      </div>
    </div>
  </section>

  <!-- Big Image Grid -->
  <section class="px-6 md:px-20 pb-32">
    <div class="grid grid-cols-1 md:grid-cols-2 gap-10 md:gap-20">
      <div class="mt-0 md:mt-32">
        <div class="aspect-[4/5] overflow-hidden bg-gray-200 mb-6 group cursor-pointer">
          <img src="https://images.unsplash.com/photo-1600607686527-6fb886090705?auto=format&fit=crop&q=80" class="w-full h-full object-cover transition-transform duration-1000 group-hover:scale-105" />
        </div>
        <h3 class="text-2xl font-medium">The Kyoto Residence</h3>
        <p class="font-sans text-sm text-[#111]/50 mt-2 tracking-wide uppercase">Architecture</p>
      </div>
      <div>
        <div class="aspect-[4/5] overflow-hidden bg-gray-200 mb-6 group cursor-pointer">
          <img src="https://images.unsplash.com/photo-1618221195710-dd6b41faaea6?auto=format&fit=crop&q=80" class="w-full h-full object-cover transition-transform duration-1000 group-hover:scale-105" />
        </div>
        <h3 class="text-2xl font-medium">Copenhagen Chair</h3>
        <p class="font-sans text-sm text-[#111]/50 mt-2 tracking-wide uppercase">Industrial Design</p>
      </div>
    </div>
  </section>
</div>`
};
